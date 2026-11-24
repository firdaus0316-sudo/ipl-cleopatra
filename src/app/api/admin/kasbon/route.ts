import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction, ExpenseTransaction, KasbonEntry, PembayaranRecord } from '@/types';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import {
  appendIncomesToSheet,
  appendKasbonToSheet,
  appendExpenseToSheet,
  appendPelunasanToSheet,
  updateKasbonInSheet,
  deleteKasbonFromSheet,
  deleteExpenseFromSheet,
  deleteExpenseByRefIdFromSheet,
  fetchKasbonFromSheet,
  fetchPelunasanHistoryMapFromSheet,
  fetchResidentsFromSheet,
  syncAllDbNamesWithMaster,
  executeSheetWritesWithRetry,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const db = getDb();
    let kasbonList = db.kasbon || [];

    // Ambil data kasbon terkini secara langsung dari Google Sheet DataKasbon & MasterWarga
    try {
      const [sheetRes, pelunasanMap, resRes] = await Promise.all([
        fetchKasbonFromSheet(),
        fetchPelunasanHistoryMapFromSheet().catch(() => new Map()),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] as any[] })),
      ]);
      if (resRes.success && resRes.residents && resRes.residents.length > 0) {
        db.residents = resRes.residents;
      }
      if (sheetRes.success && sheetRes.kasbon.length > 0) {
        const localMap = new Map(kasbonList.map((k) => [k.id, k]));
        db.kasbon = sheetRes.kasbon.map((s) => {
          const local = localMap.get(s.id);
          const sheetTerbayar = s.terbayar ?? Math.max(0, (s.nominalAwal || s.nominal) - s.nominal);
          const sheetHistory = pelunasanMap.get(s.id);
          return {
            ...s,
            terbayar: sheetTerbayar,
            riwayatPembayaran: (sheetHistory && sheetHistory.length > 0 ? sheetHistory : local?.riwayatPembayaran) || s.riwayatPembayaran || [],
          };
        });
      }
      syncAllDbNamesWithMaster(db);
      kasbonList = db.kasbon || [];
      saveDb(db);
    } catch (e) {
      console.warn('Gagal fetch live kasbon dari sheet:', e);
    }

    return NextResponse.json({
      success: true,
      data: kasbonList,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const { action, id, nominal, metode, tanggal, catatan, namaPeminjam, keterangan, status } = body;

    const db = getDb();
    const tgl = tanggal || new Date().toISOString().slice(0, 10);
    const met = metode || 'Cash';

    // ACTION 1: TAMBAH KASBON BARU (PENGELUARAN KAS)
    if (action === 'tambah') {
      const pinjamNominal = Number(nominal);
      if (!namaPeminjam || isNaN(pinjamNominal) || pinjamNominal <= 0) {
        return NextResponse.json(
          { success: false, error: 'Nama peminjam dan nominal kasbon harus diisi dengan benar.' },
          { status: 400 }
        );
      }

      const ksbId = `KSB-${Date.now()}`;
      const expId = `EXP-KSB-${Date.now()}`;
      const desc = keterangan || 'Pinjaman Kasbon Petugas';

      const newKasbon: KasbonEntry = {
        id: ksbId,
        timestamp: tgl,
        namaPeminjam,
        nominal: pinjamNominal,
        nominalAwal: pinjamNominal,
        terbayar: 0,
        keterangan: desc,
        status: 'Belum Lunas',
        tglBackdate: tgl,
        kasbonId: ksbId,
        riwayatPembayaran: [],
      };

      if (!db.kasbon) db.kasbon = [];
      db.kasbon.unshift(newKasbon);

      // OTOMATIS CATAT SEBAGAI KAS KELUAR (PENGELUARAN)
      const newExpense: ExpenseTransaction = {
        id: expId,
        tanggal: tgl,
        kategori: 'Kasbon',
        keterangan: `Kasbon: ${namaPeminjam} - ${desc}`,
        penerima: namaPeminjam,
        nominal: pinjamNominal,
        status: 'Sah',
        createdAt: new Date().toISOString(),
      };

      db.expenses.unshift(newExpense);
      saveDb(db);

      // Otomatis sinkronkan paralel kasbon baru ke sheet DataKasbon & pencairan ke DataPengeluaran (wajib berhasil)
      const writeRes = await executeSheetWritesWithRetry([
        { label: 'DataKasbon', critical: true, run: () => appendKasbonToSheet(newKasbon) },
        { label: 'DataPengeluaran', critical: true, run: () => appendExpenseToSheet(newExpense, newKasbon.id) },
      ]);
      if (!writeRes.success) {
        db.kasbon = (db.kasbon || []).filter((k) => k.id !== newKasbon.id);
        db.expenses = (db.expenses || []).filter((e) => e.id !== newExpense.id);
        saveDb(db);
        // Bersihkan partial write bila hanya salah satu yang sempat masuk
        if (!writeRes.failedCritical.includes('DataKasbon')) {
          await deleteKasbonFromSheet(newKasbon.id).catch(() => {});
        }
        if (!writeRes.failedCritical.includes('DataPengeluaran')) {
          await deleteExpenseFromSheet(newExpense.id).catch(() => {});
        }
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal menyimpan kasbon ke Google Sheet. Data dibatalkan agar kas dan piutang tetap sinkron.',
          },
          { status: 502 }
        );
      }

      addLog(
        'Pemberian Kasbon Baru Petugas',
        `Pencairan kasbon Rp ${pinjamNominal.toLocaleString('id-ID')} kepada ${namaPeminjam} (${desc}). Kas keluar RT dicatat otomatis.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Kasbon baru sebesar Rp ${pinjamNominal.toLocaleString('id-ID')} untuk ${namaPeminjam} berhasil dicatat dan dipotong dari Kas RT!`,
        data: newKasbon,
        expense: newExpense,
      });
    }

    // ACTION 2: BAYAR / KEMBALIKAN KASBON (BISA CICIL MAUPUN CASH / LUNAS)
    if (action === 'bayar') {
      // Sync kondisi terbaru dari Google Sheet DataKasbon agar sisa & terbayar tidak pernah stale
      try {
        const sheetRes = await fetchKasbonFromSheet();
        if (sheetRes.success && sheetRes.kasbon.length > 0) {
          const localMap = new Map((db.kasbon || []).map((k) => [k.id, k]));
          db.kasbon = sheetRes.kasbon.map((s) => {
            const local = localMap.get(s.id);
            return {
              ...s,
              terbayar: s.terbayar ?? Math.max(0, (s.nominalAwal || s.nominal) - s.nominal),
              riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [],
            };
          });
        }
      } catch {}

      const item = (db.kasbon || []).find((k) => k.id === id || k.kasbonId === id);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Data kasbon tidak ditemukan.' }, { status: 404 });
      }

      const bayarNominal = Number(nominal);
      if (isNaN(bayarNominal) || bayarNominal <= 0) {
        return NextResponse.json({ success: false, error: 'Nominal pembayaran tidak valid.' }, { status: 400 });
      }

      if (bayarNominal > item.nominal) {
        return NextResponse.json(
          {
            success: false,
            error: `Nominal pengembalian (Rp ${bayarNominal.toLocaleString('id-ID')}) melebihi sisa pinjaman kasbon (Rp ${item.nominal.toLocaleString('id-ID')}).`,
          },
          { status: 400 }
        );
      }

      const prevNominal = item.nominal;
      const prevTerbayar = item.terbayar;
      const prevStatus = item.status;
      const prevHistoryLen = (item.riwayatPembayaran || []).length;

      const sisaBaru = Math.max(0, item.nominal - bayarNominal);
      item.nominal = sisaBaru;
      item.terbayar = (item.terbayar || 0) + bayarNominal;
      const isLunas = sisaBaru === 0;
      item.status = isLunas ? 'Lunas' : 'Dicicil';

      const bayarId = `BYR-KSB-${Date.now()}`;
      const incId = `INC-KSB-${Date.now()}`;

      const paymentRecord: PembayaranRecord = {
        id: bayarId,
        tanggal: tgl,
        nominal: bayarNominal,
        metode: met,
        catatan: catatan || (isLunas ? 'Pelunasan penuh' : `Angsuran kasbon (Sisa: Rp ${sisaBaru.toLocaleString('id-ID')})`),
        incomeId: incId,
        createdAt: new Date().toISOString(),
      };

      if (!item.riwayatPembayaran) item.riwayatPembayaran = [];
      item.riwayatPembayaran.unshift(paymentRecord);

      // OTOMATIS CATAT SEBAGAI KAS MASUK (PEMASUKAN KAS KEMBALI)
      const newIncome: IncomeTransaction = {
        id: incId,
        tanggal: tgl,
        sumber: item.namaPeminjam,
        kategori: 'Pengembalian Kasbon',
        bulan: ['Kasbon', tgl.slice(0, 7)],
        nominal: bayarNominal,
        status: 'Sah',
        buktiId: met,
        catatan: catatan || `Pengembalian kasbon oleh ${item.namaPeminjam} (${met}) - Sisa pinjaman: Rp ${sisaBaru.toLocaleString('id-ID')}`,
        createdAt: new Date().toISOString(),
      };

      db.incomes.unshift(newIncome);
      saveDb(db);

      // Otomatis masukkan pengembalian kasbon ke Google Sheet DataIuran, RiwayatPelunasan & DataKasbon (wajib berhasil)
      const targetBulan = tgl.slice(0, 7) || '2026-11';
      const writeRes = await executeSheetWritesWithRetry([
        {
          label: 'DataIuran',
          critical: true,
          run: () =>
            appendIncomesToSheet({
              namaWarga: item.namaPeminjam,
              blok: 'Kasbon Petugas',
              bulanIuran: targetBulan,
              jumlah: bayarNominal,
              status: 'Lunas',
              kategori: isLunas ? 'Pelunasan Kasbon' : 'Pengembalian Kasbon',
              tarif: bayarNominal,
              transaksiId: incId,
              wargaId: '',
              statusTransaksi: 'Aktif',
              buktiId: met,
              bulanAwal: targetBulan,
              bulanAkhir: targetBulan,
              jumlahBulan: 1,
            }),
        },
        {
          label: 'RiwayatPelunasan',
          critical: false,
          run: () =>
            appendPelunasanToSheet({
              id: bayarId,
              waktu: tgl,
              jenis: isLunas ? 'Pelunasan Kasbon' : 'Cicilan Kasbon',
              referensiId: item.id || item.kasbonId || '',
              nama: item.namaPeminjam,
              nominal: bayarNominal,
              sisa: sisaBaru,
              transaksiId: incId,
              admin: 'Admin RT',
            }),
        },
        {
          label: 'DataKasbon',
          critical: true,
          run: () => updateKasbonInSheet(item.id || item.kasbonId || '', sisaBaru, isLunas ? 'Lunas' : 'Dicicil'),
        },
      ]);

      if (!writeRes.success) {
        item.nominal = prevNominal;
        item.terbayar = prevTerbayar;
        item.status = prevStatus;
        if (item.riwayatPembayaran && item.riwayatPembayaran.length > prevHistoryLen) {
          item.riwayatPembayaran.shift();
        }
        db.incomes = (db.incomes || []).filter((i) => i.id !== incId);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal mencatat pengembalian kasbon ke Google Sheet. Data dibatalkan agar laporan keuangan tetap konsisten.',
          },
          { status: 502 }
        );
      }

      addLog(
        isLunas ? 'Pelunasan Kasbon Petugas' : 'Pengembalian / Angsuran Kasbon Petugas',
        `Pengembalian kasbon Rp ${bayarNominal.toLocaleString('id-ID')} diterima dari ${item.namaPeminjam} via ${met}. Sisa: Rp ${sisaBaru.toLocaleString('id-ID')}. Dana telah otomatis masuk ke Kas Masuk RT.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: isLunas
          ? `Kasbon ${item.namaPeminjam} berhasil dilunasi penuh! Dana Rp ${bayarNominal.toLocaleString('id-ID')} telah otomatis masuk kembali ke Kas Masuk RT.`
          : `Angsuran kasbon Rp ${bayarNominal.toLocaleString('id-ID')} berhasil dicatat! Sisa kasbon: Rp ${sisaBaru.toLocaleString('id-ID')}. Dana telah otomatis masuk kembali ke Kas Masuk RT.`,
        data: item,
        income: newIncome,
      });
    }

    // ACTION 3: UBAH STATUS MANUAL JIKA DIPERLUKAN
    if (status && id) {
      const item = (db.kasbon || []).find((k) => k.id === id || k.kasbonId === id);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Data kasbon tidak ditemukan.' }, { status: 404 });
      }

      const prevStatus = item.status;
      const prevNominal = item.nominal;
      item.status = status;
      if (status === 'Lunas') {
        item.nominal = 0;
      }
      saveDb(db);

      const writeRes = await executeSheetWritesWithRetry([
        { label: 'DataKasbon', critical: true, run: () => updateKasbonInSheet(item.id || item.kasbonId || '', item.nominal, item.status) },
      ]);
      if (!writeRes.success) {
        item.status = prevStatus;
        item.nominal = prevNominal;
        saveDb(db);
        return NextResponse.json(
          { success: false, error: writeRes.error || 'Gagal memperbarui status kasbon di Google Sheet.' },
          { status: 502 }
        );
      }

      addLog(
        'Update Status Kasbon',
        `Status kasbon ${item.namaPeminjam} diubah menjadi ${item.status}`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Status kasbon ${item.namaPeminjam} berhasil diubah menjadi ${item.status}!`,
        data: item,
      });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak dikenali.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID kasbon wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const itemToDelete = (db.kasbon || []).find((k) => k.id === id || k.kasbonId === id);

    if (!itemToDelete) {
      return NextResponse.json({ success: false, error: 'Data kasbon tidak ditemukan.' }, { status: 404 });
    }

    const kasbonTargetId = itemToDelete.id || itemToDelete.kasbonId || id;

    // 1. Hapus dari db.kasbon
    db.kasbon = (db.kasbon || []).filter((k) => k.id !== id && k.kasbonId !== id);

    // 2. OTOMATIS HAPUS PENGELUARAN KAS TERKAIT (Pencairan Kasbon)
    const targetNominal = itemToDelete.nominalAwal || itemToDelete.nominal || 0;
    const targetDesc = (itemToDelete.keterangan || '').toLowerCase().trim();
    const linkedExp = (db.expenses || []).find(
      (e) =>
        e.id === `EXP-${kasbonTargetId}` ||
        e.id === `EXP-KSB-${kasbonTargetId.replace(/^KSB-/, '')}` ||
        e.id === kasbonTargetId ||
        e.id.includes(kasbonTargetId) ||
        (e.kategori === 'Kasbon' &&
          e.penerima?.toLowerCase() === itemToDelete.namaPeminjam?.toLowerCase() &&
          (e.nominal === targetNominal || (targetDesc && e.keterangan?.toLowerCase().includes(targetDesc))))
    );

    let deletedExpId = '';
    if (linkedExp) {
      deletedExpId = linkedExp.id;
      db.expenses = (db.expenses || []).filter((e) => e.id !== linkedExp.id);
      if (!db.deletedExpenseIds) db.deletedExpenseIds = [];
      if (!db.deletedExpenseIds.includes(linkedExp.id)) {
        db.deletedExpenseIds.push(linkedExp.id);
      }
    }

    saveDb(db);

    // 3. Sinkronkan penghapusan ke Google Sheet DataKasbon & DataPengeluaran dengan retry + validasi
    const deleteTasks = [
      { label: 'DataKasbon', critical: true, run: () => deleteKasbonFromSheet(kasbonTargetId) },
      ...(deletedExpId
        ? [{ label: 'DataPengeluaran', critical: true, run: () => deleteExpenseFromSheet(deletedExpId) }]
        : []),
      { label: 'DataPengeluaran (Ref)', critical: false, run: () => deleteExpenseByRefIdFromSheet(kasbonTargetId) },
    ];
    const writeRes = await executeSheetWritesWithRetry(deleteTasks);
    if (!writeRes.success) {
      db.kasbon.unshift(itemToDelete);
      if (linkedExp) {
        db.expenses.unshift(linkedExp);
        db.deletedExpenseIds = (db.deletedExpenseIds || []).filter((eid) => eid !== linkedExp.id);
      }
      saveDb(db);
      return NextResponse.json(
        { success: false, error: writeRes.error || 'Gagal menghapus data kasbon dari Google Sheet.' },
        { status: 502 }
      );
    }

    addLog(
      'Hapus Data Kasbon',
      `Data pinjaman kasbon ${itemToDelete.namaPeminjam || 'Petugas'} sebesar Rp ${(itemToDelete.nominal || 0).toLocaleString('id-ID')} dan catatan pengeluaran kas RT terkait berhasil dihapus oleh Admin.`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: `Data kasbon ${itemToDelete.namaPeminjam || 'Petugas'} dan pencairan kas keluar terkait berhasil dihapus.`,
      deletedExpenseId: deletedExpId || undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
