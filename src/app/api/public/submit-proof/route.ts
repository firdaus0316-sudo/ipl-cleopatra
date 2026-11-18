import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { ProofSubmission } from '@/types';
import { uploadToGoogleDrive } from '@/lib/driveUpload';
import {
  normalizePeriodCode,
  appendProofToSheet,
  fetchProofsFromSheet,
  fetchIncomesFromSheet,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { residentId, residentName, blok, hp, kategori, bulan, nominal, buktiUrl, catatanWarga } = body;

    if (!residentName || !blok || !nominal || !buktiUrl) {
      return NextResponse.json(
        { success: false, error: 'Nama, blok rumah, nominal, dan foto bukti transfer wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Normalisasi periode ke array YYYY-MM terlebih dahulu
    let parsedMonths: string[] = [];
    if (Array.isArray(bulan)) {
      bulan.forEach((b: string) => {
        const parts = String(b).split(/[,;\n]+/);
        parts.forEach((p) => {
          const norm = normalizePeriodCode(p);
          if (norm && !parsedMonths.includes(norm)) parsedMonths.push(norm);
        });
      });
    } else if (typeof bulan === 'string' && bulan.trim()) {
      bulan.split(/[,;\n]+/).forEach((p) => {
        const norm = normalizePeriodCode(p);
        if (norm && !parsedMonths.includes(norm)) parsedMonths.push(norm);
      });
    }

    if (parsedMonths.length === 0) {
      parsedMonths = [db.settings.periodeAktif ? normalizePeriodCode(db.settings.periodeAktif) : new Date().toISOString().slice(0, 7)];
    }

    // Proteksi Anti-Dobel untuk Iuran Bulanan (Reguler)
    const katLower = (kategori || 'Iuran Bulanan').toLowerCase();
    const isRegularIuran = katLower.includes('iuran') && !katLower.includes('tunggakan');
    if (isRegularIuran) {
      try {
        const normInputBlok = blok.trim().toUpperCase().replace(/\s+/g, '');
        const normInputName = residentName.trim().toLowerCase();
        const hasValidResidentId = Boolean(residentId && !String(residentId).startsWith('TEMP-'));
        const [proofRes, incRes] = await Promise.all([
          fetchProofsFromSheet().catch(() => ({ success: false, proofs: [] as any[] })),
          fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] as any[] })),
        ]);

        const isSamePayer = (recId?: string, recBlok?: string, recName?: string) => {
          if (hasValidResidentId && recId) {
            return recId === residentId;
          }
          const cleanRecBlok = (recBlok || '').toUpperCase().replace(/\s+/g, '');
          if (cleanRecBlok !== normInputBlok) return false;
          if (hasValidResidentId && recName) {
            const cleanRecName = recName.trim().toLowerCase();
            return cleanRecName.includes(normInputName) || normInputName.includes(cleanRecName);
          }
          return true;
        };

        const liveProofs = proofRes.success && proofRes.proofs.length > 0 ? proofRes.proofs : db.proofs || [];
        const duplicatePending = liveProofs.find((p) => {
          if (!p || p.status !== 'Menunggu Verifikasi') return false;
          const pKat = (p.kategori || '').toLowerCase();
          if (!pKat.includes('iuran') || pKat.includes('tunggakan')) return false;
          if (!isSamePayer(p.residentId, p.blok, p.residentName)) return false;
          const pMonths = (p.bulan || []).map((m: string) => normalizePeriodCode(m));
          return parsedMonths.some((m) => pMonths.includes(m));
        });

        if (duplicatePending) {
          return NextResponse.json(
            {
              success: false,
              error: `Bukti untuk ${residentName.trim()} (${blok.trim().toUpperCase()}) periode (${parsedMonths.join(', ')}) sudah masuk (${duplicatePending.id}) dan sedang Menunggu Verifikasi Bendahara. Tidak perlu mengirim ulang.`,
            },
            { status: 409 }
          );
        }

        const liveIncomes = incRes.success && incRes.incomes.length > 0 ? incRes.incomes : db.incomes || [];
        const paidMonthsSet = new Set<string>();
        liveIncomes.forEach((inc) => {
          if (!inc || inc.status !== 'Sah') return;
          const iKat = (inc.kategori || '').toLowerCase();
          if (!iKat.includes('iuran') || iKat.includes('tunggakan')) return;
          const match = (inc.sumber || '').match(/^(.*?)\(([^)]+)\)/);
          const iName = match?.[1]?.trim() || inc.sumber || '';
          const iBlok = (match?.[2] || '').trim();
          if (isSamePayer(inc.residentId, iBlok, iName)) {
            (inc.bulan || []).forEach((m: string) => paidMonthsSet.add(normalizePeriodCode(m)));
          }
        });

        const alreadyPaid = parsedMonths.filter((m) => paidMonthsSet.has(m));
        if (alreadyPaid.length === parsedMonths.length) {
          return NextResponse.json(
            {
              success: false,
              error: `Iuran ${residentName.trim()} (${blok.trim().toUpperCase()}) periode ${alreadyPaid.join(', ')} sudah tercatat LUNAS di sistem kas RT.`,
            },
            { status: 409 }
          );
        }
      } catch (dupErr) {
        console.warn('Duplicate check notice:', dupErr);
      }
    }

    const datePrefix = new Date().toISOString().slice(2, 7).replace('-', ''); // e.g. "2611"
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const proofId = `BKT-${datePrefix}-${randomSuffix}`;

    let finalBuktiUrl = buktiUrl;
    let driveUrl: string | undefined = undefined;

    // Otomatis simpan ke Google Drive folder BuktiFoto (1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB)
    if (buktiUrl && (buktiUrl.startsWith('data:image') || buktiUrl.startsWith('data:application/pdf'))) {
      const cleanName = residentName.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const cleanBlok = blok.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Bukti_${proofId}_${cleanName}_${cleanBlok}.jpg`;

      const webhookUrl =
        db.settings.googleDriveWebhookUrl && db.settings.googleDriveWebhookUrl.includes('script.google.com')
          ? db.settings.googleDriveWebhookUrl
          : undefined;
      const driveRes = await uploadToGoogleDrive(buktiUrl, filename, webhookUrl);
      if (driveRes.success && driveRes.fileUrl) {
        driveUrl = driveRes.fileUrl;
        finalBuktiUrl = driveRes.fileUrl;
      }
    }

    const newProof: ProofSubmission = {
      id: proofId,
      residentId: residentId || `TEMP-${Date.now()}`,
      residentName: residentName.trim(),
      blok: blok.trim().toUpperCase(),
      hp: hp ? hp.trim() : '',
      kategori: kategori || 'Iuran Bulanan',
      bulan: parsedMonths,
      nominal: Number(nominal),
      buktiUrl: finalBuktiUrl,
      driveUrl: driveUrl || 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB',
      catatanWarga: catatanWarga?.trim() || '',
      status: 'Menunggu Verifikasi',
      createdAt: new Date().toISOString(),
    };

    db.proofs.unshift(newProof);
    saveDb(db);

    // Otomatis sinkronkan pengajuan bukti baru ke Google Sheet BuktiTransfer (dengan 1x auto-retry)
    let sheetSyncOk = false;
    let sheetSyncError = '';
    try {
      const sheetRes = await appendProofToSheet(newProof);
      sheetSyncOk = sheetRes.success;
      if (!sheetRes.success) {
        sheetSyncError = sheetRes.error || '';
        const retryRes = await appendProofToSheet(newProof);
        sheetSyncOk = retryRes.success;
        if (!retryRes.success) {
          sheetSyncError = retryRes.error || sheetSyncError;
        }
      }
    } catch (e: any) {
      sheetSyncError = e.message || 'Gagal sinkronisasi sheet';
      console.error('Auto-sync proof to BuktiTransfer sheet error:', e);
    }

    if (!sheetSyncOk) {
      console.error('BuktiTransfer sheet append failed after retry:', sheetSyncError);
      return NextResponse.json(
        {
          success: false,
          error: 'Koneksi ke Google Sheets sedang sibuk. Mohon klik "Kirim Bukti Pembayaran" sekali lagi.',
        },
        { status: 503 }
      );
    }

    addLog(
      'Pengajuan Bukti Transfer',
      `Warga ${newProof.residentName} (${newProof.blok}) mengupload bukti transfer ${proofId} sebesar Rp ${newProof.nominal.toLocaleString('id-ID')}`,
      'Warga'
    );

    return NextResponse.json({
      success: true,
      data: newProof,
      sheetSynced: true,
      message: 'Bukti pembayaran berhasil dikirim! Menunggu verifikasi dari bendahara/admin.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
