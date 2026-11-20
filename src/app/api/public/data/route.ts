import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizePeriodCode, isIuranBulananCategory } from '@/lib/format';
import {
  fetchResidentsFromSheet,
  fetchIncomesFromSheet,
  fetchExpensesFromSheet,
  fetchSaldoAwalFromSheet,
  fetchProofsFromSheet,
  syncAllDbNamesWithMaster,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const db = getDb();

    // Fetch live residents, incomes, expenses, proofs, and saldo awal from Google Sheet
    try {
      const [sheetResult, incRes, expRes, saldoRes, proofRes] = await Promise.all([
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] as any[] })),
        fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] as any[] })),
        fetchExpensesFromSheet().catch(() => ({ success: false, expenses: [] as any[] })),
        fetchSaldoAwalFromSheet().catch(() => ({ success: false, saldoAwal: db.settings.saldoAwal })),
        fetchProofsFromSheet().catch(() => ({ success: false, proofs: [] as any[] })),
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
      if (proofRes.success && proofRes.proofs && proofRes.proofs.length > 0) {
        const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);
        db.proofs = proofRes.proofs.filter((p) => !deletedProofSet.has(p.id));
      }
      syncAllDbNamesWithMaster(db);
    } catch (e) {
      console.warn('Public data live sync error:', e);
    }

    const { adminPin, ...safeSettings } = db.settings;

    const totalPemasukan = (db.incomes || [])
      .filter((i) => i && i.status === 'Sah')
      .reduce((sum, i) => sum + (Number(i.nominal) || 0), 0);

    const totalPengeluaran = (db.expenses || [])
      .filter((e) => e && e.status === 'Sah')
      .reduce((sum, e) => sum + (Number(e.nominal) || 0), 0);

    const saldoKas = (Number(db.settings?.saldoAwal) || 0) + totalPemasukan - totalPengeluaran;

    // Petakan periode yang sudah lunas & menunggu verifikasi per Blok untuk cegah dobel bayar
    const paidPeriodsByBlok: Record<string, string[]> = {};
    const pendingPeriodsByBlok: Record<string, string[]> = {};

    (db.incomes || []).forEach((inc) => {
      if (!inc || inc.status !== 'Sah') return;
      if (!isIuranBulananCategory(inc.kategori)) return;
      const match = (inc.sumber || '').match(/\(([^)]+)\)/);
      const rawBlok = match?.[1] || '';
      const cleanBlok = rawBlok.toUpperCase().replace(/\s+/g, '');
      if (!cleanBlok) return;
      if (!paidPeriodsByBlok[cleanBlok]) paidPeriodsByBlok[cleanBlok] = [];
      (inc.bulan || []).forEach((b) => {
        const norm = normalizePeriodCode(b);
        if (norm && !paidPeriodsByBlok[cleanBlok].includes(norm)) {
          paidPeriodsByBlok[cleanBlok].push(norm);
        }
      });
    });

    (db.proofs || []).forEach((p) => {
      if (!p || p.status !== 'Menunggu Verifikasi') return;
      if (!isIuranBulananCategory(p.kategori)) return;
      const cleanBlok = (p.blok || '').toUpperCase().replace(/\s+/g, '');
      if (!cleanBlok) return;
      if (!pendingPeriodsByBlok[cleanBlok]) pendingPeriodsByBlok[cleanBlok] = [];
      (p.bulan || []).forEach((b) => {
        const norm = normalizePeriodCode(b);
        if (norm && !pendingPeriodsByBlok[cleanBlok].includes(norm)) {
          pendingPeriodsByBlok[cleanBlok].push(norm);
        }
      });
    });

    const activeResidentsList = (db.residents || []).filter((r) => r && r.status === 'Aktif');
    const totalResidentsCount = (db.residents || []).length;

    return NextResponse.json({
      success: true,
      settings: safeSettings,
      residents: activeResidentsList,
      residentCounts: {
        total: totalResidentsCount,
        aktif: activeResidentsList.length,
        nonaktif: Math.max(0, totalResidentsCount - activeResidentsList.length),
      },
      saldoKas,
      paidPeriodsByBlok,
      pendingPeriodsByBlok,
      sheetStatus: `Tersinkron otomatis Google Sheets`,
      isSheetLocked: false,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
