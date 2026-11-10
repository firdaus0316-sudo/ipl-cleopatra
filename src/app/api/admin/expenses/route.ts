import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { ExpenseTransaction } from '@/types';
import { uploadToGoogleDrive } from '@/lib/driveUpload';
import {
  appendExpenseToSheet,
  appendBuktiStrukToSheet,
  deleteExpenseFromSheet,
  fetchExpensesFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();
    let expenses = db.expenses || [];

    try {
      const sheetRes = await fetchExpensesFromSheet();
      if (sheetRes.success && sheetRes.expenses.length > 0) {
        const sheetExpMap = new Map(sheetRes.expenses.map((e) => [e.id, e]));
        const localMap = new Map(expenses.map((e) => [e.id, e]));

        expenses = sheetRes.expenses.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            buktiUrl: local?.buktiUrl || s.buktiUrl,
            driveUrl: local?.driveUrl || s.driveUrl,
          };
        });

        for (const [id, loc] of localMap.entries()) {
          if (!sheetExpMap.has(id)) {
            expenses.unshift(loc);
          }
        }

        db.expenses = expenses;
        saveDb(db);
      }
    } catch (e) {
      console.warn('Gagal fetch live expenses dari sheet:', e);
    }

    expenses.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    return NextResponse.json({ success: true, data: expenses });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tanggal, kategori, nominal, penerima, keterangan, buktiUrl } = body;

    if (!tanggal || !kategori || !nominal || !penerima) {
      return NextResponse.json(
        { success: false, error: 'Tanggal, kategori, nominal, dan nama penerima wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const expenseId = `EXP-${Date.now()}`;

    let finalBuktiUrl = buktiUrl || undefined;
    let driveUrl: string | undefined = undefined;

    // Otomatis simpan bukti nota / struk ke folder Google Drive BuktiFoto (1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB)
    if (buktiUrl && (buktiUrl.startsWith('data:image') || buktiUrl.startsWith('data:application/pdf'))) {
      const cleanCat = kategori.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const cleanRec = penerima.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Struk_${expenseId}_${cleanCat}_${cleanRec}.jpg`;

      const webhookUrl = db.settings.googleDriveWebhookUrl || db.settings.linkPenyimpananBuktiDrive;
      const driveRes = await uploadToGoogleDrive(buktiUrl, filename, webhookUrl);
      if (driveRes.success && driveRes.fileUrl) {
        driveUrl = driveRes.fileUrl;
        finalBuktiUrl = driveRes.fileUrl;
      }
    }

    const newExpense: ExpenseTransaction = {
      id: expenseId,
      tanggal: tanggal.slice(0, 10),
      kategori: kategori.trim(),
      nominal: Number(nominal),
      penerima: penerima.trim(),
      keterangan: keterangan?.trim() || '',
      buktiUrl: finalBuktiUrl,
      driveUrl,
      status: 'Sah',
      createdAt: new Date().toISOString(),
    };

    db.expenses.unshift(newExpense);
    saveDb(db);

    // Otomatis sinkronkan ke Google Sheet DataPengeluaran & BuktiStruk
    try {
      await appendExpenseToSheet(newExpense);
      if (newExpense.buktiUrl || newExpense.driveUrl) {
        await appendBuktiStrukToSheet(newExpense);
      }
    } catch (e) {
      console.error('Auto-sync expense to sheets error:', e);
    }

    addLog(
      'Catat Pengeluaran Kas',
      `Pengeluaran ${expenseId} (${newExpense.kategori}) kepada ${newExpense.penerima} sebesar Rp ${newExpense.nominal.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Transaksi pengeluaran berhasil dicatat!',
      data: newExpense,
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
    const exp = db.expenses.find((e) => e.id === id);

    if (!exp) {
      return NextResponse.json({ success: false, error: 'Transaksi pengeluaran tidak ditemukan.' }, { status: 404 });
    }

    if (action === 'void') {
      exp.status = 'Dibatalkan';
      saveDb(db);
      addLog('Batalkan Pengeluaran', `Pengeluaran ${exp.id} dibatalkan / void`, 'Admin');
      return NextResponse.json({ success: true, message: 'Transaksi berhasil dibatalkan.' });
    }

    if (action === 'restore') {
      exp.status = 'Sah';
      saveDb(db);
      addLog('Pulihkan Pengeluaran', `Pengeluaran ${exp.id} dipulihkan statusnya menjadi Sah`, 'Admin');
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
      return NextResponse.json({ success: false, error: 'ID pengeluaran wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    const idx = db.expenses.findIndex((e) => e.id === id);

    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Transaksi pengeluaran tidak ditemukan.' }, { status: 404 });
    }

    const exp = db.expenses[idx];
    db.expenses.splice(idx, 1);
    saveDb(db);

    try {
      await deleteExpenseFromSheet(exp.id || id);
    } catch (e) {
      console.error('Auto-sync delete expense from sheets error:', e);
    }

    addLog(
      'Hapus Pengeluaran',
      `Menghapus transaksi pengeluaran ${exp.id} (${exp.kategori} - ${exp.keterangan}) sebesar Rp ${exp.nominal.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({ success: true, message: 'Transaksi pengeluaran berhasil dihapus.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
