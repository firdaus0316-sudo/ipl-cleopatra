export interface Resident {
  id: string;
  nama: string;
  blok: string;
  hp: string;
  tarif: number;
  status: 'Aktif' | 'Nonaktif' | 'Pindah';
  catatan?: string;
}

export type ProofStatus = 'Menunggu Verifikasi' | 'Terverifikasi' | 'Ditolak';

export interface ProofSubmission {
  id: string;
  residentId: string;
  residentName: string;
  blok: string;
  hp: string;
  kategori: string;
  bulan: string[]; // e.g. ["November 2026", "Desember 2026"]
  nominal: number;
  buktiUrl: string; // Base64 data URL or local path
  driveUrl?: string; // Tautan file Google Drive di folder 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB
  catatanWarga?: string;
  status: ProofStatus;
  adminNote?: string;
  createdAt: string; // ISO string
  verifiedAt?: string;
  verifiedBy?: string;
  transactionId?: string; // Links to Kas Pemasukan if approved
}

export interface IncomeTransaction {
  id: string;
  tanggal: string; // YYYY-MM-DD
  sumber: string; // e.g. "Budi Santoso (A1/02)"
  residentId?: string;
  kategori: string; // "Iuran Bulanan", "Donasi Warga", "Sewa Lapangan", dll
  bulan?: string[];
  nominal: number;
  buktiId?: string;
  status: 'Sah' | 'Dibatalkan';
  catatan?: string;
  createdAt: string;
}

export interface ExpenseTransaction {
  id: string;
  tanggal: string; // YYYY-MM-DD
  kategori: string; // "Keamanan / Satpam", "Kebersihan / Sampah", "Listrik Pos & PJU", "Perbaikan Fasilitas", "Kasbon / Pinjaman", "Operasional RT", "Lain-lain"
  nominal: number;
  penerima: string; // Pihak ketiga / Toko / Petugas
  keterangan: string;
  buktiUrl?: string; // Foto nota / struk belanja
  driveUrl?: string; // Tautan file Google Drive di folder 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB
  status: 'Sah' | 'Dibatalkan';
  createdAt: string;
}

export interface AppSettings {
  namaRt: string; // e.g. "RT 011 / RW 028"
  namaKomplek: string; // e.g. "Cluster Cleopatra"
  alamat: string;
  namaBank: string; // e.g. "BCA"
  nomorRekening: string; // e.g. "1234567890"
  atasNama: string; // e.g. "KAS RT 011 CLEOPATRA"
  qrisUrl?: string; // QRIS image or link
  nomorWaAdmin: string; // Bendahara WhatsApp
  pesanPengumuman: string;
  adminPin: string; // Default admin password
  saldoAwal: number;
  periodeAktif?: string; // e.g. "2026-11" atau "November 2026"
  linkFolderUtamaDrive?: string; // Link Folder Google Drive Utama
  linkPenyimpananBuktiDrive?: string; // Link Folder Google Drive Penyimpanan Bukti (sheet buktistruk)
  googleDriveWebhookUrl?: string; // URL Web App Google Apps Script untuk auto-upload ke folder 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB
}

export interface SaldoAwalEntry {
  id: string;
  tanggal: string; // ISO / YYYY-MM-DD
  periode: string; // e.g. "2026-11"
  keterangan: string; // e.g. "Mutasi Kepengurusan RT Baru"
  jumlah: number;
  transaksiId?: string;
  createdAt: string;
}

export interface PembayaranRecord {
  id: string;
  tanggal: string;
  nominal: number;
  metode: 'Cash' | 'Transfer' | 'Potong Gaji';
  catatan?: string;
  incomeId?: string; // Tautan ke ID transaksi di Kas Masuk
  createdAt: string;
}

export interface TunggakanLamaEntry {
  id: string;
  tanggal: string;
  namaWarga: string;
  blok?: string;
  jumlah: number; // Sisa tunggakan saat ini
  nominalAwal: number; // Nominal tunggakan awal
  terbayar?: number; // Total yang sudah dibayar (cicilan/cash)
  keterangan: string; // e.g. "Oktober 2023 - Oktober 2026"
  status: 'Belum Lunas' | 'Dicicil' | 'Lunas';
  tipeWarga?: 'Warga' | 'Non-Warga' | 'Pindah';
  catatanPindah?: string;
  tunggakanId?: string;
  wargaId?: string;
  riwayatPembayaran?: PembayaranRecord[];
}

export interface KasbonEntry {
  id: string;
  timestamp: string;
  namaPeminjam: string;
  nominal: number; // Sisa kasbon saat ini
  nominalAwal: number; // Nominal pinjaman awal
  terbayar?: number; // Total yang sudah dikembalikan (cicilan/cash)
  keterangan: string;
  status: 'Belum Lunas' | 'Dicicil' | 'Lunas';
  tglBackdate?: string;
  kasbonId?: string;
  wargaId?: string;
  riwayatPembayaran?: PembayaranRecord[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  aksi: string;
  rincian: string;
  actor: string;
}

export interface DatabaseSchema {
  settings: AppSettings;
  residents: Resident[];
  proofs: ProofSubmission[];
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  logs: ActivityLog[];
  saldoAwalHistory?: SaldoAwalEntry[];
  tunggakanLama?: TunggakanLamaEntry[];
  kasbon?: KasbonEntry[];
}
