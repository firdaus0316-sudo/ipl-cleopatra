import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { fetchResidentsFromSheet } from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();

    // Fetch live residents from Google Sheet
    const sheetResult = await fetchResidentsFromSheet();

    let sheetStatus = '';
    if (sheetResult.success && sheetResult.residents.length > 0) {
      db.residents = sheetResult.residents;
      saveDb(db);
      sheetStatus = `Tersinkron otomatis (${sheetResult.residents.length} warga)`;
    } else if (sheetResult.error) {
      sheetStatus = sheetResult.error;
    }

    const { adminPin, ...safeSettings } = db.settings;

    const totalPemasukan = db.incomes
      .filter((i) => i.status === 'Sah')
      .reduce((sum, i) => sum + i.nominal, 0);

    const totalPengeluaran = db.expenses
      .filter((e) => e.status === 'Sah')
      .reduce((sum, e) => sum + e.nominal, 0);

    const saldoKas = db.settings.saldoAwal + totalPemasukan - totalPengeluaran;

    return NextResponse.json({
      success: true,
      settings: safeSettings,
      residents: db.residents.filter((r) => r.status === 'Aktif'),
      saldoKas,
      sheetStatus,
      isSheetLocked: !sheetResult.success && Boolean(sheetResult.error?.includes('dikunci')),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
