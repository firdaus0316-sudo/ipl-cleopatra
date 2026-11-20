import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { Resident } from '@/types';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import {
  appendResidentToSheet,
  updateResidentInSheet,
  deleteResidentFromSheet,
  fetchResidentsFromSheet,
  updateIncomeInSheet,
  updateRowInSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function computeResidentCounts(list: Resident[]) {
  const aktif = list.filter((r) => r && r.status === 'Aktif').length;
  const nonaktif = list.length - aktif;
  return { total: list.length, aktif, nonaktif };
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
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
    return NextResponse.json({
      success: true,
      data: db.residents,
      counts: computeResidentCounts(db.residents || []),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const { nama, blok, hp, tarif, status, catatan } = body;

    if (!nama || !blok) {
      return NextResponse.json({ success: false, error: 'Nama dan Blok wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    // Selaraskan lebih dulu dengan Google Sheet MasterWarga terbaru sebelum generate ID & simpan
    try {
      const sheetRes = await fetchResidentsFromSheet();
      if (sheetRes.success && sheetRes.residents.length > 0) {
        db.residents = sheetRes.residents;
      }
    } catch {}

    let maxWrgNum = db.residents.length;
    for (const existing of db.residents || []) {
      const m = /^WRG-(\d+)$/i.exec((existing.id || '').trim());
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxWrgNum) maxWrgNum = n;
      }
    }
    const residentId = `WRG-${String(maxWrgNum + 1).padStart(3, '0')}`;

    const newResident: Resident = {
      id: residentId,
      nama: nama.trim(),
      blok: blok.trim().toUpperCase(),
      hp: hp ? hp.trim() : '',
      tarif: Number(tarif) || 150000,
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
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const { id, nama, blok, hp, tarif, status, catatan } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID Warga wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    // Selaraskan lebih dulu dengan Google Sheet MasterWarga terbaru agar tidak menimpa update dari Sheet
    try {
      const sheetRes = await fetchResidentsFromSheet();
      if (sheetRes.success && sheetRes.residents.length > 0) {
        db.residents = sheetRes.residents;
      }
    } catch {}

    const resident = db.residents.find((r) => r.id === id);

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

      const isRecordOwnedByEditedResident = (
        recordResidentId?: string | null,
        recordNameOrSumber?: string | null,
        recordBlok?: string | null
      ): boolean => {
        const recId = (recordResidentId || '').trim();
        if (recId) return recId === resident.id;
        const cleanBlok = (recordBlok || '').toUpperCase().replace(/\s+/g, '');
        if (oldBlokClean && cleanBlok === oldBlokClean) return true;
        const baseName = (recordNameOrSumber || '').split('(')[0].trim().toLowerCase();
        return Boolean(oldNamaClean && baseName === oldNamaClean);
      };

      // Update di db.incomes & Google Sheet DataIuran
      for (const inc of db.incomes || []) {
        const incBlokRaw = (inc.sumber || '').match(/\(([^)]+)\)/)?.[1] || '';
        if (isRecordOwnedByEditedResident(inc.residentId, inc.sumber, incBlokRaw)) {
          inc.sumber = newSumber;
          inc.residentId = resident.id;
          try {
            await updateIncomeInSheet(inc, resident.nama, resident.blok);
          } catch {}
        }
      }

      // Update di db.proofs & Google Sheet BuktiTransfer
      for (const p of db.proofs || []) {
        if (isRecordOwnedByEditedResident(p.residentId, p.residentName, p.blok)) {
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
        if (isRecordOwnedByEditedResident(k.wargaId, k.namaPeminjam, '')) {
          k.namaPeminjam = resident.nama;
          k.wargaId = resident.id;
          try {
            await updateRowInSheet('DataKasbon', 7, k.id, { 2: resident.nama, 8: resident.id });
          } catch {}
        }
      }

      // Update di db.expenses & Google Sheet DataPengeluaran jika mencantumkan nama warga
      for (const e of db.expenses || []) {
        const wordRegex = oldNamaClean
          ? new RegExp(`\\b${oldNamaClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
          : null;
        const isMatched =
          Boolean(oldNamaClean && e.penerima?.trim().toLowerCase() === oldNamaClean) ||
          Boolean(wordRegex && e.keterangan && wordRegex.test(e.keterangan));
        if (isMatched) {
          if (oldNamaClean && e.penerima?.trim().toLowerCase() === oldNamaClean) {
            e.penerima = resident.nama;
          }
          if (wordRegex && e.keterangan) {
            e.keterangan = e.keterangan.replace(
              new RegExp(`\\b${oldNama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
              resident.nama
            );
          }
          try {
            await updateRowInSheet('DataPengeluaran', 5, e.id, { 2: e.keterangan, 4: e.kategori });
          } catch {}
        }
      }

      // Update di db.tunggakanLama & Google Sheet TunggakanLama / TunggakanNonWarga
      for (const t of db.tunggakanLama || []) {
        if (isRecordOwnedByEditedResident(t.wargaId, t.namaWarga, t.blok)) {
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
        if (isRecordOwnedByEditedResident(pel.wargaId, pel.namaWarga, '')) {
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
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    try {
      const sheetRes = await fetchResidentsFromSheet();
      if (sheetRes.success && sheetRes.residents.length > 0) {
        db.residents = sheetRes.residents;
      }
    } catch {}

    const idx = db.residents.findIndex((r) => r.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Warga tidak ditemukan.' }, { status: 404 });
    }

    const deleted = db.residents.splice(idx, 1)[0];
    saveDb(db);

    try {
      await deleteResidentFromSheet(deleted.id, deleted.blok, deleted.nama);
    } catch (sheetErr) {
      console.error('Delete resident from sheet error:', sheetErr);
    }

    addLog('Hapus Data Warga', `Menghapus warga ${deleted.nama} (${deleted.blok})`, 'Admin');

    return NextResponse.json({ success: true, message: 'Data warga berhasil dihapus.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
