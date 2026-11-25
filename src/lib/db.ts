import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseSchema, Resident, ProofSubmission, IncomeTransaction, ExpenseTransaction, ActivityLog, AppSettings } from '@/types';
import { isIuranBulananCategory, isDansosProofCategory } from '@/lib/format';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const TMP_DB_FILE = path.join(os.tmpdir(), 'database.json');

let memoryDbCache: DatabaseSchema | null = null;

const DEFAULT_SETTINGS: AppSettings = {
  namaRt: 'RT 011 / RW 028',
  namaKomplek: 'Cluster Cleopatra',
  alamat: 'Kel. Sukamaju, Kec. Cilodong',
  namaBank: 'BCA',
  nomorRekening: '6831361830',
  atasNama: 'Triana Iswahyuni',
  qrisUrl: '',
  nomorWaAdmin: '6281234567890',
  pesanPengumuman: 'Pembayaran iuran bulanan dibuka sampai tanggal 10 setiap bulannya. Mohon upload bukti transfer agar diverifikasi oleh bendahara.',
  adminPin: 'admin123',
  saldoAwal: 11745000,
  periodeAktif: '2026-11',
  linkFolderUtamaDrive: 'https://drive.google.com/drive/folders/1nFboWcdPdbncsrub31vzd3jgLRZOaZo_',
  linkPenyimpananBuktiDrive: 'https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB',
  googleDriveWebhookUrl: '',
};

const INITIAL_RESIDENTS: Resident[] = [
  { id: 'WRG-001', nama: 'Budi Santoso', blok: 'A1/01', hp: '081234567891', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-002', nama: 'Hendra Wijaya', blok: 'A1/02', hp: '081234567892', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-003', nama: 'Ahmad Fauzi', blok: 'A1/03', hp: '081234567893', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-004', nama: 'Siti Rahmawati', blok: 'B2/01', hp: '081234567894', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-005', nama: 'Dedi Kurniawan', blok: 'B2/02', hp: '081234567895', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-006', nama: 'Eko Prasetyo', blok: 'B2/03', hp: '081234567896', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-007', nama: 'Rudi Hartono', blok: 'C3/01', hp: '081234567897', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-008', nama: 'Agus Setiawan', blok: 'C3/02', hp: '081234567898', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-009', nama: 'Wawan Gunawan', blok: 'C3/03', hp: '081234567899', tarif: 100000, status: 'Aktif' },
  { id: 'WRG-010', nama: 'Joko Susilo', blok: 'D4/01', hp: '081234567800', tarif: 100000, status: 'Aktif' },
];

const INITIAL_EXPENSES: ExpenseTransaction[] = [
  {
    id: 'EXP-1001',
    tanggal: '2026-11-01',
    kategori: 'Keamanan / Satpam',
    nominal: 1200000,
    penerima: 'Pak Slamet (Koord. Satpam)',
    keterangan: 'Gaji satpam pos cluster periode November 2026',
    status: 'Sah',
    createdAt: new Date('2026-11-01T08:00:00Z').toISOString(),
  },
  {
    id: 'EXP-1002',
    tanggal: '2026-11-02',
    kategori: 'Kebersihan / Sampah',
    nominal: 450000,
    penerima: 'Dinas Kebersihan Lingkungan',
    keterangan: 'Iuran pengangkutan sampah warga mingguan',
    status: 'Sah',
    createdAt: new Date('2026-11-02T10:15:00Z').toISOString(),
  },
  {
    id: 'EXP-1003',
    tanggal: '2026-11-03',
    kategori: 'Listrik Pos & PJU',
    nominal: 285000,
    penerima: 'PLN Token',
    keterangan: 'Pembelian token listrik pos satpam & lampu jalan utama',
    status: 'Sah',
    createdAt: new Date('2026-11-03T14:30:00Z').toISOString(),
  },
];

