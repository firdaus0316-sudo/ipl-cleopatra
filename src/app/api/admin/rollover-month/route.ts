import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { SaldoAwalEntry } from '@/types';
import { MONTH_NAMES_ID, normalizePeriodCode, isIncomeInPeriod } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getPeriodLabel(code: string): string {
  if (!code) return '';
  if (/^\d{4}-\d{2}$/.test(code)) {
    const [y, m] = code.split('-');
    return `${MONTH_NAMES_ID[m] || m} ${y}`;
  }
  return code;
}

function getNextPeriodCode(periodCode: string): string {
  if (!periodCode || !/^\d{4}-\d{2}$/.test(periodCode)) {
    return '2026-12';
  }
  const [yStr, mStr] = periodCode.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function isExpenseInPeriod(exp: any, targetPeriod: string): boolean {
  const normTarget = normalizePeriodCode(targetPeriod);
  return Boolean(exp.tanggal && exp.tanggal.startsWith(normTarget));
}

export async function GET() {
  try {
    const db = getDb();
    return NextResponse.json({
      success: true,
      saldoAwal: db.settings.saldoAwal,
      periodeAktif: db.settings.periodeAktif || '2026-11',
      history: db.saldoAwalHistory || [],
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetPeriode, saldoAwalBaru, keterangan, tutupPeriodeLama, saldoAwalLama } = body;

    const db = getDb();
    const currentPeriode = tutupPeriodeLama || db.settings.periodeAktif || '2026-11';
    const nextPeriodeStr = targetPeriode || getNextPeriodCode(currentPeriode);
    const yearOfCurrentPeriod = Number(currentPeriode.slice(0, 4)) || 2026;

    // Tentukan Saldo Awal untuk periode yang ditutup
    let currentSaldoAwal = Number(saldoAwalLama);
    if (isNaN(currentSaldoAwal)) {
      const hist = (db.saldoAwalHistory || []).find((h) => h.periode === currentPeriode);
      currentSaldoAwal = hist ? hist.jumlah : (Number(db.settings.saldoAwal) || 0);
    }

    // Hitung pemasukan sah khusus untuk periode yang ditutup
    const totalMasukPeriode = db.incomes
      .filter((i) => i.status === 'Sah' && isIncomeInPeriod(i, currentPeriode, yearOfCurrentPeriod))
      .reduce((sum, i) => sum + i.nominal, 0);

    // Hitung pengeluaran sah khusus untuk periode yang ditutup
    const totalKeluarPeriode = db.expenses
      .filter((e) => e.status === 'Sah' && isExpenseInPeriod(e, currentPeriode))
      .reduce((sum, e) => sum + e.nominal, 0);

    // Saldo akhir periode terpilih yang dimutasikan jadi saldo awal bulan baru
    let saldoAkhir = Number(saldoAwalBaru);
    if (isNaN(saldoAkhir)) {
      saldoAkhir = currentSaldoAwal + totalMasukPeriode - totalKeluarPeriode;
    }

    const entryId = `SA-${Date.now()}`;
    const desc =
      keterangan ||
      `Saldo Awal Bulan ${getPeriodLabel(nextPeriodeStr)} (Pindahan Kas ${getPeriodLabel(currentPeriode)})`;

    const newSaldoEntry: SaldoAwalEntry = {
      id: entryId,
      tanggal: new Date().toISOString().slice(0, 10),
      periode: nextPeriodeStr,
      keterangan: desc,
      jumlah: saldoAkhir,
      createdAt: new Date().toISOString(),
    };

    if (!db.saldoAwalHistory) db.saldoAwalHistory = [];
    db.saldoAwalHistory.unshift(newSaldoEntry);

    // Update settings
    db.settings.saldoAwal = saldoAkhir;
    db.settings.periodeAktif = nextPeriodeStr;

    saveDb(db);

    addLog(
      'Tutup Buku & Pindah Bulan Kas',
      `Periode ${getPeriodLabel(currentPeriode)} ditutup. Saldo awal ${getPeriodLabel(nextPeriodeStr)} ditetapkan sebesar Rp ${saldoAkhir.toLocaleString('id-ID')}`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: `Berhasil pindah ke periode ${getPeriodLabel(nextPeriodeStr)}! Saldo awal baru: Rp ${saldoAkhir.toLocaleString('id-ID')}`,
      saldoAwalBaru: saldoAkhir,
      periodeBaru: nextPeriodeStr,
      entry: newSaldoEntry,
      rincianPerhitungan: {
        periodeDitutup: currentPeriode,
        saldoAwalPeriodeLama: currentSaldoAwal,
        totalMasukPeriode,
        totalKeluarPeriode,
        saldoAkhirMutasi: saldoAkhir,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
