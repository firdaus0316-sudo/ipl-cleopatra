import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  fetchIncomesFromSheet,
  fetchExpensesFromSheet,
  appendExpenseToSheet,
  fetchKasbonFromSheet,
  fetchTunggakanLamaFromSheet,
  fetchTunggakanNonWargaFromSheet,
  fetchSaldoAwalFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function GET() {
  try {
    const db = getDb();

    // Auto-sync live data dari Google Sheets secara real-time
    try {
      const [kasbonRes, tungWRes, tungNWRes, expRes, incRes, saldoRes] = await Promise.all([
        fetchKasbonFromSheet().catch(() => ({ success: false, kasbon: [] })),
        fetchTunggakanLamaFromSheet().catch(() => ({ success: false, tunggakan: [] })),
        fetchTunggakanNonWargaFromSheet().catch(() => ({ success: false, tunggakan: [] })),
        fetchExpensesFromSheet().catch(() => ({ success: false, expenses: [] })),
        fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] })),
        fetchSaldoAwalFromSheet().catch(() => ({ success: false, saldoAwal: db.settings.saldoAwal })),
      ]);

      if (kasbonRes.success && kasbonRes.kasbon.length > 0) {
        const localMap = new Map((db.kasbon || []).map((k) => [k.id, k]));
        db.kasbon = kasbonRes.kasbon.map((s) => {
          const local = localMap.get(s.id);
          return { ...s, riwayatPembayaran: local?.riwayatPembayaran || s.riwayatPembayaran || [] };
        });
      }

      const combinedTung = [...(tungWRes.tunggakan || []), ...(tungNWRes.tunggakan || [])];
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

      if (expRes.success && expRes.expenses.length > 0) {
        const deletedSet = new Set(db.deletedExpenseIds || []);
        const localMap = new Map((db.expenses || []).map((e) => [e.id, e]));
        db.expenses = expRes.expenses
          .filter((s) => !deletedSet.has(s.id))
          .map((s) => {
            const local = localMap.get(s.id);
            return {
              ...s,
              penerima: (s.penerima && s.penerima !== 'Pihak Terkait / Toko') ? s.penerima : (local?.penerima || s.penerima),
              buktiUrl: local?.buktiUrl || s.buktiUrl,
              driveUrl: local?.driveUrl || s.driveUrl,
            };
          });
      }

      // Auto-reconciliation: Pastikan setiap kasbon aktif di DataKasbon tercatat di pengeluaran
      const activeKasbonList = db.kasbon || [];
      for (const ksb of activeKasbonList) {
        if (!ksb.nominal || ksb.nominal <= 0) continue;
        const exists = (db.expenses || []).some(
          (e) =>
            e.id === `EXP-${ksb.id}` ||
            e.id === `EXP-KSB-${ksb.id.replace(/^KSB-/, '')}` ||
            e.id === ksb.id ||
            e.id.includes(ksb.id) ||
            (e.kategori === 'Kasbon' &&
              e.penerima?.toLowerCase() === ksb.namaPeminjam?.toLowerCase() &&
              e.nominal === (ksb.nominalAwal || ksb.nominal))
        );
        if (!exists) {
          const missingExpense = {
            id: `EXP-KSB-${ksb.id}`,
            tanggal: ksb.tglBackdate || (ksb.timestamp ? ksb.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            kategori: 'Kasbon',
            keterangan: `Kasbon: ${ksb.namaPeminjam} - ${ksb.keterangan || 'Pinjaman Petugas'}`,
            penerima: ksb.namaPeminjam,
            nominal: ksb.nominalAwal || ksb.nominal,
            status: 'Sah' as const,
            createdAt: new Date().toISOString(),
          };
          db.expenses.push(missingExpense);
          try {
            appendExpenseToSheet(missingExpense, ksb.id);
          } catch {}
        }
      }

      if (incRes.success && incRes.incomes.length > 0) {
        const localMap = new Map((db.incomes || []).map((i) => [i.id, i]));
        db.incomes = incRes.incomes.map((s) => {
          const local = localMap.get(s.id);
          return { ...s, buktiId: local?.buktiId || s.buktiId };
        });
      }

      if (saldoRes.success && saldoRes.saldoAwal) {
        db.settings.saldoAwal = saldoRes.saldoAwal;
      }
    } catch (e) {
      console.warn('Transparency sheet sync error:', e);
    }
    
    // Pastikan transaksi pendapatan selalu menggunakan nama resmi terkini dari Master Warga
    const residentMapById = new Map((db.residents || []).map((r) => [r.id, r]));
    const residentMapByBlok = new Map((db.residents || []).map((r) => [(r.blok || '').toUpperCase().replace(/\s+/g, ''), r]));

    db.incomes = (db.incomes || []).map((inc) => {
      const cleanBlok = (inc.sumber || '').replace(/.*\(|\).*/g, '').toUpperCase().replace(/\s+/g, '');
      const res = (inc.residentId && residentMapById.get(inc.residentId)) || (cleanBlok && residentMapByBlok.get(cleanBlok));
      if (res && res.nama) {
        return { ...inc, residentId: res.id, sumber: `${res.nama} (${res.blok})` };
      }
      return inc;
    });

    const validIncomes = db.incomes.filter((i) => i.status === 'Sah');
    const validExpenses = db.expenses.filter((e) => e.status === 'Sah');

    const totalIncomes = validIncomes.reduce((sum, i) => sum + (Number(i.nominal) || 0), 0);
    const totalExpenses = validExpenses.reduce((sum, e) => sum + (Number(e.nominal) || 0), 0);
    const saldoAkhir = (Number(db.settings.saldoAwal) || 0) + totalIncomes - totalExpenses;

    // Breakdown expense by category
    const expenseByCategory: Record<string, number> = {};
    for (const exp of validExpenses) {
      const cat = exp.kategori || 'Lainnya';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + exp.nominal;
    }

    // Breakdown income by category
    const incomeByCategory: Record<string, number> = {};
    for (const inc of validIncomes) {
      const cat = inc.kategori || 'Iuran Bulanan';
      incomeByCategory[cat] = (incomeByCategory[cat] || 0) + inc.nominal;
    }

    // Tunggakan Lama & Kasbon Petugas (Pos Piutang & Pinjaman Berjalan)
    const tunggakanLamaList = db.tunggakanLama || [];
    const tunggakanBelumLunas = tunggakanLamaList.filter((t) => t.status !== 'Lunas');
    const totalTunggakanAwal = tunggakanLamaList.reduce((sum, t) => sum + (t.nominalAwal || t.jumlah), 0);
    const totalTunggakanTerbayar = tunggakanLamaList.reduce((sum, t) => sum + (t.terbayar || 0), 0);
    const sisaTunggakanBelumBayar = tunggakanBelumLunas.reduce((sum, t) => sum + t.jumlah, 0);

    const kasbonList = db.kasbon || [];
    const kasbonBelumLunas = kasbonList.filter((k) => k.status !== 'Lunas');
    const totalKasbonAwal = kasbonList.reduce((sum, k) => sum + (k.nominalAwal || k.nominal), 0);
    const totalKasbonTerbayar = kasbonList.reduce((sum, k) => sum + (k.terbayar || 0), 0);
    const sisaKasbonBelumKembali = kasbonBelumLunas.reduce((sum, k) => sum + k.nominal, 0);

    // Monthly flow breakdown for Bar Chart (Year 2026 / current year)
    const monthlyMap: Record<number, { masuk: number; keluar: number }> = {};
    for (let m = 0; m < 12; m++) {
      monthlyMap[m] = { masuk: 0, keluar: 0 };
    }

    validIncomes.forEach((inc) => {
      if (inc.tanggal) {
        const m = parseInt(inc.tanggal.slice(5, 7), 10) - 1;
        if (!isNaN(m) && m >= 0 && m < 12) {
          monthlyMap[m].masuk += inc.nominal;
        }
      }
    });

    validExpenses.forEach((exp) => {
      if (exp.tanggal) {
        const m = parseInt(exp.tanggal.slice(5, 7), 10) - 1;
        if (!isNaN(m) && m >= 0 && m < 12) {
          monthlyMap[m].keluar += exp.nominal;
        }
      }
    });

    const monthlyFlow = MONTH_NAMES_SHORT.map((name, index) => ({
      month: name,
      monthIndex: index + 1,
      masuk: monthlyMap[index].masuk,
      keluar: monthlyMap[index].keluar,
    }));

    // Recent public expenses
    const recentExpenses = validExpenses
      .slice()
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
      .slice(0, 15)
      .map((e) => ({
        id: e.id,
        tanggal: e.tanggal,
        kategori: e.kategori,
        nominal: e.nominal,
        penerima: e.penerima,
        keterangan: e.keterangan,
        buktiUrl: e.buktiUrl || null,
      }));

    // Recent public incomes
    const recentIncomes = validIncomes
      .slice()
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime())
      .slice(0, 15)
      .map((i) => ({
        id: i.id,
        tanggal: i.tanggal,
        sumber: i.sumber,
        kategori: i.kategori,
        nominal: i.nominal,
      }));

    return NextResponse.json({
      success: true,
      summary: {
        saldoAwal: db.settings.saldoAwal,
        totalPemasukan: totalIncomes,
        totalPengeluaran: totalExpenses,
        saldoAkhir,
      },
      expenseByCategory,
      incomeByCategory,
      monthlyFlow,
      posPiutang: {
        tunggakan: {
          totalAwal: totalTunggakanAwal,
          totalTerbayar: totalTunggakanTerbayar,
          sisaBelumBayar: sisaTunggakanBelumBayar,
          countBelumLunas: tunggakanBelumLunas.length,
          list: tunggakanLamaList.map((t) => ({
            id: t.id,
            namaWarga: t.namaWarga,
            jumlah: t.jumlah,
            nominalAwal: t.nominalAwal || t.jumlah,
            keterangan: t.keterangan,
            status: t.status,
          })),
        },
        kasbon: {
          totalAwal: totalKasbonAwal,
          totalTerbayar: totalKasbonTerbayar,
          sisaBelumKembali: sisaKasbonBelumKembali,
          countBelumLunas: kasbonBelumLunas.length,
          list: kasbonList.map((k) => ({
            id: k.id,
            namaPeminjam: k.namaPeminjam,
            nominal: k.nominal,
            nominalAwal: k.nominalAwal || k.nominal,
            keterangan: k.keterangan,
            status: k.status,
            tanggal: k.tglBackdate || k.timestamp?.slice(0, 10) || '',
          })),
        },
      },
      recentExpenses,
      recentIncomes,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
