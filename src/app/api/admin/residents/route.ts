import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { Resident } from '@/types';
import {
  appendResidentToSheet,
  updateResidentInSheet,
  fetchResidentsFromSheet,
  updateIncomeInSheet,
  updateRowInSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();
    try {
      const sheetResult = await fetchResidentsFromSheet();
      if (sheetResult.success && sheetResult.residents.length > 0) {
        db.residents = sheetResult.residents;
        saveDb(db);
      }
    } catch (sheetErr) {
      console.warn('Fetch live residents error:', sheetErr);
    }
    return NextResponse.json({ success: true, data: db.residents });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, blok, hp, tarif, status, catatan } = body;

    if (!nama || !blok) {
      return NextResponse.json({ success: false, error: 'Nama dan Blok wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const count = db.residents.length + 1;
    const residentId = `WRG-${String(count).padStart(3, '0')}`;

    const newResident: Resident = {
      id: residentId,
      nama: nama.trim(),
      blok: blok.trim().toUpperCase(),
      hp: hp ? hp.trim() : '',
      tarif: Number(tarif) || 100000,
      status: status || 'Aktif',
      catatan: catatan?.trim() || '',
    };

    db.residents.push(newResident);
    saveDb(db);

    // Otomatis sinkronkan warga baru ke Google Sheet MasterWarga
    try {
      await appendResidentToSheet(newResident);
    } catch (e) {
      console.error('Auto-sync resident to sheet error:', e);
    }

    addLog('Tambah Data Warga', `Menambahkan warga ${newResident.nama} (${newResident.blok})`, 'Admin');

    return NextResponse.json({
      success: true,
      message: 'Data warga berhasil ditambahkan!',
      data: newResident,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, nama, blok, hp, tarif, status, catatan } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID Warga wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    let resident = db.residents.find((r) => r.id === id);

    if (!resident) {
      try {
        const sheetRes = await fetchResidentsFromSheet();
        if (sheetRes.success && sheetRes.residents.length > 0) {
          db.residents = sheetRes.residents;
          resident = db.residents.find((r) => r.id === id);
        }
      } catch {}
    }

    if (!resident) {
      return NextResponse.json({ success: false, error: 'Warga tidak ditemukan.' }, { status: 404 });
    }

    const oldNama = resident.nama;
    const oldBlok = resident.blok;

    if (nama) resident.nama = nama.trim();
    if (blok) resident.blok = blok.trim().toUpperCase();
    if (hp !== undefined) resident.hp = hp.trim();
    if (tarif !== undefined) resident.tarif = Number(tarif);
    if (status) resident.status = status;
    if (catatan !== undefined) resident.catatan = catatan.trim();

    saveDb(db);

    // 1. Auto-sync update data warga ke Google Sheet MasterWarga secara real-time
    try {
      await updateResidentInSheet(resident, oldBlok);
    } catch (sheetErr) {
      console.error('Update resident to sheet error:', sheetErr);
    }

    // 2. Cascade update ke semua transaksi & catatan terkait jika nama atau blok berubah
    const nameChanged = Boolean(oldNama && resident.nama.toLowerCase() !== oldNama.toLowerCase());
    const blokChanged = Boolean(oldBlok && resident.blok.toUpperCase() !== oldBlok.toUpperCase());

    if (nameChanged || blokChanged) {
      const newSumber = `${resident.nama} (${resident.blok})`;
      const oldBlokClean = (oldBlok || '').toUpperCase().replace(/\s+/g, '');
      const oldNamaClean = (oldNama || '').toLowerCase().trim();

      // Update di db.incomes & Google Sheet DataIuran
      for (const inc of db.incomes || []) {
        const incBlokClean = (inc.sumber || '').replace(/.*\(|\).*/g, '').toUpperCase().replace(/\s+/g, '');
        const isMatched =
          inc.residentId === resident.id ||
          (oldBlokClean && incBlokClean === oldBlokClean) ||
          (oldNamaClean && inc.sumber?.toLowerCase().includes(oldNamaClean));
        if (isMatched) {
          inc.sumber = newSumber;
          inc.residentId = resident.id;
          try {
            await updateIncomeInSheet(inc, resident.nama, resident.blok);
          } catch {}
        }
      }

      // Update di db.proofs & Google Sheet BuktiTransfer
      for (const p of db.proofs || []) {
        const pBlokClean = (p.blok || '').toUpperCase().replace(/\s+/g, '');
        const isMatched =
          p.residentId === resident.id ||
          (oldBlokClean && pBlokClean === oldBlokClean) ||
          (oldNamaClean && p.residentName?.toLowerCase().includes(oldNamaClean));
        if (isMatched) {
          p.residentName = resident.nama;
          p.blok = resident.blok;
          p.residentId = resident.id;
          try {
            await updateRowInSheet('BuktiTransfer', 9, p.id, { 2: resident.nama, 10: resident.id, 11: resident.blok });
          } catch {}
        }
      }

      // Update di db.kasbon & Google Sheet DataKasbon
      for (const k of db.kasbon || []) {
        const isMatched =
          k.wargaId === resident.id ||
          (oldNamaClean && k.namaPeminjam?.toLowerCase().includes(oldNamaClean));
        if (isMatched) {
          k.namaPeminjam = resident.nama;
          k.wargaId = resident.id;
          try {
            await updateRowInSheet('DataKasbon', 7, k.id, { 2: resident.nama, 8: resident.id });
          } catch {}
        }
      }

      // Update di db.expenses & Google Sheet DataPengeluaran jika mencantumkan nama warga
      for (const e of db.expenses || []) {
        const isMatched =
          (oldNamaClean && e.penerima?.toLowerCase().includes(oldNamaClean)) ||
          (oldNamaClean && e.keterangan?.toLowerCase().includes(oldNamaClean));
        if (isMatched) {
          if (oldNamaClean && e.penerima?.toLowerCase().includes(oldNamaClean)) {
            e.penerima = resident.nama;
          }
          if (oldNamaClean && e.keterangan) {
            e.keterangan = e.keterangan.replace(new RegExp(oldNama, 'gi'), resident.nama);
          }
          try {
            await updateRowInSheet('DataPengeluaran', 5, e.id, { 2: e.keterangan, 4: e.kategori });
          } catch {}
        }
      }

      // Update di db.tunggakanLama & Google Sheet TunggakanLama / TunggakanNonWarga
      for (const t of db.tunggakanLama || []) {
        const isMatched =
          t.wargaId === resident.id ||
          (oldNamaClean && t.namaWarga?.toLowerCase().includes(oldNamaClean)) ||
          (oldBlokClean && t.keterangan?.toUpperCase().replace(/\s+/g, '').includes(oldBlokClean));
        if (isMatched) {
          t.namaWarga = resident.nama;
          t.wargaId = resident.id;
          try {
            await updateRowInSheet('TunggakanLama', 6, t.id, { 2: resident.nama, 7: resident.id });
            await updateRowInSheet('TunggakanNonWarga', 8, t.id, { 2: resident.nama, 3: resident.blok, 9: resident.id });
          } catch {}
        }
      }

      // Update di db.pelunasanHistory & Google Sheet RiwayatPelunasan
      for (const pel of db.pelunasanHistory || []) {
        const isMatched =
          pel.wargaId === resident.id ||
          (oldNamaClean && pel.namaWarga?.toLowerCase().includes(oldNamaClean));
        if (isMatched) {
          pel.namaWarga = resident.nama;
          pel.wargaId = resident.id;
          try {
            await updateRowInSheet('RiwayatPelunasan', 7, pel.id, { 2: resident.nama, 8: resident.id });
          } catch {}
        }
      }

      saveDb(db);
    }

    addLog('Ubah Data Warga', `Memperbarui data warga ${resident.nama} (${resident.blok})`, 'Admin');

    return NextResponse.json({
      success: true,
      message: 'Data warga berhasil diperbarui!',
      data: resident,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const idx = db.residents.findIndex((r) => r.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Warga tidak ditemukan.' }, { status: 404 });
    }

    const deleted = db.residents.splice(idx, 1)[0];
    saveDb(db);
    addLog('Hapus Data Warga', `Menghapus warga ${deleted.nama} (${deleted.blok})`, 'Admin');

    return NextResponse.json({ success: true, message: 'Data warga berhasil dihapus.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
