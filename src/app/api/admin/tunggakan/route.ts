import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction, PembayaranRecord, TunggakanLamaEntry } from '@/types';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import {
  appendIncomesToSheet,
  appendTunggakanLamaToSheet,
  appendTunggakanNonWargaToSheet,
  appendPelunasanToSheet,
  updateTunggakanInSheet,
  deleteTunggakanFromSheet,
  fetchTunggakanLamaFromSheet,
  fetchTunggakanNonWargaFromSheet,
  fetchPelunasanHistoryMapFromSheet,
  fetchResidentsFromSheet,
  syncAllDbNamesWithMaster,
  extractNameAndBlok,
  executeSheetWritesWithRetry,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const db = getDb();
    let tunggakanList = db.tunggakanLama || [];

    try {
      const [wargaRes, nonWargaRes, pelunasanMap, resRes] = await Promise.all([
        fetchTunggakanLamaFromSheet(),
        fetchTunggakanNonWargaFromSheet(),
        fetchPelunasanHistoryMapFromSheet().catch(() => new Map()),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] as any[] })),
      ]);

      if (resRes.success && resRes.residents && resRes.residents.length > 0) {
        db.residents = resRes.residents;
      }

      const combined = [...(wargaRes.tunggakan || []), ...(nonWargaRes.tunggakan || [])];
      if (combined.length > 0) {
        const localMap = new Map(tunggakanList.map((t) => [t.id, t]));
        db.tunggakanLama = combined.map((s) => {
          const local = localMap.get(s.id);
          const sheetTerbayar = s.terbayar ?? Math.max(0, (s.nominalAwal || s.jumlah) - s.jumlah);
          const sheetHistory = pelunasanMap.get(s.id);
          return {
            ...s,
            terbayar: sheetTerbayar,
            riwayatPembayaran: (sheetHistory && sheetHistory.length > 0 ? sheetHistory : local?.riwayatPembayaran) || s.riwayatPembayaran || [],
          };
        });
      }
      syncAllDbNamesWithMaster(db);
      tunggakanList = db.tunggakanLama || [];
      saveDb(db);
    } catch (e) {
      console.warn('Gagal fetch live tunggakan dari sheet:', e);
    }

    return NextResponse.json({
      success: true,
      data: tunggakanList,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const { action, id, nominal, metode, tanggal, catatan, status, namaWarga, blok, wargaId, keterangan, tipeWarga, catatanPindah } = body;

    const db = getDb();
    const tgl = tanggal || new Date().toISOString().slice(0, 10);
    const met = metode || 'Cash';

    // ACTION: TAMBAH TUNGGAKAN BARU
    if (action === 'tambah') {
      const tunggakanNominal = Number(nominal);
      if (!namaWarga || isNaN(tunggakanNominal) || tunggakanNominal <= 0) {
        return NextResponse.json(
          { success: false, error: 'Nama warga dan nominal tunggakan harus diisi dengan benar.' },
          { status: 400 }
        );
      }

      const tungId = `TUNG-${Date.now()}`;
      const desc = keterangan || 'Tunggakan Iuran Warga';

      const newTunggakan: TunggakanLamaEntry = {
        id: tungId,
        tanggal: tgl,
        namaWarga,
        blok: blok || '',
        wargaId: wargaId || '',
        jumlah: tunggakanNominal,
        nominalAwal: tunggakanNominal,
        terbayar: 0,
        keterangan: desc,
        status: 'Belum Lunas',
        tipeWarga: tipeWarga || 'Warga',
        catatanPindah: catatanPindah || '',
        tunggakanId: tungId,
        riwayatPembayaran: [],
      };

      if (!db.tunggakanLama) db.tunggakanLama = [];
      db.tunggakanLama.unshift(newTunggakan);
      saveDb(db);

      // Otomatis sinkronkan catatan tunggakan ke sheet TunggakanLama atau TunggakanNonWarga
      const isPindahOrNon = tipeWarga === 'Pindah' || tipeWarga === 'Non-Warga';
      const writeRes = await executeSheetWritesWithRetry([
        {
          label: isPindahOrNon ? 'TunggakanNonWarga' : 'TunggakanLama',
          critical: true,
          run: () => (isPindahOrNon ? appendTunggakanNonWargaToSheet(newTunggakan) : appendTunggakanLamaToSheet(newTunggakan)),
        },
      ]);
      if (!writeRes.success) {
        db.tunggakanLama = (db.tunggakanLama || []).filter((t) => t.id !== newTunggakan.id);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal menyimpan catatan tunggakan ke Google Sheet. Data dibatalkan agar tetap sinkron.',
          },
          { status: 502 }
        );
      }

      const labelWarga = tipeWarga === 'Pindah' ? 'Bekas Warga (Pindah)' : tipeWarga === 'Non-Warga' ? 'Non-Warga' : 'Warga RT';
      addLog(
        'Catat Tunggakan Baru',
        `Tunggakan baru dicatat untuk ${namaWarga}${blok ? ' (' + blok + ')' : ''} [${labelWarga}] sebesar Rp ${tunggakanNominal.toLocaleString('id-ID')} (${desc}).`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Catatan tunggakan untuk ${namaWarga} sebesar Rp ${tunggakanNominal.toLocaleString('id-ID')} berhasil dicatat!`,
        data: newTunggakan,
      });
    }

    // Sync kondisi terbaru dari Google Sheet sebelum memproses bayar/update agar sisa & terbayar tidak pernah stale
    try {
      const [wRes, nwRes] = await Promise.all([
        fetchTunggakanLamaFromSheet().catch(() => ({ success: false, tunggakan: [] as any[] })),
        fetchTunggakanNonWargaFromSheet().catch(() => ({ success: false, tunggakan: [] as any[] })),
      ]);
      const combined = [...(wRes.tunggakan || []), ...(nwRes.tunggakan || [])];
      if (combined.length > 0) {
        const localMap = new Map((db.tunggakanLama || []).map((t) => [t.id, t]));
        db.tunggakanLama = combined.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            terbayar: s.terbayar ?? Math.max(0, (s.nominalAwal || s.jumlah) - s.jumlah),
            riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [],
          };
        });
      }
    } catch {}

    const item = (db.tunggakanLama || []).find((t) => t.id === id || t.tunggakanId === id);

    if (!item) {
      return NextResponse.json({ success: false, error: 'Data tunggakan tidak ditemukan.' }, { status: 404 });
    }

    // ACTION: BAYAR (BISA CICIL MAUPUN CASH / LUNAS)
    if (action === 'bayar') {
      const bayarNominal = Number(nominal);
      if (isNaN(bayarNominal) || bayarNominal <= 0) {
        return NextResponse.json({ success: false, error: 'Nominal pembayaran tidak valid.' }, { status: 400 });
      }

      if (bayarNominal > item.jumlah) {
        return NextResponse.json(
          {
            success: false,
            error: `Nominal pembayaran (Rp ${bayarNominal.toLocaleString('id-ID')}) melebihi sisa tunggakan (Rp ${item.jumlah.toLocaleString('id-ID')}).`,
          },
          { status: 400 }
        );
      }

      const prevJumlah = item.jumlah;
      const prevTerbayar = item.terbayar;
      const prevStatus = item.status;
      const prevHistoryLen = (item.riwayatPembayaran || []).length;

      const sisaBaru = Math.max(0, item.jumlah - bayarNominal);
      item.jumlah = sisaBaru;
      item.terbayar = (item.terbayar || 0) + bayarNominal;
      const isLunas = sisaBaru === 0;
      item.status = isLunas ? 'Lunas' : 'Dicicil';

      const bayarId = `BYR-TUNG-${Date.now()}`;
      const incId = `INC-TUNG-${Date.now()}`;

      const paymentRecord: PembayaranRecord = {
        id: bayarId,
        tanggal: tgl,
        nominal: bayarNominal,
        metode: met,
        catatan: catatan || (isLunas ? 'Pelunasan penuh' : `Cicilan tunggakan (Sisa: Rp ${sisaBaru.toLocaleString('id-ID')})`),
        incomeId: incId,
        createdAt: new Date().toISOString(),
      };

      if (!item.riwayatPembayaran) item.riwayatPembayaran = [];
      item.riwayatPembayaran.unshift(paymentRecord);

      // OTOMATIS CATAT SEBAGAI KAS MASUK (PEMASUKAN)
      const namaSumber = item.namaWarga + (item.blok ? ` (${item.blok})` : '');
      const newIncome: IncomeTransaction = {
        id: incId,
        tanggal: tgl,
        sumber: namaSumber,
        kategori: isLunas ? 'Pelunasan Tunggakan' : 'Cicilan Tunggakan',
        bulan: ['Tunggakan Lampau', tgl.slice(0, 7)],
        nominal: bayarNominal,
        status: 'Sah',
        buktiId: met,
        catatan: catatan || `Pembayaran tunggakan warga ${namaSumber} (${met}) - Sisa tunggakan: Rp ${sisaBaru.toLocaleString('id-ID')}`,
        createdAt: new Date().toISOString(),
      };

      db.incomes.unshift(newIncome);
      saveDb(db);

      // Otomatis masukkan pembayaran tunggakan ke Google Sheet DataIuran, RiwayatPelunasan & Sheet Tunggakan (wajib berhasil)
      const { nama: rNama, blok: rBlok, wargaId } = extractNameAndBlok(namaSumber, (item as any).residentId || '', db.residents);
      const targetBulan = tgl.slice(0, 7) || '2026-11';
      const writeRes = await executeSheetWritesWithRetry([
        {
          label: 'DataIuran',
          critical: true,
          run: () =>
            appendIncomesToSheet({
              namaWarga: rNama || item.namaWarga,
              blok: rBlok || item.blok || '',
              bulanIuran: targetBulan,
              jumlah: bayarNominal,
              status: 'Lunas',
              kategori: isLunas ? 'Pelunasan Tunggakan' : 'Cicilan Tunggakan',
              tarif: bayarNominal,
              transaksiId: incId,
              wargaId: wargaId || (item as any).residentId || '',
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
              jenis: item.tipeWarga === 'Pindah' ? 'Tunggakan Non-Warga' : 'Tunggakan Warga',
              referensiId: item.id || item.tunggakanId || '',
              nama: namaSumber,
              nominal: bayarNominal,
              sisa: sisaBaru,
              transaksiId: incId,
              admin: 'Admin RT',
            }),
        },
        {
          label: item.tipeWarga === 'Pindah' || item.tipeWarga === 'Non-Warga' ? 'TunggakanNonWarga' : 'TunggakanLama',
          critical: true,
          run: () => updateTunggakanInSheet(item.id || item.tunggakanId || '', sisaBaru, isLunas ? 'Lunas' : 'Dicicil', item.tipeWarga),
        },
      ]);

      if (!writeRes.success) {
        item.jumlah = prevJumlah;
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
            error: writeRes.error || 'Gagal mencatat pembayaran tunggakan ke Google Sheet. Data dibatalkan agar laporan tetap sinkron.',
          },
          { status: 502 }
        );
      }

      addLog(
        isLunas ? 'Pelunasan Tunggakan Warga' : 'Pembayaran Cicilan Tunggakan Warga',
        `Pembayaran Rp ${bayarNominal.toLocaleString('id-ID')} diterima dari ${namaSumber} via ${met}. Sisa: Rp ${sisaBaru.toLocaleString('id-ID')}. Dana telah otomatis masuk ke Kas Masuk RT.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: isLunas
          ? `Tunggakan ${item.namaWarga} berhasil dilunasi penuh! Dana Rp ${bayarNominal.toLocaleString('id-ID')} telah otomatis masuk ke Kas Masuk.`
          : `Cicilan tunggakan Rp ${bayarNominal.toLocaleString('id-ID')} berhasil dicatat! Sisa tunggakan: Rp ${sisaBaru.toLocaleString('id-ID')}. Dana telah otomatis masuk ke Kas Masuk.`,
        data: item,
        income: newIncome,
      });
    }

    // ACTION: UBAH STATUS MANUAL JIKA DIPERLUKAN
    if (status) {
      const prevStatus = item.status;
      const prevJumlah = item.jumlah;
      item.status = status;
      if (status === 'Lunas') {
        item.jumlah = 0;
      }
      saveDb(db);

      const writeRes = await executeSheetWritesWithRetry([
        {
          label: item.tipeWarga === 'Pindah' || item.tipeWarga === 'Non-Warga' ? 'TunggakanNonWarga' : 'TunggakanLama',
          critical: true,
          run: () => updateTunggakanInSheet(item.id || item.tunggakanId || '', item.jumlah, item.status, item.tipeWarga),
        },
      ]);
      if (!writeRes.success) {
        item.status = prevStatus;
        item.jumlah = prevJumlah;
        saveDb(db);
        return NextResponse.json(
          { success: false, error: writeRes.error || 'Gagal memperbarui status tunggakan di Google Sheet.' },
          { status: 502 }
        );
      }

      addLog(
        'Update Status Tunggakan',
        `Status tunggakan ${item.namaWarga} diubah menjadi ${item.status}`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Status tunggakan ${item.namaWarga} berhasil diubah menjadi ${item.status}!`,
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
      return NextResponse.json({ success: false, error: 'ID tunggakan wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const itemToDelete = (db.tunggakanLama || []).find((t) => t.id === id || t.tunggakanId === id);

    if (!itemToDelete) {
      return NextResponse.json({ success: false, error: 'Data tunggakan tidak ditemukan.' }, { status: 404 });
    }

    db.tunggakanLama = (db.tunggakanLama || []).filter((t) => t.id !== id && t.tunggakanId !== id);
    saveDb(db);

    const writeRes = await executeSheetWritesWithRetry([
      {
        label: itemToDelete.tipeWarga === 'Pindah' || itemToDelete.tipeWarga === 'Non-Warga' ? 'TunggakanNonWarga' : 'TunggakanLama',
        critical: true,
        run: () => deleteTunggakanFromSheet(itemToDelete.id || itemToDelete.tunggakanId || id, itemToDelete.tipeWarga),
      },
    ]);
    if (!writeRes.success) {
      db.tunggakanLama.unshift(itemToDelete);
      saveDb(db);
      return NextResponse.json(
        { success: false, error: writeRes.error || 'Gagal menghapus data tunggakan dari Google Sheet.' },
        { status: 502 }
      );
    }

    addLog(
      'Hapus Data Tunggakan Lama',
      `Data tunggakan ${itemToDelete.namaWarga || 'Warga'} sebesar Rp ${(itemToDelete.jumlah || 0).toLocaleString('id-ID')} berhasil dihapus oleh Admin.`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: `Data tunggakan ${itemToDelete.namaWarga || 'Warga'} berhasil dihapus.`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