const INITIAL_PROOFS: ProofSubmission[] = [
  {
    id: 'BKT-2611-001',
    residentId: 'WRG-001',
    residentName: 'Budi Santoso',
    blok: 'A1/01',
    hp: '081234567891',
    kategori: 'Iuran Bulanan',
    bulan: ['November 2026'],
    nominal: 100000,
    buktiUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    catatanWarga: 'Transfer via m-BCA a.n Budi S',
    status: 'Terverifikasi',
    adminNote: 'Sesuai, saldo masuk ke BCA',
    createdAt: new Date('2026-11-04T09:00:00Z').toISOString(),
    verifiedAt: new Date('2026-11-04T09:30:00Z').toISOString(),
    verifiedBy: 'Bendahara RT',
    transactionId: 'INC-2611-001',
  },
  {
    id: 'BKT-2611-002',
    residentId: 'WRG-002',
    residentName: 'Hendra Wijaya',
    blok: 'A1/02',
    hp: '081234567892',
    kategori: 'Iuran Bulanan',
    bulan: ['November 2026', 'Desember 2026'],
    nominal: 200000,
    buktiUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80',
    catatanWarga: 'Langsung 2 bulan ya pak rt',
    status: 'Menunggu Verifikasi',
    createdAt: new Date('2026-11-05T14:20:00Z').toISOString(),
  },
];

const INITIAL_INCOMES: IncomeTransaction[] = [
  {
    id: 'INC-2611-001',
    tanggal: '2026-11-04',
    sumber: 'Budi Santoso (A1/01)',
    residentId: 'WRG-001',
    kategori: 'Iuran Bulanan',
    bulan: ['November 2026'],
    nominal: 100000,
    buktiId: 'BKT-2611-001',
    status: 'Sah',
    catatan: 'Verifikasi transfer m-BCA',
    createdAt: new Date('2026-11-04T09:30:00Z').toISOString(),
  },
];

function normalizePeriod(p: string): string {
  if (!p) return '2026-11';
  const trimmed = p.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);
  const monthMap: Record<string, string> = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', agu: '08', aug: '08',
    sep: '09', okt: '10', oct: '10', nov: '11', des: '12', dec: '12'
  };
  const parts = trimmed.split(/[\s-]+/);
  if (parts.length >= 2) {
    let m = '';
    let y = '';
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (monthMap[lower]) m = monthMap[lower];
      else if (/^\d{4}$/.test(part)) y = part;
    }
    if (m && y) return `${y}-${m}`;
  }
  return trimmed;
}

export function ensureVerifiedProofsInIncomes(db: DatabaseSchema): boolean {
  if (!db.proofs || !db.incomes) return false;
  const existingBuktiIds = new Set(db.incomes.map((i) => i.buktiId).filter(Boolean));
  const deletedSet = new Set(db.deletedIncomeIds || []);
  let modified = false;

  for (const proof of db.proofs) {
    if (
      isDansosProofCategory(proof.kategori) ||
      (proof.transactionId || '').trim().startsWith('DANSOS-')
    ) {
      continue;
    }
    if (proof.status === 'Terverifikasi' && !existingBuktiIds.has(proof.id) && !deletedSet.has(proof.id)) {
      const rawMonths = Array.isArray(proof.bulan) && proof.bulan.length > 0 ? proof.bulan : ['2026-11'];
      const monthsList: string[] = [];
      rawMonths.forEach((b) => {
        b.split(/[,;\n]+/).forEach((p) => {
          const norm = normalizePeriod(p);
          if (norm && !monthsList.includes(norm)) monthsList.push(norm);
        });
      });
      if (monthsList.length === 0) monthsList.push('2026-11');
      monthsList.sort();

      const kat = (proof.kategori || 'Iuran Bulanan').trim();
      const isRegularIuran = isIuranBulananCategory(kat);

      // Kategori selain Iuran Bulanan TIDAK boleh dipecah ke beberapa bulan; catat 1 transaksi utuh pada periode saat itu
      if (!isRegularIuran) {
        monthsList.splice(1);
      }

      const numMonths = monthsList.length;
      const basePerMonth = Math.floor(proof.nominal / numMonths);
      const remainder = proof.nominal - basePerMonth * numMonths;
      const createdTxIds: string[] = [];
      const txDate = proof.verifiedAt
        ? proof.verifiedAt.slice(0, 10)
        : (proof.createdAt ? proof.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));

      monthsList.forEach((mCode, idx) => {
        const txId = `INC-${proof.id.replace(/[^a-zA-Z0-9]/g, '')}-${idx + 1}`;
        createdTxIds.push(txId);
        const nominalThisMonth = idx === numMonths - 1 ? basePerMonth + remainder : basePerMonth;

        db.incomes.unshift({
          id: txId,
          tanggal: txDate,
          sumber: `${proof.residentName} (${proof.blok})`,
          residentId: proof.residentId,
          kategori: kat,
          bulan: [mCode],
          nominal: nominalThisMonth,
          buktiId: proof.id,
          status: 'Sah',
          catatan: !isRegularIuran
            ? `${kat} Periode ${mCode} - Bukti ${proof.id}`
            : numMonths > 1
            ? `Iuran Periode ${mCode} (${idx + 1}/${numMonths}) - Bukti ${proof.id}`
            : `Iuran Periode ${mCode} - Bukti ${proof.id}`,
          createdAt: proof.verifiedAt || proof.createdAt || new Date().toISOString(),
        });
        existingBuktiIds.add(proof.id);
      });

      proof.transactionId = createdTxIds.join(', ');
      modified = true;
    }
  }

  return modified;
}

