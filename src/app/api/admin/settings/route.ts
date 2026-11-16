import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { appendSaldoAwalToSheet } from '@/lib/googleSheet';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const db = getDb();
    return NextResponse.json({ success: true, settings: db.settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const db = getDb();

    const oldSaldoAwal = db.settings.saldoAwal;
    const newSaldoAwal = body.saldoAwal !== undefined ? Number(body.saldoAwal) : oldSaldoAwal;
    const nextAdminPin =
      typeof body.adminPin === 'string' && body.adminPin.trim().length >= 4
        ? body.adminPin.trim()
        : db.settings.adminPin;

    db.settings = {
      ...db.settings,
      ...body,
      adminPin: nextAdminPin,
      saldoAwal: isNaN(newSaldoAwal) ? oldSaldoAwal : newSaldoAwal,
    };

    saveDb(db);

    // Otomatis sinkronkan jika Saldo Awal diubah
    if (!isNaN(newSaldoAwal) && newSaldoAwal !== oldSaldoAwal) {
      try {
        await appendSaldoAwalToSheet({
          tanggal: new Date().toISOString(),
          keterangan: 'Pembaruan Saldo Awal Pengaturan RT',
          jumlah: newSaldoAwal,
          transaksiId: `SA-${Date.now()}`,
        });
      } catch (e) {
        console.error('Auto-sync saldo awal to sheet error:', e);
      }
    }

    addLog('Ubah Pengaturan RT', 'Informasi rekening & konfigurasi RT diperbarui', 'Admin');

    return NextResponse.json({
      success: true,
      message: 'Pengaturan berhasil disimpan!',
      settings: db.settings,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
