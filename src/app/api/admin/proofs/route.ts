import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { IncomeTransaction, BansosEntry } from '@/types';
import { isAdminAuthenticated, unauthorizedAdminResponse } from '@/lib/adminAuth';
import { isIuranBulananCategory, isBansosProofCategory, safeNumber, safeTimestamp } from '@/lib/format';
import {
  appendBansosToSheet,
  appendIncomesToSheet,
  appendPelunasanToSheet,
  appendBuktiStrukToSheet,
  computeBansosSummary,
  extractNameAndBlok,
  fetchBansosFromSheets,
  fetchIncomesFromSheet,
  fetchProofsFromSheet,
  fetchResidentsFromSheet,
  updateProofInSheet,
  deleteBansosFromSheet,
  deleteProofFromSheet,
  deleteIncomeFromSheet,
  deletePelunasanFromSheet,
  getDirectGoogleDriveImageUrl,
  syncAllDbNamesWithMaster,
  executeSheetWritesWithRetry,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const db = getDb();

    // Auto-sync live dari Google Sheet BuktiTransfer & MasterWarga (Sumber Kebenaran Utama)
    try {
      const [sheetProofsRes, sheetResidentsRes] = await Promise.all([
        fetchProofsFromSheet().catch(() => ({ success: false, proofs: [] })),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] })),
      ]);

      if (sheetResidentsRes.success && sheetResidentsRes.residents && sheetResidentsRes.residents.length > 0) {
        db.residents = sheetResidentsRes.residents;
      }

      if (sheetProofsRes.success && sheetProofsRes.proofs && sheetProofsRes.proofs.length > 0) {
        const localMap = new Map((db.proofs || []).map((p) => [p.id, p]));
        const mergedProofs = sheetProofsRes.proofs.map((sheetProof) => {
          const local = localMap.get(sheetProof.id);
          const directImg = getDirectGoogleDriveImageUrl(sheetProof.driveUrl || sheetProof.buktiUrl);
          if (local) {
            return {
              ...sheetProof,
              buktiUrl: local.buktiUrl && local.buktiUrl.startsWith('data:') ? local.buktiUrl : directImg || sheetProof.buktiUrl,
              driveUrl: sheetProof.driveUrl || local.driveUrl,
              status: sheetProof.status || local.status,
              adminNote: sheetProof.adminNote || local.adminNote,
            };
          }
          return {
            ...sheetProof,
            buktiUrl: directImg || sheetProof.buktiUrl,
          };
        });

        // Jangan pernah membangkitkan ulang bukti lama dari cache lokal; hanya pertahankan bukti baru (< 60 detik)
        const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);
        const sheetIdSet = new Set(sheetProofsRes.proofs.map((p) => p.id));
        const nowMs = Date.now();
        const recentLocalOnly = (db.proofs || []).filter(
          (p) => !sheetIdSet.has(p.id) && !deletedProofSet.has(p.id) && nowMs - safeTimestamp(p.createdAt) < 60_000
        );

        db.proofs = [...mergedProofs.filter((p) => !deletedProofSet.has(p.id)), ...recentLocalOnly];
      }
      saveDb(db);
    } catch (e) {
      console.error('Error auto-sync proofs from sheet:', e);
    }

    syncAllDbNamesWithMaster(db);
    let proofs = [...(db.proofs || [])];

    // Urutkan terbaru di atas, dan prioritaskan status "Menunggu Verifikasi" paling atas
    proofs.reverse().sort((a, b) => {
      const rank = (s: string) => (s === 'Menunggu Verifikasi' ? 0 : s === 'Ditolak' ? 1 : 2);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return safeTimestamp(b.createdAt) - safeTimestamp(a.createdAt);
    });

    if (status && status !== 'Semua') {
      proofs = proofs.filter((p) => p.status === status);
    }

    return NextResponse.json({ success: true, data: proofs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function normalizePeriodCode(input?: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);

  const monthMap: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08', aug: '08', sep: '09', okt: '10', oct: '10', nov: '11', des: '12', dec: '12'
  };

  const parts = trimmed.split(/[\s-]+/);
  if (parts.length >= 2) {
    let mStr = '';
    let yStr = '';
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (monthMap[lower]) mStr = monthMap[lower];
      else if (/^\d{4}$/.test(p)) yStr = p;
      else if (/^\d{1,2}$/.test(p) && !mStr) mStr = p.padStart(2, '0');
    }
    if (mStr && yStr) return `${yStr}-${mStr}`;
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) return unauthorizedAdminResponse();
  try {
    const body = await req.json();
    const { id, action, adminNote } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'ID dan Action wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    let proofIndex = db.proofs.findIndex((p) => p.id === id);

    if (proofIndex === -1) {
      try {
        const sheetProofsRes = await fetchProofsFromSheet();
        if (sheetProofsRes.success && sheetProofsRes.proofs.length > 0) {
          const found = sheetProofsRes.proofs.find((p) => p.id === id);
          if (found) {
            db.proofs.unshift(found);
            proofIndex = 0;
          }
        }
      } catch {}
    }

    if (proofIndex === -1) {
      return NextResponse.json({ success: false, error: 'Bukti transfer tidak ditemukan.' }, { status: 404 });
    }

    const proof = db.proofs[proofIndex];

    if (action === 'approve') {
      // Idempoten Guard: cegah double-approve (dobel klik / 2 tab / ghosting baris DataIuran)
      if (proof.status === 'Terverifikasi') {
        return NextResponse.json({
          success: true,
          message: `Bukti ${proof.id} sudah diverifikasi sebelumnya.`,
          data: proof,
        });
      }

      try {
        const liveIncomesRes = await fetchIncomesFromSheet();
        if (liveIncomesRes.success) {
          const alreadyInSheet = liveIncomesRes.incomes.filter((i) => i.buktiId === proof.id && i.status === 'Sah');
          if (alreadyInSheet.length > 0) {
            proof.status = 'Terverifikasi';
            proof.transactionId = alreadyInSheet.map((i) => i.id).join(', ');
            saveDb(db);
            return NextResponse.json({
              success: true,
              message: `Bukti ${proof.id} sudah tercatat sah di DataIuran.`,
              data: proof,
            });
          }
        }
      } catch {}

      const proofNominalSafe = safeNumber(proof.nominal, 0);
      if (proofNominalSafe <= 0) {
        return NextResponse.json({ success: false, error: 'Nominal bukti transfer tidak valid (<= 0).' }, { status: 400 });
      }

      const proofKategori = (proof.kategori || 'Iuran Bulanan').trim();

      // === KHUSUS SUMBANGAN DANA BANSOS WARGA -> MASUK KE KAS KECIL BANSOS (TIDAK MASUK KAS UTAMA) ===
      if (isBansosProofCategory(proofKategori)) {
        const nowIso = new Date().toISOString();
        const todayDate = nowIso.slice(0, 10);
        const { nama: rNama, blok: rBlok } = extractNameAndBlok(
          `${proof.residentName} (${proof.blok})`,
          proof.residentId,
          db.residents
        );
        const senderLabel = `${rNama || proof.residentName} (${rBlok || proof.blok})`;

        // Idempotency check terhadap RiwayatPelunasan live & db.bansos
        let liveBansosEntries: BansosEntry[] = db.bansos || [];
        try {
          const liveBansosRes = await fetchBansosFromSheets();
          if (liveBansosRes.success) {
            const deletedSet = new Set([...(db.deletedBansosIds || []), ...(db.deletedExpenseIds || [])]);
            liveBansosEntries = liveBansosRes.entries.filter((b) => !deletedSet.has(b.id));
          }
        } catch {}

        const existingBansos = liveBansosEntries.find(
          (b) =>
            (proof.transactionId && b.id === proof.transactionId) ||
            (b.keterangan || '').includes(proof.id)
        );
        if (existingBansos) {
          proof.status = 'Terverifikasi';
          proof.transactionId = existingBansos.id;
          saveDb(db);
          return NextResponse.json({
            success: true,
            message: `Bukti Sumbangan Bansos ${proof.id} sudah tercatat di Pos Kas Kecil Bansos.`,
            data: proof,
          });
        }

        const bansosId = `BANSOS-IN-${Date.now()}`;
        const currentSummary = computeBansosSummary(liveBansosEntries);
        const nextBalance = currentSummary.saldoBansos + proofNominalSafe;
        const cleanNote = (proof.catatanWarga || '').trim().replace(/[|,]/g, ' ');
        const ketText = cleanNote
          ? `${cleanNote} - Sumbangan Warga Terverifikasi (${proof.id})`
          : `Sumbangan Warga Terverifikasi (${proof.id})`;

        const newBansosEntry: BansosEntry = {
          id: bansosId,
          tanggal: todayDate,
          jenis: 'masuk_langsung',
          nominal: proofNominalSafe,
          pihakTerkait: senderLabel,
          keterangan: ketText,
          status: 'Sah',
          buktiUrl: proof.buktiUrl,
          driveUrl: proof.driveUrl || 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB',
          createdAt: nowIso,
        };

        const prevProofSnapshot = { ...proof };
        if (!db.bansos) db.bansos = [];
        db.bansos.unshift(newBansosEntry);
        proof.status = 'Terverifikasi';
        proof.adminNote = adminNote || 'Sumbangan Dana Bansos valid — masuk ke Kas Kecil Bansos';
        proof.verifiedAt = nowIso;
        proof.verifiedBy = 'Bendahara RT';
        proof.transactionId = bansosId;
        if (!proof.driveUrl) {
          proof.driveUrl = 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB';
        }
        saveDb(db);

        const bansosMonthsStr = Array.isArray(proof.bulan)
          ? proof.bulan.join(', ')
          : String(proof.bulan || todayDate.slice(0, 7));

        const bansosWriteRes = await executeSheetWritesWithRetry([
          {
            label: 'KasBansos',
            critical: true,
            run: () => appendBansosToSheet(newBansosEntry, nextBalance, proof.id),
          },
          {
            label: 'BuktiTransfer',
            critical: true,
            run: () =>
              updateProofInSheet({
                buktiId: proof.id,
                status: 'Terverifikasi',
                waktuUpload: proof.createdAt || nowIso,
                namaWarga: proof.residentName,
                nominal: proofNominalSafe,
                keterangan: proof.catatanWarga || '',
                fileUrl: proof.driveUrl || proof.buktiUrl,
                kategori: proofKategori,
                bulan: bansosMonthsStr,
                blok: proof.blok,
                wargaId: proof.residentId,
                verifiedAt: nowIso,
                verifiedBy: 'Bendahara RT',
                adminNote: proof.adminNote,
                transactionId: bansosId,
              }),
          },
          ...(proof.driveUrl || proof.buktiUrl
            ? [
                {
                  label: 'BuktiStruk (Bansos)',
                  critical: false,
                  run: () =>
                    appendBuktiStrukToSheet({
                      id: bansosId,
                      tanggal: todayDate,
                      kategori: 'Dana Masuk Bansos',
                      nominal: proofNominalSafe,
                      penerima: senderLabel,
                      keterangan: ketText,
                      buktiUrl: proof.buktiUrl,
                      driveUrl: proof.driveUrl,
                      status: 'Sah',
                      createdAt: nowIso,
                    }),
                },
              ]
            : []),
        ]);

        if (!bansosWriteRes.success) {
          db.bansos = (db.bansos || []).filter((b) => b.id !== bansosId);
          Object.assign(proof, prevProofSnapshot);
          saveDb(db);
          return NextResponse.json(
            {
              success: false,
              error: bansosWriteRes.error || 'Gagal mencatat sumbangan Bansos ke Google Sheet.',
            },
            { status: 502 }
          );
        }

        addLog(
          'Verifikasi Sumbangan Bansos',
          `Bukti ${proof.id} (${proofKategori}) dari ${senderLabel} disetujui Rp ${proofNominalSafe.toLocaleString('id-ID')} → langsung masuk ke Saldo Kas Kecil Bansos (${bansosId}), terpisah dari Kas Utama.`,
          'Admin'
        );

        return NextResponse.json({
          success: true,
          message: `Bukti Sumbangan Bansos ${proof.id} disetujui! Dana Rp ${proofNominalSafe.toLocaleString('id-ID')} masuk ke Saldo Kas Kecil Bansos (bukan Kas Utama).`,
          data: proof,
          bansosEntry: newBansosEntry,
        });
      }

      // 1. Pecah periode multi-bulan menjadi terpisah per bulan (Format YYYY-MM)
      const rawBulanList = Array.isArray(proof.bulan)
        ? proof.bulan
        : typeof proof.bulan === 'string'
        ? (proof.bulan as string).split(/[,;]+/)
        : [];

      let monthsList: string[] = [];
      rawBulanList.forEach((bStr: string) => {
        const parts = String(bStr).split(/[,;]+/);
        parts.forEach((p: string) => {
          const norm = normalizePeriodCode(p);
          if (norm && !monthsList.includes(norm)) {
            monthsList.push(norm);
          }
        });
      });

      if (monthsList.length === 0) {
        monthsList = [
          (proof.createdAt ? normalizePeriodCode(proof.createdAt.slice(0, 7)) : '') ||
            new Date().toISOString().slice(0, 7),
        ];
      }

      const isRegularIuran = isIuranBulananCategory(proofKategori);

      if (isRegularIuran) {
        // Cari tarif warga (ekspansi multi-bulan HANYA berlaku untuk Iuran Bulanan)
        const res = db.residents.find(
          (r) => r.id === proof.residentId || r.nama.toLowerCase() === proof.residentName.toLowerCase()
        );
        const residentTarif = res?.tarif || 150000;

        // Jika nominal mencakup lebih dari 1 bulan tetapi hanya 1 bulan yang terdaftar, ekspansi secara periodik
        if (monthsList.length === 1 && proof.nominal >= residentTarif * 2 && residentTarif > 0) {
          const calculatedMonthsCount = Math.round(proof.nominal / residentTarif);
          if (calculatedMonthsCount > 1) {
            const [sY, sM] = monthsList[0].split('-').map(Number);
            monthsList = [];
            for (let m = 0; m < calculatedMonthsCount; m++) {
              const date = new Date(sY, sM - 1 + m, 1);
              const mCode = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              monthsList.push(mCode);
            }
          }
        }
        // Urutkan bulan secara kronologis
        monthsList.sort();
      } else {
        // Kategori selain Iuran Bulanan (Donasi/Dana Hibah, THR, Ramadhan, Agustusan, Selokan, Lainnya):
        // Catat sebagai 1 transaksi utuh pada periode saat itu, jangan dipecah ke multi-bulan.
        monthsList = [monthsList[0]];
      }

      const numMonths = monthsList.length;
      const basePerMonth = Math.floor(proof.nominal / numMonths);
      const remainder = proof.nominal - basePerMonth * numMonths;

      const createdTxIds: string[] = [];
      const createdIncomes: IncomeTransaction[] = [];
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      // Buat transaksi kas masuk TERPISAH untuk SETIAP bulan (khusus Iuran Bulanan), atau 1 transaksi utuh untuk kategori lainnya
      monthsList.forEach((mCode, idx) => {
        const txId = `INC-${Date.now()}-${idx + 1}`;
        createdTxIds.push(txId);
        const nominalThisMonth = isRegularIuran
          ? idx === numMonths - 1
            ? basePerMonth + remainder
            : basePerMonth
          : proof.nominal;

        const newIncome: IncomeTransaction = {
          id: txId,
          tanggal: todayDate,
          sumber: `${proof.residentName} (${proof.blok})`,
          residentId: proof.residentId,
          kategori: proofKategori,
          bulan: [mCode], // Format YYYY-MM per bulan
          nominal: nominalThisMonth,
          buktiId: proof.id,
          status: 'Sah',
          catatan:
            adminNote ||
            (!isRegularIuran
              ? `${proofKategori} Periode ${mCode} - Bukti ${proof.id}`
              : numMonths > 1
              ? `Iuran Periode ${mCode} (${idx + 1}/${numMonths}) - Bukti ${proof.id}`
              : `Iuran Periode ${mCode} - Bukti ${proof.id}`),
          createdAt: nowIso,
        };

        createdIncomes.push(newIncome);
        db.incomes.unshift(newIncome);
      });

      // Otomatis masukkan kas masuk terverifikasi ke Google Sheet DataIuran
      const { nama: rNama, blok: rBlok, wargaId } = extractNameAndBlok(
        `${proof.residentName} (${proof.blok})`,
        proof.residentId,
        db.residents
      );

      const rowsToAppend = createdIncomes.map((inc) => ({
        namaWarga: rNama || proof.residentName,
        blok: rBlok || proof.blok,
        bulanIuran: inc.bulan?.[0] || '2026-11',
        jumlah: inc.nominal,
        status: 'Lunas',
        kategori: proofKategori,
        tarif: inc.nominal,
        transaksiId: inc.id,
        wargaId: wargaId || proof.residentId,
        statusTransaksi: 'Aktif',
        buktiId: proof.id,
        bulanAwal: inc.bulan?.[0] || monthsList[0],
        bulanAkhir: inc.bulan?.[0] || monthsList[monthsList.length - 1],
        jumlahBulan: 1,
      }));

      // 2. Update Proof status & Drive URL di memori terlebih dahulu
      proof.status = 'Terverifikasi';
      proof.adminNote = adminNote || 'Bukti valid dan sesuai';
      proof.verifiedAt = nowIso;
      proof.verifiedBy = 'Bendahara RT';
      proof.bulan = monthsList; // format YYYY-MM
      proof.transactionId = createdTxIds.join(', ');

      if (!proof.driveUrl) {
        proof.driveUrl = 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB';
      }

      // 3. Sinkronkan paralel ke Google Sheets (DataIuran, RiwayatPelunasan, & BuktiTransfer) dengan verifikasi hasil + retry otomatis
      const pelunasanPayload = {
        id: `VERIF-${proof.id}`,
        waktu: nowIso,
        jenis: isRegularIuran ? 'Iuran Warga (Transfer)' : `${proofKategori} (Transfer)`,
        referensiId: proof.id,
        nama: `${proof.residentName} (${proof.blok})`,
        nominal: proof.nominal,
        sisa: 0,
        transaksiId: createdTxIds.join(', '),
        admin: 'Bendahara RT',
      };
      const proofUpdatePayload = {
        buktiId: proof.id,
        status: 'Terverifikasi' as const,
        waktuUpload: proof.createdAt || nowIso,
        namaWarga: proof.residentName,
        nominal: proof.nominal,
        keterangan: proof.catatanWarga || '',
        fileUrl: proof.driveUrl || proof.buktiUrl,
        kategori: proof.kategori || 'Iuran Bulanan',
        bulan: monthsList.join(', '),
        blok: proof.blok,
        wargaId: proof.residentId,
        verifiedAt: nowIso,
        verifiedBy: 'Bendahara RT',
        adminNote: proof.adminNote,
        transactionId: proof.transactionId,
      };

      const [incSettled, pelSettled, proofSettled] = await Promise.allSettled([
        appendIncomesToSheet(rowsToAppend),
        appendPelunasanToSheet(pelunasanPayload),
        updateProofInSheet(proofUpdatePayload),
      ]);

      let incSaved = incSettled.status === 'fulfilled' && incSettled.value?.success;
      if (!incSaved) {
        // Retry sekuensial bila eksekusi paralel ke Apps Script mengalami lock contention/timeout
        await new Promise((r) => setTimeout(r, 400));
        const retryInc = await appendIncomesToSheet(rowsToAppend);
        incSaved = Boolean(retryInc?.success);
      }

      if (!incSaved) {
        // Batalkan status lokal agar BuktiTransfer tidak Terverifikasi tanpa baris DataIuran
        db.incomes = (db.incomes || []).filter((i) => !createdTxIds.includes(i.id));
        proof.status = 'Menunggu Verifikasi';
        delete proof.verifiedAt;
        delete proof.verifiedBy;
        delete proof.transactionId;
        saveDb(db);
        return NextResponse.json(
          {
            success: false,
            error: 'Gagal menulis transaksi ke Google Sheet DataIuran. Silakan coba verifikasi ulang.',
          },
          { status: 502 }
        );
      }

      if (!(pelSettled.status === 'fulfilled' && pelSettled.value?.success)) {
        await appendPelunasanToSheet(pelunasanPayload).catch(() => {});
      }
      if (!(proofSettled.status === 'fulfilled' && proofSettled.value?.success)) {
        await updateProofInSheet(proofUpdatePayload).catch(() => {});
      }

      saveDb(db);
      addLog(
        'Verifikasi Bukti Disetujui',
        isRegularIuran
          ? `Bukti ${proof.id} (${proofKategori}) dari ${proof.residentName} (${proof.blok}) disetujui. Dibagi ke ${numMonths} bulan kas masuk (${createdTxIds.join(', ')}).`
          : `Bukti ${proof.id} (${proofKategori}) dari ${proof.residentName} (${proof.blok}) disetujui penuh Rp ${proof.nominal.toLocaleString('id-ID')} pada periode ${monthsList[0]} (${createdTxIds.join(', ')}).`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: isRegularIuran && numMonths > 1
          ? `Bukti berhasil diverifikasi dan otomatis dipecah menjadi ${numMonths} transaksi kas masuk terpisah per bulan!`
          : `Bukti ${proofKategori} berhasil diverifikasi utuh pada periode ${monthsList[0]}!`,
        data: proof,
      });
    }

    if (action === 'reject') {
      // Batalkan seluruh transaksi kas masuk yang terkait bukti ini
      const txIdsToVoid = new Set<string>();
      if (proof.transactionId) {
        proof.transactionId.split(',').forEach((s: string) => txIdsToVoid.add(s.trim()));
      }
      db.incomes.forEach((inc) => {
        if (inc.buktiId === proof.id || txIdsToVoid.has(inc.id)) {
          inc.status = 'Dibatalkan';
        }
      });

      const prevProof = { ...proof };
      proof.status = 'Ditolak';
      proof.adminNote = adminNote || 'Bukti transfer tidak sesuai atau tidak valid.';
      proof.verifiedAt = new Date().toISOString();
      proof.verifiedBy = 'Bendahara RT';

      // Update status ke Google Sheet BuktiTransfer (wajib berhasil)
      const writeRes = await executeSheetWritesWithRetry([
        {
          label: 'BuktiTransfer',
          critical: true,
          run: () =>
            updateProofInSheet({
              buktiId: proof.id,
              status: 'Ditolak',
              waktuUpload: proof.createdAt,
              namaWarga: proof.residentName,
              nominal: proof.nominal,
              keterangan: proof.catatanWarga || '',
              fileUrl: proof.driveUrl || proof.buktiUrl,
              kategori: proof.kategori || 'Iuran Bulanan',
              bulan: Array.isArray(proof.bulan) ? proof.bulan.join(', ') : String(proof.bulan || ''),
              blok: proof.blok,
              wargaId: proof.residentId,
              verifiedAt: proof.verifiedAt,
              verifiedBy: 'Bendahara RT',
              adminNote: proof.adminNote,
            }),
        },
      ]);
      if (!writeRes.success) {
        Object.assign(proof, prevProof);
        saveDb(db);
        return NextResponse.json(
          { success: false, error: writeRes.error || 'Gagal memperbarui penolakan bukti ke Google Sheet.' },
          { status: 502 }
        );
      }

      saveDb(db);
      addLog(
        'Verifikasi Bukti Ditolak',
        `Bukti ${proof.id} dari ${proof.residentName} (${proof.blok}) ditolak. Alasan: ${proof.adminNote}`,
        'Admin'
      );

      return NextResponse.json({
        success: true,
        message: 'Bukti transfer telah ditolak.',
        data: proof,
      });
    }

    if (action === 'cancel') {
      const prevProof = { ...proof };
      const prevIncStatuses = new Map<string, string>();
      const prevBansos = [...(db.bansos || [])];
      // Batalkan transaksi kas masuk atau kas bansos terkait dan kembalikan ke antrean
      const txIdsToVoid = new Set<string>();
      if (proof.transactionId) {
        proof.transactionId.split(',').forEach((s: string) => txIdsToVoid.add(s.trim()));
      }
      const affectedIncomes = db.incomes.filter((inc) => inc.buktiId === proof.id || txIdsToVoid.has(inc.id));
      affectedIncomes.forEach((inc) => {
        prevIncStatuses.set(inc.id, inc.status);
        inc.status = 'Dibatalkan';
      });

      const affectedBansosIds = new Set<string>();
      (db.bansos || []).forEach((b) => {
        if (txIdsToVoid.has(b.id) || (b.keterangan || '').includes(proof.id)) {
          affectedBansosIds.add(b.id);
        }
      });
      Array.from(txIdsToVoid).forEach((txId) => {
        if (txId.startsWith('BANSOS-IN-')) affectedBansosIds.add(txId);
      });
      if (affectedBansosIds.size > 0) {
        if (!db.deletedBansosIds) db.deletedBansosIds = [];
        Array.from(affectedBansosIds).forEach((bId) => {
          if (!db.deletedBansosIds!.includes(bId)) db.deletedBansosIds!.push(bId);
        });
        db.bansos = (db.bansos || []).filter((b) => !affectedBansosIds.has(b.id));
      }

      proof.status = 'Menunggu Verifikasi';
      proof.adminNote = '';
      proof.verifiedAt = undefined;
      proof.verifiedBy = undefined;
      proof.transactionId = undefined;

      // Update status ke Google Sheet BuktiTransfer & batalkan baris terkait di DataIuran / RiwayatPelunasan secara paralel + retry
      const incomeTxIdsToDelete = Array.from(txIdsToVoid).filter(
        (txId) => Boolean(txId) && !txId.startsWith('BANSOS-')
      );
      const cancelTasks = [
        {
          label: 'BuktiTransfer',
          critical: true,
          run: () =>
            updateProofInSheet({
              buktiId: proof.id,
              status: 'Menunggu Verifikasi',
              waktuUpload: proof.createdAt,
              namaWarga: proof.residentName,
              nominal: proof.nominal,
              keterangan: proof.catatanWarga || '',
              fileUrl: proof.driveUrl || proof.buktiUrl,
              kategori: proof.kategori || 'Iuran Bulanan',
              bulan: Array.isArray(proof.bulan) ? proof.bulan.join(', ') : String(proof.bulan || ''),
              blok: proof.blok,
              wargaId: proof.residentId,
              verifiedAt: '',
              verifiedBy: '',
              adminNote: '',
              transactionId: '',
            }),
        },
        ...incomeTxIdsToDelete.map((txId) => ({
          label: `DataIuran (${txId})`,
          critical: false,
          run: () => deleteIncomeFromSheet(txId),
        })),
        ...Array.from(affectedBansosIds).flatMap((bId) => [
          {
            label: `KasBansos (${bId})`,
            critical: false,
            run: () => deleteBansosFromSheet(bId),
          },
          {
            label: `RiwayatPelunasan (${bId})`,
            critical: false,
            run: () => deletePelunasanFromSheet(bId),
          },
        ]),
      ];

      const writeRes = await executeSheetWritesWithRetry(cancelTasks);
      if (!writeRes.success) {
        Object.assign(proof, prevProof);
        affectedIncomes.forEach((inc) => {
          const ps = prevIncStatuses.get(inc.id);
          if (ps) inc.status = ps as any;
        });
        db.bansos = prevBansos;
        saveDb(db);
        return NextResponse.json(
          { success: false, error: writeRes.error || 'Gagal membatalkan status bukti di Google Sheet.' },
          { status: 502 }
        );
      }

      saveDb(db);
      addLog('Reset Verifikasi Bukti', `Status bukti ${proof.id} dikembalikan ke antrean verifikasi`, 'Admin');

      return NextResponse.json({
        success: true,
        message: 'Status bukti transfer berhasil dikembalikan ke antrean.',
        data: proof,
      });
    }

    return NextResponse.json({ success: false, error: 'Aksi tidak valid.' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'ID bukti transfer wajib diisi.' }, { status: 400 });
    }

    const db = getDb();
    let proofIndex = db.proofs.findIndex((p) => p.id === id);

    if (proofIndex === -1) {
      try {
        const sheetProofsRes = await fetchProofsFromSheet();
        if (sheetProofsRes.success && sheetProofsRes.proofs.length > 0) {
          const found = sheetProofsRes.proofs.find((p) => p.id === id);
          if (found) {
            db.proofs.unshift(found);
            proofIndex = 0;
          }
        }
      } catch {}
    }

    if (proofIndex === -1) {
      return NextResponse.json({ success: false, error: 'Bukti transfer tidak ditemukan.' }, { status: 404 });
    }

    const proof = db.proofs[proofIndex];

    // 1. Kumpulkan semua transaksi kas masuk yang dihasilkan dari bukti ini (sinkronkan dulu dengan DataIuran jika perlu)
    try {
      const sheetIncRes = await fetchIncomesFromSheet();
      if (sheetIncRes.success && sheetIncRes.incomes.length > 0) {
        db.incomes = sheetIncRes.incomes;
      }
    } catch {}

    const txIdsToDelete = new Set<string>();
    const bansosIdsToDelete = new Set<string>();
    if (proof.transactionId) {
      proof.transactionId.split(',').forEach((t) => {
        const clean = t.trim();
        if (!clean) return;
        if (clean.startsWith('BANSOS-')) bansosIdsToDelete.add(clean);
        else txIdsToDelete.add(clean);
      });
    }
    (db.incomes || []).forEach((inc) => {
      if (inc.buktiId === proof.id || txIdsToDelete.has(inc.id)) {
        txIdsToDelete.add(inc.id);
      }
    });
    (db.bansos || []).forEach((b) => {
      if (bansosIdsToDelete.has(b.id) || (b.keterangan || '').includes(proof.id)) {
        bansosIdsToDelete.add(b.id);
      }
    });

    if (!db.deletedIncomeIds) db.deletedIncomeIds = [];
    if (!db.deletedProofIds) db.deletedProofIds = [];
    if (!db.deletedBansosIds) db.deletedBansosIds = [];

    if (!db.deletedIncomeIds.includes(proof.id)) db.deletedIncomeIds.push(proof.id);
    if (!db.deletedProofIds.includes(proof.id)) db.deletedProofIds.push(proof.id);
    for (const bId of Array.from(bansosIdsToDelete)) {
      if (!db.deletedBansosIds.includes(bId)) db.deletedBansosIds.push(bId);
    }

    // 2. Hapus paralel seluruh transaksi kas masuk / bansos terkait & baris BuktiTransfer + RiwayatPelunasan dengan retry + verifikasi
    const deleteTasks = [
      { label: `BuktiTransfer (${id})`, critical: true, run: () => deleteProofFromSheet(id) },
      { label: `RiwayatPelunasan (VERIF-${id})`, critical: false, run: () => deletePelunasanFromSheet(`VERIF-${id}`) },
      { label: `RiwayatPelunasan (${id})`, critical: false, run: () => deletePelunasanFromSheet(id) },
    ];
    for (const txId of Array.from(txIdsToDelete)) {
      if (!db.deletedIncomeIds.includes(txId)) db.deletedIncomeIds.push(txId);
      deleteTasks.push(
        { label: `DataIuran (${txId})`, critical: true, run: () => deleteIncomeFromSheet(txId) },
        { label: `RiwayatPelunasan (${txId})`, critical: false, run: () => deletePelunasanFromSheet(txId) }
      );
    }
    for (const bId of Array.from(bansosIdsToDelete)) {
      deleteTasks.push(
        { label: `KasBansos (${bId})`, critical: false, run: () => deleteBansosFromSheet(bId) },
        { label: `RiwayatPelunasan (${bId})`, critical: false, run: () => deletePelunasanFromSheet(bId) }
      );
    }

    const prevIncomes = [...(db.incomes || [])];
    const prevProofs = [...(db.proofs || [])];
    const prevBansos = [...(db.bansos || [])];
    db.incomes = (db.incomes || []).filter((inc) => inc.buktiId !== proof.id && !txIdsToDelete.has(inc.id));
    db.proofs = (db.proofs || []).filter((p) => p.id !== id);
    db.bansos = (db.bansos || []).filter((b) => !bansosIdsToDelete.has(b.id) && !(b.keterangan || '').includes(proof.id));
    saveDb(db);

    const writeRes = await executeSheetWritesWithRetry(deleteTasks);
    if (!writeRes.success) {
      db.incomes = prevIncomes;
      db.proofs = prevProofs;
      db.bansos = prevBansos;
      saveDb(db);
      return NextResponse.json(
        { success: false, error: writeRes.error || 'Gagal menghapus data dari Google Sheet.' },
        { status: 502 }
      );
    }

    addLog(
      'Hapus Bukti Transfer & Transaksi Terkait',
      `Menghapus bukti transfer ${proof.id} dari ${proof.residentName} (${proof.blok}) beserta seluruh transaksi kas masuk terkait (${Array.from(txIdsToDelete).join(', ') || '-'}) dari aplikasi dan Google Sheet`,
      'Admin'
    );

    return NextResponse.json({
      success: true,
      message: 'Bukti transfer dan seluruh transaksi kas masuk terkait berhasil dihapus total dari aplikasi dan Google Sheet.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
