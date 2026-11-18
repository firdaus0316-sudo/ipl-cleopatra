import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { normalizePeriodCode } from '@/lib/format';
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

    // Petakan periode lunas & menunggu verifikasi berdasarkan residentId (utama) dan Blok (hanya jika unik 1 KK per blok)
    const activeResidents = (db.residents || []).filter((r) => r && r.status === 'Aktif');
    const blokResidentCount = new Map<string, number>();
    activeResidents.forEach((r) => {
      const cb = (r.blok || '').toUpperCase().replace(/\s+/g, '');
      if (cb) blokResidentCount.set(cb, (blokResidentCount.get(cb) || 0) + 1);
    });

    const paidPeriodsByResident: Record<string, string[]> = {};
    const pendingPeriodsByResident: Record<string, string[]> = {};
    const paidPeriodsByBlok: Record<string, string[]> = {};
    const pendingPeriodsByBlok: Record<string, string[]> = {};

    (db.incomes || []).forEach((inc) => {
      if (!inc || inc.status !== 'Sah') return;
      const kat = (inc.kategori || '').toLowerCase();
      if (!kat.includes('iuran') || kat.includes('tunggakan')) return;
      const match = (inc.sumber || '').match(/\(([^)]+)\)/);
      const rawBlok = match?.[1] || '';
      const cleanBlok = rawBlok.toUpperCase().replace(/\s+/g, '');
      const months = (inc.bulan || []).map((b) => normalizePeriodCode(b)).filter(Boolean);

      if (inc.residentId) {
        if (!paidPeriodsByResident[inc.residentId]) paidPeriodsByResident[inc.residentId] = [];
        months.forEach((norm) => {
          if (!paidPeriodsByResident[inc.residentId!].includes(norm)) {
            paidPeriodsByResident[inc.residentId!].push(norm);
          }
        });
      }

      if (cleanBlok && (!inc.residentId || (blokResidentCount.get(cleanBlok) || 0) <= 1)) {
        if (!paidPeriodsByBlok[cleanBlok]) paidPeriodsByBlok[cleanBlok] = [];
        months.forEach((norm) => {
          if (!paidPeriodsByBlok[cleanBlok].includes(norm)) {
            paidPeriodsByBlok[cleanBlok].push(norm);
          }
        });
      }
    });

    (db.proofs || []).forEach((p) => {
      if (!p || p.status !== 'Menunggu Verifikasi') return;
      const kat = (p.kategori || '').toLowerCase();
      if (!kat.includes('iuran') || kat.includes('tunggakan')) return;
      const cleanBlok = (p.blok || '').toUpperCase().replace(/\s+/g, '');
      const months = (p.bulan || []).map((b) => normalizePeriodCode(b)).filter(Boolean);

      if (p.residentId) {
        if (!pendingPeriodsByResident[p.residentId]) pendingPeriodsByResident[p.residentId] = [];
        months.forEach((norm) => {
          if (!pendingPeriodsByResident[p.residentId!].includes(norm)) {
            pendingPeriodsByResident[p.residentId!].push(norm);
          }
        });
      }

      if (cleanBlok && (!p.residentId || (blokResidentCount.get(cleanBlok) || 0) <= 1)) {
        if (!pendingPeriodsByBlok[cleanBlok]) pendingPeriodsByBlok[cleanBlok] = [];
        months.forEach((norm) => {
          if (!pendingPeriodsByBlok[cleanBlok].includes(norm)) {
            pendingPeriodsByBlok[cleanBlok].push(norm);
          }
        });
      }
    });

    return NextResponse.json({
      success: true,
      settings: safeSettings,
      residents: activeResidents,
      saldoKas,
      paidPeriodsByResident,
      pendingPeriodsByResident,
      paidPeriodsByBlok,
      pendingPeriodsByBlok,
      sheetStatus: `Tersinkron otomatis Google Sheets`,
      isSheetLocked: false,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
