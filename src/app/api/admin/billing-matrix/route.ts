import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { matchIncomeToResident, matchProofToResident } from '@/lib/format';
import { fetchIncomesFromSheet, fetchResidentsFromSheet } from '@/lib/googleSheet';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function matchesMonth(targetYear: number, monthIndex: number, bStr?: string | null): boolean {
  if (!bStr) return false;
  const str = bStr.trim().toLowerCase();
  const mNum = monthIndex + 1;
  const mNumPad = String(mNum).padStart(2, '0');
  const code = `${targetYear}-${mNumPad}`;

  // 1. Format YYYY-MM (e.g. 2026-11)
  if (str === code || str.includes(code)) return true;

  // 2. Format Nama Bulan (e.g. "November 2026", "November")
  const mName = MONTH_NAMES[monthIndex].toLowerCase();
  if (str === mName || str === `${mName} ${targetYear}`) return true;

  // 3. Format Singkat (e.g. "Nov 2026", "Nov")
  const mShort = mName.slice(0, 3);
  if (str.startsWith(mShort) && (!str.match(/\d{4}/) || str.includes(String(targetYear)))) return true;

  // 4. Substring nama bulan dan tahun cocok
  if (str.includes(mName)) {
    const yMatch = str.match(/\d{4}/);
    if (!yMatch || yMatch[0] === String(targetYear)) return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get('year')) || 2026;

    const db = getDb();

    // Auto-sync live residents & incomes dari Google Sheet
    try {
      const [incRes, resRes] = await Promise.all([
        fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] })),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] })),
      ]);

      if (resRes.success && resRes.residents && resRes.residents.length > 0) {
        db.residents = resRes.residents;
      }

      if (incRes.success && incRes.incomes && incRes.incomes.length > 0) {
        const localMap = new Map((db.incomes || []).map((i) => [i.id, i]));
        db.incomes = incRes.incomes.map((s) => {
          const local = localMap.get(s.id);
          return { ...s, buktiId: local?.buktiId || s.buktiId };
        });
      }
    } catch {}

    const activeResidents = (db.residents || []).filter((r) => r.status === 'Aktif');
    const validIncomes = (db.incomes || []).filter((i) => i.status !== 'Dibatalkan');
    const pendingProofs = (db.proofs || []).filter((p) => p.status === 'Menunggu Verifikasi');
    const currentPeriod = db.settings?.periodeAktif || '2026-11';

    // Statistik bulanan untuk rekapitulasi cepat
    const monthlyStats: Record<string, { lunas: number; menunggu: number; belum: number; nominal: number }> = {};
    MONTH_NAMES.forEach((m) => {
      monthlyStats[m] = { lunas: 0, menunggu: 0, belum: 0, nominal: 0 };
    });

    // Kalkulasi Matriks Per Warga
    const matrix = activeResidents.map((warga) => {
      const monthsStatus: Record<
        string,
        {
          status: 'Lunas' | 'Menunggu' | 'Belum Bayar';
          nominal?: number;
          tanggal?: string;
          transaksiId?: string;
          metode?: string;
        }
      > = {};

      // Cari semua iuran yang cocok dengan warga ini (dari Sheet DataIuran & Transaksi Lokal)
      const residentIncomes = validIncomes.filter((i) => matchIncomeToResident(i, warga));

      // Cari semua bukti transfer pending yang cocok dengan warga ini
      const residentPendingProofs = pendingProofs.filter((p) => matchProofToResident(p, warga));

      for (let monthIdx = 0; monthIdx < MONTH_NAMES.length; monthIdx++) {
        const m = MONTH_NAMES[monthIdx];
        const mNumPad = String(monthIdx + 1).padStart(2, '0');
        const periodCode = `${year}-${mNumPad}`;

        // 1. Cek Lunas di Incomes (Sheet dataiuran)
        const matchedIncome = residentIncomes.find((i) => {
          const bList = Array.isArray(i.bulan) ? i.bulan : i.bulan ? [i.bulan] : [];
          if (bList.some((b) => matchesMonth(year, monthIdx, b))) return true;

          // Jika kolom bulan kosong, gunakan tanggal transaksi
          if (bList.length === 0 && i.tanggal && i.tanggal.startsWith(periodCode)) return true;

          return false;
        });

        if (matchedIncome) {
          monthsStatus[m] = {
            status: 'Lunas',
            nominal: matchedIncome.nominal,
            tanggal: matchedIncome.tanggal,
            transaksiId: matchedIncome.id,
            metode: matchedIncome.kategori || 'Iuran Bulanan',
          };
          monthlyStats[m].lunas++;
          monthlyStats[m].nominal += Number(matchedIncome.nominal) || 0;
          continue;
        }

        // 2. Cek Menunggu Verifikasi di Proofs
        const matchedProof = residentPendingProofs.find((p) => {
          const bList = Array.isArray(p.bulan) ? p.bulan : p.bulan ? [p.bulan] : [];
          return bList.some((b) => matchesMonth(year, monthIdx, b));
        });

        if (matchedProof) {
          monthsStatus[m] = {
            status: 'Menunggu',
            nominal: matchedProof.nominal,
            tanggal: matchedProof.createdAt ? matchedProof.createdAt.slice(0, 10) : undefined,
            transaksiId: matchedProof.id,
          };
          monthlyStats[m].menunggu++;
          continue;
        }

        // 3. Belum Bayar
        monthsStatus[m] = { status: 'Belum Bayar' };
        monthlyStats[m].belum++;
      }

      // Hitung total lunas tahun ini untuk warga tersebut
      const totalLunasTahunIni = Object.values(monthsStatus).filter((s) => s.status === 'Lunas').length;

      return {
        id: warga.id,
        nama: warga.nama,
        blok: warga.blok,
        hp: warga.hp,
        tarif: warga.tarif,
        months: monthsStatus,
        totalLunasTahunIni,
      };
    });

    return NextResponse.json({
      success: true,
      year,
      monthNames: MONTH_NAMES,
      currentPeriod,
      totalResidents: activeResidents.length,
      monthlyStats,
      data: matrix,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
