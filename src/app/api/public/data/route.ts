import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import {
  fetchResidentsFromSheet,
  fetchIncomesFromSheet,
  fetchExpensesFromSheet,
  fetchSaldoAwalFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();

    // Fetch live residents, incomes, expenses, and saldo awal from Google Sheet
    try {
      const [sheetResult, incRes, expRes, saldoRes] = await Promise.all([
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] })),
        fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] })),
        fetchExpensesFromSheet().catch(() => ({ success: false, expenses: [] })),
        fetchSaldoAwalFromSheet().catch(() => ({ success: false, saldoAwal: db.settings.saldoAwal })),
      ]);

      if (sheetResult.success && sheetResult.residents && sheetResult.residents.length > 0) {
        db.residents = sheetResult.residents;
      }
      if (incRes.success && incRes.incomes && incRes.incomes.length > 0) {
        const localMap = new Map((db.incomes || []).map((i) => [i.id, i]));
        db.incomes = incRes.incomes.map((s) => {
          const local = localMap.get(s.id);
          return { ...s, buktiId: local?.buktiId || s.buktiId };
        });
      }
      if (expRes.success && expRes.expenses && expRes.expenses.length > 0) {
        const deletedSet = new Set(db.deletedExpenseIds || []);
        const localMap = new Map((db.expenses || []).map((e) => [e.id, e]));
        db.expenses = expRes.expenses
          .filter((s) => !deletedSet.has(s.id))
          .map((s) => {
            const local = localMap.get(s.id);
            return {
              ...s,
              buktiUrl: local?.buktiUrl || s.buktiUrl,
              driveUrl: local?.driveUrl || s.driveUrl,
            };
          });
      }
      if (saldoRes.success && saldoRes.saldoAwal) {
        db.settings.saldoAwal = saldoRes.saldoAwal;
      }
    } catch (e) {
      console.warn('Public data live sync error:', e);
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
      sheetStatus: `Tersinkron otomatis Google Sheets`,
      isSheetLocked: false,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
