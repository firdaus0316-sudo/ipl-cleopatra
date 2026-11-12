import { Resident, IncomeTransaction, ExpenseTransaction, SaldoAwalEntry, TunggakanLamaEntry, KasbonEntry, ProofSubmission } from '@/types';
import { spawn } from 'child_process';

export const SHEET_ID = '1CzNnjH8-j8XR6UkQcP2qtFAY2jX28IVJoVWGeXJkxIw';

// GIDs untuk semua sheet yang tersedia
export const SHEET_GIDS = {
  masterwarga: '1068212752',
  saldoawal: '469058426',
  riwayatpelunasan: '1531683437',
  dataiuran: '0',
  datapengeluaran: '2139531296',
  tunggakanlama: '463968323',
  tunggakannonwarga: '1402141287',
  kasbon: '1031321249',
  buktistruk: '762023314',
  buktitransfer: '4652474',
};

export const SHEET_GID = SHEET_GIDS.masterwarga;
export const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// Google Drive Folders
export const GOOGLE_DRIVE_MAIN_FOLDER = 'https://drive.google.com/drive/folders/1nFboWcdPdbncsrub31vzd3jgLRZOaZo_';
export const GOOGLE_DRIVE_BUKTI_STORAGE = 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB';
export const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxg_LRxCVh-oYYeiMBpJvo6i0kkrClAmAUdXnPfFNhZNTsBXarGZ9JJOaoFMI7l6YBC9w/exec';

export function normalizePeriodCode(input?: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);

  const monthMap: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08', aug: '08',
    sep: '09', okt: '10', oct: '10', nov: '11', des: '12', dec: '12', nop: '11', nopember: '11'
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

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export function parseDateFlexible(str?: string): string {
  if (!str) return new Date().toISOString().slice(0, 10);
  const trimmed = str.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const [datePart] = trimmed.split(' ');
  const parts = datePart.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      const p0 = Number(parts[0]);
      const p1 = Number(parts[1]);
      if (p0 > 12) {
        // DD/MM/YYYY
        return `${parts[2]}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      } else {
        // MM/DD/YYYY
        return `${parts[2]}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
    }
  }

  return new Date().toISOString().slice(0, 10);
}

