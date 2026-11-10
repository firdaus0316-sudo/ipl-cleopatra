import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

export const DRIVE_STORAGE_FOLDER_ID = '1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB';
export const DRIVE_STORAGE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_STORAGE_FOLDER_ID}`;

export interface DriveUploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  error?: string;
}

/**
 * Unggah gambar Base64 / Data URL ke Google Drive folder BuktiFoto (1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB)
 * Menggunakan direct gdrive CLI terlebih dahulu (auth langsung akun Google terhubung).
 * Jika CLI gagal / tidak ada, fallback ke Webhook Apps Script.
 */
export async function uploadToGoogleDrive(
  dataUrlOrBase64: string,
  filename: string,
  webhookUrl?: string
): Promise<DriveUploadResult> {
  // 1. Coba upload langsung via gdrive CLI
  try {
    const cliResult = await uploadViaGdriveCLI(dataUrlOrBase64, filename);
    if (cliResult.success) {
      return cliResult;
    }
    console.warn('gdrive CLI upload fallback notice:', cliResult.error);
  } catch (err: any) {
    console.warn('gdrive CLI upload error, falling back to webhook:', err.message);
  }

  // 2. Fallback: Google Apps Script Web App jika webhookUrl tersedia
  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      let base64 = dataUrlOrBase64;
      let mimetype = 'image/jpeg';

      if (dataUrlOrBase64.includes(';base64,')) {
        const parts = dataUrlOrBase64.split(';base64,');
        mimetype = parts[0].replace('data:', '') || 'image/jpeg';
        base64 = parts[1];
      }

      const payload = {
        base64,
        mimetype,
        filename,
        folderId: DRIVE_STORAGE_FOLDER_ID,
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const text = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch {
          // not json
        }
        if (data.success && (data.fileUrl || data.url)) {
          return {
            success: true,
            fileUrl: data.fileUrl || data.url,
            fileId: data.fileId || data.id,
          };
        }
      }
    } catch (e: any) {
      console.error('Webhook upload error:', e.message);
    }
  }

  return {
    success: false,
    error: 'Gagal mengupload foto ke Google Drive BuktiFoto.',
  };
}

async function uploadViaGdriveCLI(
  dataUrlOrBase64: string,
  filename: string
): Promise<DriveUploadResult> {
  let base64Data = dataUrlOrBase64;
  let ext = '.jpg';

  if (dataUrlOrBase64.includes(';base64,')) {
    const parts = dataUrlOrBase64.split(';base64,');
    if (parts[0].includes('png')) ext = '.png';
    else if (parts[0].includes('pdf')) ext = '.pdf';
    base64Data = parts[1];
  }

  const cleanFilename = (filename.endsWith('.jpg') || filename.endsWith('.png') || filename.endsWith('.pdf'))
    ? filename
    : `${filename}${ext}`;

  const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${cleanFilename}`);
  await fs.promises.writeFile(tempFilePath, Buffer.from(base64Data, 'base64'));

  return new Promise((resolve) => {
    const child = spawn(
      'gdrive',
      ['mutate', 'upload', tempFilePath, '--parent', DRIVE_STORAGE_FOLDER_ID],
      { shell: true }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', async (code) => {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {}

      if (code === 0) {
        const match = stdout.match(/ID:\s*([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          const fileId = match[1];
          const fileUrl = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
          resolve({ success: true, fileId, fileUrl });
          return;
        }
      }
      resolve({ success: false, error: stderr || stdout || `gdrive exit code ${code}` });
    });

    child.on('error', async (err) => {
      try {
        await fs.promises.unlink(tempFilePath);
      } catch {}
      resolve({ success: false, error: err.message });
    });
  });
}
