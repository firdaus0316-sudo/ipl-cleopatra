import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { Resident } from '@/types';
import { appendResidentToSheet } from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();
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
    const resident = db.residents.find((r) => r.id === id);

    if (!resident) {
      return NextResponse.json({ success: false, error: 'Warga tidak ditemukan.' }, { status: 404 });
    }

    if (nama) resident.nama = nama.trim();
    if (blok) resident.blok = blok.trim().toUpperCase();
    if (hp !== undefined) resident.hp = hp.trim();
    if (tarif !== undefined) resident.tarif = Number(tarif);
    if (status) resident.status = status;
    if (catatan !== undefined) resident.catatan = catatan.trim();

    saveDb(db);
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