export async function fetchCsvByGid(gid: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9500);

  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      throw new Error('Spreadsheet masih dikunci (Private). Ubah akses di Google Sheets menjadi "Siapa saja yang memiliki link" -> "Pelihat (Viewer)".');
    }

    if (!res.ok) {
      throw new Error(`Gagal membaca Google Sheets GID ${gid}: status ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(`Google Sheets mengembalikan halaman HTML alih-alih data CSV untuk GID ${gid}.`);
    }

    return text;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * 1. Fetch Master Warga (Sheet masterwarga, GID 1068212752)
 */
export async function fetchResidentsFromSheet(): Promise<{ success: boolean; residents: Resident[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.masterwarga);
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return { success: true, residents: [] };
    }

    let headerLineIndex = 0;
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      const parsed = parseCsvLine(lines[i]).map((h) => h.toLowerCase());
      if (parsed.some((h) => h.includes('nama') || h.includes('blok') || h.includes('warga'))) {
        headerLineIndex = i;
        break;
      }
    }

    const headers = parseCsvLine(lines[headerLineIndex]).map((h) => h.toLowerCase());
    const namaIdx = headers.findIndex((h) => h.includes('nama') || h.includes('warga'));
    const blokIdx = headers.findIndex((h) => h.includes('blok') || h.includes('rumah') || h.includes('unit'));
    const hpIdx = headers.findIndex((h) => h.includes('hp') || h.includes('wa') || h.includes('telepon') || h.includes('kontak'));
    const tarifIdx = headers.findIndex((h) => h.includes('iuran bulanan') || h.includes('iuran') || h.includes('tarif') || h.includes('nominal'));
    const idIdx = headers.findIndex((h) => h.includes('warga id') || (h.includes('id') && !h.includes('blok') && !h.includes('no')));
    const statusIdx = headers.findIndex((h) => h.includes('status'));

    const residents: Resident[] = [];

    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const nama = (cols[namaIdx >= 0 ? namaIdx : 0] || '').trim();
      const blok = (cols[blokIdx >= 0 ? blokIdx : 1] || '').trim();

      // Skip invalid header rows or vacant rows
      const namaLower = nama.toLowerCase();
      if (
        !nama ||
        namaLower === 'n/a' ||
        namaLower === 'nama' ||
        namaLower === 'nama warga' ||
        namaLower.startsWith('nama ') ||
        namaLower === 'total' ||
        namaLower.startsWith('total ')
      ) {
        continue;
      }

      let rawHp = '';
      if (cols.length > 2 && cols[2] !== undefined && cols[2] !== null && String(cols[2]).trim() !== '') {
        rawHp = String(cols[2]).replace(/[^0-9]/g, '');
      } else if (hpIdx >= 0 && cols[hpIdx]) {
        rawHp = String(cols[hpIdx]).replace(/[^0-9]/g, '');
      }

      if (rawHp.length >= 7) {
        if (rawHp.startsWith('62')) {
          rawHp = '0' + rawHp.slice(2);
        } else if (!rawHp.startsWith('0')) {
          rawHp = '0' + rawHp;
        }
      }

      const rawTarif = (cols[tarifIdx >= 0 ? tarifIdx : 3] || '').replace(/[^0-9]/g, '');
      const tarif = rawTarif ? parseInt(rawTarif, 10) : 150000;
      const wargaId = (idIdx >= 0 && cols[idIdx] && cols[idIdx].length > 3) ? cols[idIdx] : `WRG-${i.toString().padStart(3, '0')}`;
      const statusRaw = (statusIdx >= 0 ? cols[statusIdx] : 'Aktif').toLowerCase();
      const status = statusRaw.includes('non') ? 'Nonaktif' : 'Aktif';

      residents.push({
        id: wargaId,
        nama,
        blok: blok || '-',
        hp: rawHp,
        tarif: isNaN(tarif) || tarif <= 0 ? 150000 : tarif,
        status,
        catatan: 'Tersinkron otomatis dari Google Sheets masterwarga',
      });
    }

    residents.sort((a, b) => a.blok.localeCompare(b.blok, undefined, { numeric: true }));

    return { success: true, residents };
  } catch (err: any) {
    return { success: false, residents: [], error: err.message || 'Terjadi kesalahan saat membaca sheet masterwarga.' };
  }
}

/**
 * 2. Fetch Saldo Awal (Sheet SaldoAwal, GID 469058426)
 */
export async function fetchSaldoAwalFromSheet(): Promise<{ success: boolean; saldoAwal: number; entries: SaldoAwalEntry[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.saldoawal);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const entries: SaldoAwalEntry[] = [];
    let latestSaldo = 11745000;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;
      const tanggalRaw = cols[0];
      const keterangan = cols[1];
      const jumlahRaw = cols[2].replace(/[^0-9]/g, '');
      const transaksiId = cols[3] || `SA-${i}`;
      const jumlah = jumlahRaw ? parseInt(jumlahRaw, 10) : 0;

      if (jumlah > 0) {
        latestSaldo = jumlah;
      }

      const isoDate = parseDateFlexible(tanggalRaw);
      const periode = isoDate.slice(0, 7); // e.g. "2026-11"

      entries.push({
        id: transaksiId,
        tanggal: isoDate,
        periode,
        keterangan: keterangan || 'Saldo Awal Mutasi',
        jumlah,
        transaksiId,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      saldoAwal: latestSaldo,
      entries,
    };
  } catch (err: any) {
    return { success: false, saldoAwal: 11745000, entries: [], error: err.message };
  }
}

/**
 * 3. Fetch Data Iuran Kas Masuk (Sheet DataIuran, GID 0)
 */
export async function fetchIncomesFromSheet(): Promise<{ success: boolean; incomes: IncomeTransaction[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.dataiuran);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const incomes: IncomeTransaction[] = [];

    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const deletedSet = new Set(db.deletedIncomeIds || []);

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 5) continue;

      const waktu = cols[0];
      const nama = cols[1] || '';
      const blok = cols[2] || '';
      const periode = cols[3] || '';
      const nominalRaw = cols[4].replace(/[^0-9]/g, '');
      const statusRaw = (cols[5] || 'Lunas').toLowerCase();
      const kategori = cols[6] || 'Iuran Bulanan';
      const transaksiId = cols[8] ? cols[8].trim() : `SHEET-ROW-${i}`;
      const residentId = cols[9] || undefined;
      const statusTx = (cols[10] || 'Aktif').toLowerCase();
      const buktiId = cols[11] || undefined;

      const nominal = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      if (!nama || nominal <= 0) continue;

      const isVoid = statusTx.includes('batal') || statusRaw.includes('batal');
      if (deletedSet.has(transaksiId) || (buktiId && deletedSet.has(buktiId)) || isVoid) continue;

      const tanggal = parseDateFlexible(waktu);

      const bulanList: string[] = [];
      if (periode) {
        periode.split(/[,;\n]+/).forEach((p) => {
          const norm = normalizePeriodCode(p);
          if (norm && !bulanList.includes(norm)) bulanList.push(norm);
        });
      }
      const bulanAwal = (cols[12] || '').trim();
      const bulanAkhir = (cols[13] || '').trim();
      if (bulanAwal) {
        const normAwal = normalizePeriodCode(bulanAwal);
        if (normAwal && !bulanList.includes(normAwal)) bulanList.push(normAwal);
      }
      if (bulanAkhir) {
        const normAkhir = normalizePeriodCode(bulanAkhir);
        if (normAkhir && !bulanList.includes(normAkhir)) bulanList.push(normAkhir);
      }

      if (bulanList.length > 1) {
        const numMonths = bulanList.length;
        const baseNominal = Math.floor(nominal / numMonths);
        const rem = nominal - baseNominal * numMonths;

        bulanList.forEach((mCode, idx) => {
          const subNominal = idx === numMonths - 1 ? baseNominal + rem : baseNominal;
          incomes.push({
            id: `${transaksiId}-${idx + 1}`,
            tanggal,
            sumber: blok ? `${nama} (${blok})` : nama,
            residentId: residentId ? residentId.trim() : undefined,
            kategori,
            bulan: [mCode],
            nominal: subNominal,
            buktiId,
            status: isVoid ? 'Dibatalkan' : 'Sah',
            catatan: `Iuran Periode ${mCode} (${idx + 1}/${numMonths})`,
            createdAt: new Date().toISOString(),
          });
        });
      } else {
        incomes.push({
          id: transaksiId,
          tanggal,
          sumber: blok ? `${nama} (${blok})` : nama,
          residentId: residentId ? residentId.trim() : undefined,
          kategori,
          bulan: bulanList.length > 0 ? bulanList : [normalizePeriodCode(periode) || '2026-11'],
          nominal,
          buktiId,
          status: isVoid ? 'Dibatalkan' : 'Sah',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Deduplikasi transaksi pemasukan:
    // 1. Berdasarkan ID transaksi unik
    // 2. Berdasarkan kombinasi (Blok/Warga + Bulan Tagihan) agar tidak pernah ada pembayaran ganda/ghosting untuk bulan yang sama
    const seenIncIds = new Set<string>();
    const seenBlockMonth = new Map<string, IncomeTransaction>();
    const uniqueIncomes: IncomeTransaction[] = [];

    for (const inc of incomes) {
      if (seenIncIds.has(inc.id)) continue;
      seenIncIds.add(inc.id);

      const parsed = extractNameAndBlok(inc.sumber || '');
      const blockKey = (parsed.blok || inc.residentId || inc.sumber || '').toUpperCase().replace(/\s+/g, '');
      const monthKey = Array.isArray(inc.bulan) ? inc.bulan.join(',') : inc.bulan || '';
      const comboKey = `${blockKey}_${monthKey}`;

      if (blockKey && monthKey && !inc.catatan?.toLowerCase().includes('angsuran') && !inc.catatan?.toLowerCase().includes('cicil')) {
        const existing = seenBlockMonth.get(comboKey);
        if (existing) {
          // Jika salah satu memiliki buktiId (hasil verifikasi resmi), prioritaskan yang berbukti resmi
          if (!existing.buktiId && inc.buktiId) {
            const idx = uniqueIncomes.indexOf(existing);
            if (idx !== -1) uniqueIncomes[idx] = inc;
            seenBlockMonth.set(comboKey, inc);
          }
          continue;
        }
        seenBlockMonth.set(comboKey, inc);
      }

      uniqueIncomes.push(inc);
    }

    return { success: true, incomes: uniqueIncomes };
  } catch (err: any) {
    return { success: false, incomes: [], error: err.message };
  }
}

/**
 * 4. Fetch Data Pengeluaran Kas (Sheet DataPengeluaran, GID 2139531296)
 */
export async function fetchExpensesFromSheet(): Promise<{ success: boolean; expenses: ExpenseTransaction[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.datapengeluaran);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const expenses: ExpenseTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const waktu = cols[0];
      const keterangan = cols[1] || '';
      const nominalRaw = cols[2].replace(/[^0-9]/g, '');
      const kategori = cols[3] || 'Variabel';
      const transaksiId = cols[4] || `EXP-${i}`;
      const statusTx = (cols[5] || 'Aktif').toLowerCase();
      const sheetPenerima = (cols[7] || '').trim();

      const nominal = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      if (!keterangan || nominal <= 0) continue;

      const tanggal = parseDateFlexible(waktu);
      const isVoid = statusTx.includes('batal');

      // Gunakan kolom Penerima dari sheet (kolom 8) jika tersedia, atau ekstrak dari keterangan
      let penerima = sheetPenerima || 'Pihak Terkait / Toko';
      let resolvedKategori = kategori;
      if (keterangan.toLowerCase().includes('kasbon:')) {
        if (!sheetPenerima) {
          const parts = keterangan.split(':')[1]?.split('-');
          penerima = parts ? parts[0].trim() : 'Petugas / Security';
        }
        // Pastikan setiap transaksi pencairan kasbon selalu berkategori 'Kasbon'
        resolvedKategori = 'Kasbon';
      } else if (!sheetPenerima && keterangan.toLowerCase().includes('gaji')) {
        penerima = 'Satpam / Petugas Kebersihan';
      }

      expenses.push({
        id: transaksiId,
        tanggal,
        kategori: resolvedKategori,
        nominal,
        penerima,
        keterangan,
        status: isVoid ? 'Dibatalkan' : 'Sah',
        createdAt: new Date().toISOString(),
      });
    }

    // Deduplikasi transaksi pengeluaran:
    // 1. Berdasarkan ID transaksi unik
    // 2. Berdasarkan fingerprint (keterangan + nominal + tanggal) agar tidak pernah ada double transaksi pengeluaran
    const seenIds = new Set<string>();
    const seenExpFingerprint = new Set<string>();
    const uniqueExpenses: ExpenseTransaction[] = [];
    for (const exp of expenses) {
      if (seenIds.has(exp.id)) continue;
      seenIds.add(exp.id);

      const fp = `${(exp.keterangan || '').trim().toLowerCase()}_${exp.nominal}_${exp.tanggal}_${exp.status}`;
      if (seenExpFingerprint.has(fp)) {
        continue;
      }
      seenExpFingerprint.add(fp);

      uniqueExpenses.push(exp);
    }

    return { success: true, expenses: uniqueExpenses };
  } catch (err: any) {
    return { success: false, expenses: [], error: err.message };
  }
}

/**
 * 5. Fetch Tunggakan Lama (Sheet TunggakanLama, GID 463968323)
 */
export async function fetchTunggakanLamaFromSheet(): Promise<{ success: boolean; tunggakan: TunggakanLamaEntry[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.tunggakanlama);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const tunggakan: TunggakanLamaEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const tanggal = parseDateFlexible(cols[0]);
      const namaWarga = cols[1];
      const nominalRaw = cols[2].replace(/[^0-9]/g, '');
      const keterangan = cols[3] || 'Tunggakan Lampau';
      const statusRaw = (cols[4] || 'Belum Lunas').toLowerCase();
      const tunggakanId = cols[5] || `TUNG-${i}`;
      const wargaId = cols[6] || undefined;
      const nominalAwalRaw = (cols[7] || '').replace(/[^0-9]/g, '');

      const jumlah = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      const nominalAwal = nominalAwalRaw ? parseInt(nominalAwalRaw, 10) : jumlah;

      if (!namaWarga || jumlah <= 0) continue;

      tunggakan.push({
        id: tunggakanId,
        tanggal,
        namaWarga,
        jumlah,
        nominalAwal,
        keterangan,
        status: statusRaw.includes('lunas') && !statusRaw.includes('belum') ? 'Lunas' : 'Belum Lunas',
        tunggakanId,
        wargaId,
      });
    }

    return { success: true, tunggakan };
  } catch (err: any) {
    return { success: false, tunggakan: [], error: err.message };
  }
}

/**
 * 5b. Fetch Tunggakan Non-Warga (Sheet TunggakanNonWarga, GID 1402141287)
 */
export async function fetchTunggakanNonWargaFromSheet(): Promise<{ success: boolean; tunggakan: TunggakanLamaEntry[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.tunggakannonwarga);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const tunggakan: TunggakanLamaEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const tanggal = parseDateFlexible(cols[0]);
      const namaWarga = cols[1];
      const blok = cols[2] || 'N/A';
      const nominalRaw = (cols[3] || '').replace(/[^0-9]/g, '');
      const keterangan = cols[4] || 'Tunggakan Lampau (Pindah)';
      const statusRaw = (cols[5] || 'Belum Lunas').toLowerCase();
      const catatanPindah = cols[6] || 'Bekas warga (sudah pindah rumah)';
      const tunggakanId = cols[7] || `TUNG-NW-${i}`;
      const nominalAwalRaw = (cols[8] || '').replace(/[^0-9]/g, '');

      const jumlah = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      const nominalAwal = nominalAwalRaw ? parseInt(nominalAwalRaw, 10) : jumlah;

      if (!namaWarga || jumlah <= 0) continue;

      tunggakan.push({
        id: tunggakanId,
        tanggal,
        namaWarga,
        blok,
        jumlah,
        nominalAwal,
        keterangan,
        status: statusRaw.includes('lunas') && !statusRaw.includes('belum') ? 'Lunas' : 'Belum Lunas',
        tipeWarga: 'Pindah',
        catatanPindah,
        tunggakanId,
      });
    }

    return { success: true, tunggakan };
  } catch (err: any) {
    return { success: false, tunggakan: [], error: err.message };
  }
}

/**
 * 6. Fetch Data Kasbon (Sheet DataKasbon, GID 1031321249)
 */
export async function fetchKasbonFromSheet(): Promise<{ success: boolean; kasbon: KasbonEntry[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.kasbon);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const kasbon: KasbonEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const timestamp = cols[0];
      const namaPeminjam = cols[1];
      const nominalRaw = cols[2].replace(/[^0-9]/g, '');
      const keterangan = cols[3] || 'Kasbon';
      const statusRaw = (cols[4] || 'Belum Lunas').toLowerCase();
      const tglBackdate = cols[5] ? parseDateFlexible(cols[5]) : parseDateFlexible(timestamp);
      const kasbonId = cols[6] || `KSB-${i}`;
      const wargaId = cols[7] || undefined;
      const nominalAwalRaw = (cols[8] || '').replace(/[^0-9]/g, '');

      const nominal = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      const nominalAwal = nominalAwalRaw ? parseInt(nominalAwalRaw, 10) : nominal;

      if (!namaPeminjam || nominal <= 0) continue;

      kasbon.push({
        id: kasbonId,
        timestamp,
        namaPeminjam,
        nominal,
        nominalAwal,
        keterangan,
        status: statusRaw.includes('lunas') && !statusRaw.includes('belum') ? 'Lunas' : 'Belum Lunas',
        tglBackdate,
        kasbonId,
        wargaId,
      });
    }

    // Deduplikasi kasbon berdasarkan ID unik
    const seenKasbonIds = new Set<string>();
    const uniqueKasbon: KasbonEntry[] = [];
    for (const k of kasbon) {
      if (!seenKasbonIds.has(k.id)) {
        seenKasbonIds.add(k.id);
        uniqueKasbon.push(k);
      }
    }

    return { success: true, kasbon: uniqueKasbon };
  } catch (err: any) {
    return { success: false, kasbon: [], error: err.message };
  }
}

export function getMonthsBetween(start: string, end: string): string[] {
  if (!start) return [];
  if (!end || start === end) return [start];
  const [startY, startM] = start.split('-').map(Number);
  const [endY, endM] = end.split('-').map(Number);
  if (!startY || !startM || !endY || !endM) return [start];
  const months: string[] = [];
  let curY = startY;
  let curM = startM;
  while (curY < endY || (curY === endY && curM <= endM)) {
    months.push(`${curY}-${String(curM).padStart(2, '0')}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }
  return months;
}