function ensureDb(): DatabaseSchema {
  if (memoryDbCache) {
    return memoryDbCache;
  }

  // Coba baca dari /tmp terlebih dahulu jika ada perubahan runtime di cloud
  if (fs.existsSync(TMP_DB_FILE)) {
    try {
      const raw = fs.readFileSync(TMP_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseSchema;
      memoryDbCache = parsed;
      return parsed;
    } catch {}
  }

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {}
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = {
      settings: DEFAULT_SETTINGS,
      residents: INITIAL_RESIDENTS,
      proofs: INITIAL_PROOFS,
      incomes: INITIAL_INCOMES,
      expenses: INITIAL_EXPENSES,
      logs: [
        {
          id: 'LOG-001',
          timestamp: new Date().toISOString(),
          aksi: 'Inisialisasi Sistem',
          rincian: 'Database sistem kas warga berhasil disiapkan',
          actor: 'Sistem',
        },
      ],
    };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    } catch {
      try {
        fs.writeFileSync(TMP_DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      } catch {}
    }
    memoryDbCache = initialData;
    return initialData;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed.saldoAwalHistory) parsed.saldoAwalHistory = [];
    if (!parsed.tunggakanLama) parsed.tunggakanLama = [];
    if (!parsed.kasbon) parsed.kasbon = [];
    const modified = ensureVerifiedProofsInIncomes(parsed);
    memoryDbCache = parsed;
    if (modified) {
      saveDb(parsed);
    }
    return parsed;
  } catch {
    const fallback: DatabaseSchema = {
      settings: DEFAULT_SETTINGS,
      residents: INITIAL_RESIDENTS,
      proofs: [],
      incomes: [],
      expenses: [],
      logs: [],
      saldoAwalHistory: [],
      tunggakanLama: [],
      kasbon: [],
    };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
    } catch {
      try {
        fs.writeFileSync(TMP_DB_FILE, JSON.stringify(fallback, null, 2), 'utf-8');
      } catch {}
    }
    memoryDbCache = fallback;
    return fallback;
  }
}

export function getDb(): DatabaseSchema {
  return ensureDb();
}

export function saveDb(data: DatabaseSchema): void {
  memoryDbCache = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempPath = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_FILE);
  } catch (err: any) {
    // Fallback serverless (Vercel / read-only filesystem)
    try {
      fs.writeFileSync(TMP_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }
}

export function addLog(aksi: string, rincian: string, actor = 'Admin'): void {
  const db = getDb();
  const log: ActivityLog = {
    id: `LOG-${Date.now()}`,
    timestamp: new Date().toISOString(),
    aksi,
    rincian,
    actor,
  };
  db.logs.unshift(log);
  if (db.logs.length > 200) db.logs = db.logs.slice(0, 200);
  saveDb(db);
}
