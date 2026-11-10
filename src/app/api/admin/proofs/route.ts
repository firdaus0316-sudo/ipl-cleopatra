import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction } from '@/types';
import { appendIncomesToSheet, appendPelunasanToSheet, extractNameAndBlok } from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const db = getDb();
    let proofs = db.proofs;

    if (status && status !== 'Semua') {
      proofs = proofs.filter((p) => p.status === status);
    }

    return NextResponse.json({ success: true, data: proofs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function normalizePeriodCode(input?: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);

  const monthMap: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08', aug: '08', sep: '09', okt: '10', oct: '10', nov: '11', des: '12', dec: '12'
  };

  const parts = trimmed.split(/[\s-]+/);
  if (parts.length >= 2) {
    let mStr = '';
    let yStr = '';
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (monthMap[lower]) mStr = monthMap[lower];
      else if (/^\d{4}$/.test(p)) yStr = p;
      else if (/^\d{1,2}$/.test(p) && !mStr) mStr = p.padStart(2, '0');
    }
    if (mStr && yStr) return `${yStr}-${mStr}`;
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, adminNote } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'ID dan Action wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const proofIndex = db.proofs.findIndex((p) => p.id === id);

    if (proofIndex === -1) {
      return NextResponse.json({ success: false, error: 'Bukti transfer tidak ditemukan.' }, { status: 404 });
    }

    const proof = db.proofs[proofIndex];

    if (action === 'approve') {
      // 1. Pecah periode multi-bulan menjadi terpisah per bulan (Format YYYY-MM)
      const rawBulanList = Array.isArray(proof.bulan)
        ? proof.bulan
        : typeof proof.bulan === 'string'
        ? (proof.bulan as string).split(',')
        : [];

      let monthsList: string[] = [];
      rawBulanList.forEach((bStr: string) => {
        const parts = String(bStr).split(',');
        parts.forEach((p: string) => {
          const norm = normalizePeriodCode(p);
          if (norm && !monthsList.includes(norm)) {
            monthsList.push(norm);
          }
        });
      });

      if (monthsList.length === 0) {
        monthsList = [new Date().toISOString().slice(0, 7)];
      }

      // Urutkan bulan secara kronologis
      monthsList.sort();

      const numMonths = monthsList.length;
      const basePerMonth = Math.floor(proof.nominal / numMonths);
      const remainder = proof.nominal - basePerMonth * numMonths;

      const createdTxIds: string[] = [];
      const createdIncomes: IncomeTransaction[] = [];
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      // Buat transaksi kas masuk TERPISAH untuk SETIAP bulan
      monthsList.forEach((mCode, idx) => {
        const txId = `INC-${Date.now()}-${idx + 1}`;
        createdTxIds.push(txId);
        const nominalThisMonth = idx === numMonths - 1 ? basePerMonth + remainder : basePerMonth;

        const newIncome: IncomeTransaction = {
          id: txId,
          tanggal: todayDate,
          sumber: `${proof.residentName} (${proof.blok})`,
          residentId: proof.residentId,
          kategori: 'Iuran Bulanan',
          bulan: [mCode], // Format YYYY-MM per bulan
          nominal: nominalThisMonth,
          buktiId: proof.id,
          status: 'Sah',
          catatan:
            adminNote ||
            (numMonths > 1
              ? `Iuran Periode ${mCode} (${idx + 1}/${numMonths}) - Bukti ${proof.id}`
              : `Iuran Periode ${mCode} - Bukti ${proof.id}`),
          createdAt: nowIso,
        };

        createdIncomes.push(newIncome);
        db.incomes.unshift(newIncome);
      });

      // Otomatis masukkan kas masuk terverifikasi ke Google Sheet DataIuran
      const { nama: rNama, blok: rBlok, wargaId } = extractNameAndBlok(
        `${proof.residentName} (${proof.blok})`,
        proof.residentId,
        db.residents
      );

      const rowsToAppend = createdIncomes.map((inc) => ({
        namaWarga: rNama || proof.residentName,
        blok: rBlok || proof.blok,
        bulanIuran: inc.bulan?.[0] || '2026-11',
        jumlah: inc.nominal,
        status: 'Lunas',
        kategori: proof.kategori || 'Iuran Bulanan',
        tarif: inc.nominal,
        transaksiId: inc.id,
        wargaId: wargaId || proof.residentId,
        statusTransaksi: 'Aktif',
        buktiId: proof.id,
        bulanAwal: monthsList[0],
        bulanAkhir: monthsList[monthsList.length - 1],
        jumlahBulan: monthsList.length,
      }));

      try {
        await appendIncomesToSheet(rowsToAppend);
        await appendPelunasanToSheet({
          id: `VERIF-${proof.id}`,
          waktu: nowIso,
          jenis: 'Iuran Warga (Transfer)',
          referensiId: proof.id,
          nama: `${proof.residentName} (${proof.blok})`,
          nominal: proof.nominal,
          sisa: 0,
          transaksiId: createdTxIds.join(', '),
          admin: 'Bendahara RT',
        });
      } catch (e) {
        console.error('Auto-sync verified proof to sheets error:', e);
      }

      // 2. Update Proof status & Drive URL
      proof.status = 'Terverifikasi';
      proof.adminNote = adminNote || 'Bukti valid dan sesuai';
      proof.verifiedAt = nowIso;
      proof.verifiedBy = 'Bendahara RT';
      proof.bulan = monthsList; // format YYYY-MM
      proof.transactionId = createdTxIds.join(', ');

      if (!proof.driveUrl) {
        proof.driveUrl = 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB';
      }

      // 3. Masukkan ke Google Sheet BuktiTransfer jika Webhook Apps Script aktif
      if (db.settings.googleDriveWebhookUrl) {
        try {
          fetch(db.settings.googleDriveWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'verify_bukti',
              waktuUpload: proof.createdAt || nowIso,
              namaWarga: proof.residentName,
              nominal: proof.nominal,
              keterangan: proof.catatanWarga || '',
              fileUrl: proof.driveUrl || proof.buktiUrl,
              kategori: proof.kategori || 'Iuran Bulanan',
              bulan: monthsList.join(', '),
              status: 'Terverifikasi',
              buktiId: proof.id,
              blok: proof.blok,
              wargaId: proof.residentId,
              transactionId: proof.transactionId,
            }),
          }).catch((e) => console.error('Webhook async call error:', e));
        } catch (e) {
          console.error('Webhook error:', e);
        }
      }

      saveDb(db);
      addLog(
        'Verifikasi Bukti Disetujui',
        `Bukti ${proof.id} dari ${proof.residentName} (${proof.blok}) disetujui. Dibagi ke ${numMonths} bulan kas masuk (${createdTxIds.join(', ')}).`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Bukti berhasil diverifikasi dan otomatis dipecah menjadi ${numMonths} transaksi kas masuk terpisah per bulan!`,
        data: proof,
      });
    }

    if (action === 'reject') {
      // Batalkan seluruh transaksi kas masuk yang terkait bukti ini
      const txIdsToVoid = new Set<string>();
      if (proof.transactionId) {
        proof.transactionId.split(',').forEach((s: string) => txIdsToVoid.add(s.trim()));
      }
      db.incomes.forEach((inc) => {
        if (inc.buktiId === proof.id || txIdsToVoid.has(inc.id)) {
          inc.status = 'Dibatalkan';
        }
      });

      proof.status = 'Ditolak';
      proof.adminNote = adminNote || 'Bukti transfer tidak sesuai atau tidak valid.';
      proof.verifiedAt = new Date().toISOString();
      proof.verifiedBy = 'Bendahara RT';

      saveDb(db);
      addLog(
        'Verifikasi Bukti Ditolak',
        `Bukti ${proof.id} dari ${proof.residentName} (${proof.blok}) ditolak. Alasan: ${proof.adminNote}`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: 'Bukti transfer telah ditolak.',
        data: proof,
      });
    }

    if (action === 'cancel') {
      // Batalkan transaksi kas masuk dan kembalikan ke antrean
      const txIdsToVoid = new Set<string>();
      if (proof.transactionId) {
        proof.transactionId.split(',').forEach((s: string) => txIdsToVoid.add(s.trim()));
      }
      db.incomes.forEach((inc) => {
        if (inc.buktiId === proof.id || txIdsToVoid.has(inc.id)) {
          inc.status = 'Dibatalkan';
        }
      });

      proof.status = 'Menunggu Verifikasi';
      proof.adminNote = '';
      proof.verifiedAt = undefined;
      proof.verifiedBy = undefined;
      proof.transactionId = undefined;

      saveDb(db);
      addLog('Reset Verifikasi Bukti', `Status bukti ${proof.id} dikembalikan ke antrean verifikasi`, 'Admin');

      return NextResponse.json({
        success: true,
        message: 'Status bukti transfer berhasil dikembalikan ke antrean.',
        data: proof,
      });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak valid.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID bukti transfer wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const proofIndex = db.proofs.findIndex((p) => p.id === id);

    if (proofIndex === -1) {
      return NextResponse.json({ success: false, error: 'Bukti transfer tidak ditemukan.' }, { status: 404 });
    }

    const proof = db.proofs[proofIndex];

    // Jika bukti transfer ini sebelumnya sudah disetujui (ada transaksi kas masuk),
    // batalkan transaksi kas terkait agar saldo kas RT tetap akurat.
    if (proof.transactionId) {
      const incIndex = db.incomes.findIndex((i) => i.id === proof.transactionId);
      if (incIndex !== -1) {
        db.incomes[incIndex].status = 'Dibatalkan';
      }
    }

    // Hapus data bukti transfer
    db.proofs.splice(proofIndex, 1);
    saveDb(db);

    addLog(
      'Hapus Bukti Transfer',
      `Menghapus bukti transfer ${proof.id} dari ${proof.residentName} (${proof.blok}) sebesar Rp ${proof.nominal.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Bukti transfer dan transaksi terkait berhasil dihapus/dibatalkan.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
