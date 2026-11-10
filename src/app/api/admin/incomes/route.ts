import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction } from '@/types';
import {
  appendIncomesToSheet,
  deleteIncomeFromSheet,
  extractNameAndBlok,
  updateKasbonInSheet,
  updateTunggakanInSheet,
  fetchIncomesFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();
    let incomes = db.incomes || [];

    try {
      const sheetRes = await fetchIncomesFromSheet();
      if (sheetRes.success && sheetRes.incomes.length > 0) {
        const sheetIncMap = new Map(sheetRes.incomes.map((i) => [i.id, i]));
        const localMap = new Map(incomes.map((i) => [i.id, i]));

        incomes = sheetRes.incomes.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            buktiId: local?.buktiId || s.buktiId,
          };
        });

        for (const [id, loc] of localMap.entries()) {
          if (!sheetIncMap.has(id) && !db.deletedIncomeIds?.includes(id)) {
            incomes.unshift(loc);
          }
        }

        db.incomes = incomes;
        saveDb(db);
      }
    } catch (e) {
      console.warn('Gagal fetch live incomes dari sheet:', e);
    }

    incomes.sort((a, b) => {
      const timeB = new Date(b.createdAt || b.tanggal).getTime();
      const timeA = new Date(a.createdAt || a.tanggal).getTime();
      return timeB - timeA;
    });
    return NextResponse.json({ success: true, data: incomes });
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
    const { tanggal, sumber, residentId, kategori, bulan, nominal, catatan } = body;

    if (!tanggal || !sumber || !kategori || !nominal) {
      return NextResponse.json(
        { success: false, error: 'Tanggal, sumber, kategori, dan nominal wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const totalNominal = Number(nominal);
    const nowIso = new Date().toISOString();
    const tgl = tanggal.slice(0, 10);

    // Jika kategori Iuran Bulanan dan memilih bulan, pecah menjadi terpisah per bulan
    const rawBulanList = Array.isArray(bulan)
      ? bulan
      : typeof bulan === 'string'
      ? bulan.split(',')
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

    const isIuran = kategori.trim() === 'Iuran Bulanan' || kategori.toLowerCase().includes('iuran');

    if (isIuran && monthsList.length > 0) {
      monthsList.sort();
      const numMonths = monthsList.length;
      const basePerMonth = Math.floor(totalNominal / numMonths);
      const remainder = totalNominal - basePerMonth * numMonths;

      const createdIncomes: IncomeTransaction[] = [];
      const createdIds: string[] = [];

      monthsList.forEach((mCode, idx) => {
        const incomeId = `INC-MANUAL-${Date.now()}-${idx + 1}`;
        createdIds.push(incomeId);
        const nominalThisMonth = idx === numMonths - 1 ? basePerMonth + remainder : basePerMonth;

        const newIncome: IncomeTransaction = {
          id: incomeId,
          tanggal: tgl,
          sumber: sumber.trim(),
          residentId: residentId || undefined,
          kategori: 'Iuran Bulanan',
          bulan: [mCode], // Format YYYY-MM
          nominal: nominalThisMonth,
          status: 'Sah',
          catatan:
            catatan?.trim() ||
            (numMonths > 1
              ? `Iuran Periode ${mCode} (${idx + 1}/${numMonths})`
              : `Iuran Periode ${mCode}`),
          createdAt: nowIso,
        };

        db.incomes.unshift(newIncome);
        createdIncomes.push(newIncome);
      });

      saveDb(db);

      // Otomatis sinkronkan dan masukkan ke sheet DataIuran
      const { nama: rNama, blok: rBlok, wargaId } = extractNameAndBlok(sumber, residentId, db.residents);
      const rowsToAppend = createdIncomes.map((inc) => ({
        namaWarga: rNama,
        blok: rBlok,
        bulanIuran: inc.bulan?.[0] || '2026-11',
        jumlah: inc.nominal,
        status: 'Lunas',
        kategori: 'Iuran Bulanan',
        tarif: inc.nominal,
        transaksiId: inc.id,
        wargaId: wargaId,
        statusTransaksi: 'Aktif',
        buktiId: '',
        bulanAwal: monthsList[0],
        bulanAkhir: monthsList[monthsList.length - 1],
        jumlahBulan: monthsList.length,
      }));
      try {
        await appendIncomesToSheet(rowsToAppend);
      } catch (e) {
        console.error('Auto-sync income to sheet error:', e);
      }

      addLog(
        'Catat Kas Masuk Manual (Multi-Bulan)',
        `Pemasukan Iuran (${monthsList.join(', ')}) dari ${sumber.trim()} sebesar Rp ${totalNominal.toLocaleString('id-ID')} dipecah ke ${numMonths} transaksi bulanan.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Transaksi kas masuk berhasil dicatat dan dipecah ke ${numMonths} periode bulanan!`,
        data: createdIncomes[0],
      });
    }

    // Pemasukan non-iuran atau 1 transaksi standar
    const incomeId = `INC-MANUAL-${Date.now()}`;
    const newIncome: IncomeTransaction = {
      id: incomeId,
      tanggal: tgl,
      sumber: sumber.trim(),
      residentId: residentId || undefined,
      kategori: kategori.trim(),
      bulan: monthsList.length > 0 ? monthsList : undefined,
      nominal: totalNominal,
      status: 'Sah',
      catatan: catatan?.trim() || 'Pemasukan dicatat manual oleh admin',
      createdAt: nowIso,
    };

    db.incomes.unshift(newIncome);
    saveDb(db);

    // Otomatis sinkronkan dan masukkan ke sheet DataIuran
    const { nama: rNamaSingle, blok: rBlokSingle, wargaId: wIdSingle } = extractNameAndBlok(sumber, residentId, db.residents);
    appendIncomesToSheet({
      namaWarga: rNamaSingle,
      blok: rBlokSingle,
      bulanIuran: monthsList[0] || normalizePeriodCode(tgl) || '2026-11',
      jumlah: newIncome.nominal,
      status: 'Lunas',
      kategori: newIncome.kategori,
      tarif: newIncome.nominal,
      transaksiId: newIncome.id,
      wargaId: wIdSingle,
      statusTransaksi: 'Aktif',
      buktiId: '',
      bulanAwal: monthsList[0] || normalizePeriodCode(tgl) || '2026-11',
      bulanAkhir: monthsList[monthsList.length - 1] || monthsList[0] || '2026-11',
      jumlahBulan: Math.max(1, monthsList.length),
    }).catch((e) => console.error('Auto-sync single income to sheet error:', e));

    addLog(
      'Catat Kas Masuk Manual',
      `Pemasukan ${incomeId} (${newIncome.kategori}) dari ${newIncome.sumber} sebesar Rp ${newIncome.nominal.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Transaksi pemasukan berhasil dicatat!',
      data: newIncome,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action } = body;

    const db = getDb();
    const inc = db.incomes.find((i) => i.id === id);

    if (!inc) {
      return NextResponse.json({ success: false, error: 'Transaksi tidak ditemukan.' }, { status: 404 });
    }

    if (action === 'void') {
      inc.status = 'Dibatalkan';
      saveDb(db);
      addLog('Batalkan Pemasukan', `Pemasukan ${inc.id} dibatalkan / void`, 'Admin');
      return NextResponse.json({ success: true, message: 'Transaksi berhasil dibatalkan.' });
    }

    if (action === 'restore') {
      inc.status = 'Sah';
      saveDb(db);
      addLog('Pulihkan Pemasukan', `Pemasukan ${inc.id} dipulihkan statusnya menjadi Sah`, 'Admin');
      return NextResponse.json({ success: true, message: 'Transaksi berhasil dipulihkan.' });
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
      return NextResponse.json({ success: false, error: 'ID pemasukan wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const idx = db.incomes.findIndex((i) => i.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Transaksi pemasukan tidak ditemukan.' }, { status: 404 });
    }

    const inc = db.incomes[idx];

    // 1. Jika pemasukan berasal dari bukti transfer warga, sinkronkan status bukti transfernya
    if (inc.buktiId) {
      if (!db.deletedIncomeIds) db.deletedIncomeIds = [];
      if (!db.deletedIncomeIds.includes(inc.buktiId)) db.deletedIncomeIds.push(inc.buktiId);
      db.proofs = (db.proofs || []).filter((p) => p.id !== inc.buktiId && p.transactionId !== inc.id);
    }

    // 2. Jika pemasukan berasal dari cicilan/pelunasan tunggakan, kembalikan saldo piutang warga
    if (inc.id.startsWith('INC-TUNG-') || (inc.kategori && inc.kategori.includes('Tunggakan'))) {
      if (db.tunggakanLama) {
        for (const t of db.tunggakanLama) {
          const rIdx = (t.riwayatPembayaran || []).findIndex(
            (r: any) => r.incomeId === inc.id || r.id === inc.id
          );
          if (rIdx !== -1 || (inc.sumber && inc.sumber.toLowerCase().includes(t.namaWarga.toLowerCase()))) {
            if (rIdx !== -1 && t.riwayatPembayaran) {
              t.riwayatPembayaran.splice(rIdx, 1);
            }
            t.terbayar = Math.max(0, (t.terbayar || 0) - inc.nominal);
            t.jumlah = (t.nominalAwal || (t.jumlah + inc.nominal)) - (t.terbayar || 0);
            t.status = t.jumlah <= 0 ? 'Lunas' : (t.terbayar > 0 ? 'Dicicil' : 'Belum Lunas');
            try {
              await updateTunggakanInSheet(t.id || t.tunggakanId || '', t.jumlah, t.status, t.tipeWarga);
            } catch (e) {
              console.warn('Gagal sinkronisasi update tunggakan ke sheet:', e);
            }
            break;
          }
        }
      }
    }

    // 3. Jika pemasukan berasal dari pengembalian kasbon petugas, kembalikan sisa kasbon
    if (inc.id.startsWith('INC-KSB-') || (inc.kategori && inc.kategori.includes('Kasbon'))) {
      if (db.kasbon) {
        for (const k of db.kasbon) {
          const rIdx = (k.riwayatPembayaran || []).findIndex(
            (r: any) => r.incomeId === inc.id || r.id === inc.id
          );
          if (rIdx !== -1 || (inc.sumber && inc.sumber.toLowerCase().includes(k.namaPeminjam.toLowerCase()))) {
            if (rIdx !== -1 && k.riwayatPembayaran) {
              k.riwayatPembayaran.splice(rIdx, 1);
            }
            k.terbayar = Math.max(0, (k.terbayar || 0) - inc.nominal);
            k.nominal = (k.nominalAwal || (k.nominal + inc.nominal)) - (k.terbayar || 0);
            k.status = k.nominal <= 0 ? 'Lunas' : (k.terbayar > 0 ? 'Dicicil' : 'Belum Lunas');
            try {
              await updateKasbonInSheet(k.id || k.kasbonId || '', k.nominal, k.status);
            } catch (e) {
              console.warn('Gagal sinkronisasi update kasbon ke sheet:', e);
            }
            break;
          }
        }
      }
    }

    if (!db.deletedIncomeIds) db.deletedIncomeIds = [];
    if (!db.deletedIncomeIds.includes(inc.id)) {
      db.deletedIncomeIds.push(inc.id);
    }

    db.incomes.splice(idx, 1);
    saveDb(db);

    // 4. Hapus dari Google Sheet DataIuran secara real-time
    try {
      await deleteIncomeFromSheet(inc.id);
    } catch (e: any) {
      console.warn('Gagal sinkronisasi hapus ke Google Sheet DataIuran:', e.message);
    }

    addLog(
      'Hapus Pemasukan',
      `Menghapus transaksi pemasukan ${inc.id} (${inc.kategori} - ${inc.sumber}) sebesar Rp ${inc.nominal.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({ success: true, message: 'Transaksi pemasukan berhasil dihapus.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
