export function formatRupiah(value: any): string {
  try {
    const num = typeof value === 'number' ? value : Number(value);
    const safeNum = isNaN(num) || !isFinite(num) ? 0 : num;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(safeNum);
  } catch {
    return 'Rp 0';
  }
}

export function formatDateIndo(dateStr: any): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr || '-');
  }
}

export function formatDateTimeIndo(dateStr: any): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr || '-');
  }
}

export function cleanPhone(phone: any): string {
  if (!phone) return '';
  const str = String(phone);
  let cleaned = str.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

export function createWaLink(phone: string, text: string): string {
  const p = cleanPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function formatPeriodCode(input?: any): string {
  if (!input) return '-';
  const trimmed = String(input).trim();
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
    let m = '';
    let y = '';
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (monthMap[lower]) m = monthMap[lower];
      else if (/^\d{4}$/.test(p)) y = p;
      else if (/^\d{1,2}$/.test(p) && !m) m = p.padStart(2, '0');
    }
    if (m && y) return `${y}-${m}`;
  }
  return trimmed;
}

export const MONTH_NAMES_ID: Record<string, string> = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember',
};

export function normalizePeriodCode(input?: any): string {
  if (!input) return '';
  const trimmed = String(input).trim();
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
    let m = '';
    let y = '';
    for (const p of parts) {
      const lower = p.toLowerCase();
      if (monthMap[lower]) m = monthMap[lower];
      else if (/^\d{4}$/.test(p)) y = p;
      else if (/^\d{1,2}$/.test(p) && !m) m = p.padStart(2, '0');
    }
    if (m && y) return `${y}-${m}`;
  }
  return '';
}

export function isIncomeInPeriod(inc: any, targetPeriod: string, year: number): boolean {
  if (inc.status && inc.status !== 'Sah') return false;

  const isNonRegular = !isIuranBulananCategory(inc.kategori);

  const bList = Array.isArray(inc.bulan) ? inc.bulan : inc.bulan ? [inc.bulan] : [];
  const validPeriodCodes = bList
    .map((b: string) => normalizePeriodCode(b))
    .filter((b: string) => /^\d{4}-\d{2}$/.test(b));

  const tglPeriod = inc.tanggal ? inc.tanggal.slice(0, 7) : '';

  if (targetPeriod === 'ALL') {
    if (isNonRegular || validPeriodCodes.length === 0) {
      return Boolean(inc.tanggal && inc.tanggal.startsWith(String(year)));
    }
    return (
      validPeriodCodes.some((b: string) => b.startsWith(String(year))) ||
      Boolean(inc.tanggal && inc.tanggal.startsWith(String(year)))
    );
  } else {
    const normTarget = normalizePeriodCode(targetPeriod) || targetPeriod;
    if (isNonRegular || validPeriodCodes.length === 0) {
      return Boolean(tglPeriod && tglPeriod === normTarget);
    }
    return validPeriodCodes.includes(normTarget);
  }
}

export function normalizeBlokCode(s?: string | null): string {
  if (!s) return '';
  return s
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/.()\[\]]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function matchIncomeToResident(income: any, resident: any): boolean {
  if (!income || !resident) return false;
  // 1. Authoritative check via residentId
  if (income.residentId) {
    return income.residentId === resident.id;
  }

  // 2. Blok match dengan pemisah ketat (mencegah tabrakan H-12/2 vs H-1/22)
  const rBlok = normalizeBlokCode(resident.blok);
  if (rBlok && income.sumber) {
    const sNorm = normalizeBlokCode(income.sumber);
    const regex = new RegExp(`(^|-)${rBlok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-|$)`, 'i');
    if (regex.test(sNorm)) {
      return true;
    }
  }

  // 3. Nama lengkap warga (exact base name sebelum kurung blok) jika blok tidak dicantumkan di sumber
  if (resident.nama && resident.nama.trim().length >= 4 && income.sumber) {
    const sBase = income.sumber.split('(')[0].toLowerCase().trim();
    const nClean = resident.nama.toLowerCase().trim();
    if (sBase === nClean) {
      return true;
    }
  }

  return false;
}

export function matchProofToResident(proof: any, resident: any): boolean {
  if (!proof || !resident) return false;
  // 1. Authoritative check via residentId
  if (proof.residentId) {
    return proof.residentId === resident.id;
  }

  // 2. Blok match dengan pemisah ketat
  const rBlok = normalizeBlokCode(resident.blok);
  if (rBlok && proof.blok) {
    const pBlok = normalizeBlokCode(proof.blok);
    if (rBlok === pBlok) return true;
  }

  // 3. Nama lengkap warga (exact match)
  if (resident.nama && resident.nama.trim().length >= 4 && proof.residentName) {
    const pClean = proof.residentName.toLowerCase().trim();
    const nClean = resident.nama.toLowerCase().trim();
    if (pClean === nClean) return true;
  }

  return false;
}