/**
 * 7. Fetch Bukti Transfer (Sheet BuktiTransfer, GID 4652474)
 */
export async function fetchProofsFromSheet(): Promise<{ success: boolean; proofs: ProofSubmission[]; error?: string }> {
  try {
    const csvText = await fetchCsvByGid(SHEET_GIDS.buktitransfer);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const proofs: ProofSubmission[] = [];

    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 3) continue;

      const waktuUpload = cols[0];
      const namaWarga = cols[1];
      const nominalRaw = (cols[2] || '').replace(/[^0-9]/g, '');
      const keterangan = cols[3] || '';
      const driveUrl = cols[4] || '';
      const kategori = cols[5] || 'Iuran Bulanan';
      const bulanRaw = cols[6] || '';
      const statusRaw = (cols[7] || 'Terverifikasi').toLowerCase();
      const buktiId = cols[8] || `BKT-SHEET-${i}`;
      const residentId = cols[9] || '';
      const blok = cols[10] || '';
      const verifiedAt = cols[11] || undefined;
      const verifiedBy = cols[12] || 'Admin';
      const adminNote = cols[13] || '';
      const transactionId = cols[14] || undefined;

      if (deletedProofSet.has(buktiId)) continue;

      const nominal = nominalRaw ? parseInt(nominalRaw, 10) : 0;
      if (!namaWarga && !driveUrl) continue;

      const parsedBulan: string[] = [];
      if (bulanRaw) {
        bulanRaw.split(/[,;\n]+/).forEach((b) => {
          const norm = normalizePeriodCode(b);
          if (norm && !parsedBulan.includes(norm)) {
            parsedBulan.push(norm);
          }
        });
      }

      // Periksa juga kolom Bulan Awal & Bulan Akhir jika multi-bulan
      const bulanAwal = (cols[15] || '').trim();
      const bulanAkhir = (cols[16] || '').trim();
      if (bulanAwal && bulanAkhir) {
        const normAwal = normalizePeriodCode(bulanAwal);
        const normAkhir = normalizePeriodCode(bulanAkhir);
        if (normAwal && normAkhir) {
          const range = getMonthsBetween(normAwal, normAkhir);
          range.forEach((m) => {
            if (!parsedBulan.includes(m)) parsedBulan.push(m);
          });
        }
      }

      if (parsedBulan.length === 0) {
        parsedBulan.push('2026-11');
      }

      let status: 'Terverifikasi' | 'Menunggu Verifikasi' | 'Ditolak' = 'Terverifikasi';
      if (statusRaw.includes('tolak')) {
        status = 'Ditolak';
      } else if (statusRaw.includes('menunggu')) {
        status = 'Menunggu Verifikasi';
      }

      proofs.push({
        id: buktiId,
        residentId: residentId || '',
        residentName: namaWarga,
        blok: blok || '',
        hp: '',
        kategori,
        bulan: parsedBulan,
        nominal,
        buktiUrl: driveUrl || '',
        driveUrl: driveUrl || 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB',
        catatanWarga: keterangan,
        status,
        adminNote,
        createdAt: parseDateFlexible(waktuUpload),
        verifiedAt,
        verifiedBy,
        transactionId,
      });
    }

    // Deduplikasi bukti transfer berdasarkan ID unik
    const seenProofIds = new Set<string>();
    const uniqueProofs: ProofSubmission[] = [];
    for (const p of proofs) {
      if (!seenProofIds.has(p.id)) {
        seenProofIds.add(p.id);
        uniqueProofs.push(p);
      }
    }

    return { success: true, proofs: uniqueProofs };
  } catch (err: any) {
    return { success: false, proofs: [], error: err.message };
  }
}

