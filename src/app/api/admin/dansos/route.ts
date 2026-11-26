import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { DansosEntry, DansosTransactionType, ExpenseTransaction } from '@/types';
import { uploadToGoogleDrive } from '@/lib/driveUpload';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import {
  fetchDansosFromSheets,
  computeDansosSummary,
  appendDansosToSheet,
  appendSaldoAwalDansosToSheet,
  appendExpenseToSheet,
  appendBuktiStrukToSheet,
  deleteDansosFromSheet,
  deleteSaldoAwalDansosFromSheet,
  deleteExpenseFromSheet,
  deletePelunasanFromSheet,
  deleteRowFromSheet,
  executeSheetWritesWithRetry,
  SHEET_GIDS,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const db = getDb();
    let entries: DansosEntry[] = db.dansos || [];
    let summary = computeDansosSummary(entries);

    try {
      const sheetRes = await fetchDansosFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedDansosIds || []), ...(db.deletedExpenseIds || [])]);
        const filtered = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
        db.dansos = filtered;
        entries = filtered;
        summary = computeDansosSummary(filtered);
        saveDb(db);
      }
    } catch (e) {
      console.warn('Fetch live dansos from sheets error:', e);
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
    const { tanggal, jenis, nominal, pihakTerkait, keterangan, buktiUrl } = body as {
      tanggal?: string;
      jenis?: DansosTransactionType;
      nominal?: number | string;
      pihakTerkait?: string;
      keterangan?: string;
      buktiUrl?: string;
    };

    const parsedNominal = Number(nominal);
    if (!tanggal || !jenis || !['saldo_awal', 'pemindahan', 'penyaluran', 'masuk_langsung'].includes(jenis)) {
      return NextResponse.json({ success: false, error: 'Jenis transaksi dan tanggal wajib diisi.' }, { status: 400 });
    }
    if (isNaN(parsedNominal) || parsedNominal <= 0) {
      return NextResponse.json({ success: false, error: 'Nominal harus lebih dari Rp 0.' }, { status: 400 });
    }
    if (!pihakTerkait?.trim() || !keterangan?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nama pihak terkait / penerima dan keterangan wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const tgl = tanggal.slice(0, 10);
    const ts = Date.now();
    const cleanPihak = pihakTerkait.trim().replace(/[|,]/g, ' ');
    const cleanKet = keterangan.trim().replace(/[|,]/g, ' ');

    // Cek saldo terkini dari Sheet (Kas Utama & Kas Dansos) sebelum memindahkan atau menyalurkan dana
    try {
      const sheetRes = await fetchDansosFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedDansosIds || []), ...(db.deletedExpenseIds || [])]);
        db.dansos = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
      }
    } catch {}

    const currentDansosSummary = computeDansosSummary(db.dansos || []);
    if (jenis === 'penyaluran' && parsedNominal > currentDansosSummary.saldoDansos) {
      return NextResponse.json(
        {
          success: false,
          error: `Saldo Kas Dansos (Rp ${currentDansosSummary.saldoDansos.toLocaleString('id-ID')}) tidak mencukupi untuk penyaluran Rp ${parsedNominal.toLocaleString('id-ID')}. Lakukan Pemindahan Dana dari Kas Utama atau catat Saldo Awal terlebih dahulu.`,
        },
        { status: 400 }
      );
    }

    const prefix =
      jenis === 'saldo_awal'
        ? 'SA-DANSOS'
        : jenis === 'pemindahan'
          ? 'EXP-DANSOS'
          : jenis === 'penyaluran'
            ? 'DANSOS-OUT'
            : 'DANSOS-IN';
    const entryId = `${prefix}-${ts}`;

    let finalBuktiUrl = buktiUrl || '';
    let driveUrl = '';
    if (buktiUrl && (buktiUrl.startsWith('data:image') || buktiUrl.startsWith('data:application/pdf'))) {
      const cleanName = cleanPihak.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Dansos_${entryId}_${cleanName}.jpg`;
      const webhookUrl = db.settings.googleDriveWebhookUrl || db.settings.linkPenyimpananBuktiDrive;
      const driveRes = await uploadToGoogleDrive(buktiUrl, filename, webhookUrl);
      if (driveRes.success && driveRes.fileUrl) {
        driveUrl = driveRes.fileUrl;
        finalBuktiUrl = driveRes.fileUrl;
      }
    }

    const newEntry: DansosEntry = {
      id: entryId,
      tanggal: tgl,
      jenis,
      nominal: parsedNominal,
      pihakTerkait: cleanPihak,
      keterangan: cleanKet,
      status: 'Sah',
      buktiUrl: finalBuktiUrl || undefined,
      driveUrl: driveUrl || undefined,
      sourceExpenseId: jenis === 'pemindahan' ? entryId : undefined,
      createdAt: new Date().toISOString(),
    };

    if (!db.dansos) db.dansos = [];
    db.dansos.unshift(newEntry);

    // 1. Jika Pemindahan Dana dari Kas Utama -> Kurangi Kas Utama via DataPengeluaran
    let createdExpense: ExpenseTransaction | null = null;
    if (jenis === 'pemindahan') {
      createdExpense = {
        id: entryId,
        tanggal: tgl,
        kategori: 'Pemindahan Dana Dansos',
        nominal: parsedNominal,
        penerima: cleanPihak,
        keterangan: `Pemindahan Dana ke Kas Dansos: ${cleanKet}`,
        buktiUrl: finalBuktiUrl || undefined,
        driveUrl: driveUrl || undefined,
        status: 'Sah',
        createdAt: new Date().toISOString(),
      };
      db.expenses.unshift(createdExpense);
      saveDb(db);

      const nextBalanceAfterTransfer = currentDansosSummary.saldoDansos + parsedNominal;
      const sheetTasks = [
        { label: 'DataPengeluaran', critical: true, run: () => appendExpenseToSheet(createdExpense!) },
        { label: 'KasDansos', critical: true, run: () => appendDansosToSheet(newEntry, nextBalanceAfterTransfer, entryId) },
        ...(createdExpense.buktiUrl || createdExpense.driveUrl
          ? [{ label: 'BuktiStruk', critical: false, run: () => appendBuktiStrukToSheet(createdExpense!) }]
          : []),
      ];
      const writeRes = await executeSheetWritesWithRetry(sheetTasks);
      if (!writeRes.success) {
        await Promise.allSettled([deleteExpenseFromSheet(entryId), deleteDansosFromSheet(entryId)]);
        db.dansos = (db.dansos || []).filter((b) => b.id !== entryId);
        db.expenses = (db.expenses || []).filter((e) => e.id !== entryId);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal mencatat pemindahan dana Dansos ke Google Sheet DataPengeluaran / KasDansos.',
          },
          { status: 502 }
        );
      }

      addLog(
        'Pemindahan Dana ke Kas Dansos',
        `Memindahkan dana Rp ${parsedNominal.toLocaleString('id-ID')} dari Kas Utama ke Pos Kas Dansos (${cleanPihak}: ${cleanKet}). Saldo Kas Utama berkurang & sheet KasDansos terisi otomatis.`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Pemindahan dana Rp ${parsedNominal.toLocaleString('id-ID')} ke Kas Dansos berhasil dicatat ke Google Sheet KasDansos (Kas Utama berkurang otomatis)!`,
        data: newEntry,
        expense: createdExpense,
        summary: computeDansosSummary(db.dansos),
      });
    }

    // 1b. Jika Saldo Awal Dansos (Mutasi Bulan Sebelumnya) -> Simpan khusus ke Google Sheet SaldoAwalDansos (tidak memengaruhi Kas Utama)
    if (jenis === 'saldo_awal') {
      saveDb(db);
      const saWriteTasks = [
        {
          label: 'SaldoAwalDansos',
          critical: true,
          run: () => appendSaldoAwalDansosToSheet(newEntry),
        },
        ...(finalBuktiUrl || driveUrl
          ? [
              {
                label: 'BuktiStruk (Saldo Awal Dansos)',
                critical: false,
                run: () =>
                  appendBuktiStrukToSheet({
                    id: entryId,
                    tanggal: tgl,
                    kategori: 'Saldo Awal Dansos',
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

      const writeRes = await executeSheetWritesWithRetry(saWriteTasks);
      if (!writeRes.success) {
        db.dansos = (db.dansos || []).filter((b) => b.id !== entryId);
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: writeRes.error || 'Gagal menyimpan Saldo Awal Dansos ke Google Sheet SaldoAwalDansos.',
          },
          { status: 502 }
        );
      }

      addLog(
        'Saldo Awal Dana Dansos',
        `Mencatat Saldo Awal Dansos Rp ${parsedNominal.toLocaleString('id-ID')} (${cleanPihak}: ${cleanKet}) ke Google Sheet SaldoAwalDansos (terpisah dari Kas Utama).`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: `Saldo Awal Dansos Rp ${parsedNominal.toLocaleString('id-ID')} berhasil disimpan ke Google Sheet SaldoAwalDansos!`,
        data: newEntry,
        summary: computeDansosSummary(db.dansos),
      });
    }

    // 2. Penyaluran / Dana Masuk Khusus Dansos -> Dicatat TERPISAH ke Google Sheet KasDansos (tidak memengaruhi Kas Utama)
    saveDb(db);
    const nextBalance =
      jenis === 'penyaluran'
        ? Math.max(0, currentDansosSummary.saldoDansos - parsedNominal)
        : currentDansosSummary.saldoDansos + parsedNominal;

    const pelunasanLabel = jenis === 'penyaluran' ? 'Penyaluran Dana Dansos' : 'Dana Masuk Dansos';
    const writeTasks = [
      {
        label: 'KasDansos',
        critical: true,
        run: () => appendDansosToSheet(newEntry, nextBalance, entryId),
      },
      ...(finalBuktiUrl || driveUrl
        ? [
            {
              label: 'BuktiStruk (Dansos)',
              critical: false,
              run: () =>
                appendBuktiStrukToSheet({
                  id: entryId,
                  tanggal: tgl,
                  kategori: pelunasanLabel,
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
      db.dansos = (db.dansos || []).filter((b) => b.id !== entryId);
      saveDb(db);
      return NextResponse.json(
        {
          success: false,
          error: writeRes.error || 'Gagal menyimpan transaksi Kas Dansos ke Google Sheet.',
        },
        { status: 502 }
      );
    }

    addLog(
      jenis === 'penyaluran' ? 'Penyaluran Dana Dansos' : 'Dana Masuk Khusus Dansos',
      `${pelunasanLabel} Rp ${parsedNominal.toLocaleString('id-ID')} (${cleanPihak}: ${cleanKet}) dicatat pada Kas Kecil Dansos (terpisah dari Kas Utama).`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message:
        jenis === 'penyaluran'
          ? `Penyaluran Dansos Rp ${parsedNominal.toLocaleString('id-ID')} berhasil dicatat dari Saldo Kas Dansos (terpisah dari Kas Utama)!`
          : `Dana masuk khusus Dansos Rp ${parsedNominal.toLocaleString('id-ID')} berhasil dicatat ke Kas Dansos!`,
      data: newEntry,
      summary: computeDansosSummary(db.dansos),
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
      return NextResponse.json({ success: false, error: 'ID transaksi Dansos wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    try {
      const sheetRes = await fetchDansosFromSheets();
      if (sheetRes.success) {
        const deletedSet = new Set([...(db.deletedDansosIds || []), ...(db.deletedExpenseIds || [])]);
        db.dansos = sheetRes.entries.filter((e) => !deletedSet.has(e.id));
      }
    } catch {}

    const prevDansos = [...(db.dansos || [])];
    const prevExpenses = [...(db.expenses || [])];
    const target = prevDansos.find((b) => b.id === id);

    if (!target) {
      return NextResponse.json({ success: false, error: 'Transaksi Kas Dansos tidak ditemukan.' }, { status: 404 });
    }

    if (!db.deletedDansosIds) db.deletedDansosIds = [];
    if (!db.deletedDansosIds.includes(id)) db.deletedDansosIds.push(id);

    const isSaldoAwal = target.jenis === 'saldo_awal' || id.startsWith('SA-DANSOS-');
    const isPemindahan = target.jenis === 'pemindahan' || id.startsWith('EXP-');
    if (isPemindahan) {
      if (!db.deletedExpenseIds) db.deletedExpenseIds = [];
      if (!db.deletedExpenseIds.includes(id)) db.deletedExpenseIds.push(id);
      db.expenses = (db.expenses || []).filter((e) => e.id !== id);
    }
    db.dansos = prevDansos.filter((b) => b.id !== id);
    saveDb(db);

    const deleteTasks = isSaldoAwal
      ? [
          { label: 'SaldoAwalDansos', critical: true, run: () => deleteSaldoAwalDansosFromSheet(id) },
          { label: 'KasDansos', critical: false, run: () => deleteDansosFromSheet(id) },
          {
            label: 'BuktiStruk',
            critical: false,
            run: () => deleteRowFromSheet('BuktiStruk', 7, id, SHEET_GIDS.buktistruk),
          },
        ]
      : isPemindahan
        ? [
            { label: 'DataPengeluaran', critical: true, run: () => deleteExpenseFromSheet(id) },
            { label: 'KasDansos', critical: false, run: () => deleteDansosFromSheet(id) },
          ]
        : [
            { label: 'KasDansos', critical: true, run: () => deleteDansosFromSheet(id) },
            { label: 'RiwayatPelunasan', critical: false, run: () => deletePelunasanFromSheet(id) },
            {
              label: 'BuktiStruk',
              critical: false,
              run: () => deleteRowFromSheet('BuktiStruk', 7, id, SHEET_GIDS.buktistruk),
            },
          ];

    const writeRes = await executeSheetWritesWithRetry(deleteTasks);
    if (!writeRes.success) {
      db.dansos = prevDansos;
      db.expenses = prevExpenses;
      db.deletedDansosIds = (db.deletedDansosIds || []).filter((bid) => bid !== id);
      if (isPemindahan) {
        db.deletedExpenseIds = (db.deletedExpenseIds || []).filter((eid) => eid !== id);
      }
      saveDb(db);
      return NextResponse.json(
        { success: false, error: writeRes.error || 'Gagal menghapus transaksi Dansos dari Google Sheet.' },
        { status: 502 }
      );
    }

    addLog(
      'Hapus Transaksi Kas Dansos',
      `Menghapus transaksi Dansos ${id} (${target.pihakTerkait} - Rp ${target.nominal.toLocaleString('id-ID')})`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Transaksi Kas Dansos berhasil dihapus.',
      summary: computeDansosSummary(db.dansos),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