/**
 * Mengembalikan true HANYA untuk kategori Iuran Bulanan (Reguler).
 * Kategori lain (Donasi / Dana Hibah, THR, Ramadhan, Agustusan, Selokan, Lainnya,
 * Pelunasan Tunggakan, Pengembalian Kasbon) tidak boleh dipecah ke multi-bulan
 * dan dicatat utuh pada satu periode saat transaksi tersebut terjadi.
 */
export function isIuranBulananCategory(kategori?: string | null): boolean {
  const lower = (kategori || '').trim().toLowerCase();
  if (!lower) return true;
  if (
    lower.includes('donasi') ||
    lower.includes('hibah') ||
    lower.includes('thr') ||
    lower.includes('ramadhan') ||
    lower.includes('agustusan') ||
    lower.includes('selokan') ||
    lower.includes('tunggakan') ||
    lower.includes('kasbon') ||
    lower.includes('lainnya') ||
    lower.includes('lainya')
  ) {
    return false;
  }
  return lower === 'iuran bulanan' || lower === 'iuran bulanan (reguler)' || lower.startsWith('iuran bulanan');
}

/**
 * Mengelompokkan transaksi pemasukan ke bucket keuangan agar jelas pemisahannya:
 * - 'iuran'     : Iuran Bulanan Reguler
 * - 'tunggakan' : Pelunasan / Cicilan Tunggakan Warga
 * - 'kasbon'    : Pengembalian / Pelunasan Kasbon Petugas
 * - 'lainnya'   : Kategori non-bulanan (Donasi / Dana Hibah, THR, Ramadhan, Agustusan, Selokan, Lainnya)
 */
export function classifyIncomeBucket(kategori?: string | null): 'iuran' | 'tunggakan' | 'kasbon' | 'lainnya' {
  if (isIuranBulananCategory(kategori)) return 'iuran';
  const lower = (kategori || '').trim().toLowerCase();
  if (lower.includes('tunggakan')) return 'tunggakan';
  if (lower.includes('kasbon')) return 'kasbon';
  return 'lainnya';
}

export function isPemindahanBansosCategory(kategori?: string | null): boolean {
  const lower = (kategori || '').trim().toLowerCase();
  return lower.includes('pemindahan dana bansos') || lower.includes('pemindahan bansos') || lower === 'transfer dana bansos';
}

export const BANSOS_PROOF_CATEGORY = 'Sumbangan Dana Bansos';

export function isBansosProofCategory(kategori?: string | null): boolean {
  const lower = (kategori || '').trim().toLowerCase();
  return (
    lower.includes('sumbangan dana bansos') ||
    lower.includes('donasi bansos') ||
    lower.includes('kas kecil bansos') ||
    lower === 'dana bansos' ||
    lower === 'bansos'
  );
}

export interface ProofPeriodSlice<T = any> {
  proof: T;
  periodCode: string;
  periodNominal: number;
  sliceIndex: number;
  totalSlices: number;
  rowKey: string;
}

/**
 * Memecah bukti transfer kategori Iuran Bulanan yang mencakup > 1 bulan
 * (mis. bayar Rp 300.000 untuk 2 bulan) menjadi rincian per periode bulan.
 * Kategori di luar Iuran Bulanan selalu utuh 1 periode.
 */
export function splitProofByPeriod<
  T extends { id: string; kategori?: string; bulan?: string[]; nominal: number }
>(proof: T): ProofPeriodSlice<T>[] {
  const monthsRaw = Array.isArray(proof.bulan)
    ? proof.bulan
    : proof.bulan
    ? String(proof.bulan).split(/[,;\n]+/)
    : [];
  const normalizedMonths: string[] = [];
  monthsRaw.forEach((m) => {
    const code = normalizePeriodCode(m) || String(m).trim();
    if (code && !normalizedMonths.includes(code)) {
      normalizedMonths.push(code);
    }
  });

  if (normalizedMonths.length === 0) {
    normalizedMonths.push('-');
  }

  if (!isIuranBulananCategory(proof.kategori) || normalizedMonths.length <= 1) {
    return [
      {
        proof,
        periodCode: normalizedMonths[0],
        periodNominal: Number(proof.nominal) || 0,
        sliceIndex: 0,
        totalSlices: 1,
        rowKey: proof.id,
      },
    ];
  }

  const sortedMonths = [...normalizedMonths].sort();
  const n = sortedMonths.length;
  const total = Number(proof.nominal) || 0;
  const base = Math.floor(total / n);
  const rem = total - base * n;

  return sortedMonths.map((periodCode, idx) => ({
    proof,
    periodCode,
    periodNominal: idx === n - 1 ? base + rem : base,
    sliceIndex: idx,
    totalSlices: n,
    rowKey: `${proof.id}__${periodCode}`,
  }));
}

/**
 * Mengembalikan angka finite yang aman (tidak pernah NaN / Infinity).
 */
export function safeNumber(val: unknown, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Mengembalikan timestamp milidetik yang aman untuk sorting (tidak pernah NaN).
 */
export function safeTimestamp(val: unknown): number {
  if (!val) return 0;
  const ms = new Date(String(val)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
