import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function GET() {
  try {
    const db = getDb();
    
    const validIncomes = db.incomes.filter((i) => i.status === 'Sah');
    const validExpenses = db.expenses.filter((e) => e.status === 'Sah');

    const totalIncomes = validIncomes.reduce((sum, i) => sum + i.nominal, 0);
    const totalExpenses = validExpenses.reduce((sum, e) => sum + e.nominal, 0);
    const saldoAkhir = db.settings.saldoAwal + totalIncomes - totalExpenses;

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
