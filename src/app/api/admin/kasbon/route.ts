import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction, ExpenseTransaction, KasbonEntry, PembayaranRecord } from '@/types';
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
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();
    let kasbonList = db.kasbon || [];

    // Ambil data kasbon terkini secara langsung dari Google Sheet DataKasbon
    try {
      const sheetRes = await fetchKasbonFromSheet();
      if (sheetRes.success && sheetRes.kasbon.length > 0) {
        const localMap = new Map(kasbonList.map((k) => [k.id, k]));
        kasbonList = sheetRes.kasbon.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [],
          };
        });
        db.kasbon = kasbonList;
        saveDb(db);
      }
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
        kategori: 'Variabel',
        keterangan: `Kasbon: ${namaPeminjam} - ${desc}`,
        penerima: namaPeminjam,
        nominal: pinjamNominal,
        status: 'Sah',
        createdAt: new Date().toISOString(),
      };

      db.expenses.unshift(newExpense);
      saveDb(db);

      // Otomatis sinkronkan kasbon baru ke sheet DataKasbon & pencairan pengeluaran ke sheet DataPengeluaran
      try {
        await appendKasbonToSheet(newKasbon);
        await appendExpenseToSheet(newExpense, newKasbon.id);
      } catch (e) {
        console.error('Auto-sync kasbon to sheets error:', e);
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

      // Otomatis masukkan pengembalian kasbon ke Google Sheet DataIuran & RiwayatPelunasan
      const targetBulan = tgl.slice(0, 7) || '2026-11';
      try {
        await appendIncomesToSheet({
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
        });

        await appendPelunasanToSheet({
          id: bayarId,
          waktu: tgl,
          jenis: isLunas ? 'Pelunasan Kasbon' : 'Cicilan Kasbon',
          referensiId: item.id || item.kasbonId || '',
          nama: item.namaPeminjam,
          nominal: bayarNominal,
          sisa: sisaBaru,
          transaksiId: incId,
          admin: 'Admin RT',
        });

        // Sinkronkan sisa dan status kasbon ke Google Sheet DataKasbon
        await updateKasbonInSheet(item.id || item.kasbonId || '', sisaBaru, isLunas ? 'Lunas' : 'Dicicil');
      } catch (e) {
        console.error('Auto-sync kasbon payment to sheets error:', e);
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

      item.status = status;
      if (status === 'Lunas') {
        item.nominal = 0;
      }
      saveDb(db);

      try {
        await updateKasbonInSheet(item.id || item.kasbonId || '', item.nominal, item.status);
      } catch (e) {
        console.error('Auto-sync kasbon status to sheets error:', e);
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
    const linkedExp = (db.expenses || []).find(
      (e) =>
        e.id === `EXP-${kasbonTargetId}` ||
        e.id === `EXP-KSB-${kasbonTargetId.replace(/^KSB-/, '')}` ||
        e.id.includes(kasbonTargetId) ||
        (e.kategori === 'Kasbon' && e.penerima?.toLowerCase() === itemToDelete.namaPeminjam?.toLowerCase())
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

    // 3. Sinkronkan penghapusan ke Google Sheet DataKasbon & DataPengeluaran
    try {
      await deleteKasbonFromSheet(kasbonTargetId);
      if (deletedExpId) {
        await deleteExpenseFromSheet(deletedExpId);
      }
      await deleteExpenseByRefIdFromSheet(kasbonTargetId);
    } catch (e) {
      console.error('Auto-sync delete kasbon and linked expense from sheets error:', e);
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
