import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, addLog } from '@/lib/db';
import { ProofSubmission } from '@/types';
import { uploadToGoogleDrive } from '@/lib/driveUpload';
import { normalizePeriodCode, appendProofToSheet } from '@/lib/googleSheet';

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

      const webhookUrl = db.settings.googleDriveWebhookUrl || db.settings.linkPenyimpananBuktiDrive;
      const driveRes = await uploadToGoogleDrive(buktiUrl, filename, webhookUrl);
      if (driveRes.success && driveRes.fileUrl) {
        driveUrl = driveRes.fileUrl;
        finalBuktiUrl = driveRes.fileUrl;
      }
    }

    // Normalisasi periode ke array YYYY-MM
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

    // Otomatis sinkronkan pengajuan bukti baru ke Google Sheet BuktiTransfer
    try {
      await appendProofToSheet(newProof);
    } catch (e) {
      console.error('Auto-sync proof to BuktiTransfer sheet error:', e);
    }

    addLog(
      'Pengajuan Bukti Transfer',
      `Warga ${newProof.residentName} (${newProof.blok}) mengupload bukti transfer ${proofId} sebesar Rp ${newProof.nominal.toLocaleString('id-ID')}`,
      'Warga'
    );

    return NextResponse.json({
      success: true,
      data: newProof,
      message: 'Bukti pembayaran berhasil dikirim! Menunggu verifikasi dari bendahara/admin.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
