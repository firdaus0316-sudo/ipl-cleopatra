import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { MONTH_NAMES_ID, normalizePeriodCode, isIncomeInPeriod, matchIncomeToResident } from '@/lib/format';
import {
  fetchKasbonFromSheet,
  fetchTunggakanLamaFromSheet,
  fetchTunggakanNonWargaFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getPeriodLabel(code: string): string {
  if (code === 'ALL') return 'Semua Periode (Akumulasi)';
  if (/^\d{4}-\d{2}$/.test(code)) {
    const [y, m] = code.split('-');
    return `${MONTH_NAMES_ID[m] || m} ${y}`;
  }
  return code;
}

function isExpenseInPeriod(exp: any, targetPeriod: string, year: number): boolean {
  if (targetPeriod === 'ALL') {
    return Boolean(exp.tanggal && exp.tanggal.startsWith(String(year)));
  } else {
    const normTarget = normalizePeriodCode(targetPeriod);
    return Boolean(exp.tanggal && exp.tanggal.startsWith(normTarget));
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedTargetPeriod = searchParams.get('targetPeriod');
    const requestedYear = Number(searchParams.get('year')) || (requestedTargetPeriod && requestedTargetPeriod.startsWith('20') ? Number(requestedTargetPeriod.slice(0, 4)) : 2026);

    const db = getDb();

    // Auto-sync kasbon live dari Google Sheet DataKasbon
    try {
      const kasbonRes = await fetchKasbonFromSheet();
      if (kasbonRes.success && kasbonRes.kasbon.length > 0) {
        const localMap = new Map((db.kasbon || []).map((k) => [k.id, k]));
        db.kasbon = kasbonRes.kasbon.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [],
          };
        });
      }
    } catch {}

    // Auto-sync tunggakan live dari Google Sheet TunggakanLama & TunggakanNonWarga
    try {
      const [wRes, nwRes] = await Promise.all([
        fetchTunggakanLamaFromSheet(),
        fetchTunggakanNonWargaFromSheet(),
      ]);
      const combinedTung = [...(wRes.tunggakan || []), ...(nwRes.tunggakan || [])];
      if (combinedTung.length > 0) {
        const localMap = new Map((db.tunggakanLama || []).map((t) => [t.id, t]));
        db.tunggakanLama = combinedTung.map((s) => {
          const local = localMap.get(s.id);
          return {
            ...s,
            terbayar: local?.terbayar || s.terbayar || 0,
            riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [],
          };
        });
      }
    } catch {}

    const validIncomes = db.incomes.filter((i) => i.status === 'Sah');
    const validExpenses = db.expenses.filter((e) => e.status === 'Sah');

    const pendingProofsCount = db.proofs.filter((p) => p.status === 'Menunggu Verifikasi').length;
    const verifiedProofsCount = db.proofs.filter((p) => p.status === 'Terverifikasi').length;
    const activeResidentsCount = db.residents.filter((r) => r.status === 'Aktif').length;

    const tunggakanLamaList = db.tunggakanLama || [];
    const kasbonList = db.kasbon || [];
    const saldoAwalHistory = db.saldoAwalHistory || [];

    // STATISTIK TUNGGAKAN LAMA (TERPISAH SEBAGAI PIUTANG)
    const tunggakanBelumLunas = tunggakanLamaList.filter((t) => t.status !== 'Lunas');
    const totalTunggakanAwal = tunggakanLamaList.reduce((sum, t) => sum + (t.nominalAwal || t.jumlah), 0);
    const totalTunggakanTerbayar = tunggakanLamaList.reduce((sum, t) => sum + (t.terbayar || 0), 0);
    const sisaTunggakanBelumBayar = tunggakanBelumLunas.reduce((sum, t) => sum + t.jumlah, 0);

    // STATISTIK KASBON PETUGAS (TERPISAH SEBAGAI PINJAMAN BERJALAN)
    const kasbonBelumLunas = kasbonList.filter((k) => k.status !== 'Lunas');
    const totalKasbonAwal = kasbonList.reduce((sum, k) => sum + (k.nominalAwal || k.nominal), 0);
    const totalKasbonTerbayar = kasbonList.reduce((sum, k) => sum + (k.terbayar || 0), 0);
    const sisaKasbonBelumKembali = kasbonBelumLunas.reduce((sum, k) => sum + k.nominal, 0);

    // ==========================================
    // 1. TARGET vs REALISASI IURAN BULANAN PER PERIODE
    // ==========================================
    const defaultPeriodCode = db.settings.periodeAktif || '2026-11';
    const activePeriodCode = requestedTargetPeriod || defaultPeriodCode;
    const isAll = activePeriodCode === 'ALL';

    // Hitung Pemasukan & Pengeluaran Berdasarkan Tahun Berjalan & Periode Pilihan
    const periodIncomes = validIncomes.filter((i) => isIncomeInPeriod(i, activePeriodCode, requestedYear));
    const totalPemasukanPeriode = periodIncomes.reduce((sum, i) => sum + i.nominal, 0);

    const yearIncomes = validIncomes.filter((i) => isIncomeInPeriod(i, 'ALL', requestedYear));
    const totalPemasukanTahun = yearIncomes.reduce((sum, i) => sum + i.nominal, 0);

    const periodExpenses = validExpenses.filter((e) => isExpenseInPeriod(e, activePeriodCode, requestedYear));
    const totalPengeluaranPeriode = periodExpenses.reduce((sum, e) => sum + e.nominal, 0);

    const yearExpenses = validExpenses.filter((e) => isExpenseInPeriod(e, 'ALL', requestedYear));
    const totalPengeluaranTahun = yearExpenses.reduce((sum, e) => sum + e.nominal, 0);

    const totalIncomesAllTime = validIncomes.reduce((sum, i) => sum + i.nominal, 0);
    const totalExpensesAllTime = validExpenses.reduce((sum, e) => sum + e.nominal, 0);
    const saldoKas = db.settings.saldoAwal + totalIncomesAllTime - totalExpensesAllTime;

    const periodePemasukanLabel = isAll ? `Semua Bulan (${requestedYear})` : getPeriodLabel(normalizePeriodCode(activePeriodCode));

    const activeResidents = db.residents.filter((r) => r.status === 'Aktif');
    const totalTargetWarga = activeResidents.length;
    const totalTargetNominal = activeResidents.reduce((acc, r) => acc + (r.tarif || 150000), 0);

    // Kumpulkan seluruh periode yang ada di database transaksi
    const discoveredPeriodCodes = new Set<string>();
    validIncomes.forEach((inc) => {
      const isIuran = inc.kategori === 'Iuran Bulanan' || inc.kategori?.toLowerCase().includes('iuran');
      if (!isIuran) return;
      const bList = Array.isArray(inc.bulan) ? inc.bulan : inc.bulan ? [inc.bulan] : [];
      bList.forEach((b) => {
        const norm = normalizePeriodCode(b);
        if (norm) discoveredPeriodCodes.add(norm);
      });
      if (bList.length === 0 && inc.tanggal) {
        discoveredPeriodCodes.add(inc.tanggal.slice(0, 7));
      }
    });

    // Pastikan seluruh bulan dari requestedYear dan tahun aktif tersedia
    for (let m = 1; m <= 12; m++) {
      discoveredPeriodCodes.add(`${requestedYear}-${String(m).padStart(2, '0')}`);
    }

    const sortedPeriodCodes = Array.from(discoveredPeriodCodes).sort();

    // Helper untuk menghitung per periode
    const calculatePeriodMetrics = (pCode: string) => {
      const paidResidentsMap = new Map<string, { residentId: string; nama: string; blok: string; nominal: number; tanggal: string }>();
      let periodRealisasiNominal = 0;

      validIncomes.forEach((inc) => {
        const isIuran = inc.kategori === 'Iuran Bulanan' || inc.kategori?.toLowerCase().includes('iuran');
        if (!isIuran) return;

        const bList = Array.isArray(inc.bulan) ? inc.bulan : inc.bulan ? [inc.bulan] : [];
        const normalizedBList = bList.map((b) => normalizePeriodCode(b));

        let isMatch = false;
        if (pCode === 'ALL') {
          isMatch =
            normalizedBList.some((b) => b.startsWith(String(requestedYear))) ||
            (normalizedBList.length === 0 && Boolean(inc.tanggal?.startsWith(String(requestedYear))));
        } else {
          isMatch = normalizedBList.includes(pCode);
          if (!isMatch && normalizedBList.length === 0 && inc.tanggal?.startsWith(pCode)) {
            isMatch = true;
          }
        }

        if (isMatch) {
          periodRealisasiNominal += inc.nominal;
          let rId = inc.residentId;
          if (!rId) {
            const matchedResident = activeResidents.find((w) => matchIncomeToResident(inc, w));
            if (matchedResident) rId = matchedResident.id;
          }
          if (rId) {
            paidResidentsMap.set(rId, {
              residentId: rId,
              nama: inc.sumber,
              blok: '',
              nominal: (paidResidentsMap.get(rId)?.nominal || 0) + inc.nominal,
              tanggal: inc.tanggal,
            });
          }
        }
      });

      const wargaSudahBayarCount = paidResidentsMap.size;
      const wargaBelumBayarList = activeResidents
        .filter((r) => !paidResidentsMap.has(r.id))
        .map((r) => ({
          id: r.id,
          nama: r.nama,
          blok: r.blok,
          hp: r.hp || '',
          tarif: r.tarif || 150000,
        }));

      const wargaBelumBayarCount = wargaBelumBayarList.length;
      const sisaNominalBelumTertagih = Math.max(0, totalTargetNominal - periodRealisasiNominal);
      const persenCapaianWarga = totalTargetWarga > 0 ? Math.round((wargaSudahBayarCount / totalTargetWarga) * 100) : 0;
      const persenCapaianNominal = totalTargetNominal > 0 ? Math.round((periodRealisasiNominal / totalTargetNominal) * 100) : 0;

      return {
        periode: pCode,
        periodeLabel: getPeriodLabel(pCode),
        totalTargetWarga,
        totalTargetNominal,
        wargaSudahBayarCount,
        realisasiNominal: periodRealisasiNominal,
        wargaBelumBayarCount,
        sisaNominalBelumTertagih,
        persenCapaianWarga,
        persenCapaianNominal,
        wargaBelumBayarList,
        wargaSudahBayarList: Array.from(paidResidentsMap.values()),
      };
    };

    // Filter periode agar hanya memuat bulan dari tahun yang dipilih
    const filteredPeriodCodes = sortedPeriodCodes.filter((code) => code.startsWith(String(requestedYear)));

    // Hitung ringkasan cepat untuk semua periode yang tersedia
    const availablePeriods = [
      {
        code: 'ALL',
        label: `Semua Bulan (${requestedYear})`,
        ...(() => {
          const m = calculatePeriodMetrics('ALL');
          return {
            wargaSudahBayarCount: m.wargaSudahBayarCount,
            wargaBelumBayarCount: m.wargaBelumBayarCount,
            realisasiNominal: m.realisasiNominal,
            targetNominal: m.totalTargetNominal,
          };
        })(),
      },
      ...filteredPeriodCodes.map((code) => {
        const m = calculatePeriodMetrics(code);
        return {
          code,
          label: m.periodeLabel,
          wargaSudahBayarCount: m.wargaSudahBayarCount,
          wargaBelumBayarCount: m.wargaBelumBayarCount,
          realisasiNominal: m.realisasiNominal,
          targetNominal: m.totalTargetNominal,
        };
      }),
    ];

    // Data target realisasi iuran untuk periode yang sedang dipilih
    const targetRealisasiIuran = {
      ...calculatePeriodMetrics(activePeriodCode),
      availablePeriods,
    };

    // ==========================================
    // 2. DATA GRAFIK ARUS KAS (CASH FLOW CHART)
    // ==========================================
    // Agregasi transaksi harian untuk visualisasi arus kas sesuai periode & tahun
    const dailyMap = new Map<string, { masuk: number; keluar: number }>();

    // Masukkan transaksi kas masuk periode aktif
    periodIncomes.forEach((inc) => {
      const dateStr = inc.tanggal ? inc.tanggal.slice(0, 10) : `${requestedYear}-11-01`;
      const existing = dailyMap.get(dateStr) || { masuk: 0, keluar: 0 };
      existing.masuk += inc.nominal;
      dailyMap.set(dateStr, existing);
    });

    // Masukkan transaksi kas keluar periode aktif
    periodExpenses.forEach((exp) => {
      const dateStr = exp.tanggal ? exp.tanggal.slice(0, 10) : `${requestedYear}-11-01`;
      const existing = dailyMap.get(dateStr) || { masuk: 0, keluar: 0 };
      existing.keluar += exp.nominal;
      dailyMap.set(dateStr, existing);
    });

    // Urutkan berdasarkan tanggal
    const sortedDates = Array.from(dailyMap.keys()).sort();
    let rollingBalance = isAll ? db.settings.saldoAwal : 0;

    const dailyCashFlow = sortedDates.map((dateStr) => {
      const item = dailyMap.get(dateStr)!;
      rollingBalance += item.masuk - item.keluar;

      // Format label hari & bulan sederhana: misal '03 Nov'
      const parts = dateStr.split('-');
      const d = parts[2] || '01';
      const m = parts[1] || '11';
      const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const mIdx = parseInt(m, 10) - 1;
      const label = `${d} ${monthNamesShort[mIdx] || 'Nov'}`;

      return {
        tanggal: dateStr,
        label,
        masuk: item.masuk,
        keluar: item.keluar,
        surplusDefisit: item.masuk - item.keluar,
        saldoKumulatif: rollingBalance,
      };
    });

    const cashFlowChart = {
      saldoAwal: db.settings.saldoAwal,
      totalMasuk: totalPemasukanPeriode,
      totalKeluar: totalPengeluaranPeriode,
      surplusDefisit: totalPemasukanPeriode - totalPengeluaranPeriode,
      saldoAkhir: saldoKas,
      dailyData: dailyCashFlow,
    };

    // Recent 5 pending proofs
    const pendingProofs = db.proofs
      .filter((p) => p.status === 'Menunggu Verifikasi')
      .slice(0, 5);

    // Recent 8 transactions combined (filter berdasarkan periode jika bukan ALL)
    const txIncomes = periodIncomes.map((inc) => ({
      id: inc.id,
      type: 'income' as const,
      tanggal: inc.tanggal,
      deskripsi: `${inc.kategori} - ${inc.sumber}`,
      nominal: inc.nominal,
      status: inc.status,
    }));
    const txExpenses = periodExpenses.map((exp) => ({
      id: exp.id,
      type: 'expense' as const,
      tanggal: exp.tanggal,
      deskripsi: `${exp.kategori} (${exp.penerima})`,
      nominal: exp.nominal,
      status: exp.status,
    }));
    const combinedTransactions = [...txIncomes, ...txExpenses]
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
      .slice(0, 8);

    return NextResponse.json({
      success: true,
      stats: {
        // KAS RIIL RT (Mengikuti tahun & periode berjalan yang dipilih)
        saldoKas,
        saldoAwal: db.settings.saldoAwal,
        totalPemasukan: totalPemasukanPeriode,
        totalPemasukanPeriode,
        totalPemasukanTahun,
        totalPemasukanAllTime: totalIncomesAllTime,
        totalPengeluaran: totalPengeluaranPeriode,
        totalPengeluaranPeriode,
        totalPengeluaranTahun,
        totalPengeluaranAllTime: totalExpensesAllTime,
        periodeAktif: activePeriodCode,
        periodeLabel: periodePemasukanLabel,
        periodePemasukanLabel,
        isPeriodAll: isAll,
        selectedYear: requestedYear,
        pendingProofsCount,
        verifiedProofsCount,
        activeResidentsCount,

        // PIUTANG TUNGGAKAN LAMA
        tunggakanLamaCount: tunggakanBelumLunas.length,
        totalTunggakanAwal,
        totalTunggakanTerbayar,
        totalTunggakanLama: sisaTunggakanBelumBayar,

        // PINJAMAN KASBON PETUGAS
        kasbonAktifCount: kasbonBelumLunas.length,
        totalKasbonAwal,
        totalKasbonTerbayar,
        totalKasbonAktif: sisaKasbonBelumKembali,
      },
      pendingProofs,
      recentTransactions: combinedTransactions,
      recentLogs: db.logs.slice(0, 6),
      tunggakanLama: tunggakanLamaList,
      kasbon: kasbonList,
      saldoAwalHistory,
      targetRealisasiIuran,
      cashFlowChart,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