/**
 * 8. SINKRONISASI LENGKAP SEMUA SHEET
 */
export async function syncAllGoogleSheetsData() {
  const [resRes, saldoRes, incRes, expRes, tungRes, tungNonRes, kasbonRes, proofRes] = await Promise.all([
    fetchResidentsFromSheet(),
    fetchSaldoAwalFromSheet(),
    fetchIncomesFromSheet(),
    fetchExpensesFromSheet(),
    fetchTunggakanLamaFromSheet(),
    fetchTunggakanNonWargaFromSheet(),
    fetchKasbonFromSheet(),
    fetchProofsFromSheet(),
  ]);

  const allTunggakan = [...(tungRes.tunggakan || []), ...(tungNonRes.tunggakan || [])];

  return {
    success: resRes.success,
    residents: resRes.residents || [],
    saldoAwal: saldoRes.saldoAwal || 11745000,
    saldoAwalHistory: saldoRes.entries || [],
    incomes: incRes.incomes || [],
    expenses: expRes.expenses || [],
    tunggakanLama: allTunggakan,
    tunggakanWarga: tungRes.tunggakan || [],
    tunggakanNonWarga: tungNonRes.tunggakan || [],
    kasbon: kasbonRes.kasbon || [],
    proofs: proofRes.proofs || [],
    errors: [resRes.error, saldoRes.error, incRes.error, expRes.error, tungRes.error, tungNonRes.error, kasbonRes.error, proofRes.error].filter(Boolean),
  };
}

