import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction } from '@/types';
import {
  appendIncomesToSheet,
  appendPelunasanToSheet,
  extractNameAndBlok,
  fetchProofsFromSheet,
  fetchResidentsFromSheet,
  updateProofInSheet,
  deleteProofFromSheet,
  deleteIncomeFromSheet,
  deletePelunasanFromSheet,
  getDirectGoogleDriveImageUrl,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const db = getDb();

    // Auto-sync live dari Google Sheet BuktiTransfer & MasterWarga (Sumber Kebenaran Utama)
    try {
      const [sheetProofsRes, sheetResidentsRes] = await Promise.all([
        fetchProofsFromSheet().catch(() => ({ success: false, proofs: [] })),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] })),
      ]);

      if (sheetResidentsRes.success && sheetResidentsRes.residents && sheetResidentsRes.residents.length > 0) {
        db.residents = sheetResidentsRes.residents;
      }

      if (sheetProofsRes.success && sheetProofsRes.proofs && sheetProofsRes.proofs.length > 0) {
        const localMap = new Map((db.proofs || []).map((p) => [p.id, p]));
        const mergedProofs = sheetProofsRes.proofs.map((sheetProof) => {
          const local = localMap.get(sheetProof.id);
          const directImg = getDirectGoogleDriveImageUrl(sheetProof.driveUrl || sheetProof.buktiUrl);
          if (local) {
            return {
              ...sheetProof,
              buktiUrl: local.buktiUrl && local.buktiUrl.startsWith('data:') ? local.buktiUrl : directImg || sheetProof.buktiUrl,
              driveUrl: sheetProof.driveUrl || local.driveUrl,
              status: sheetProof.status || local.status,
              adminNote: sheetProof.adminNote || local.adminNote,
            };
          }
          return {
            ...sheetProof,
            buktiUrl: directImg || sheetProof.buktiUrl,
          };
        });

        // Pertahankan bukti lokal yang belum ter-commit ke sheet jika ada
        const sheetIdSet = new Set(sheetProofsRes.proofs.map((p) => p.id));
        const localOnly = (db.proofs || []).filter((p) => !sheetIdSet.has(p.id));

        db.proofs = [...mergedProofs, ...localOnly];
      }
      saveDb(db);
    } catch (e) {
      console.error('Error auto-sync proofs from sheet:', e);
    }

    const residentMapById = new Map((db.residents || []).map((r) => [r.id, r]));
    const residentMapByBlok = new Map((db.residents || []).map((r) => [(r.blok || '').toUpperCase().replace(/\s+/g, ''), r]));

    let proofs = (db.proofs || []).map((p) => {
      const cleanBlok = (p.blok || '').toUpperCase().replace(/\s+/g, '');
      const res = (p.residentId && residentMapById.get(p.residentId)) || (cleanBlok && residentMapByBlok.get(cleanBlok));
      if (res && res.nama) {
        return {
          ...p,
          residentName: res.nama,
          blok: res.blok,
          residentId: res.id,
        };
      }
      return p;
    });

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
    let proofIndex = db.proofs.findIndex((p) => p.id === id);

    if (proofIndex === -1) {
      try {
        const sheetProofsRes = await fetchProofsFromSheet();
        if (sheetProofsRes.success && sheetProofsRes.proofs.length > 0) {
          const found = sheetProofsRes.proofs.find((p) => p.id === id);
          if (found) {
            db.proofs.unshift(found);
            proofIndex = 0;
          }
        }
      } catch {}
    }

    if (proofIndex === -1) {
      return NextResponse.json({ success: false, error: 'Bukti transfer tidak ditemukan.' }, { status: 404 });
    }

    const proof = db.proofs[proofIndex];

    if (action === 'approve') {
      // 1. Pecah periode multi-bulan menjadi terpisah per bulan (Format YYYY-MM)
      const rawBulanList = Array.isArray(proof.bulan)
        ? proof.bulan
        : typeof proof.bulan === 'string'
        ? (proof.bulan as string).split(/[,;]+/)
        : [];

      let monthsList: string[] = [];
      rawBulanList.forEach((bStr: string) => {
        const parts = String(bStr).split(/[,;]+/);
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

      // Cari tarif warga
      const res = db.residents.find(
        (r) => r.id === proof.residentId || r.nama.toLowerCase() === proof.residentName.toLowerCase()
      );
      const residentTarif = res?.tarif || 150000;

      // Jika nominal mencakup lebih dari 1 bulan tetapi hanya 1 bulan yang terdaftar, ekspansi secara periodik
      if (monthsList.length === 1 && proof.nominal >= residentTarif * 2 && residentTarif > 0) {
        const calculatedMonthsCount = Math.round(proof.nominal / residentTarif);
        if (calculatedMonthsCount > 1) {
          const [sY, sM] = monthsList[0].split('-').map(Number);
          monthsList = [];
          for (let m = 0; m < calculatedMonthsCount; m++) {
            const date = new Date(sY, sM - 1 + m, 1);
            const mCode = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthsList.push(mCode);
          }
        }
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

      // 3. Update status Terverifikasi ke Google Sheet BuktiTransfer
      try {
        await updateProofInSheet({
          buktiId: proof.id,
          status: 'Terverifikasi',
          waktuUpload: proof.createdAt || nowIso,
          namaWarga: proof.residentName,
          nominal: proof.nominal,
          keterangan: proof.catatanWarga || '',
          fileUrl: proof.driveUrl || proof.buktiUrl,
          kategori: proof.kategori || 'Iuran Bulanan',
          bulan: monthsList.join(', '),
          blok: proof.blok,
          wargaId: proof.residentId,
          verifiedAt: nowIso,
          verifiedBy: 'Bendahara RT',
          adminNote: proof.adminNote,
          transactionId: proof.transactionId,
        });
      } catch (e) {
        console.error('updateProofInSheet error:', e);
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

      // Update status ke Google Sheet BuktiTransfer
      try {
        await updateProofInSheet({
          buktiId: proof.id,
          status: 'Ditolak',
          waktuUpload: proof.createdAt,
          namaWarga: proof.residentName,
          nominal: proof.nominal,
          keterangan: proof.catatanWarga || '',
          fileUrl: proof.driveUrl || proof.buktiUrl,
          kategori: proof.kategori || 'Iuran Bulanan',
          bulan: Array.isArray(proof.bulan) ? proof.bulan.join(', ') : String(proof.bulan || ''),
          blok: proof.blok,
          wargaId: proof.residentId,
          verifiedAt: new Date().toISOString(),
          verifiedBy: 'Bendahara RT',
          adminNote: proof.adminNote,
        });
      } catch (e) {
        console.error('updateProofInSheet error:', e);
      }

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

      // Update status ke Google Sheet BuktiTransfer
      try {
        await updateProofInSheet({
          buktiId: proof.id,
          status: 'Menunggu Verifikasi',
          waktuUpload: proof.createdAt,
          namaWarga: proof.residentName,
          nominal: proof.nominal,
          keterangan: proof.catatanWarga || '',
          fileUrl: proof.driveUrl || proof.buktiUrl,
          kategori: proof.kategori || 'Iuran Bulanan',
          bulan: Array.isArray(proof.bulan) ? proof.bulan.join(', ') : String(proof.bulan || ''),
          blok: proof.blok,
          wargaId: proof.residentId,
          verifiedAt: '',
          verifiedBy: '',
          adminNote: '',
          transactionId: '',
        });
      } catch (e) {
        console.error('updateProofInSheet error:', e);
      }

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

    // 1. Kumpulkan semua transaksi kas masuk yang dihasilkan dari bukti ini
    const txIdsToDelete = new Set<string>();
    if (proof.transactionId) {
      proof.transactionId.split(',').forEach((t) => txIdsToDelete.add(t.trim()));
    }
    (db.incomes || []).forEach((inc) => {
      if (inc.buktiId === proof.id || txIdsToDelete.has(inc.id)) {
        txIdsToDelete.add(inc.id);
      }
    });

    if (!db.deletedIncomeIds) db.deletedIncomeIds = [];
    if (!db.deletedProofIds) db.deletedProofIds = [];

    if (!db.deletedIncomeIds.includes(proof.id)) db.deletedIncomeIds.push(proof.id);
    if (!db.deletedProofIds.includes(proof.id)) db.deletedProofIds.push(proof.id);

    // 2. Hapus seluruh transaksi kas masuk terkait dari Google Sheet DataIuran & RiwayatPelunasan
    for (const txId of txIdsToDelete) {
      if (!db.deletedIncomeIds.includes(txId)) db.deletedIncomeIds.push(txId);
      try {
        await deleteIncomeFromSheet(txId);
        await deletePelunasanFromSheet(txId);
      } catch {}
    }

    // 3. Hapus transaksi kas masuk terkait dari memori lokal db.incomes
    db.incomes = (db.incomes || []).filter((inc) => inc.buktiId !== proof.id && !txIdsToDelete.has(inc.id));

    // 4. Hapus baris dari Google Sheet BuktiTransfer & RiwayatPelunasan
    try {
      await deleteProofFromSheet(id);
      await deletePelunasanFromSheet(`VERIF-${id}`);
      await deletePelunasanFromSheet(id);
    } catch (e) {
      console.error('deleteProofFromSheet error:', e);
    }

    // 5. Hapus data bukti transfer dari memori lokal
    db.proofs = (db.proofs || []).filter((p) => p.id !== id);
    saveDb(db);

    addLog(
      'Hapus Bukti Transfer & Transaksi Terkait',
      `Menghapus bukti transfer ${proof.id} dari ${proof.residentName} (${proof.blok}) beserta seluruh transaksi kas masuk terkait (${Array.from(txIdsToDelete).join(', ') || '-'}) dari aplikasi dan Google Sheet`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Bukti transfer dan seluruh transaksi kas masuk terkait berhasil dihapus total dari aplikasi dan Google Sheet.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
