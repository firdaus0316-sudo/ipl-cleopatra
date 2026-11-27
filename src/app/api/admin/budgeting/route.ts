import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { BudgetingEntry, BudgetingTransactionType, ExpenseTransaction, IncomeTransaction } from '@/types';
import { uploadToGoogleDrive } from '@/lib/driveUpload';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import {
  fetchBudgetingFromSheets,
  computeBudgetingSummary,
  appendBudgetingToSheet,
  updateBudgetingStatusInSheet,
  deleteBudgetingFromSheet,
  appendExpenseToSheet,
  deleteExpenseFromSheet,
  appendIncomesToSheet,
  deleteIncomeFromSheet,
  appendBuktiStrukToSheet,
  deleteRowFromSheet,
  executeSheetWritesWithRetry,
  normalizePeriodCode,
  SHEET_GIDS,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const db = getDb();
    let entries: BudgetingEntry[] = db.budgeting || [];
    let summary = computeBudgetingSummary(entries);

    try {
      const sheetRes = await fetchBudgetingFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedBudgetingIds || []), ...(db.deletedExpenseIds || [])]);
        const filtered = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
        db.budgeting = filtered;
        entries = filtered;
        summary = computeBudgetingSummary(filtered);
        saveDb(db);
      }
    } catch (e) {
      console.warn('Fetch live budgeting from sheets error:', e);
    }

    return NextResponse.json({
      success: true,
      data: entries,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const {
      tanggal,
      periodeTarget,
      jenis,
      kategoriPos,
      nominal,
      pihakTerkait,
      keterangan,
      buktiUrl,
      planId,
    } = body as {
      tanggal?: string;
      periodeTarget?: string;
      jenis?: BudgetingTransactionType;
      kategoriPos?: string;
      nominal?: number | string;
      pihakTerkait?: string;
      keterangan?: string;
      buktiUrl?: string;
      planId?: string;
    };

    const parsedNominal = Number(nominal);
    if (!tanggal || !jenis || !['pemindahan', 'rencana', 'realisasi', 'kembalikan'].includes(jenis)) {
      return NextResponse.json({ success: false, error: 'Jenis transaksi dan tanggal wajib diisi.' }, { status: 400 });
    }
    if (isNaN(parsedNominal) || parsedNominal <= 0) {
      return NextResponse.json({ success: false, error: 'Nominal harus lebih dari Rp 0.' }, { status: 400 });
    }
    if (!pihakTerkait?.trim() || !keterangan?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Pihak terkait / pos tujuan dan keterangan wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const tgl = tanggal.slice(0, 10);
    const normPeriode = normalizePeriodCode(periodeTarget || '') || tgl.slice(0, 7);
    const ts = Date.now();
    const cleanPihak = pihakTerkait.trim().replace(/[|,]/g, ' ');
    const cleanKet = keterangan.trim().replace(/[|,]/g, ' ');
    const cleanKategoriPos = (kategoriPos || 'Operasional').trim().replace(/[|,]/g, ' ');

    // Sinkronkan saldo budgeting terkini dari Google Sheets
    try {
      const sheetRes = await fetchBudgetingFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedBudgetingIds || []), ...(db.deletedExpenseIds || [])]);
        db.budgeting = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
      }
    } catch {}

    const currentSummary = computeBudgetingSummary(db.budgeting || []);

    if ((jenis === 'realisasi' || jenis === 'kembalikan') && parsedNominal > currentSummary.saldoBudgeting) {
      return NextResponse.json(
        {
          success: false,
          error: `Saldo Dana Budgeting tersedia (Rp ${currentSummary.saldoBudgeting.toLocaleString('id-ID')}) tidak mencukupi untuk Rp ${parsedNominal.toLocaleString('id-ID')}. Lakukan Pemindahan Dana Budgeting dari Kas Utama terlebih dahulu.`,
        },
        { status: 400 }
      );
    }

    const prefix =
      jenis === 'pemindahan'
        ? 'EXP-BDG'
        : jenis === 'rencana'
          ? 'BDG-PLAN'
          : jenis === 'realisasi'
            ? 'BDG-OUT'
            : 'BDG-RET';
    const entryId = `${prefix}-${ts}`;

    let finalBuktiUrl = buktiUrl || '';
    let driveUrl = '';
    if (buktiUrl && (buktiUrl.startsWith('data:image') || buktiUrl.startsWith('data:application/pdf'))) {
      const cleanName = cleanPihak.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Budgeting_${entryId}_${cleanName}.jpg`;
      const webhookUrl = db.settings.googleDriveWebhookUrl || db.settings.linkPenyimpananBuktiDrive;
      const driveRes = await uploadToGoogleDrive(buktiUrl, filename, webhookUrl);
      if (driveRes.success && driveRes.fileUrl) {
        driveUrl = driveRes.fileUrl;
        finalBuktiUrl = driveRes.fileUrl;
      }
    }

    const newEntry: BudgetingEntry = {
      id: entryId,
      tanggal: tgl,
      periodeTarget: normPeriode,
      jenis,
      kategoriPos: cleanKategoriPos,
      pihakTerkait: cleanPihak,
      keterangan: cleanKet,
      nominal: parsedNominal,
      status: jenis === 'rencana' ? 'Direncanakan' : 'Sah',
      buktiUrl: finalBuktiUrl || undefined,
      driveUrl: driveUrl || undefined,
      referensiId: planId || entryId,
      createdAt: new Date().toISOString(),
    };

    if (!db.budgeting) db.budgeting = [];
    db.budgeting.unshift(newEntry);

    // 1. Pemindahan Dana dari Kas Utama -> Kurangi Kas Utama (DataPengeluaran) & Masuk ke Pos Budgeting (belum realisasi belanja)
    if (jenis === 'pemindahan') {
      const createdExpense: ExpenseTransaction = {
        id: entryId,
        tanggal: tgl,
        kategori: 'Pemindahan Dana Budgeting',
        nominal: parsedNominal,
        penerima: cleanPihak,
        keterangan: `Pemindahan Dana Budgeting (${normPeriode}): ${cleanKet}`,
        buktiUrl: finalBuktiUrl || undefined,
        driveUrl: driveUrl || undefined,
        status: 'Sah',
        createdAt: new Date().toISOString(),
      };
      db.expenses.unshift(createdExpense);
      saveDb(db);

      const nextSaldo = currentSummary.saldoBudgeting + parsedNominal;
      const writeRes = await executeSheetWritesWithRetry([
        { label: 'DataPengeluaran', critical: true, run: () => appendExpenseToSheet(createdExpense) },
        { label: 'AnggaranBudgeting', critical: true, run: () => appendBudgetingToSheet(newEntry, nextSaldo) },
        ...(createdExpense.buktiUrl || createdExpense.driveUrl
          ? [{ label: 'BuktiStruk', critical: false, run: () => appendBuktiStrukToSheet(createdExpense) }]
          : []),
      ]);

      if (!writeRes.success) {
        await Promise.allSettled([deleteExpenseFromSheet(entryId), deleteBudgetingFromSheet(entryId)]);
        db.budgeting = (db.budgeting || []).filter((b) => b.id !== entryId);
        db.expenses = (db.expenses || []).filter((e) => e.id !== entryId);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal mencatat pemindahan dana budgeting ke Google Sheet.',
          },
          { status: 502 }
        );
      }

      addLog(
        'Pemindahan Dana Budgeting',
        `Memindahkan dana Rp ${parsedNominal.toLocaleString('id-ID')} dari Kas Utama ke Pos Budgeting ${normPeriode} (${cleanKet}). Belum tercatat sebagai realisasi pengeluaran.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Pemindahan dana Rp ${parsedNominal.toLocaleString('id-ID')} ke Pos Budgeting (${normPeriode}) berhasil! Dana dicadangkan dan siap direalisasikan bulan depan.`,
        data: newEntry,
        expense: createdExpense,
        summary: computeBudgetingSummary(db.budgeting),
      });
    }

    // 2. Pengembalian Sisa Dana Budgeting ke Kas Utama -> Tambah Kas Utama (DataIuran) & Kurangi Saldo Budgeting
    if (jenis === 'kembalikan') {
      const incId = `INC-${entryId}`;
      const returnIncome: IncomeTransaction = {
        id: incId,
        tanggal: tgl,
        sumber: `${cleanPihak} (Budgeting ${normPeriode})`,
        kategori: 'Pengembalian Sisa Budgeting',
        bulan: [normPeriode],
        nominal: parsedNominal,
        status: 'Sah',
        catatan: `Pengembalian sisa dana budgeting ${normPeriode}: ${cleanKet}`,
        createdAt: new Date().toISOString(),
      };
      newEntry.referensiId = incId;
      db.incomes.unshift(returnIncome);
      saveDb(db);

      const nextSaldo = Math.max(0, currentSummary.saldoBudgeting - parsedNominal);
      const writeRes = await executeSheetWritesWithRetry([
        {
          label: 'DataIuran',
          critical: true,
          run: () =>
            appendIncomesToSheet({
              namaWarga: cleanPihak,
              blok: `BDG-${normPeriode}`,
              bulanIuran: normPeriode,
              jumlah: parsedNominal,
              status: 'Lunas',
              kategori: 'Pengembalian Sisa Budgeting',
              tarif: parsedNominal,
              transaksiId: incId,
              wargaId: '',
              statusTransaksi: 'Aktif',
              buktiId: entryId,
              bulanAwal: normPeriode,
              bulanAkhir: normPeriode,
              jumlahBulan: 1,
            }),
        },
        { label: 'AnggaranBudgeting', critical: true, run: () => appendBudgetingToSheet(newEntry, nextSaldo) },
      ]);

      if (!writeRes.success) {
        await Promise.allSettled([deleteIncomeFromSheet(incId), deleteBudgetingFromSheet(entryId)]);
        db.budgeting = (db.budgeting || []).filter((b) => b.id !== entryId);
        db.incomes = (db.incomes || []).filter((i) => i.id !== incId);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal mencatat pengembalian sisa dana budgeting ke Google Sheet.',
          },
          { status: 502 }
        );
      }

      addLog(
        'Pengembalian Sisa Budgeting',
        `Mengembalikan sisa dana budgeting Rp ${parsedNominal.toLocaleString('id-ID')} (${normPeriode}) ke Saldo Kas Utama.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Sisa dana budgeting Rp ${parsedNominal.toLocaleString('id-ID')} berhasil dikembalikan ke Saldo Kas Utama!`,
        data: newEntry,
        summary: computeBudgetingSummary(db.budgeting),
      });
    }

    // 3. Rencana Pos Anggaran ATAU Realisasi Pengeluaran Bulan Depan -> Dicatat HANYA di AnggaranBudgeting (TIDAK memotong Kas Utama lagi!)
    const nextSaldo =
      jenis === 'realisasi'
        ? Math.max(0, currentSummary.saldoBudgeting - parsedNominal)
        : currentSummary.saldoBudgeting;

    // Jika realisasi terkait dengan item rencana, tandai item rencana sebagai 'Terealisasi'
    let linkedPlanPrevStatus: BudgetingEntry['status'] | undefined;
    let linkedPlanObj: BudgetingEntry | undefined;
    if (jenis === 'realisasi' && planId) {
      linkedPlanObj = (db.budgeting || []).find((b) => b.id === planId && b.jenis === 'rencana');
      if (linkedPlanObj) {
        linkedPlanPrevStatus = linkedPlanObj.status;
        linkedPlanObj.status = 'Terealisasi';
        linkedPlanObj.referensiId = entryId;
      }
    }
    saveDb(db);

    const writeTasks = [
      { label: 'AnggaranBudgeting', critical: true, run: () => appendBudgetingToSheet(newEntry, nextSaldo) },
      ...(linkedPlanObj
        ? [
            {
              label: `AnggaranBudgeting (Update Rencana ${planId})`,
              critical: false,
              run: () => updateBudgetingStatusInSheet(planId!, 'Terealisasi', entryId),
            },
          ]
        : []),
      ...(finalBuktiUrl || driveUrl
        ? [
            {
              label: 'BuktiStruk (Budgeting)',
              critical: false,
              run: () =>
                appendBuktiStrukToSheet({
                  id: entryId,
                  tanggal: tgl,
                  kategori: jenis === 'realisasi' ? `Realisasi Budgeting (${cleanKategoriPos})` : 'Rencana Budgeting',
                  nominal: parsedNominal,
                  penerima: cleanPihak,
                  keterangan: cleanKet,
                  buktiUrl: finalBuktiUrl,
                  driveUrl,
                  status: 'Sah',
                  createdAt: new Date().toISOString(),
                }),
            },
          ]
        : []),
    ];

    const writeRes = await executeSheetWritesWithRetry(writeTasks);
    if (!writeRes.success) {
      db.budgeting = (db.budgeting || []).filter((b) => b.id !== entryId);
      if (linkedPlanObj && linkedPlanPrevStatus) {
        linkedPlanObj.status = linkedPlanPrevStatus;
      }
      saveDb(db);
      return NextResponse.json(
        {
          success: false,
          error: writeRes.error || 'Gagal menyimpan catatan budgeting ke Google Sheet AnggaranBudgeting.',
        },
        { status: 502 }
      );
    }

    addLog(
      jenis === 'realisasi' ? 'Realisasi Pengeluaran Budgeting' : 'Rencana Pos Anggaran',
      jenis === 'realisasi'
        ? `Merealisasikan belanja Rp ${parsedNominal.toLocaleString('id-ID')} dari Saldo Budgeting ${normPeriode} (${cleanPihak}: ${cleanKet}). Kas Utama tidak dipotong ulang.`
        : `Menambahkan rencana pos anggaran ${normPeriode} (${cleanKategoriPos}): ${cleanKet} sebesar Rp ${parsedNominal.toLocaleString('id-ID')}.`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message:
        jenis === 'realisasi'
          ? `Realisasi pengeluaran Rp ${parsedNominal.toLocaleString('id-ID')} berhasil dicatat dari Saldo Budgeting (tidak memotong Kas Utama ulang)!`
          : `Rencana pos anggaran ${normPeriode} sebesar Rp ${parsedNominal.toLocaleString('id-ID')} berhasil disimpan!`,
      data: newEntry,
      summary: computeBudgetingSummary(db.budgeting),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID transaksi Budgeting wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    try {
      const sheetRes = await fetchBudgetingFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedBudgetingIds || []), ...(db.deletedExpenseIds || [])]);
        db.budgeting = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
      }
    } catch {}

    const prevBudgeting = [...(db.budgeting || [])];
    const prevExpenses = [...(db.expenses || [])];
    const prevIncomes = [...(db.incomes || [])];
    const target = prevBudgeting.find((b) => b.id === id);

    if (!target) {
      return NextResponse.json({ success: false, error: 'Catatan Budgeting tidak ditemukan.' }, { status: 404 });
    }

    if (!db.deletedBudgetingIds) db.deletedBudgetingIds = [];
    if (!db.deletedBudgetingIds.includes(id)) db.deletedBudgetingIds.push(id);

    const isPemindahan = target.jenis === 'pemindahan' || id.startsWith('EXP-BDG-');
    const isKembalikan = target.jenis === 'kembalikan' || id.startsWith('BDG-RET-');
    const returnIncId = target.referensiId?.startsWith('INC-') ? target.referensiId : `INC-${id}`;

    if (isPemindahan) {
      if (!db.deletedExpenseIds) db.deletedExpenseIds = [];
      if (!db.deletedExpenseIds.includes(id)) db.deletedExpenseIds.push(id);
      db.expenses = (db.expenses || []).filter((e) => e.id !== id);
    }
    if (isKembalikan) {
      if (!db.deletedIncomeIds) db.deletedIncomeIds = [];
      if (!db.deletedIncomeIds.includes(returnIncId)) db.deletedIncomeIds.push(returnIncId);
      db.incomes = (db.incomes || []).filter((i) => i.id !== returnIncId);
    }
    db.budgeting = prevBudgeting.filter((b) => b.id !== id);
    saveDb(db);

    const deleteTasks = isPemindahan
      ? [
          { label: 'DataPengeluaran', critical: true, run: () => deleteExpenseFromSheet(id) },
          { label: 'AnggaranBudgeting', critical: false, run: () => deleteBudgetingFromSheet(id) },
        ]
      : isKembalikan
        ? [
            { label: 'DataIuran', critical: true, run: () => deleteIncomeFromSheet(returnIncId) },
            { label: 'AnggaranBudgeting', critical: false, run: () => deleteBudgetingFromSheet(id) },
          ]
        : [
            { label: 'AnggaranBudgeting', critical: true, run: () => deleteBudgetingFromSheet(id) },
            {
              label: 'BuktiStruk',
              critical: false,
              run: () => deleteRowFromSheet('BuktiStruk', 7, id, SHEET_GIDS.buktistruk),
            },
          ];

    const writeRes = await executeSheetWritesWithRetry(deleteTasks);
    if (!writeRes.success) {
      db.budgeting = prevBudgeting;
      db.expenses = prevExpenses;
      db.incomes = prevIncomes;
      db.deletedBudgetingIds = (db.deletedBudgetingIds || []).filter((bid) => bid !== id);
      if (isPemindahan) {
        db.deletedExpenseIds = (db.deletedExpenseIds || []).filter((eid) => eid !== id);
      }
      if (isKembalikan) {
        db.deletedIncomeIds = (db.deletedIncomeIds || []).filter((iid) => iid !== returnIncId);
      }
      saveDb(db);
      return NextResponse.json(
        { success: false, error: writeRes.error || 'Gagal menghapus catatan budgeting dari Google Sheet.' },
        { status: 502 }
      );
    }

    addLog(
      'Hapus Catatan Budgeting',
      `Menghapus catatan budgeting ${id} (${target.pihakTerkait} - Rp ${target.nominal.toLocaleString('id-ID')})`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Catatan Budgeting berhasil dihapus.',
      summary: computeBudgetingSummary(db.budgeting),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
