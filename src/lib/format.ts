export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeIndo(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cleanPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

export function createWaLink(phone: string, text: string): string {
  const p = cleanPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function formatPeriodCode(input?: string): string {
  if (!input) return '-';
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

export function normalizePeriodCode(input?: string | null): string {
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

  const isNonRegular =
    inc.kategori === 'Pengembalian Kasbon' ||
    inc.kategori === 'Cicilan Tunggakan' ||
    inc.kategori === 'Pelunasan Tunggakan' ||
    inc.kategori?.toLowerCase().includes('kasbon') ||
    inc.kategori?.toLowerCase().includes('tunggakan') ||
    inc.kategori?.toLowerCase().includes('donasi');

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
  return s.trim().toUpperCase().replace(/[\s\-_/.]+/g, '-');
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

  // 3. Nama lengkap warga (minimal 4 karakter) jika blok tidak dicantumkan di sumber
  if (resident.nama && resident.nama.trim().length >= 4 && income.sumber) {
    const sClean = income.sumber.toLowerCase();
    const nClean = resident.nama.toLowerCase().trim();
    if (sClean.includes(nClean)) {
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

  // 3. Nama lengkap warga
  if (resident.nama && resident.nama.trim().length >= 4 && proof.residentName) {
    const pClean = proof.residentName.toLowerCase();
    const nClean = resident.nama.toLowerCase().trim();
    if (pClean.includes(nClean) || nClean.includes(pClean)) return true;
  }

  return false;
}