/**
 * 9. OTOMATIS TAMBAHKAN TRANSAKSI KE GOOGLE SHEET DATAIURAN
 */
export interface IncomeRowData {
  waktu?: string;
  namaWarga: string;
  blok?: string;
  bulanIuran: string;
  jumlah: number;
  status?: string;
  kategori?: string;
  tarif?: number;
  transaksiId: string;
  wargaId?: string;
  statusTransaksi?: string;
  buktiId?: string;
  bulanAwal?: string;
  bulanAkhir?: string;
  jumlahBulan?: number;
}

export function extractNameAndBlok(
  sumber: string,
  residentId?: string,
  residents?: Resident[]
): { nama: string; blok: string; wargaId: string } {
  if (residentId && residents) {
    const found = residents.find((r) => r.id === residentId);
    if (found) {
      return { nama: found.nama, blok: found.blok, wargaId: found.id };
    }
  }

  const match = sumber.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    return { nama: match[1].trim(), blok: match[2].trim(), wargaId: residentId || '' };
  }

  return { nama: sumber.trim(), blok: '', wargaId: residentId || '' };
}

export async function appendIncomesToSheet(
  items: IncomeRowData | IncomeRowData[]
): Promise<{ success: boolean; count: number; error?: string }> {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return { success: true, count: 0 };

  try {
    const rows = list.map((item) => {
      const now = new Date();
      const formattedTime =
        item.waktu ||
        `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const cleanNama = (item.namaWarga || '').replace(/[,|\r\n]/g, ' ').trim();
      const cleanBlok = (item.blok || '').replace(/[,|\r\n]/g, ' ').trim();
      const bulan = item.bulanIuran || '2026-11';
      const jumlah = item.jumlah || 0;
      const status = item.status || 'Lunas';
      const kategori = item.kategori || 'Iuran Bulanan';
      const tarif = item.tarif || item.jumlah || 150000;
      const txId = item.transaksiId;
      const wargaId = item.wargaId || '';
      const statusTx = item.statusTransaksi || 'Aktif';
      const buktiId = item.buktiId || '';
      const bulanAwal = item.bulanAwal || bulan;
      const bulanAkhir = item.bulanAkhir || bulan;
      const jumlahBulan = item.jumlahBulan || 1;

      return `${formattedTime},${cleanNama},${cleanBlok},${bulan},${jumlah},${status},${kategori},${tarif},${txId},${wargaId},${statusTx},${buktiId},${bulanAwal},${bulanAkhir},${jumlahBulan}`;
    });

    return await appendRowsToSheet('DataIuran', rows);
  } catch (err: any) {
    console.error('appendIncomesToSheet exception:', err);
    return { success: false, count: 0, error: err.message };
  }
}

export async function deleteRowFromSheet(
  sheetName: string,
  idColIndex: number,
  rowId: string,
  gid?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rowId) return { success: true };

    // 1. Prioritaskan Webhook Apps Script (Sangat Cepat & Berjalan di Cloud/Vercel)
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL || db.settings.googleDriveWebhookUrl || DEFAULT_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.startsWith('http')) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'delete_row', sheetName, rowId, colIndex: idColIndex }),
        });
        if (res.ok) return { success: true };
      } catch (webhookErr) {
        console.warn(`Webhook deleteRowFromSheet error:`, webhookErr);
      }
    }

    // 2. Fallback via gsheets CLI jika di komputer lokal
    if (gid) {
      try {
        const csvText = await fetchCsvByGid(gid);
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        let targetRowIndex = -1;

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const curId = cols[idColIndex - 1] || '';
          if (curId.trim() === rowId.trim()) {
            targetRowIndex = i;
            break;
          }
        }

        if (targetRowIndex !== -1) {
          const cliResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
            try {
              const child = spawn(
                'gsheets',
                ['mutate', 'delete-rows', SHEET_ID, '--sheet-id', gid, '--start', String(targetRowIndex), '--end', String(targetRowIndex + 1)],
                { shell: true }
              );
              let stderr = '';
              child.stderr.on('data', (d) => (stderr += d.toString()));
              child.on('close', (code) => {
                if (code === 0) resolve({ success: true });
                else resolve({ success: false, error: stderr });
              });
              child.on('error', (err) => resolve({ success: false, error: err.message }));
            } catch (e: any) {
              resolve({ success: false, error: e.message });
            }
          });

          if (cliResult.success) return cliResult;
        }
      } catch (cliErr) {
        // Lanjutkan
      }
    }

    return { success: false, error: 'Gagal menghapus baris dari Google Sheets.' };
  } catch (err: any) {
    console.error(`deleteRowFromSheet [${sheetName}] error:`, err);
    return { success: false, error: err.message };
  }
}

export async function updateRowInSheet(
  sheetName: string,
  idColIndex: number,
  rowId: string,
  updates: Record<number, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rowId) return { success: false, error: 'Row ID wajib diisi.' };

    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL || db.settings.googleDriveWebhookUrl || DEFAULT_WEBHOOK_URL;
    if (webhookUrl && webhookUrl.startsWith('http')) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_row', sheetName, rowId, idColIndex, updates }),
      });
      if (res.ok) {
        try {
          const json = await res.json();
          if (json.updated === false) {
            console.warn(`updateRowInSheet [${sheetName}] row not updated:`, json.message);
            return { success: false, error: json.message || 'Baris tidak ditemukan di Google Sheets.' };
          }
          return { success: true };
        } catch {
          return { success: true };
        }
      }
    }

    return { success: false, error: 'Gagal memperbarui data Google Sheet (Webhook belum terhubung).' };
  } catch (err: any) {
    console.error(`updateRowInSheet [${sheetName}] error:`, err);
    return { success: false, error: err.message };
  }
}

export async function updateResidentInSheet(
  r: Resident,
  oldBlok?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Coba update via Warga ID (kolom 10 di sheet MasterWarga)
    let res = await updateRowInSheet('MasterWarga', 10, r.id, {
      1: r.nama,
      2: r.blok,
      3: r.hp || '',
      4: r.tarif || 150000,
      11: r.status || 'Aktif',
    });

    // 2. Jika via ID belum berhasil, coba via Blok (kolom 2)
    if (!res.success && (oldBlok || r.blok)) {
      res = await updateRowInSheet('MasterWarga', 2, oldBlok || r.blok, {
        1: r.nama,
        2: r.blok,
        3: r.hp || '',
        4: r.tarif || 150000,
        11: r.status || 'Aktif',
      });
    }

    // 3. Jika masih belum berhasil, coba via Nama (kolom 1)
    if (!res.success && r.nama) {
      res = await updateRowInSheet('MasterWarga', 1, r.nama, {
        1: r.nama,
        2: r.blok,
        3: r.hp || '',
        4: r.tarif || 150000,
        11: r.status || 'Aktif',
      });
    }

    return res;
  } catch (err: any) {
    console.error('updateResidentInSheet error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteIncomeFromSheet(txId: string): Promise<{ success: boolean; error?: string }> {
  return deleteRowFromSheet('DataIuran', 9, txId, SHEET_GIDS.dataiuran);
}

export async function updateIncomeInSheet(
  inc: IncomeTransaction,
  namaWarga: string,
  blok: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formattedTime = formatGoogleSheetTimestamp(inc.tanggal ? new Date(inc.tanggal) : new Date());
    const bulanStr = Array.isArray(inc.bulan) ? inc.bulan.join('; ') : inc.bulan || '';

    // 1. Coba update via webhook
    const webhookRes = await updateRowInSheet('DataIuran', 9, inc.id, {
      1: formattedTime,
      2: namaWarga,
      3: blok,
      4: bulanStr,
      5: inc.nominal,
      6: inc.status === 'Dibatalkan' ? 'Dibatalkan' : 'Lunas',
      7: inc.kategori || 'Iuran Bulanan',
      10: inc.residentId || '',
    });

    // 2. Fallback: hapus baris lama dan tambahkan baris baru yang diperbarui
    if (!webhookRes.success) {
      await deleteIncomeFromSheet(inc.id);
      await appendIncomesToSheet({
        waktu: formattedTime,
        namaWarga,
        blok,
        bulanIuran: bulanStr,
        jumlah: inc.nominal,
        status: inc.status === 'Dibatalkan' ? 'Dibatalkan' : 'Lunas',
        kategori: inc.kategori || 'Iuran Bulanan',
        tarif: inc.nominal,
        transaksiId: inc.id,
        wargaId: inc.residentId || '',
        statusTransaksi: inc.status === 'Dibatalkan' ? 'Dibatalkan' : 'Aktif',
        buktiId: inc.buktiId || '',
        bulanAwal: Array.isArray(inc.bulan) ? inc.bulan[0] : bulanStr,
        bulanAkhir: Array.isArray(inc.bulan) ? inc.bulan[inc.bulan.length - 1] : bulanStr,
        jumlahBulan: Array.isArray(inc.bulan) ? inc.bulan.length : 1,
      });
    }
    return { success: true };
  } catch (err: any) {
    console.error('updateIncomeInSheet error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteExpenseFromSheet(expId: string): Promise<{ success: boolean; error?: string }> {
  return deleteRowFromSheet('DataPengeluaran', 5, expId, SHEET_GIDS.datapengeluaran);
}

export async function deleteExpenseByRefIdFromSheet(refId: string): Promise<{ success: boolean; error?: string }> {
  return deleteRowFromSheet('DataPengeluaran', 7, refId, SHEET_GIDS.datapengeluaran);
}

export async function updateExpenseInSheet(
  e: ExpenseTransaction,
  refId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const formattedTime = formatGoogleSheetTimestamp(e.tanggal ? new Date(e.tanggal) : new Date());
    // Coba update via webhook
    const webhookRes = await updateRowInSheet('DataPengeluaran', 5, e.id, {
      1: formattedTime,
      2: e.keterangan || `${e.kategori} - ${e.penerima}`,
      3: e.nominal || 0,
      4: e.kategori,
      6: e.status === 'Dibatalkan' ? 'Dibatalkan' : 'Aktif',
      8: escapeGsheetCell(e.penerima || 'Pihak Terkait / Toko'),
    });

    if (!webhookRes.success) {
      // Fallback: hapus baris lama dan tambahkan baris baru yang telah diperbarui
      await deleteExpenseFromSheet(e.id);
      await appendExpenseToSheet(e, refId);
    }
    return { success: true };
  } catch (err: any) {
    console.error('updateExpenseInSheet error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteKasbonFromSheet(kasbonId: string): Promise<{ success: boolean; error?: string }> {
  return deleteRowFromSheet('DataKasbon', 7, kasbonId, SHEET_GIDS.kasbon);
}

export async function updateKasbonInSheet(
  kasbonId: string,
  nominalSisa: number,
  status: string
): Promise<{ success: boolean; error?: string }> {
  return updateRowInSheet('DataKasbon', 7, kasbonId, { 3: nominalSisa, 5: status });
}

export async function deleteTunggakanFromSheet(
  tunggakanId: string,
  tipeWarga?: string
): Promise<{ success: boolean; error?: string }> {
  const isPindah = tipeWarga === 'Pindah' || tipeWarga === 'Non-Warga';
  if (isPindah) {
    return deleteRowFromSheet('TunggakanNonWarga', 8, tunggakanId, SHEET_GIDS.tunggakannonwarga);
  }
  return deleteRowFromSheet('TunggakanLama', 6, tunggakanId, SHEET_GIDS.tunggakanlama);
}

export async function updateTunggakanInSheet(
  tunggakanId: string,
  nominalSisa: number,
  status: string,
  tipeWarga?: string
): Promise<{ success: boolean; error?: string }> {
  const isPindah = tipeWarga === 'Pindah' || tipeWarga === 'Non-Warga';
  if (isPindah) {
    return updateRowInSheet('TunggakanNonWarga', 8, tunggakanId, { 4: nominalSisa, 6: status });
  }
  return updateRowInSheet('TunggakanLama', 6, tunggakanId, { 3: nominalSisa, 5: status });
}

/**
 * 10. HELPER UMUM & MUTASI UNTUK SEMUA SHEET GOOGLE SPREADSHEET
 */
export function formatGoogleSheetTimestamp(d: Date = new Date()): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${m}/${day}/${y} ${hh}:${mm}:${ss}`;
}

export function escapeGsheetCell(val: any): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[,|\r\n]/g, ' ').trim();
}

async function appendViaWebhook(sheetTitle: string, rows: (string | number)[][]): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    const webhookUrl = process.env.GOOGLE_WEBHOOK_URL || db.settings.googleDriveWebhookUrl || DEFAULT_WEBHOOK_URL;
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return { success: false, count: 0, error: 'Webhook URL belum dikonfigurasi' };
    }

    const payload = {
      action: 'append_rows',
      sheetName: sheetTitle,
      rows: rows,
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        return { success: true, count: rows.length };
      }
      return { success: false, count: 0, error: data.error || 'Webhook returned error' };
    }
    return { success: false, count: 0, error: `Webhook HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

export async function appendRowsToSheet(
  sheetTitle: string,
  rows: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (rows.length === 0) return { success: true, count: 0 };
  const valuesArg = rows.join('|');

  // 1. Coba via gsheets CLI (jika di environment lokal dengan CLI terpasang)
  const cliPromise = new Promise<{ success: boolean; count: number; error?: string }>((resolve) => {
    try {
      const child = spawn(
        'gsheets',
        ['mutate', 'append', SHEET_ID, sheetTitle, valuesArg],
        { shell: true }
      );

      let stderr = '';
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, count: rows.length });
        } else {
          resolve({ success: false, count: 0, error: stderr || stdout });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, count: 0, error: err.message });
      });
    } catch (e: any) {
      resolve({ success: false, count: 0, error: e.message });
    }
  });

  const cliResult = await cliPromise;
  if (cliResult.success) {
    return cliResult;
  }

  // 2. Fallback Webhook jika CLI tidak ada (misalnya saat di Vercel/Cloud)
  const rowsArray = rows.map((r) => r.split(',').map((c) => c.trim()));
  const webhookResult = await appendViaWebhook(sheetTitle, rowsArray);
  if (webhookResult.success) {
    return webhookResult;
  }

  return { success: false, count: 0, error: cliResult.error || webhookResult.error };
}

// 10.1 MasterWarga
export async function appendResidentToSheet(r: Resident) {
  const row = [
    escapeGsheetCell(r.nama),
    escapeGsheetCell(r.blok),
    escapeGsheetCell(r.hp),
    r.tarif || 150000,
    0,
    0,
    0,
    0,
    0,
    escapeGsheetCell(r.id),
    r.status || 'Aktif',
  ].join(',');
  return appendRowsToSheet('MasterWarga', [row]);
}

// 10.2 SaldoAwal
export async function appendSaldoAwalToSheet(entry: {
  tanggal?: string;
  keterangan: string;
  jumlah: number;
  transaksiId: string;
}) {
  const formattedTime = formatGoogleSheetTimestamp(entry.tanggal ? new Date(entry.tanggal) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(entry.keterangan),
    entry.jumlah || 0,
    escapeGsheetCell(entry.transaksiId),
  ].join(',');
  return appendRowsToSheet('SaldoAwal', [row]);
}

// 10.3 RiwayatPelunasan
export async function appendPelunasanToSheet(p: {
  id: string;
  waktu?: string;
  jenis: string;
  referensiId: string;
  nama: string;
  nominal: number;
  sisa: number;
  transaksiId: string;
  admin?: string;
}) {
  const formattedTime = formatGoogleSheetTimestamp(p.waktu ? new Date(p.waktu) : new Date());
  const row = [
    escapeGsheetCell(p.id),
    formattedTime,
    escapeGsheetCell(p.jenis),
    escapeGsheetCell(p.referensiId),
    escapeGsheetCell(p.nama),
    p.nominal || 0,
    p.sisa || 0,
    escapeGsheetCell(p.transaksiId),
    escapeGsheetCell(p.admin || 'Admin RT'),
  ].join(',');
  return appendRowsToSheet('RiwayatPelunasan', [row]);
}

// 10.4 TunggakanLama (Warga)
export async function appendTunggakanLamaToSheet(t: TunggakanLamaEntry) {
  const formattedTime = formatGoogleSheetTimestamp(t.tanggal ? new Date(t.tanggal) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(t.namaWarga),
    t.jumlah || 0,
    escapeGsheetCell(t.keterangan),
    t.status || 'Belum Lunas',
    escapeGsheetCell(t.id || t.tunggakanId || ''),
    escapeGsheetCell(t.wargaId || ''),
    t.nominalAwal || t.jumlah || 0,
  ].join(',');
  return appendRowsToSheet('TunggakanLama', [row]);
}

// 10.5 TunggakanNonWarga (Bekas Warga / Pindah)
export async function appendTunggakanNonWargaToSheet(t: TunggakanLamaEntry) {
  const formattedTime = formatGoogleSheetTimestamp(t.tanggal ? new Date(t.tanggal) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(t.namaWarga),
    escapeGsheetCell(t.blok || 'N/A'),
    t.jumlah || 0,
    escapeGsheetCell(t.keterangan),
    t.status || 'Belum Lunas',
    escapeGsheetCell(t.catatanPindah || 'Bekas warga (sudah pindah rumah)'),
    escapeGsheetCell(t.id || t.tunggakanId || ''),
    t.nominalAwal || t.jumlah || 0,
  ].join(',');
  return appendRowsToSheet('TunggakanNonWarga', [row]);
}

// 10.6 DataKasbon
export async function appendKasbonToSheet(k: KasbonEntry) {
  const formattedTime = formatGoogleSheetTimestamp(new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(k.namaPeminjam),
    k.nominal || 0,
    escapeGsheetCell(k.keterangan),
    k.status || 'Belum Lunas',
    k.tglBackdate || k.timestamp || '',
    escapeGsheetCell(k.id || k.kasbonId || ''),
    escapeGsheetCell(k.wargaId || ''),
    k.nominalAwal || k.nominal || 0,
  ].join(',');
  return appendRowsToSheet('DataKasbon', [row]);
}

// 10.7 DataPengeluaran
export async function appendExpenseToSheet(e: ExpenseTransaction, refId?: string) {
  const formattedTime = formatGoogleSheetTimestamp(e.tanggal ? new Date(e.tanggal) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(e.keterangan || `${e.kategori} - ${e.penerima}`),
    e.nominal || 0,
    escapeGsheetCell(e.kategori),
    escapeGsheetCell(e.id),
    'Aktif',
    escapeGsheetCell(refId || ''),
    escapeGsheetCell(e.penerima || 'Pihak Terkait / Toko'),
  ].join(',');
  return appendRowsToSheet('DataPengeluaran', [row]);
}

// 10.8 BuktiTransfer
export async function appendProofToSheet(p: ProofSubmission) {
  const formattedTime = formatGoogleSheetTimestamp(p.createdAt ? new Date(p.createdAt) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(p.residentName),
    p.nominal || 0,
    escapeGsheetCell(p.catatanWarga || ''),
    escapeGsheetCell(p.driveUrl || p.buktiUrl || ''),
    escapeGsheetCell(p.kategori || 'Iuran Bulanan'),
    escapeGsheetCell(p.bulan?.join('; ') || '2026-11'),
    escapeGsheetCell(p.status || 'Menunggu Verifikasi'),
    escapeGsheetCell(p.id),
    escapeGsheetCell(p.residentId || ''),
    escapeGsheetCell(p.blok || ''),
    escapeGsheetCell(p.verifiedAt || ''),
    escapeGsheetCell(p.verifiedBy || ''),
    escapeGsheetCell(p.adminNote || ''),
    escapeGsheetCell(p.transactionId || ''),
    escapeGsheetCell(p.bulan?.[0] || '2026-11'),
    escapeGsheetCell(p.bulan?.[p.bulan.length - 1] || '2026-11'),
    p.bulan?.length || 1,
  ].join(',');
  return appendRowsToSheet('BuktiTransfer', [row]);
}

export async function updateProofInSheet(data: {
  buktiId: string;
  status: 'Terverifikasi' | 'Menunggu Verifikasi' | 'Ditolak';
  waktuUpload?: string;
  namaWarga?: string;
  nominal?: number;
  keterangan?: string;
  fileUrl?: string;
  kategori?: string;
  bulan?: string;
  blok?: string;
  wargaId?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  adminNote?: string;
  transactionId?: string;
}) {
  const webhookUrl = process.env.GOOGLE_SCRIPT_WEBHOOK_URL || process.env.GOOGLE_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'verify_bukti',
        ...data,
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error('updateProofInSheet error:', err);
    return { status: 'error', message: err.message };
  }
}

export async function deleteProofFromSheet(proofId: string) {
  // Kolom 9 di Sheet BuktiTransfer adalah Bukti ID
  return deleteRowFromSheet('BuktiTransfer', 9, proofId, SHEET_GIDS.buktitransfer);
}

export async function deletePelunasanFromSheet(idOrRefId: string) {
  if (!idOrRefId) return { success: true };
  try {
    await deleteRowFromSheet('RiwayatPelunasan', 1, idOrRefId, SHEET_GIDS.riwayatpelunasan);
    await deleteRowFromSheet('RiwayatPelunasan', 4, idOrRefId, SHEET_GIDS.riwayatpelunasan);
    await deleteRowFromSheet('RiwayatPelunasan', 8, idOrRefId, SHEET_GIDS.riwayatpelunasan);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function getDirectGoogleDriveImageUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

// 10.9 BuktiStruk
export async function appendBuktiStrukToSheet(e: ExpenseTransaction) {
  const formattedTime = formatGoogleSheetTimestamp(e.tanggal ? new Date(e.tanggal) : new Date());
  const row = [
    formattedTime,
    escapeGsheetCell(e.keterangan),
    escapeGsheetCell(e.kategori),
    escapeGsheetCell(e.penerima),
    e.nominal || 0,
    escapeGsheetCell(e.driveUrl || e.buktiUrl || ''),
    escapeGsheetCell(e.id),
    escapeGsheetCell(e.status || 'Sah'),
  ].join(',');
  return appendRowsToSheet('BuktiStruk', [row]);
}
