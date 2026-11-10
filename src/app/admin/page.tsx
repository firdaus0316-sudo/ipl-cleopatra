'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  CheckSquare,
  ArrowDownCircle,
  ArrowUpCircle,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  Settings,
  LogOut,
  Shield,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  AlertTriangle,
  Upload,
  RefreshCw,
  Printer,
  Download,
  DollarSign,
  MessageCircle,
  ChevronDown,
  Wallet,
  Coins,
  History,
  ArrowRight,
  BookOpen,
  Target,
  TrendingUp,
  BarChart3,
  CreditCard,
  X,
  AlertCircle,
  Building2,
  Filter,
  Lock,
  Menu,
} from 'lucide-react';
import { formatRupiah, formatDateIndo, formatDateTimeIndo, createWaLink, formatPeriodCode, isIncomeInPeriod } from '@/lib/format';
import {
  ProofSubmission,
  IncomeTransaction,
  ExpenseTransaction,
  Resident,
  AppSettings,
  SaldoAwalEntry,
  TunggakanLamaEntry,
  KasbonEntry,
} from '@/types';
import * as XLSX from 'xlsx';

const KATEGORI_INCOME_OPTIONS = [
  'Iuran Bulanan',
  'THR (Tunjangan Hari Raya)',
  'Donasi / Dana Hibah',
  'Ramadhan',
  'Agustusan',
  'Selokan',
  'Lainnya',
];

const BULAN_OPTIONS = [
  'Januari 2026',
  'Februari 2026',
  'Maret 2026',
  'April 2026',
  'Mei 2026',
  'Juni 2026',
  'Juli 2026',
  'Agustus 2026',
  'September 2026',
  'Oktober 2026',
  'November 2026',
  'Desember 2026',
];

const BULAN_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const getNextPeriodHelper = (code: string) => {
  if (!code || !/^\d{4}-\d{2}$/.test(code)) return '2026-12';
  const [yStr, mStr] = code.split('-');
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
};

const getPeriodNameIndoHelper = (code: string) => {
  if (!code) return '';
  if (/^\d{4}-\d{2}$/.test(code)) {
    const [y, m] = code.split('-');
    const monthNames: Record<string, string> = {
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
    return `${monthNames[m] || m} ${y}`;
  }
  return code;
};

export default function AdminPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPinText, setShowPinText] = useState(false);

  // Active Menu Tab
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'verifikasi' | 'pengeluaran' | 'pemasukan' | 'matriks' | 'warga' | 'tunggakan' | 'kasbon' | 'laporan' | 'pengaturan'
  >('dashboard');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Global Admin Data
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [proofs, setProofs] = useState<ProofSubmission[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tunggakanLama, setTunggakanLama] = useState<TunggakanLamaEntry[]>([]);
  const [kasbon, setKasbon] = useState<KasbonEntry[]>([]);
  const [saldoAwalHistory, setSaldoAwalHistory] = useState<SaldoAwalEntry[]>([]);

  // Pindah Bulan / Rollover Modal States
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [rolloverSourcePeriod, setRolloverSourcePeriod] = useState('2026-11');
  const [rolloverTargetMonth, setRolloverTargetMonth] = useState('2026-12');
  const [rolloverKeterangan, setRolloverKeterangan] = useState('Saldo Awal Bulan Desember 2026');
  const [rolloverCustomSaldo, setRolloverCustomSaldo] = useState('');
  const [isSubmittingRollover, setIsSubmittingRollover] = useState(false);

  // Filters & Search
  const [tunggakanSearch, setTunggakanSearch] = useState('');
  const [tunggakanCategoryFilter, setTunggakanCategoryFilter] = useState<'all' | 'warga' | 'pindah'>('all');
  const [kasbonSearch, setKasbonSearch] = useState('');
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState<'all' | 'iuran' | 'tunggakan' | 'kasbon'>('all');

  // Tunggakan Modal States
  const [selectedTunggakan, setSelectedTunggakan] = useState<TunggakanLamaEntry | null>(null);
  const [tunggakanBayarType, setTunggakanBayarType] = useState<'lunas' | 'cicil'>('cicil');
  const [tunggakanBayarNominal, setTunggakanBayarNominal] = useState('');
  const [tunggakanBayarMetode, setTunggakanBayarMetode] = useState<'Cash' | 'Transfer'>('Cash');
  const [tunggakanBayarTanggal, setTunggakanBayarTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [tunggakanBayarCatatan, setTunggakanBayarCatatan] = useState('');
  const [isSubmittingTunggakanBayar, setIsSubmittingTunggakanBayar] = useState(false);
  const [showTunggakanHistoryModal, setShowTunggakanHistoryModal] = useState<TunggakanLamaEntry | null>(null);

  // Modal Tambah Tunggakan Baru
  const [showAddTunggakanModal, setShowAddTunggakanModal] = useState(false);
  const [newTunggakanResidentType, setNewTunggakanResidentType] = useState<'warga' | 'pindah' | 'non_warga'>('warga');
  const [newTunggakanResidentId, setNewTunggakanResidentId] = useState('');
  const [newTunggakanNama, setNewTunggakanNama] = useState('');
  const [newTunggakanBlok, setNewTunggakanBlok] = useState('');
  const [newTunggakanCatatanPindah, setNewTunggakanCatatanPindah] = useState('');
  const [wargaTunggakanSearch, setWargaTunggakanSearch] = useState('');
  const [isWargaTunggakanDropdownOpen, setIsWargaTunggakanDropdownOpen] = useState(false);
  const [newTunggakanTarif, setNewTunggakanTarif] = useState(150000);
  const [newTunggakanYear, setNewTunggakanYear] = useState(2026);
  const [newTunggakanMonths, setNewTunggakanMonths] = useState<string[]>(['November 2026']);
  const [newTunggakanNominal, setNewTunggakanNominal] = useState('150000');
  const [newTunggakanKeterangan, setNewTunggakanKeterangan] = useState('November 2026');
  const [newTunggakanTanggal, setNewTunggakanTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingAddTunggakan, setIsSubmittingAddTunggakan] = useState(false);

  // Kasbon Modal States
  const [selectedKasbon, setSelectedKasbon] = useState<KasbonEntry | null>(null);
  const [kasbonBayarType, setKasbonBayarType] = useState<'lunas' | 'cicil'>('cicil');
  const [kasbonBayarNominal, setKasbonBayarNominal] = useState('');
  const [kasbonBayarMetode, setKasbonBayarMetode] = useState<'Cash' | 'Transfer' | 'Potong Gaji'>('Cash');
  const [kasbonBayarTanggal, setKasbonBayarTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [kasbonBayarCatatan, setKasbonBayarCatatan] = useState('');
  const [isSubmittingKasbonBayar, setIsSubmittingKasbonBayar] = useState(false);
  const [showKasbonHistoryModal, setShowKasbonHistoryModal] = useState<KasbonEntry | null>(null);

  // Modal Tambah Kasbon Baru
  const [showAddKasbonModal, setShowAddKasbonModal] = useState(false);
  const [newKasbonNama, setNewKasbonNama] = useState('');
  const [newKasbonNominal, setNewKasbonNominal] = useState('');
  const [newKasbonKeterangan, setNewKasbonKeterangan] = useState('Keluarga / Keperluan Mendesak');
  const [newKasbonTanggal, setNewKasbonTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingAddKasbon, setIsSubmittingAddKasbon] = useState(false);

  // Data Refresh State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [refreshToast, setRefreshToast] = useState('');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  // Matriks Penagihan States
  const [matrixYear, setMatrixYear] = useState(2026);
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixFilterStatus, setMatrixFilterStatus] = useState<'ALL' | 'LUNAS_INI' | 'BELUM_INI'>('ALL');
  const [matrixSelectedBlock, setMatrixSelectedBlock] = useState<string>('ALL');

  // Filters & Search
  const [proofFilter, setProofFilter] = useState('Semua');
  const [wargaSearch, setWargaSearch] = useState('');

  const toDirectImg = (url?: string): string => {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}`;
    return url;
  };

  // Modals
  const [selectedProof, setSelectedProof] = useState<ProofSubmission | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Modal Expense
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedExpenseReceipt, setSelectedExpenseReceipt] = useState<ExpenseTransaction | null>(null);
  const [newExpenseDate, setNewExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [newExpenseCategory, setNewExpenseCategory] = useState<'Fixed' | 'Variabel'>('Fixed');
  const [newExpenseNominal, setNewExpenseNominal] = useState('');
  const [newExpenseRecipient, setNewExpenseRecipient] = useState('');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseReceipt, setNewExpenseReceipt] = useState('');
  const [newExpenseReceiptFileName, setNewExpenseReceiptFileName] = useState('');
  const expenseFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const resetExpenseForm = () => {
    setNewExpenseDate(new Date().toISOString().slice(0, 10));
    setNewExpenseCategory('Fixed');
    setNewExpenseNominal('');
    setNewExpenseRecipient('');
    setNewExpenseDesc('');
    setNewExpenseReceipt('');
    setNewExpenseReceiptFileName('');
    if (expenseFileInputRef.current) {
      expenseFileInputRef.current.value = '';
    }
  };

  const handleClearExpenseReceipt = () => {
    setNewExpenseReceipt('');
    setNewExpenseReceiptFileName('');
    if (expenseFileInputRef.current) {
      expenseFileInputRef.current.value = '';
    }
  };

  // Modal Manual Income States
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [newIncomeDate, setNewIncomeDate] = useState(new Date().toISOString().slice(0, 10));
  const [newIncomeCategory, setNewIncomeCategory] = useState('Iuran Bulanan');
  const [newIncomeResidentId, setNewIncomeResidentId] = useState('');
  const [newIncomeNama, setNewIncomeNama] = useState('');
  const [newIncomeBlok, setNewIncomeBlok] = useState('');
  const [newIncomeHp, setNewIncomeHp] = useState('');
  const [newIncomeTarif, setNewIncomeTarif] = useState(150000);
  const [isManualNonWarga, setIsManualNonWarga] = useState(false);
  const [wargaIncomeSearch, setWargaIncomeSearch] = useState('');
  const [isWargaDropdownOpen, setIsWargaDropdownOpen] = useState(false);
  const [newIncomeMonths, setNewIncomeMonths] = useState<string[]>(['November 2026']);
  const [newIncomeNominal, setNewIncomeNominal] = useState('150000');
  const [newIncomeNote, setNewIncomeNote] = useState('');

  // Modal Warga
  const [showResidentModal, setShowResidentModal] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [resNama, setResNama] = useState('');
  const [resBlok, setResBlok] = useState('');
  const [resHp, setResHp] = useState('');
  const [resTarif, setResTarif] = useState('100000');
  const [resStatus, setResStatus] = useState<'Aktif' | 'Nonaktif' | 'Pindah'>('Aktif');

  // Target Realisasi & Arus Kas State
  const [showBelumBayarModal, setShowBelumBayarModal] = useState(false);
  const [searchBelumBayar, setSearchBelumBayar] = useState('');
  const [hoveredChartDay, setHoveredChartDay] = useState<any>(null);
  const [selectedTargetPeriod, setSelectedTargetPeriod] = useState<string>('2026-11');

  // Check existing session
  useEffect(() => {
    const savedAuth = localStorage.getItem('cleo_admin_auth');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch data on tab change or auth with fresh timestamp
  const refreshAll = async (showToast = false, overridePeriod?: string) => {
    if (!isAuthenticated) return;
    setIsRefreshing(true);
    try {
      const ts = Date.now();
      const periodParam = overridePeriod || selectedTargetPeriod || '2026-11';
      const opts = { cache: 'no-store' as RequestCache };

      const [dashRes, proofsRes, expRes, incRes, resRes, matrixRes, settRes, kasbonRes, tunggakanRes] = await Promise.all([
        fetch(`/api/admin/dashboard?targetPeriod=${periodParam}&year=${matrixYear}&_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/proofs?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/expenses?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/incomes?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/residents?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/billing-matrix?year=${matrixYear}&_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/settings?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/kasbon?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/tunggakan?_t=${ts}`, opts).then((r) => r.json()).catch(() => null),
      ]);

      if (dashRes?.success) {
        setDashboardData(dashRes);
        if (dashRes.saldoAwalHistory) setSaldoAwalHistory(dashRes.saldoAwalHistory);
      }
      if (kasbonRes?.success && Array.isArray(kasbonRes.data)) {
        setKasbon(kasbonRes.data);
      } else if (dashRes?.kasbon) {
        setKasbon(dashRes.kasbon);
      }
      if (tunggakanRes?.success && Array.isArray(tunggakanRes.data)) {
        setTunggakanLama(tunggakanRes.data);
      } else if (dashRes?.tunggakanLama) {
        setTunggakanLama(dashRes.tunggakanLama);
      }
      if (proofsRes?.success) setProofs(proofsRes.data);
      if (expRes?.success) {
        let list: ExpenseTransaction[] = expRes.data || [];
        try {
          const rawDel = localStorage.getItem('cleopatra_deleted_expenses');
          if (rawDel) {
            const delSet = new Set(JSON.parse(rawDel));
            list = list.filter((e) => !delSet.has(e.id));
          }
        } catch {}
        setExpenses(list);
      }
      if (incRes?.success) {
        let list: IncomeTransaction[] = incRes.data || [];
        try {
          const rawDel = localStorage.getItem('cleopatra_deleted_incomes');
          if (rawDel) {
            const delSet = new Set(JSON.parse(rawDel));
            list = list.filter((i) => !delSet.has(i.id));
          }
        } catch {}
        setIncomes(list);
      }
      if (resRes?.success) setResidents(resRes.data);
      if (matrixRes?.success) setMatrixData(matrixRes);
      if (settRes?.success) setSettings(settRes.settings);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastUpdated(timeStr);

      if (showToast) {
        setRefreshToast(`Data berhasil diperbarui pukul ${timeStr}`);
        setTimeout(() => setRefreshToast(''), 3000);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleChangeTargetPeriod = async (newPeriod: string) => {
    setSelectedTargetPeriod(newPeriod);
    try {
      const ts = Date.now();
      const res = await fetch(`/api/admin/dashboard?targetPeriod=${newPeriod}&year=${matrixYear}&_t=${ts}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data?.success) {
        setDashboardData(data);
      }
    } catch (err) {
      console.error('Error changing target period:', err);
    }
  };

  const handleYearChange = async (newYear: number) => {
    setMatrixYear(newYear);
    let newPeriod = selectedTargetPeriod;
    if (selectedTargetPeriod !== 'ALL') {
      const monthPart = selectedTargetPeriod.includes('-') ? selectedTargetPeriod.split('-')[1] : '11';
      newPeriod = `${newYear}-${monthPart}`;
      setSelectedTargetPeriod(newPeriod);
    }
    try {
      const ts = Date.now();
      const [dashRes, matrixRes] = await Promise.all([
        fetch(`/api/admin/dashboard?targetPeriod=${newPeriod}&year=${newYear}&_t=${ts}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch(`/api/admin/billing-matrix?year=${newYear}&_t=${ts}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      if (dashRes?.success) setDashboardData(dashRes);
      if (matrixRes?.success) setMatrixData(matrixRes);
    } catch (err) {
      console.error('Error changing year:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    }
  }, [isAuthenticated, activeTab]);

  // Sync with Google Sheets
  const handleSyncGoogleSheet = async () => {
    setIsSyncingSheet(true);
    try {
      const res = await fetch('/api/admin/sync-sheet', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Berhasil menyinkronkan data warga dari Google Sheet!');
        refreshAll(true);
      } else {
        alert(data.error || 'Gagal menyinkronkan data Google Sheet.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        localStorage.setItem('cleo_admin_auth', 'true');
      } else {
        setAuthError(data.error || 'Password admin salah.');
      }
    } catch {
      setAuthError('Gagal menghubungkan ke server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('cleo_admin_auth');
    window.location.href = '/admin';
  };

  // VERIFICATION ACTIONS
  const handleApproveProof = async (proof: ProofSubmission) => {
    if (!confirm(`Konfirmasi setujui bukti transfer ${proof.id} sebesar ${formatRupiah(proof.nominal)}? Kas masuk akan otomatis bertambah.`)) {
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch('/api/admin/proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proof.id, action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Bukti transfer telah disetujui dan kas masuk berhasil dicatat! Silakan kirim pesan WA konfirmasi verifikasi kepada warga.');
        setSelectedProof({ ...proof, status: 'Terverifikasi' });
        refreshAll();
      } else {
        alert(data.error || 'Gagal memverifikasi.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRejectProof = async (proof: ProofSubmission) => {
    const reason = prompt('Masukkan alasan penolakan bukti transfer:', rejectNote || 'Nominal tidak sesuai / bukti buram');
    if (reason === null) return;

    setIsVerifying(true);
    try {
      const res = await fetch('/api/admin/proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proof.id, action: 'reject', adminNote: reason }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Bukti transfer telah ditolak.');
        setSelectedProof(null);
        refreshAll();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancelProof = async (proof: ProofSubmission) => {
    if (!confirm(`Kembalikan status bukti transfer ${proof.id} ke antrean verifikasi? Transaksi kas terkait akan dibatalkan.`)) {
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch('/api/admin/proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proof.id, action: 'cancel' }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedProof(null);
        refreshAll();
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteProof = async (proof: ProofSubmission) => {
    if (
      !confirm(
        `Hapus bukti transaksi ${proof.id} dari ${proof.residentName} (${formatRupiah(
          proof.nominal
        )})?\n\nTransaksi kas terkait akan otomatis dibatalkan.`
      )
    ) {
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/admin/proofs?id=${encodeURIComponent(proof.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert('Bukti transfer berhasil dihapus dan transaksi telah dibatalkan.');
        if (selectedProof?.id === proof.id) {
          setSelectedProof(null);
        }
        refreshAll(true);
      } else {
        alert(data.error || 'Gagal menghapus bukti transfer.');
      }
    } catch {
      alert('Gagal menghubungi server.');
    } finally {
      setIsVerifying(false);
    }
  };

  // EXPENSE ACTIONS
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseNominal || Number(newExpenseNominal) <= 0) {
      alert('Nominal pengeluaran wajib diisi.');
      return;
    }
    const res = await fetch('/api/admin/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tanggal: newExpenseDate,
        kategori: newExpenseCategory,
        nominal: Number(newExpenseNominal),
        penerima: newExpenseRecipient,
        keterangan: newExpenseDesc,
        buktiUrl: newExpenseReceipt,
      }),
    });
    const d = await res.json();
    if (d.success) {
      setShowExpenseModal(false);
      resetExpenseForm();
      refreshAll();
    } else {
      alert(d.error || 'Gagal menyimpan pengeluaran.');
    }
  };

  const handleVoidExpense = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan (void) transaksi pengeluaran ini?')) return;
    const res = await fetch('/api/admin/expenses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'void' }),
    });
    const d = await res.json();
    if (d.success) refreshAll();
  };

  const handleDeleteExpense = async (id: string, nominal: number, ket: string) => {
    if (
      !confirm(
        `Hapus permanen pengeluaran ini (${formatRupiah(nominal)} - ${ket})?\n\nTransaksi akan dihapus dari sistem dan saldo kas RT akan disesuaikan kembali.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/expenses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (d.success) {
        try {
          const rawDel = localStorage.getItem('cleopatra_deleted_expenses');
          const arr: string[] = rawDel ? JSON.parse(rawDel) : [];
          if (!arr.includes(id)) {
            arr.push(id);
            localStorage.setItem('cleopatra_deleted_expenses', JSON.stringify(arr));
          }
        } catch {}
        alert('Transaksi pengeluaran berhasil dihapus.');
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal menghapus pengeluaran.');
      }
    } catch {
      alert('Gagal menghubungi server.');
    }
  };

  // MANUAL INCOME ACTIONS
  const handleOpenIncomeModal = () => {
    setNewIncomeDate(new Date().toISOString().slice(0, 10));
    setNewIncomeCategory('Iuran Bulanan');
    setNewIncomeResidentId('');
    setNewIncomeNama('');
    setNewIncomeBlok('');
    setNewIncomeHp('');
    setNewIncomeTarif(150000);
    setIsManualNonWarga(false);
    setWargaIncomeSearch('');
    setIsWargaDropdownOpen(false);
    setNewIncomeMonths(['November 2026']);
    setNewIncomeNominal('150000');
    setNewIncomeNote('');
    setShowIncomeModal(true);
  };

  const handleSelectIncomeResident = (r: Resident) => {
    setNewIncomeResidentId(r.id);
    setNewIncomeNama(r.nama);
    setNewIncomeBlok(r.blok);
    setNewIncomeHp(r.hp || '');
    const tarif = r.tarif || 150000;
    setNewIncomeTarif(tarif);
    setWargaIncomeSearch(r.nama);
    setIsWargaDropdownOpen(false);

    if (newIncomeCategory === 'Iuran Bulanan') {
      setNewIncomeNominal(String(tarif * Math.max(1, newIncomeMonths.length)));
    }
  };

  const handleToggleIncomeMonth = (m: string) => {
    let updated: string[];
    if (newIncomeMonths.includes(m)) {
      if (newIncomeMonths.length === 1) return;
      updated = newIncomeMonths.filter((x) => x !== m);
    } else {
      updated = [...newIncomeMonths, m];
    }
    setNewIncomeMonths(updated);
    if (newIncomeCategory === 'Iuran Bulanan') {
      setNewIncomeNominal(String(newIncomeTarif * updated.length));
    }
  };

  const handleQuickMonthSelect = (count: number) => {
    const startIndex = BULAN_OPTIONS.indexOf('November 2026') >= 0 ? BULAN_OPTIONS.indexOf('November 2026') : 0;
    let selected: string[] = [];
    if (count === 12) {
      selected = [...BULAN_OPTIONS];
    } else {
      selected = BULAN_OPTIONS.slice(startIndex, startIndex + count);
      if (selected.length < count) {
        selected = BULAN_OPTIONS.slice(0, count);
      }
    }
    setNewIncomeMonths(selected);
    if (newIncomeCategory === 'Iuran Bulanan') {
      setNewIncomeNominal(String(newIncomeTarif * selected.length));
    }
  };

  const handleCategoryChange = (cat: string) => {
    setNewIncomeCategory(cat);
    if (cat === 'Iuran Bulanan') {
      setNewIncomeNominal(String(newIncomeTarif * Math.max(1, newIncomeMonths.length)));
      setNewIncomeNote('');
    } else if (cat === 'THR (Tunjangan Hari Raya)') {
      setNewIncomeNominal('100000');
      setNewIncomeNote('Iuran THR Satpam & Petugas Kebersihan');
    } else if (cat === 'Ramadhan') {
      setNewIncomeNominal('50000');
      setNewIncomeNote('Iuran Kegiatan Ramadhan / Buka Bersama');
    } else if (cat === 'Agustusan') {
      setNewIncomeNominal('50000');
      setNewIncomeNote('Iuran Kegiatan 17 Agustusan');
    } else if (cat === 'Selokan') {
      setNewIncomeNominal('50000');
      setNewIncomeNote('Iuran Kerja Bakti / Pembersihan Selokan');
    } else if (cat === 'Donasi / Dana Hibah') {
      setNewIncomeNominal('200000');
      setNewIncomeNote('Donasi sukarela warga');
    } else {
      setNewIncomeNominal('50000');
      setNewIncomeNote('');
    }
  };

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSumber = isManualNonWarga
      ? newIncomeNama.trim()
      : newIncomeBlok
      ? `${newIncomeNama.trim()} (${newIncomeBlok.trim()})`
      : newIncomeNama.trim();

    if (!finalSumber) {
      alert('Nama pembayar / warga wajib dipilih atau diisi.');
      return;
    }
    if (!newIncomeNominal || Number(newIncomeNominal) <= 0) {
      alert('Nominal kas masuk wajib diisi.');
      return;
    }

    const res = await fetch('/api/admin/incomes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tanggal: newIncomeDate,
        sumber: finalSumber,
        residentId: !isManualNonWarga && newIncomeResidentId ? newIncomeResidentId : undefined,
        kategori: newIncomeCategory,
        bulan: newIncomeCategory === 'Iuran Bulanan' ? newIncomeMonths : undefined,
        nominal: Number(newIncomeNominal),
        catatan: newIncomeNote || `${newIncomeCategory} - ${finalSumber}`,
      }),
    });
    const d = await res.json();
    if (d.success) {
      alert('Transaksi kas masuk berhasil dicatat!');
      setShowIncomeModal(false);
      refreshAll(true);
    } else {
      alert(d.error || 'Gagal menyimpan pemasukan.');
    }
  };

  const handleVoidIncome = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan transaksi pemasukan ini?')) return;
    const res = await fetch('/api/admin/incomes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'void' }),
    });
    const d = await res.json();
    if (d.success) refreshAll();
  };

  const handleDeleteIncome = async (id: string, nominal: number, sumber: string) => {
    if (
      !confirm(
        `Hapus permanen transaksi pemasukan ini (${formatRupiah(nominal)} - ${sumber})?\n\nTransaksi akan dihapus dari sistem dan saldo kas RT akan disesuaikan kembali.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/incomes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (d.success) {
        try {
          const rawDel = localStorage.getItem('cleopatra_deleted_incomes');
          const arr: string[] = rawDel ? JSON.parse(rawDel) : [];
          if (!arr.includes(id)) {
            arr.push(id);
            localStorage.setItem('cleopatra_deleted_incomes', JSON.stringify(arr));
          }
        } catch {}
        alert('Transaksi pemasukan berhasil dihapus.');
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal menghapus pemasukan.');
      }
    } catch {
      alert('Gagal menghubungi server.');
    }
  };

  // TUNGGAKAN LAMA ACTIONS
  const handleOpenTunggakanBayarModal = (t: TunggakanLamaEntry) => {
    setSelectedTunggakan(t);
    setTunggakanBayarType('lunas');
    setTunggakanBayarNominal(String(t.jumlah));
    setTunggakanBayarMetode('Cash');
    setTunggakanBayarTanggal(new Date().toISOString().slice(0, 10));
    setTunggakanBayarCatatan('');
  };

  const handleSubmitTunggakanBayar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTunggakan) return;
    const nom = Number(tunggakanBayarNominal);
    if (isNaN(nom) || nom <= 0) {
      alert('Masukkan nominal pembayaran yang valid.');
      return;
    }
    if (nom > selectedTunggakan.jumlah) {
      alert(`Nominal pembayaran (Rp ${nom.toLocaleString('id-ID')}) melebihi sisa tunggakan (${formatRupiah(selectedTunggakan.jumlah)}).`);
      return;
    }
    setIsSubmittingTunggakanBayar(true);
    try {
      const res = await fetch('/api/admin/tunggakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bayar',
          id: selectedTunggakan.id,
          nominal: nom,
          metode: tunggakanBayarMetode,
          tanggal: tunggakanBayarTanggal,
          catatan: tunggakanBayarCatatan,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message);
        setSelectedTunggakan(null);
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal mencatat pembayaran tunggakan.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSubmittingTunggakanBayar(false);
    }
  };

  const handleUpdateTunggakanStatus = async (id: string, currentStatus: string, nama: string) => {
    const newStatus = currentStatus === 'Lunas' ? 'Belum Lunas' : 'Lunas';
    if (!confirm(`Ubah status tunggakan ${nama} menjadi "${newStatus}"?`)) return;
    try {
      const res = await fetch('/api/admin/tunggakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const d = await res.json();
      if (d.success) {
        alert(`Status tunggakan ${nama} berhasil diubah menjadi "${newStatus}".`);
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal mengubah status tunggakan.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  const formatTunggakanMonthRange = (months: string[]): string => {
    if (!months || months.length === 0) return '';
    if (months.length === 1) return months[0];
    const sorted = [...months].sort((a, b) => {
      const partsA = a.split(' ');
      const partsB = b.split(' ');
      const ya = parseInt(partsA[1] || '0', 10);
      const yb = parseInt(partsB[1] || '0', 10);
      if (ya !== yb) return ya - yb;
      return BULAN_NAMES.indexOf(partsA[0]) - BULAN_NAMES.indexOf(partsB[0]);
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const [firstM, firstY] = first.split(' ');
    const [lastM, lastY] = last.split(' ');

    if (firstY === lastY) {
      if (sorted.length === 12) {
        return `Januari - Desember ${firstY} (1 Tahun Penuh)`;
      }
      return `${firstM} - ${lastM} ${firstY}`;
    }
    return `${first} - ${last}`;
  };

  const isPindahOrNonWarga = (t: TunggakanLamaEntry) => {
    if (t.tipeWarga === 'Pindah' || t.tipeWarga === 'Non-Warga') return true;
    if (t.catatanPindah && t.catatanPindah.trim().length > 0) return true;
    if (t.wargaId) {
      const res = residents.find((r) => r.id === t.wargaId);
      if (res?.status === 'Pindah') return true;
    }
    const text = ((t.namaWarga || '') + ' ' + (t.keterangan || '')).toLowerCase();
    if (text.includes('pindah') || text.includes('bekas warga') || text.includes('eks warga')) return true;
    return false;
  };

  const handleSelectTunggakanResident = (r: Resident) => {
    setNewTunggakanResidentId(r.id);
    setNewTunggakanNama(r.nama);
    setNewTunggakanBlok(r.blok);
    const tarif = r.tarif || 150000;
    setNewTunggakanTarif(tarif);
    setWargaTunggakanSearch(r.nama);
    setIsWargaTunggakanDropdownOpen(false);
    if (r.status === 'Pindah') {
      setNewTunggakanResidentType('pindah');
      setNewTunggakanCatatanPindah(`Bekas warga ${r.blok} (Status: Pindah Rumah)`);
    } else {
      setNewTunggakanResidentType('warga');
      setNewTunggakanCatatanPindah('');
    }
    setNewTunggakanNominal(String(tarif * Math.max(1, newTunggakanMonths.length)));
  };

  const handleToggleTunggakanMonth = (m: string) => {
    let updated: string[];
    if (newTunggakanMonths.includes(m)) {
      if (newTunggakanMonths.length === 1) return;
      updated = newTunggakanMonths.filter((x) => x !== m);
    } else {
      updated = [...newTunggakanMonths, m];
    }
    setNewTunggakanMonths(updated);
    setNewTunggakanNominal(String(newTunggakanTarif * updated.length));
    setNewTunggakanKeterangan(formatTunggakanMonthRange(updated));
  };

  const handleQuickTunggakanMonthSelect = (count: number) => {
    let selected: string[] = [];
    if (count === 12) {
      selected = BULAN_NAMES.map((name) => `${name} ${newTunggakanYear}`);
    } else {
      const sliceNames = BULAN_NAMES.slice(0, count);
      selected = sliceNames.map((name) => `${name} ${newTunggakanYear}`);
    }
    setNewTunggakanMonths(selected);
    setNewTunggakanNominal(String(newTunggakanTarif * selected.length));
    setNewTunggakanKeterangan(formatTunggakanMonthRange(selected));
  };

  const handleChangeTunggakanYear = (year: number) => {
    setNewTunggakanYear(year);
    const updated = newTunggakanMonths.map((m) => {
      const [name] = m.split(' ');
      return `${name} ${year}`;
    });
    setNewTunggakanMonths(updated);
    setNewTunggakanKeterangan(formatTunggakanMonthRange(updated));
  };

  const resetAddTunggakanForm = () => {
    setNewTunggakanResidentType('warga');
    setNewTunggakanResidentId('');
    setNewTunggakanNama('');
    setNewTunggakanBlok('');
    setNewTunggakanCatatanPindah('');
    setWargaTunggakanSearch('');
    setIsWargaTunggakanDropdownOpen(false);
    setNewTunggakanTarif(150000);
    setNewTunggakanYear(2026);
    const defMonths = ['November 2026'];
    setNewTunggakanMonths(defMonths);
    setNewTunggakanNominal('150000');
    setNewTunggakanKeterangan('November 2026');
    setNewTunggakanTanggal(new Date().toISOString().slice(0, 10));
  };

  const handleSubmitAddTunggakan = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = Number(newTunggakanNominal);
    const nama = newTunggakanNama.trim();
    if (!nama || isNaN(nom) || nom <= 0) {
      alert('Masukkan nama warga dan nominal tunggakan yang valid.');
      return;
    }
    setIsSubmittingAddTunggakan(true);
    try {
      const tipe =
        newTunggakanResidentType === 'pindah'
          ? 'Pindah'
          : newTunggakanResidentType === 'non_warga'
          ? 'Non-Warga'
          : 'Warga';

      const res = await fetch('/api/admin/tunggakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tambah',
          namaWarga: nama,
          blok: newTunggakanBlok,
          wargaId: newTunggakanResidentId,
          nominal: nom,
          keterangan: newTunggakanKeterangan || 'Tunggakan Iuran',
          tanggal: newTunggakanTanggal,
          tipeWarga: tipe,
          catatanPindah: newTunggakanCatatanPindah,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message || 'Catatan tunggakan berhasil disimpan!');
        setShowAddTunggakanModal(false);
        resetAddTunggakanForm();
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal menambahkan tunggakan.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSubmittingAddTunggakan(false);
    }
  };

  // KASBON ACTIONS
  const handleOpenKasbonBayarModal = (k: KasbonEntry) => {
    setSelectedKasbon(k);
    setKasbonBayarType('lunas');
    setKasbonBayarNominal(String(k.nominal));
    setKasbonBayarMetode('Cash');
    setKasbonBayarTanggal(new Date().toISOString().slice(0, 10));
    setKasbonBayarCatatan('');
  };

  const handleSubmitKasbonBayar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKasbon) return;
    const nom = Number(kasbonBayarNominal);
    if (isNaN(nom) || nom <= 0) {
      alert('Masukkan nominal pengembalian yang valid.');
      return;
    }
    if (nom > selectedKasbon.nominal) {
      alert(`Nominal pengembalian (Rp ${nom.toLocaleString('id-ID')}) melebihi sisa kasbon (${formatRupiah(selectedKasbon.nominal)}).`);
      return;
    }
    setIsSubmittingKasbonBayar(true);
    try {
      const res = await fetch('/api/admin/kasbon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bayar',
          id: selectedKasbon.id,
          nominal: nom,
          metode: kasbonBayarMetode,
          tanggal: kasbonBayarTanggal,
          catatan: kasbonBayarCatatan,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message);
        setSelectedKasbon(null);
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal mencatat pengembalian kasbon.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSubmittingKasbonBayar(false);
    }
  };

  const handleSubmitAddKasbon = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = Number(newKasbonNominal);
    if (!newKasbonNama || isNaN(nom) || nom <= 0) {
      alert('Masukkan nama peminjam dan nominal pinjaman yang valid.');
      return;
    }
    setIsSubmittingAddKasbon(true);
    try {
      const res = await fetch('/api/admin/kasbon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tambah',
          namaPeminjam: newKasbonNama,
          nominal: nom,
          keterangan: newKasbonKeterangan,
          tanggal: newKasbonTanggal,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message);
        setShowAddKasbonModal(false);
        setNewKasbonNama('');
        setNewKasbonNominal('');
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal menambahkan kasbon.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSubmittingAddKasbon(false);
    }
  };

  const handleUpdateKasbonStatus = async (id: string, currentStatus: string, nama: string) => {
    const newStatus = currentStatus === 'Lunas' ? 'Belum Lunas' : 'Lunas';
    if (!confirm(`Ubah status kasbon ${nama} menjadi "${newStatus}"?`)) return;
    try {
      const res = await fetch('/api/admin/kasbon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const d = await res.json();
      if (d.success) {
        alert(`Status kasbon ${nama} berhasil diubah menjadi "${newStatus}".`);
        refreshAll(true);
      } else {
        alert(d.error || 'Gagal mengubah status kasbon.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  // ROLLOVER MONTH (TUTUP BUKU BULANAN BERDASARKAN PERIODE PILIHAN)
  const handleOpenRolloverModal = () => {
    const initialSource =
      selectedTargetPeriod && selectedTargetPeriod !== 'ALL'
        ? selectedTargetPeriod
        : settings?.periodeAktif || '2026-11';
    const nextP = getNextPeriodHelper(initialSource);

    setRolloverSourcePeriod(initialSource);
    setRolloverTargetMonth(nextP);
    setRolloverKeterangan(
      `Saldo Awal Bulan ${getPeriodNameIndoHelper(nextP)} (Pindahan Kas ${getPeriodNameIndoHelper(initialSource)})`
    );
    setRolloverCustomSaldo('');
    setShowRolloverModal(true);
  };

  const handleSourcePeriodChange = (newSource: string) => {
    setRolloverSourcePeriod(newSource);
    const nextP = getNextPeriodHelper(newSource);
    setRolloverTargetMonth(nextP);
    setRolloverKeterangan(
      `Saldo Awal Bulan ${getPeriodNameIndoHelper(nextP)} (Pindahan Kas ${getPeriodNameIndoHelper(newSource)})`
    );
  };

  const handleRolloverMonth = async (e: React.FormEvent, calculatedSaldoAkhir: number, sourceSaldoAwal: number) => {
    e.preventDefault();
    const finalSaldoAwal = rolloverCustomSaldo ? Number(rolloverCustomSaldo) : calculatedSaldoAkhir;
    if (
      !confirm(
        `Lakukan Tutup Buku periode "${getPeriodNameIndoHelper(rolloverSourcePeriod)}" dan Pindah Bulan ke periode "${getPeriodNameIndoHelper(
          rolloverTargetMonth
        )}"?\n\nSaldo akhir periode terpilih (${formatRupiah(
          finalSaldoAwal
        )}) otomatis dimutasikan menjadi Saldo Awal periode baru.`
      )
    ) {
      return;
    }
    setIsSubmittingRollover(true);
    try {
      const res = await fetch('/api/admin/rollover-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPeriode: rolloverTargetMonth,
          keterangan: rolloverKeterangan,
          tutupPeriodeLama: rolloverSourcePeriod,
          saldoAwalLama: sourceSaldoAwal,
          saldoAwalBaru: finalSaldoAwal,
        }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message || 'Tutup buku dan pindah bulan berhasil diproses!');
        setShowRolloverModal(false);
        setSelectedTargetPeriod(rolloverTargetMonth);
        refreshAll(true, rolloverTargetMonth);
      } else {
        alert(d.error || 'Gagal memproses tutup buku.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setIsSubmittingRollover(false);
    }
  };

  // RESIDENT ACTIONS
  const handleSaveResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingResident) {
      const res = await fetch('/api/admin/residents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingResident.id,
          nama: resNama,
          blok: resBlok,
          hp: resHp,
          tarif: Number(resTarif),
          status: resStatus,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowResidentModal(false);
        setEditingResident(null);
        refreshAll();
      }
    } else {
      const res = await fetch('/api/admin/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: resNama,
          blok: resBlok,
          hp: resHp,
          tarif: Number(resTarif),
          status: resStatus,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowResidentModal(false);
        refreshAll();
      }
    }
  };

  const handleDeleteResident = async (id: string, nama: string) => {
    if (!confirm(`Hapus data warga ${nama}?`)) return;
    const res = await fetch(`/api/admin/residents?id=${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (d.success) refreshAll();
  };

  const handleDeleteTunggakan = async (item: TunggakanLamaEntry) => {
    const nama = item.namaWarga || (item as any).nama || 'Warga';
    const id = item.id || (item as any).tunggakanId || '';
    if (!confirm(`Hapus catatan tunggakan lama untuk ${nama} (${formatRupiah(item.jumlah)})?`)) return;
    try {
      const res = await fetch(`/api/admin/tunggakan?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        alert(d.message || 'Data tunggakan berhasil dihapus.');
        refreshAll();
      } else {
        alert(d.error || 'Gagal menghapus data tunggakan.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  const handleDeleteKasbon = async (item: KasbonEntry) => {
    const nama = item.namaPeminjam || (item as any).nama || 'Petugas';
    const id = item.id || (item as any).kasbonId || '';
    if (!confirm(`Hapus catatan kasbon untuk ${nama} (${formatRupiah(item.nominal)})?`)) return;
    try {
      const res = await fetch(`/api/admin/kasbon?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        alert(d.message || 'Data kasbon berhasil dihapus.');
        refreshAll();
      } else {
        alert(d.error || 'Gagal menghapus data kasbon.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const d = await res.json();
    if (d.success) {
      alert('Pengaturan RT berhasil diperbarui!');
      refreshAll();
    }
  };

  // Helper normalisasi format periode (contoh: "2026-11", "November 2026", "2026-11-05")
  const normalizePeriodCodeHelper = (input: string): string => {
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
    return '';
  };

  // Hitung Arus Kas Mutasi 12 Bulan (Januari s/d Desember) secara kumulatif
  const compute12MonthsCashflow = () => {
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    let currentRunningSaldo = settings?.saldoAwal || 0;

    return monthNames.map((monthName, idx) => {
      const mNum = String(idx + 1).padStart(2, '0');
      const periodCode = `${matrixYear}-${mNum}`;

      const monthIncomes = incomes.filter((inc) => isIncomeInPeriod(inc, periodCode, matrixYear));
      const totalMasuk = monthIncomes.reduce((s, i) => s + i.nominal, 0);

      const monthExpenses = expenses.filter((exp) => {
        if (exp.status !== 'Sah') return false;
        return exp.tanggal && normalizePeriodCodeHelper(exp.tanggal) === periodCode;
      });
      const totalKeluar = monthExpenses.reduce((s, e) => s + e.nominal, 0);

      const saldoAwalBulan = currentRunningSaldo;
      const surplusDefisit = totalMasuk - totalKeluar;
      const saldoAkhirBulan = saldoAwalBulan + surplusDefisit;

      // Update saldo awal untuk bulan berikutnya
      currentRunningSaldo = saldoAkhirBulan;

      return {
        monthNumber: idx + 1,
        monthName: `${monthName} ${matrixYear}`,
        periodCode,
        saldoAwal: saldoAwalBulan,
        totalMasuk,
        totalKeluar,
        surplusDefisit,
        saldoAkhir: saldoAkhirBulan,
        incomesList: monthIncomes,
        expensesList: monthExpenses,
      };
    });
  };

  // Export Excel (.xlsx) Resmi & Berformat Lengkap (Logo, Kop, Tabel Bergaya, Formula & Tanda Tangan)
  const handleExportExcel = async () => {
    try {
      const isAll = selectedTargetPeriod === 'ALL';
      const periodLabel = isAll ? `Semua Bulan (${matrixYear})` : getPeriodNameIndoHelper(selectedTargetPeriod);
      const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');

      const res = await fetch(`/api/admin/export-excel?period=${encodeURIComponent(selectedTargetPeriod)}&year=${matrixYear}`);
      if (!res.ok) throw new Error('Gagal membuat dokumen Excel dari server.');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Keuangan_IPL_Cleopatra_${cleanPeriod}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Terjadi kendala saat download Excel: ' + err.message);
    }
  };

  // Export CSV dengan UTF-8 BOM (Rapi & Tanpa Kolom ID / Status yang tidak diperlukan)
  const handleExportCsv = () => {
    const isAll = selectedTargetPeriod === 'ALL';
    const periodLabel = isAll ? `Semua Bulan (${matrixYear})` : getPeriodNameIndoHelper(selectedTargetPeriod);

    const reportIncomes = incomes.filter((inc) => {
      if (inc.status !== 'Sah') return false;
      if (isAll) {
        const yearStr = String(matrixYear);
        if (inc.tanggal && inc.tanggal.startsWith(yearStr)) return true;
        const bList = Array.isArray(inc.bulan) ? inc.bulan : inc.bulan ? [inc.bulan] : [];
        return bList.some((b) => normalizePeriodCodeHelper(b).startsWith(yearStr));
      }
      const bList = Array.isArray(inc.bulan) ? inc.bulan : inc.bulan ? [inc.bulan] : [];
      if (bList.length > 0) {
        return bList.some((b) => normalizePeriodCodeHelper(b) === selectedTargetPeriod);
      }
      return inc.tanggal && normalizePeriodCodeHelper(inc.tanggal) === selectedTargetPeriod;
    });

    const reportExpenses = expenses.filter((exp) => {
      if (exp.status !== 'Sah') return false;
      if (isAll) {
        return exp.tanggal && exp.tanggal.startsWith(String(matrixYear));
      }
      return exp.tanggal && normalizePeriodCodeHelper(exp.tanggal) === selectedTargetPeriod;
    });

    const rows = [
      ['No', 'Tipe Transaksi', 'Tanggal', 'Kategori', 'Sumber / Penerima', 'Keterangan / Periode Tagihan', 'Nominal (Rp)'],
      ...reportIncomes.map((i, idx) => [
        idx + 1,
        'Penerimaan (Masuk)',
        i.tanggal || '-',
        `"${(i.kategori || 'Iuran Bulanan').replace(/"/g, '""')}"`,
        `"${(i.sumber || '').replace(/"/g, '""')}"`,
        `"${(Array.isArray(i.bulan) ? i.bulan.join(', ') : i.bulan || '').replace(/"/g, '""')}"`,
        i.nominal,
      ]),
      ...reportExpenses.map((e, idx) => [
        idx + 1,
        'Pengeluaran (Keluar)',
        e.tanggal || '-',
        `"${(e.kategori || 'Operasional').replace(/"/g, '""')}"`,
        `"${(e.penerima || '').replace(/"/g, '""')}"`,
        `"${(e.keterangan || '').replace(/"/g, '""')}"`,
        e.nominal,
      ]),
    ];

    const csvContent = '\uFEFF' + rows.map((e) => e.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Kas_Cleopatra_${cleanPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Pending count for badge
  const pendingCount = proofs.filter((p) => p.status === 'Menunggu Verifikasi').length;

  // LOGIN SCREEN (2 JENDELA: SAMPING KIRI TULISAN/BRANDING, SAMPING KANAN MASUK ADMIN)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row antialiased">
        {/* JENDELA KIRI: TULISAN, BRANDING & INFORMASI SISTEM KAS RT */}
        <div className="lg:w-7/12 xl:w-2/3 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header Brand */}
          <div className="relative z-10">
            <div className="flex items-center gap-3.5 mb-8">
              <img
                src="/logo-cleopatra.jpg"
                alt="Logo IPL Cleopatra"
                className="w-12 h-12 rounded-2xl object-cover shadow-md ring-2 ring-emerald-500/30"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-lg tracking-tight">IPL Cleopatra</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Sistem Kas RT
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  {settings?.namaRt || 'RT 011 / RW 028'} • {settings?.namaKomplek || 'Cluster Cleopatra'}
                </div>
              </div>
            </div>

            {/* Tulisan Utama / Headline */}
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-[11px] font-bold text-slate-300">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Portal Administrasi Keuangan & Pembukuan Kas Terpadu</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-snug">
                Pengelolaan Kas Riil & Iuran Warga yang{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">
                  Transparan, Rapi, dan Akuntabel
                </span>
                .
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Dirancang khusus untuk pengurus dan bendahara RT dalam memantau arus kas secara akurat, mencatat realisasi iuran bulanan, memverifikasi bukti transfer warga, serta mengelola piutang tunggakan lama dan kasbon petugas dengan integrasi langsung ke Google Sheets.
              </p>
            </div>

            {/* 3 Fitur Utama (Feature Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-8 max-w-3xl">
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-slate-700/80 transition backdrop-blur-xs space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-white">Kas Riil Terverifikasi</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Pencatatan kas riil mutlak terpisah dari pos piutang dan pinjaman untuk mencegah selisih dana.
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-slate-700/80 transition backdrop-blur-xs space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-white">Sinkronisasi Cloud</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Tersambung langsung dengan Google Sheets resmi dan arsip bukti transfer di Google Drive.
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-slate-700/80 transition backdrop-blur-xs space-y-1.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-white">Piutang & Kasbon</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Pelacakan rinci tunggakan warga (termasuk bekas warga pindah) dan pinjaman operasional petugas.
                </div>
              </div>
            </div>
          </div>

          {/* Footer Info Kiri */}
          <div className="relative z-10 pt-8 mt-8 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Sistem Aktif & Terlindungi • Enkripsi Sesi Admin</span>
            </div>
            <span>© 2026 Pengurus RT Cluster Cleopatra. All rights reserved.</span>
          </div>
        </div>

        {/* JENDELA KANAN: FORM MASUK ADMIN */}
        <div className="lg:w-5/12 xl:w-1/3 bg-slate-950 p-6 sm:p-10 lg:p-12 flex flex-col justify-center items-center relative">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center shadow-inner mb-4">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Masuk Admin
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Silakan masukkan PIN atau Password Administrator untuk mengelola buku kas RT.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {authError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Password / PIN Admin
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPinText ? 'text' : 'password'}
                    required
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Masukkan PIN / Password..."
                    autoFocus
                    className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-white placeholder:text-slate-500 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinText(!showPinText)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    title={showPinText ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showPinText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-xs transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memeriksa Akses...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Panel Pengurus</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-800/80 space-y-3 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition font-medium"
              >
                <span>&larr; Kembali ke Portal Transparansi Warga</span>
              </Link>

              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[11px] text-slate-400 text-left flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>
                  Akses dibatasi khusus untuk Ketua RT, Sekretaris, dan Bendahara RT yang berwenang.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ADMIN DASHBOARD SHELL
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col md:flex-row">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col md:min-h-screen border-r border-slate-800 flex-shrink-0">
        {/* Brand & Mobile Hamburger */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-cleopatra.jpg"
              alt="Logo IPL Cleopatra"
              className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-emerald-500/40 shrink-0"
            />
            <div>
              <div className="font-extrabold text-white text-base tracking-tight leading-tight">
                IPL Cleopatra
              </div>
              <div className="text-[11px] text-emerald-400 font-semibold tracking-wide mt-0.5">
                Administrasi Keuangan RT
              </div>
            </div>
          </div>
          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Toggle Navigation"
          >
            {isMobileNavOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Collapsible Container on Mobile */}
        <div className={`flex-col md:flex md:flex-1 ${isMobileNavOpen ? 'flex' : 'hidden'}`}>
        {/* Menu Items */}
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-emerald-400' : ''}`} />
            <span>Ringkasan Dashboard</span>
          </button>

          <button
            onClick={() => { setActiveTab('verifikasi'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'verifikasi'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckSquare className={`w-4 h-4 ${activeTab === 'verifikasi' ? 'text-emerald-400' : ''}`} />
              <span>Verifikasi Bukti</span>
            </div>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('pengeluaran'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'pengeluaran'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <ArrowUpCircle className={`w-4 h-4 ${activeTab === 'pengeluaran' ? 'text-rose-400' : 'text-slate-400'}`} />
            <span>Kas Keluar (Pengeluaran)</span>
          </button>

          <button
            onClick={() => { setActiveTab('pemasukan'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'pemasukan'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <ArrowDownCircle className={`w-4 h-4 ${activeTab === 'pemasukan' ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>Iuran & Kas Masuk</span>
          </button>

          <button
            onClick={() => { setActiveTab('matriks'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'matriks'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <CalendarCheck className={`w-4 h-4 ${activeTab === 'matriks' ? 'text-emerald-400' : ''}`} />
            <span>Buku Penagihan (Matriks)</span>
          </button>

          <button
            onClick={() => { setActiveTab('warga'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'warga'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <Users className={`w-4 h-4 ${activeTab === 'warga' ? 'text-emerald-400' : ''}`} />
            <span>Master Warga</span>
          </button>

          <button
            onClick={() => { setActiveTab('tunggakan'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'tunggakan'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Clock className={`w-4 h-4 ${activeTab === 'tunggakan' ? 'text-amber-400' : ''}`} />
              <span>Tunggakan Lama</span>
            </div>
            {tunggakanLama.filter((t) => t.status === 'Belum Lunas').length > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {tunggakanLama.filter((t) => t.status === 'Belum Lunas').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('kasbon'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'kasbon'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Wallet className={`w-4 h-4 ${activeTab === 'kasbon' ? 'text-cyan-400' : ''}`} />
              <span>Data Kasbon</span>
            </div>
            {kasbon.filter((k) => k.status === 'Belum Lunas').length > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {kasbon.filter((k) => k.status === 'Belum Lunas').length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('laporan'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'laporan'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 ${activeTab === 'laporan' ? 'text-emerald-400' : ''}`} />
            <span>Laporan & Export</span>
          </button>

          <button
            onClick={() => { setActiveTab('pengaturan'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
              activeTab === 'pengaturan'
                ? 'bg-slate-800 text-white border-l-2 border-emerald-500 shadow-xs font-bold'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <Settings className={`w-4 h-4 ${activeTab === 'pengaturan' ? 'text-emerald-400' : ''}`} />
            <span>Pengaturan RT</span>
          </button>
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link
            href="/"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka Portal Warga</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar (Logout)</span>
          </button>
        </div>
        </div>
      </aside>

      {/* MAIN ADMIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
        {/* GLOBAL HEADER: REAL-TIME DATA REFRESH BAR */}
        <div className="mb-6 bg-white rounded-2xl p-3 sm:p-3.5 shadow-xs border border-slate-200/90 flex flex-wrap items-center justify-between gap-3">
          {/* Sisi Kiri: Status Data Kas, Terakhir Diperbarui, dan Pilihan Tahun */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRefreshing ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isRefreshing ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              </span>
              <span>Sistem Kas Aktif</span>
              {lastUpdated && (
                <span className="text-[11px] text-slate-400 font-normal pl-1 border-l border-slate-200">
                  {lastUpdated}
                </span>
              )}
            </div>

            {/* Pilihan Tahun */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-300 transition shrink-0 shadow-2xs">
              <CalendarCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-400 font-normal">Tahun:</span>
              <select
                value={matrixYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-hidden cursor-pointer"
                title="Pilih Tahun Berjalan untuk Menyesuaikan Periode dan Matriks"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>

          {/* Sisi Kanan: Periode, Sinkronkan Sheets, Pindah Bulan, Drive Bukti, dan Perbarui Data */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Tombol Pilih Periode */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-300 transition shrink-0 shadow-2xs">
              <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-slate-400 font-normal hidden sm:inline">Periode:</span>
              <select
                value={selectedTargetPeriod}
                onChange={(e) => handleChangeTargetPeriod(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-xs focus:outline-hidden cursor-pointer max-w-[130px] sm:max-w-none truncate"
                title="Pilih Periode Bulan Pilihan atau Semua Bulan"
              >
                <option value="ALL">Semua Bulan ({matrixYear})</option>
                {(dashboardData?.targetRealisasiIuran?.availablePeriods || [])
                  .filter((p: any) => p.code !== 'ALL')
                  .map((p: any) => (
                    <option key={p.code} value={p.code}>
                      {p.label} {p.wargaSudahBayarCount !== undefined ? `(${p.wargaSudahBayarCount} Lunas)` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Tombol Sinkronisasi Google Sheets */}
            <button
              type="button"
              onClick={handleSyncGoogleSheet}
              disabled={isSyncingSheet}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-60 shrink-0 cursor-pointer"
              title="Tarik & Sinkronkan Seluruh Data Google Sheets: Master Warga, Saldo Awal, Data Iuran, Pengeluaran, Tunggakan Lama & Data Kasbon"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncingSheet ? 'animate-spin' : ''}`} />
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{isSyncingSheet ? 'Menyinkronkan...' : 'Sinkronkan Sheets'}</span>
              <span className="sm:hidden">{isSyncingSheet ? 'Sinkron...' : 'Sheets'}</span>
            </button>

            {/* Tombol Pindah Bulan */}
            <button
              type="button"
              onClick={handleOpenRolloverModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs shrink-0 cursor-pointer"
              title="Tutup Buku Bulan Berjalan & Bawa Saldo Akhir Menjadi Saldo Awal Bulan Berikutnya"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-300" />
              <span>Pindah Bulan</span>
            </button>

            {/* Folder Google Drive Penyimpanan Bukti */}
            <a
              href="https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition flex items-center gap-1.5 shrink-0 shadow-2xs"
              title="Buka Folder Google Drive Bukti Transfer & Struk"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <span>Drive Bukti</span>
            </a>

            {/* Tombol Perbarui Data */}
            <button
              type="button"
              onClick={() => refreshAll(true)}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-2xs disabled:opacity-60 shrink-0 cursor-pointer"
              title="Segarkan data kas & rekap terkini"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Memperbarui...' : 'Perbarui'}</span>
            </button>
          </div>
        </div>

        {/* REFRESH TOAST NOTIFICATION */}
        {refreshToast && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{refreshToast}</span>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && dashboardData && (
          <div className="space-y-6">
            {/* Sub-Header Bersih */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Ringkasan Keuangan RT</h1>
                <p className="text-xs text-slate-500">
                  Pantau saldo kas riil, target penerimaan iuran, dan arus kas keuangan secara real-time.
                </p>
              </div>
            </div>

            {/* Metric Tiles - Professional Corporate Financial Style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600">Saldo Kas RT Saat Ini</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatRupiah(dashboardData.stats.saldoKas)}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span>Saldo Awal:</span>
                  <span className="font-semibold text-slate-700">{formatRupiah(dashboardData.stats.saldoAwal)}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600">Total Kas Masuk</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 max-w-[130px] truncate" title={dashboardData.stats.periodePemasukanLabel}>
                      {dashboardData.stats.periodePemasukanLabel || (selectedTargetPeriod === 'ALL' ? `Semua Bulan (${matrixYear})` : 'Periode Terpilih')}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatRupiah(dashboardData.stats.totalPemasukan)}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span>Akumulasi Thn {matrixYear}:</span>
                  <span className="font-semibold text-slate-700">
                    {formatRupiah(dashboardData.stats.totalPemasukanTahun ?? dashboardData.stats.totalPemasukan)}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600">Total Kas Keluar</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60 max-w-[130px] truncate" title={dashboardData.stats.periodePemasukanLabel}>
                      {dashboardData.stats.periodePemasukanLabel || (selectedTargetPeriod === 'ALL' ? `Semua Bulan (${matrixYear})` : 'Periode Terpilih')}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight">
                    {formatRupiah(dashboardData.stats.totalPengeluaran)}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span>Akumulasi Thn {matrixYear}:</span>
                  <span className="font-semibold text-slate-700">
                    {formatRupiah(dashboardData.stats.totalPengeluaranTahun ?? dashboardData.stats.totalPengeluaran)}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600">Antrean Bukti Warga</span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900 tracking-tight flex items-center justify-between">
                    <span>{dashboardData.stats.pendingProofsCount}</span>
                    {dashboardData.stats.pendingProofsCount > 0 && (
                      <button
                        onClick={() => setActiveTab('verifikasi')}
                        className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold transition cursor-pointer"
                      >
                        Verifikasi &rarr;
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                  {dashboardData.stats.pendingProofsCount > 0 ? 'Menunggu verifikasi bendahara' : 'Semua bukti telah terverifikasi'}
                </div>
              </div>
            </div>

            {/* BUKU LEDGER: POS PIUTANG TUNGGAKAN & PINJAMAN KASBON (NON-KAS RIIL) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Buku Piutang & Pinjaman Berjalan (Non-Kas Riil)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Pos terpisah dari kas riil fisik RT. Dana pelunasan/cicilan otomatis masuk ke Kas Masuk saat diterima.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Kartu Piutang Tunggakan Warga */}
                <div className="bg-slate-50/70 hover:bg-slate-50 rounded-2xl p-5 border border-slate-200/80 transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-800 flex items-center justify-center font-bold">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Piutang Tunggakan Warga</span>
                          <span className="text-[10px] text-slate-400">Termasuk eks-warga pindah</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                        {dashboardData.stats.tunggakanLamaCount} Rumah Belum Lunas
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] text-slate-500 font-medium">Sisa Piutang Belum Tertagih:</div>
                      <div className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                        {formatRupiah(dashboardData.stats.totalTunggakanLama)}
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Total Awal: <strong className="text-slate-700">{formatRupiah(dashboardData.stats.totalTunggakanAwal || 0)}</strong>
                      </span>
                      <span className="text-emerald-700 font-bold">
                        Sudah Masuk Kas: {formatRupiah(dashboardData.stats.totalTunggakanTerbayar || 0)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('tunggakan')}
                    className="mt-4 w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition border border-slate-300 flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                  >
                    <span>Kelola & Catat Pembayaran Tunggakan (Cicil / Cash)</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>

                {/* Kartu Pinjaman Kasbon Petugas */}
                <div className="bg-slate-50/70 hover:bg-slate-50 rounded-2xl p-5 border border-slate-200/80 transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-200/80 text-slate-800 flex items-center justify-center font-bold">
                          <Wallet className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Pinjaman Kasbon Petugas</span>
                          <span className="text-[10px] text-slate-400">Pinjaman operasional pengurus/petugas</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                        {dashboardData.stats.kasbonAktifCount} Petugas Berjalan
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] text-slate-500 font-medium">Sisa Kasbon Belum Dikembalikan:</div>
                      <div className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                        {formatRupiah(dashboardData.stats.totalKasbonAktif)}
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        Kasbon Awal: <strong className="text-slate-700">{formatRupiah(dashboardData.stats.totalKasbonAwal || 0)}</strong>
                      </span>
                      <span className="text-emerald-700 font-bold">
                        Sudah Kembali ke Kas: {formatRupiah(dashboardData.stats.totalKasbonTerbayar || 0)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('kasbon')}
                    className="mt-4 w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition border border-slate-300 flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                  >
                    <span>Kelola & Catat Pengembalian Kasbon (Cicil / Cash)</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* PANEL 1: TARGET VS REALISASI IURAN BULANAN (MASTER WARGA VS DATA IURAN) */}
            {dashboardData.targetRealisasiIuran && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/90 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
                      <Target className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-slate-900 text-base">
                          Target & Realisasi Iuran Bulanan
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {dashboardData.targetRealisasiIuran.periodeLabel || dashboardData.targetRealisasiIuran.periode}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Target dari <strong>Master Warga</strong> (Sheet: Iuran Bulanan) vs Realisasi Pembayaran warga di <strong>Data Iuran</strong>.
                      </p>
                    </div>
                  </div>

                  {/* KONTROL PILIH PERIODE IURAN (NAVIGASI & DROPDOWN LENGKAP) */}
                  <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold pl-1">
                      <History className="w-4 h-4 text-emerald-600" />
                      <span>Pilih Periode:</span>
                    </div>

                    <select
                      value={selectedTargetPeriod}
                      onChange={(e) => handleChangeTargetPeriod(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      {(dashboardData.targetRealisasiIuran.availablePeriods || []).map((p: any) => (
                        <option key={p.code} value={p.code}>
                          {p.label} {p.code !== 'ALL' ? `(${p.wargaSudahBayarCount} Lunas / ${p.wargaBelumBayarCount} Belum)` : ''}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                      <button
                        type="button"
                        onClick={() => setShowBelumBayarModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition border border-rose-200 shadow-2xs"
                      >
                        <Users className="w-3.5 h-3.5 text-rose-600" />
                        <span>Lihat {dashboardData.targetRealisasiIuran.wargaBelumBayarCount} Warga Belum Bayar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('matriks')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        <span>Matriks</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4 Kartu Metrik Target vs Realisasi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Target Iuran */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1">
                      <span>Target Iuran ({dashboardData.targetRealisasiIuran.periodeLabel})</span>
                      <Target className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="text-xl font-extrabold text-slate-900">
                      {formatRupiah(dashboardData.targetRealisasiIuran.totalTargetNominal)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>Total Master Warga:</span>
                      <span className="font-bold text-slate-700">
                        {dashboardData.targetRealisasiIuran.totalTargetWarga} KK
                      </span>
                    </div>
                  </div>

                  {/* Realisasi Iuran Terkumpul */}
                  <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold mb-1">
                      <span>Realisasi Iuran Terkumpul</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white">
                        {dashboardData.targetRealisasiIuran.persenCapaianNominal}%
                      </span>
                    </div>
                    <div className="text-xl font-extrabold text-emerald-700">
                      {formatRupiah(dashboardData.targetRealisasiIuran.realisasiNominal)}
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-1 flex items-center justify-between">
                      <span>Warga Sudah Membayar:</span>
                      <span className="font-bold">
                        {dashboardData.targetRealisasiIuran.wargaSudahBayarCount} KK ({dashboardData.targetRealisasiIuran.persenCapaianWarga}%)
                      </span>
                    </div>
                  </div>

                  {/* Sisa Belum Tertagih */}
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                    <div className="flex items-center justify-between text-xs text-amber-800 font-semibold mb-1">
                      <span>Sisa Belum Tertagih</span>
                      <Coins className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <div className="text-xl font-extrabold text-amber-700">
                      {formatRupiah(dashboardData.targetRealisasiIuran.sisaNominalBelumTertagih)}
                    </div>
                    <div className="text-[11px] text-amber-700 mt-1 flex items-center justify-between">
                      <span>Kekurangan Penerimaan:</span>
                      <span className="font-bold">
                        {100 - dashboardData.targetRealisasiIuran.persenCapaianNominal}%
                      </span>
                    </div>
                  </div>

                  {/* Sisa Warga Belum Bayar */}
                  <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200">
                    <div className="flex items-center justify-between text-xs text-rose-800 font-semibold mb-1">
                      <span>Warga Belum Bayar</span>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    </div>
                    <div className="text-xl font-extrabold text-rose-700">
                      {dashboardData.targetRealisasiIuran.wargaBelumBayarCount} KK
                    </div>
                    <div className="text-[11px] text-rose-700 mt-1 flex items-center justify-between">
                      <span>Status Tagihan:</span>
                      <button
                        type="button"
                        onClick={() => setShowBelumBayarModal(true)}
                        className="font-bold underline hover:text-rose-900"
                      >
                        Buka List Warga &rarr;
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar Visualisasi Capaian */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div>
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        Capaian Nominal Iuran ({formatRupiah(dashboardData.targetRealisasiIuran.realisasiNominal)} dari {formatRupiah(dashboardData.targetRealisasiIuran.totalTargetNominal)})
                      </span>
                      <span className="text-emerald-700 font-extrabold">
                        {dashboardData.targetRealisasiIuran.persenCapaianNominal}% Tercapai
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, dashboardData.targetRealisasiIuran.persenCapaianNominal)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        Tingkat Partisipasi KK Warga ({dashboardData.targetRealisasiIuran.wargaSudahBayarCount} dari {dashboardData.targetRealisasiIuran.totalTargetWarga} KK)
                      </span>
                      <span className="text-blue-700 font-extrabold">
                        {dashboardData.targetRealisasiIuran.persenCapaianWarga}% Partisipasi
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, dashboardData.targetRealisasiIuran.persenCapaianWarga)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PANEL 2: GRAFIK ARUS KAS RT (CASH FLOW CHART) */}
            {dashboardData.cashFlowChart && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/90 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                        <span>Grafik Arus Kas RT (Cash Flow)</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          Harian & Saldo Berjalan
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Perbandingan Kas Masuk vs Kas Keluar serta tren akumulasi saldo kas riil RT.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                    <span className="text-slate-500">Surplus Kas Bersih:</span>
                    <span className="font-extrabold text-emerald-700">
                      +{formatRupiah(dashboardData.cashFlowChart.surplusDefisit)}
                    </span>
                  </div>
                </div>

                {/* Visual SVG Cash Flow Chart */}
                {(() => {
                  const daily = dashboardData.cashFlowChart.dailyData || [];
                  if (daily.length === 0) {
                    return (
                      <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Belum ada data arus kas untuk ditampilkan dalam grafik.
                      </div>
                    );
                  }

                  // Hitung skala maksimum nilai untuk chart
                  const maxDailyVal = Math.max(
                    ...daily.map((d: any) => Math.max(d.masuk || 0, d.keluar || 0)),
                    5000000
                  );
                  const maxSaldo = Math.max(
                    ...daily.map((d: any) => d.saldoKumulatif || 0),
                    dashboardData.cashFlowChart.saldoAwal || 0,
                    20000000
                  );

                  const svgWidth = 800;
                  const svgHeight = 240;
                  const paddingLeft = 50;
                  const paddingRight = 40;
                  const paddingTop = 25;
                  const paddingBottom = 40;
                  const chartWidth = svgWidth - paddingLeft - paddingRight;
                  const chartHeight = svgHeight - paddingTop - paddingBottom;

                  const count = daily.length;
                  const stepX = chartWidth / Math.max(1, count);
                  const barWidth = Math.min(32, stepX * 0.32);

                  // Titik-titik garis saldo kumulatif
                  const points = daily.map((d: any, idx: number) => {
                    const cx = paddingLeft + idx * stepX + stepX / 2;
                    const cy = paddingTop + chartHeight - ((d.saldoKumulatif || 0) / maxSaldo) * chartHeight;
                    return { x: cx, y: cy, data: d };
                  });

                  const polylinePoints = points.map((p: any) => `${p.x},${p.y}`).join(' ');

                  return (
                    <div className="space-y-3">
                      {/* Interactive Tooltip Card jika ada item yang dihover */}
                      {hoveredChartDay ? (
                        <div className="p-3 rounded-xl bg-slate-900 text-white text-xs flex flex-wrap items-center justify-between gap-3 shadow-md animate-fade-in">
                          <div className="flex items-center gap-2">
                            <CalendarCheck className="w-4 h-4 text-emerald-400" />
                            <span className="font-bold">{hoveredChartDay.tanggal} ({hoveredChartDay.label})</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div>
                              <span className="text-slate-400 text-[11px]">Kas Masuk: </span>
                              <span className="font-bold text-emerald-400">+{formatRupiah(hoveredChartDay.masuk)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[11px]">Kas Keluar: </span>
                              <span className="font-bold text-rose-400">-{formatRupiah(hoveredChartDay.keluar)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[11px]">Saldo Berjalan: </span>
                              <span className="font-bold text-indigo-300">{formatRupiah(hoveredChartDay.saldoKumulatif)}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                            Arahkan kursor ke batang grafik atau titik tanggal untuk melihat rincian arus kas harian.
                          </span>
                          <span className="font-semibold text-slate-600">
                            Periode: {dashboardData.targetRealisasiIuran?.periode || '2026-11'}
                          </span>
                        </div>
                      )}

                      {/* SVG Canvas */}
                      <div className="w-full overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                          className="w-full h-auto min-w-[650px] bg-slate-50/50 rounded-xl border border-slate-100"
                        >
                          {/* Grid horizontal lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                            const y = paddingTop + chartHeight * (1 - pct);
                            return (
                              <g key={i}>
                                <line
                                  x1={paddingLeft}
                                  y1={y}
                                  x2={svgWidth - paddingRight}
                                  y2={y}
                                  stroke="#e2e8f0"
                                  strokeDasharray="4 4"
                                />
                                <text
                                  x={paddingLeft - 8}
                                  y={y + 3}
                                  textAnchor="end"
                                  fontSize="9"
                                  fill="#94a3b8"
                                  fontWeight="bold"
                                >
                                  {pct === 0 ? '0' : `${Math.round((maxDailyVal * pct) / 1000000)}Jt`}
                                </text>
                              </g>
                            );
                          })}

                          {/* Bars (Kas Masuk & Kas Keluar) */}
                          {daily.map((d: any, idx: number) => {
                            const centerX = paddingLeft + idx * stepX + stepX / 2;
                            const hMasuk = ((d.masuk || 0) / maxDailyVal) * chartHeight;
                            const hKeluar = ((d.keluar || 0) / maxDailyVal) * chartHeight;

                            const xMasuk = centerX - barWidth - 2;
                            const yMasuk = paddingTop + chartHeight - hMasuk;

                            const xKeluar = centerX + 2;
                            const yKeluar = paddingTop + chartHeight - hKeluar;

                            const isHovered = hoveredChartDay?.tanggal === d.tanggal;

                            return (
                              <g
                                key={d.tanggal}
                                className="cursor-pointer transition-all duration-200"
                                onMouseEnter={() => setHoveredChartDay(d)}
                              >
                                {/* Highlight kolom saat dihover */}
                                {isHovered && (
                                  <rect
                                    x={centerX - stepX / 2 + 4}
                                    y={paddingTop}
                                    width={stepX - 8}
                                    height={chartHeight}
                                    fill="#f1f5f9"
                                    rx="6"
                                    opacity="0.8"
                                  />
                                )}

                                {/* Bar Masuk (Emerald) */}
                                {hMasuk > 0 && (
                                  <rect
                                    x={xMasuk}
                                    y={yMasuk}
                                    width={barWidth}
                                    height={hMasuk}
                                    fill="#10b981"
                                    rx="4"
                                    className="hover:opacity-90"
                                  />
                                )}

                                {/* Bar Keluar (Rose) */}
                                {hKeluar > 0 && (
                                  <rect
                                    x={xKeluar}
                                    y={yKeluar}
                                    width={barWidth}
                                    height={hKeluar}
                                    fill="#f43f5e"
                                    rx="4"
                                    className="hover:opacity-90"
                                  />
                                )}

                                {/* Label Tanggal di Bawah */}
                                <text
                                  x={centerX}
                                  y={svgHeight - 14}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fontWeight={isHovered ? 'bold' : 'normal'}
                                  fill={isHovered ? '#0f172a' : '#64748b'}
                                >
                                  {d.label}
                                </text>
                              </g>
                            );
                          })}

                          {/* Garis Tren Saldo Kumulatif (Indigo Line) */}
                          {points.length > 1 && (
                            <polyline
                              fill="none"
                              stroke="#6366f1"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={polylinePoints}
                              className="opacity-80"
                            />
                          )}

                          {/* Titik node di atas garis saldo */}
                          {points.map((p: any) => {
                            const isHovered = hoveredChartDay?.tanggal === p.data.tanggal;
                            return (
                              <g
                                key={p.data.tanggal}
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredChartDay(p.data)}
                              >
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={isHovered ? 6 : 4}
                                  fill={isHovered ? '#4338ca' : '#6366f1'}
                                  stroke="#ffffff"
                                  strokeWidth="2"
                                />
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      {/* Legend Grafik */}
                      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500"></span>
                            <span className="text-slate-700 font-semibold">Kas Masuk (Iuran & Donasi)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-sm bg-rose-500"></span>
                            <span className="text-slate-700 font-semibold">Kas Keluar (Operasional)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-1.5 rounded-full bg-indigo-600"></span>
                            <span className="text-slate-700 font-semibold">Tren Pertumbuhan Saldo Kas RT</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500 font-medium">
                          Saldo Awal: <strong className="text-slate-700">{formatRupiah(dashboardData.cashFlowChart.saldoAwal)}</strong> &rarr; Saldo Akhir: <strong className="text-emerald-700">{formatRupiah(dashboardData.cashFlowChart.saldoAkhir)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* NOTIFIKASI PENDING BUKTI (MUNCUL HANYA JIKA ADA ANTREAN) */}
            {dashboardData.pendingProofs?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shrink-0">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">
                      Ada {dashboardData.pendingProofs.length} Bukti Transfer Warga Menunggu Verifikasi
                    </h4>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Periksa bukti transfer warga agar otomatis tercatat ke kas masuk RT.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('verifikasi')}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition shadow-xs shrink-0"
                >
                  Buka Verifikasi Bukti &rarr;
                </button>
              </div>
            )}

            {/* PANEL ARUS KAS MASUK & KELUAR TERBARU (ELEGAN FULL-WIDTH) */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/90 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Arus Kas Masuk & Keluar Terbaru</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Riwayat catatan transaksi keuangan kas RT yang sah dan aktif.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('pemasukan')}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline px-2.5 py-1 rounded-lg hover:bg-emerald-50 transition"
                  >
                    Semua Kas Masuk &rarr;
                  </button>
                  <button
                    onClick={() => setActiveTab('pengeluaran')}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline px-2.5 py-1 rounded-lg hover:bg-rose-50 transition"
                  >
                    Semua Kas Keluar &rarr;
                  </button>
                </div>
              </div>

              {(!dashboardData.recentTransactions || dashboardData.recentTransactions.length === 0) ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Belum ada transaksi keuangan yang tercatat.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dashboardData.recentTransactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50/80 transition flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {tx.type === 'income' ? (
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                            <ArrowDownCircle className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs shrink-0">
                            <ArrowUpCircle className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 truncate">{tx.deskripsi}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>{formatDateIndo(tx.tanggal)}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-600">
                              {tx.type === 'income' ? 'Kas Masuk' : 'Kas Keluar'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-black text-xs ${
                            tx.type === 'income' ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {tx.type === 'income' ? '+' : '-'} {formatRupiah(tx.nominal)}
                        </div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 mt-0.5">
                          Sah
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: VERIFIKASI BUKTI */}
        {activeTab === 'verifikasi' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Verifikasi Pembayaran Warga</h1>
                <p className="text-xs text-slate-500">
                  Periksa foto bukti transfer warga sebelum memasukkannya ke kas resmi RT.
                </p>
              </div>

              {/* Status Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                  {['Semua', 'Menunggu Verifikasi', 'Terverifikasi', 'Ditolak'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setProofFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        proofFilter === st
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Proofs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Bukti Foto</th>
                      <th className="py-3.5 px-4">No. Tiket</th>
                      <th className="py-3.5 px-4">Warga & Blok</th>
                      <th className="py-3.5 px-4">Bulan Tagihan</th>
                      <th className="py-3.5 px-4">Nominal</th>
                      <th className="py-3.5 px-4">Tanggal Unggah</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proofs
                      .filter((p) => proofFilter === 'Semua' || p.status === proofFilter)
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4">
                            {p.buktiUrl || p.driveUrl ? (
                              <img
                                src={toDirectImg(p.buktiUrl || p.driveUrl)}
                                alt="Foto Bukti"
                                className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition bg-slate-100"
                                onClick={() => setSelectedProof(p)}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">
                                No pic
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            <div>{p.id}</div>
                            <a
                              href={p.driveUrl || "https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-normal mt-0.5"
                              title="Buka File / Folder di Google Drive"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Drive Bukti</span>
                            </a>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{p.residentName}</div>
                            <div className="text-[11px] text-slate-500">
                              Blok {p.blok} {p.hp && `• ${p.hp}`}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-700">{p.bulan?.map(formatPeriodCode).join(', ') || '-'}</td>
                          <td className="py-3 px-4 font-black text-slate-900 text-sm">
                            {formatRupiah(p.nominal)}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{formatDateIndo(p.createdAt)}</td>
                          <td className="py-3 px-4">
                            {p.status === 'Terverifikasi' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Terverifikasi
                              </span>
                            )}
                            {p.status === 'Menunggu Verifikasi' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                Menunggu Verifikasi
                              </span>
                            )}
                            {p.status === 'Ditolak' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                                <XCircle className="w-3.5 h-3.5 text-red-600" />
                                Ditolak
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {p.status === 'Terverifikasi' && (() => {
                                const resident = residents.find(
                                  (r) => r.id === p.residentId || r.nama.toLowerCase() === p.residentName.toLowerCase()
                                );
                                const targetHp = p.hp || resident?.hp;
                                if (!targetHp) return null;

                                const periodeStr = p.bulan && p.bulan.length > 0
                                  ? p.bulan.join(', ')
                                  : (settings?.periodeAktif || '2026-11');

                                const waMsg = `Assalamualaikum, Bapak/Ibu ${p.residentName}.\n\nKami informasikan pembayaran iuran RT 011 / RW 028 sudah *diterima dan diverifikasi*.\n\n*Rincian pembayaran:*\nNama: ${p.residentName}\nBlok: ${p.blok}\nKategori: ${p.kategori || 'Iuran Bulanan'}\nPeriode: ${periodeStr}\nNominal: ${formatRupiah(p.nominal)}\nStatus: *Terverifikasi*\n\nTerima kasih atas pembayarannya.\nPengurus RT 011 / RW 028`;

                                return (
                                  <a
                                    href={createWaLink(targetHp, waMsg)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition border border-emerald-200 shadow-2xs"
                                    title="Kirim Pesan WhatsApp Konfirmasi Lunas"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>WA</span>
                                  </a>
                                );
                              })()}
                              <button
                                onClick={() => setSelectedProof(p)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm"
                              >
                                Periksa
                              </button>
                              <button
                                onClick={() => handleDeleteProof(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition border border-red-200/60"
                                title="Hapus / Batalkan Transaksi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: KAS KELUAR (PENGELUARAN) */}
        {activeTab === 'pengeluaran' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Transaksi Kas Keluar (Pengeluaran)</h1>
                <p className="text-xs text-slate-500">
                  Catat pengeluaran kas RT untuk keamanan, kebersihan, listrik pos, perbaikan, dan operasional.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    resetExpenseForm();
                    setShowExpenseModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Catat Pengeluaran Baru</span>
                </button>
              </div>
            </div>

            {/* Total Expense Summary Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="text-xs text-slate-500 font-medium">Total Akumulasi Pengeluaran Sah</span>
                <div className="text-2xl font-black text-rose-600">
                  {formatRupiah(
                    expenses.filter((e) => e.status === 'Sah').reduce((sum, e) => sum + e.nominal, 0)
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Menampilkan {expenses.length} catatan pengeluaran
              </div>
            </div>

            {/* Expenses Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Tanggal</th>
                      <th className="py-3.5 px-4">Kategori</th>
                      <th className="py-3.5 px-4">Keterangan</th>
                      <th className="py-3.5 px-4">Penerima</th>
                      <th className="py-3.5 px-4">Nominal</th>
                      <th className="py-3.5 px-4">Struk / Nota</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center w-40 min-w-[160px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-medium text-slate-600">{formatDateIndo(exp.tanggal)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                              exp.kategori === 'Fixed'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                : exp.kategori === 'Variabel'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {exp.kategori}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{exp.keterangan}</td>
                        <td className="py-3 px-4 text-slate-600">{exp.penerima}</td>
                        <td className="py-3 px-4 font-black text-rose-600 text-sm">
                          - {formatRupiah(exp.nominal)}
                        </td>
                        <td className="py-3 px-4">
                          {exp.buktiUrl ? (
                            <button
                              type="button"
                              onClick={() => setSelectedExpenseReceipt(exp)}
                              className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 font-bold transition shadow-xs cursor-pointer"
                              title="Buka pratinjau struk nota"
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Lihat Struk</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {exp.status === 'Sah' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Sah
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                              Dibatalkan
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center w-40 min-w-[160px]">
                          <div className="flex items-center justify-center gap-1.5 mx-auto">
                            {exp.status === 'Sah' && (
                              <button
                                onClick={() => handleVoidExpense(exp.id)}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition border border-amber-200/60"
                                title="Batalkan transaksi ini"
                              >
                                Batalkan
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteExpense(exp.id, exp.nominal, exp.keterangan)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition border border-red-200/60"
                              title="Hapus permanen pengeluaran ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: IURAN & KAS MASUK */}
        {activeTab === 'pemasukan' && (() => {
          const countAll = incomes.length;
          const countIuran = incomes.filter((i) => (i.kategori || '').toLowerCase().includes('iuran')).length;
          const countTunggakan = incomes.filter((i) => (i.kategori || '').toLowerCase().includes('tunggakan')).length;
          const countKasbon = incomes.filter((i) => (i.kategori || '').toLowerCase().includes('kasbon')).length;

          const filteredIncomes = incomes.filter((inc) => {
            if (incomeSearch) {
              const q = incomeSearch.toLowerCase();
              const matchSumber = (inc.sumber || '').toLowerCase().includes(q);
              const matchKategori = (inc.kategori || '').toLowerCase().includes(q);
              const matchCatatan = (inc.catatan || '').toLowerCase().includes(q);
              const matchId = (inc.id || '').toLowerCase().includes(q);
              const matchBukti = (inc.buktiId || '').toLowerCase().includes(q);
              if (!matchSumber && !matchKategori && !matchCatatan && !matchId && !matchBukti) return false;
            }

            if (incomeCategoryFilter === 'iuran') {
              return (inc.kategori || '').toLowerCase().includes('iuran');
            }
            if (incomeCategoryFilter === 'tunggakan') {
              return (inc.kategori || '').toLowerCase().includes('tunggakan');
            }
            if (incomeCategoryFilter === 'kasbon') {
              return (inc.kategori || '').toLowerCase().includes('kasbon');
            }

            return true;
          });

          const getCategoryBadgeClass = (kat: string) => {
            const lower = (kat || '').toLowerCase();
            if (lower.includes('tunggakan')) {
              return 'bg-amber-100 text-amber-900 border border-amber-300 font-bold';
            }
            if (lower.includes('kasbon')) {
              return 'bg-cyan-100 text-cyan-900 border border-cyan-300 font-bold';
            }
            if (lower.includes('donasi') || lower.includes('hibah')) {
              return 'bg-purple-100 text-purple-900 border border-purple-300 font-bold';
            }
            return 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-semibold';
          };

          return (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">Iuran & Pemasukan Kas Masuk</h1>
                  <p className="text-xs text-slate-500">
                    Daftar semua kas masuk RT: Iuran Bulanan Warga, Cicilan/Pelunasan Tunggakan Lama (Warga & Non-Warga), Pengembalian Kasbon Petugas, dan manual.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleOpenIncomeModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Catat Kas Masuk Manual</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari sumber/warga, blok, kategori, bukti, catatan..."
                    value={incomeSearch}
                    onChange={(e) => setIncomeSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setIncomeCategoryFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      incomeCategoryFilter === 'all'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua ({countAll})
                  </button>
                  <button
                    onClick={() => setIncomeCategoryFilter('iuran')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      incomeCategoryFilter === 'iuran'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Iuran Bulanan ({countIuran})
                  </button>
                  <button
                    onClick={() => setIncomeCategoryFilter('tunggakan')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      incomeCategoryFilter === 'tunggakan'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80'
                    }`}
                  >
                    Tunggakan Warga & Non-Warga ({countTunggakan})
                  </button>
                  <button
                    onClick={() => setIncomeCategoryFilter('kasbon')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      incomeCategoryFilter === 'kasbon'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100 border border-cyan-200/80'
                    }`}
                  >
                    Kasbon Petugas ({countKasbon})
                  </button>
                </div>
              </div>

              {/* Incomes Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-3.5 px-4">Tanggal</th>
                        <th className="py-3.5 px-4">Sumber / Warga</th>
                        <th className="py-3.5 px-4">Kategori</th>
                        <th className="py-3.5 px-4">Bulan / Keterangan</th>
                        <th className="py-3.5 px-4">Nominal</th>
                        <th className="py-3.5 px-4">No. Bukti / Metode</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-center w-40 min-w-[160px]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredIncomes.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            Tidak ada transaksi pemasukan yang cocok dengan filter.
                          </td>
                        </tr>
                      ) : (
                        filteredIncomes.map((inc) => (
                          <tr key={inc.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-4 font-medium text-slate-600">{formatDateIndo(inc.tanggal)}</td>
                            <td className="py-3 px-4 font-bold text-slate-900">{inc.sumber}</td>
                            <td className="py-3 px-4">
                              <span className={`px-2.5 py-1 rounded-md text-[11px] ${getCategoryBadgeClass(inc.kategori)}`}>
                                {inc.kategori}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-mono font-medium text-slate-800">
                                {inc.bulan?.map(formatPeriodCode).join(', ') || '-'}
                              </div>
                              {inc.catatan && (
                                <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 max-w-[200px]" title={inc.catatan}>
                                  {inc.catatan}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 font-black text-emerald-700 text-sm">
                              + {formatRupiah(inc.nominal)}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {inc.buktiId || 'Manual'}
                            </td>
                            <td className="py-3 px-4">
                              {inc.status === 'Sah' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Sah
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                  Dibatalkan
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center w-40 min-w-[160px]">
                              <div className="flex items-center justify-center gap-1.5 mx-auto">
                                {inc.status === 'Sah' && (
                                  <button
                                    onClick={() => handleVoidIncome(inc.id)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition border border-amber-200/60"
                                    title="Batalkan transaksi ini"
                                  >
                                    Batalkan
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteIncome(inc.id, inc.nominal, inc.sumber)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition border border-red-200/60"
                                  title="Hapus permanen pemasukan ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 5: MASTER WARGA */}
        {activeTab === 'warga' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Master Data Warga</h1>
                <p className="text-xs text-slate-500">
                  Kelola data penghuni rumah, nomor WhatsApp, dan tarif iuran masing-masing rumah.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setEditingResident(null);
                    setResNama('');
                    setResBlok('');
                    setResHp('');
                    setResTarif('100000');
                    setResStatus('Aktif');
                    setShowResidentModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Warga Baru</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4">
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Cari nama warga atau blok rumah..."
                  value={wargaSearch}
                  onChange={(e) => setWargaSearch(e.target.value)}
                  className="w-full sm:max-w-xs text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-3">Blok / No</th>
                      <th className="py-3 px-3">Nama Kepala Keluarga</th>
                      <th className="py-3 px-3">No. WhatsApp</th>
                      <th className="py-3 px-3">Tarif Iuran Bulanan</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {residents
                      .filter(
                        (r) =>
                          r.nama.toLowerCase().includes(wargaSearch.toLowerCase()) ||
                          r.blok.toLowerCase().includes(wargaSearch.toLowerCase())
                      )
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3 font-bold text-slate-900">{r.blok}</td>
                          <td className="py-3 px-3 font-semibold text-slate-900">{r.nama}</td>
                          <td className="py-3 px-3 text-slate-600">
                            {r.hp ? (
                              <a
                                href={`https://wa.me/${r.hp.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-600 hover:underline flex items-center gap-1"
                              >
                                <span>{r.hp}</span>
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-emerald-700">{formatRupiah(r.tarif)}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'Aktif'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingResident(r);
                                  setResNama(r.nama);
                                  setResBlok(r.blok);
                                  setResHp(r.hp);
                                  setResTarif(String(r.tarif));
                                  setResStatus(r.status);
                                  setShowResidentModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteResident(r.id, r.nama)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: MATRIKS PENAGIHAN */}
        {activeTab === 'matriks' && (() => {
          const ALL_MONTH_NAMES = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];

          const isAllPeriod = selectedTargetPeriod === 'ALL';
          let targetMonthName = 'November';
          if (!isAllPeriod && selectedTargetPeriod) {
            const parts = selectedTargetPeriod.split('-');
            if (parts.length === 2) {
              const mIdx = parseInt(parts[1], 10) - 1;
              if (mIdx >= 0 && mIdx < 12) {
                targetMonthName = ALL_MONTH_NAMES[mIdx];
              }
            }
          }

          const getBlockGroup = (blokStr?: string): string => {
            if (!blokStr) return 'Lainnya';
            const trimmed = blokStr.trim().toUpperCase();
            const match = trimmed.match(/^[A-Z]+/);
            if (match) return `Blok ${match[0]}`;
            return 'Lainnya';
          };

          // Hitung daftar blok yang tersedia
          const blockCounts: Record<string, number> = {};
          (matrixData?.data || []).forEach((row: any) => {
            const grp = getBlockGroup(row.blok);
            blockCounts[grp] = (blockCounts[grp] || 0) + 1;
          });
          const availableBlocks = Object.keys(blockCounts).sort().map((name) => ({
            name,
            count: blockCounts[name],
          }));

          // Filter baris matriks
          const filteredMatrixRows = (matrixData?.data || []).filter((row: any) => {
            // 1. Filter Pencarian Nama / Blok
            if (matrixSearch.trim()) {
              const q = matrixSearch.toLowerCase();
              const matchNama = row.nama?.toLowerCase().includes(q);
              const matchBlok = row.blok?.toLowerCase().includes(q);
              if (!matchNama && !matchBlok) return false;
            }

            // 2. Filter Blok
            const grp = getBlockGroup(row.blok);
            if (matrixSelectedBlock !== 'ALL' && grp !== matrixSelectedBlock) {
              return false;
            }

            // 3. Filter Status (Semua, Lunas, Belum Bayar)
            if (matrixFilterStatus === 'LUNAS_INI') {
              if (isAllPeriod) {
                return row.totalLunasTahunIni > 0;
              }
              return row.months?.[targetMonthName]?.status === 'Lunas';
            }

            if (matrixFilterStatus === 'BELUM_INI') {
              if (isAllPeriod) {
                return row.totalLunasTahunIni < 12;
              }
              return row.months?.[targetMonthName]?.status !== 'Lunas';
            }

            return true;
          });

          // Grouping berdasarkan Blok
          const groupedMatrixRows: Record<string, any[]> = {};
          filteredMatrixRows.forEach((row: any) => {
            const grp = getBlockGroup(row.blok);
            if (!groupedMatrixRows[grp]) groupedMatrixRows[grp] = [];
            groupedMatrixRows[grp].push(row);
          });

          // Urutkan warga di dalam setiap blok
          Object.keys(groupedMatrixRows).forEach((grp) => {
            groupedMatrixRows[grp].sort((a: any, b: any) =>
              a.blok.localeCompare(b.blok, undefined, { numeric: true })
            );
          });

          const sortedBlockKeys = Object.keys(groupedMatrixRows).sort();

          // Statistik Dinamis Berdasarkan Bulan Pilihan
          const statsTargetMonth = matrixData?.monthlyStats?.[targetMonthName] || { lunas: 0, belum: 0, nominal: 0 };
          const secondaryMonthName = targetMonthName === 'November' ? 'Desember' : 'November';
          const statsSecondaryMonth = matrixData?.monthlyStats?.[secondaryMonthName] || { lunas: 0, belum: 0, nominal: 0 };

          return (
            <div className="space-y-6">
              {/* Header & Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-xs">
                      <CalendarCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <span>Buku Penagihan & Matriks Iuran</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Tahun {matrixYear}
                        </span>
                      </h1>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Terkoneksi langsung ke Google Sheet <strong>DataIuran</strong> & <strong>MasterWarga</strong>. Dilengkapi grouping per blok dan filter periode bulanan.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => refreshAll(true)}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>Perbarui Data</span>
                  </button>
                </div>
              </div>

              {/* Quick Summary Cards (Statistik Matriks Dinamis) */}
              {matrixData?.monthlyStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="text-[11px] font-bold text-slate-500 mb-0.5">Total Warga Aktif</div>
                    <div className="text-xl font-black text-slate-900">{matrixData.totalResidents || residents.length} KK</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Tercatat di Sheet MasterWarga</div>
                  </div>

                  <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                    <div className="text-[11px] font-bold text-emerald-800 mb-0.5">
                      {isAllPeriod ? `Realisasi ${targetMonthName}` : `Lunas ${targetMonthName} ${matrixYear}`}
                    </div>
                    <div className="text-xl font-black text-emerald-700">
                      {statsTargetMonth.lunas} KK
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">
                      {formatRupiah(statsTargetMonth.nominal)} terkumpul
                    </div>
                  </div>

                  <div className="bg-teal-50/70 p-3.5 rounded-xl border border-teal-200 shadow-2xs">
                    <div className="text-[11px] font-bold text-teal-800 mb-0.5">
                      Lunas {secondaryMonthName} {matrixYear}
                    </div>
                    <div className="text-xl font-black text-teal-700">
                      {statsSecondaryMonth.lunas} KK
                    </div>
                    <div className="text-[10px] text-teal-600 mt-0.5">
                      {formatRupiah(statsSecondaryMonth.nominal)}
                    </div>
                  </div>

                  <div
                    onClick={() => setMatrixFilterStatus('BELUM_INI')}
                    className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200 shadow-2xs cursor-pointer hover:bg-rose-100/70 transition"
                    title="Klik untuk langsung memfilter daftar warga belum bayar"
                  >
                    <div className="text-[11px] font-bold text-rose-800 mb-0.5 flex items-center justify-between">
                      <span>{isAllPeriod ? 'Belum Bayar (Bulan Berjalan)' : `Belum Bayar ${targetMonthName}`}</span>
                      <span className="text-[9px] underline text-rose-600">Filter</span>
                    </div>
                    <div className="text-xl font-black text-rose-700">
                      {statsTargetMonth.belum} KK
                    </div>
                    <div className="text-[10px] text-rose-600 mt-0.5">Klik untuk lihat & kirim WA tagihan</div>
                  </div>
                </div>
              )}

              {/* Filter Bar: Pencarian, Periode Bulan, Blok, & Status */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari nama warga atau blok..."
                      value={matrixSearch}
                      onChange={(e) => setMatrixSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                    />
                  </div>

                  {/* Filter Periode Bulan */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                    <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-bold text-slate-500">Periode:</span>
                    <select
                      value={selectedTargetPeriod}
                      onChange={(e) => handleChangeTargetPeriod(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-900 focus:outline-hidden cursor-pointer"
                      title="Pilih periode acuan matriks penagihan"
                    >
                      <option value="ALL">Semua Bulan ({matrixYear})</option>
                      {ALL_MONTH_NAMES.map((m, idx) => {
                        const mPad = String(idx + 1).padStart(2, '0');
                        const code = `${matrixYear}-${mPad}`;
                        const lunasCount = matrixData?.monthlyStats?.[m]?.lunas;
                        return (
                          <option key={code} value={code}>
                            {m} {matrixYear} {lunasCount !== undefined ? `(${lunasCount} Lunas)` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Filter Group Blok */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-bold text-slate-500">Blok:</span>
                    <select
                      value={matrixSelectedBlock}
                      onChange={(e) => setMatrixSelectedBlock(e.target.value)}
                      className="bg-transparent text-xs font-black text-slate-900 focus:outline-hidden cursor-pointer"
                      title="Filter tampilan per blok atau semua blok"
                    >
                      <option value="ALL">Semua Blok ({availableBlocks.length} Blok)</option>
                      {availableBlocks.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} ({b.count} Warga)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {/* Filter Status (Semua, Lunas Bulan Ini, Belum Bayar) */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                    <button
                      type="button"
                      onClick={() => setMatrixFilterStatus('ALL')}
                      className={`px-3 py-1 rounded-lg transition ${
                        matrixFilterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixFilterStatus('LUNAS_INI')}
                      className={`px-3 py-1 rounded-lg transition ${
                        matrixFilterStatus === 'LUNAS_INI'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'hover:text-emerald-700'
                      }`}
                    >
                      {isAllPeriod ? 'Sudah Ada Bayar' : `Lunas (${targetMonthName.slice(0, 3)})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixFilterStatus('BELUM_INI')}
                      className={`px-3 py-1 rounded-lg transition ${
                        matrixFilterStatus === 'BELUM_INI'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'hover:text-rose-700'
                      }`}
                    >
                      {isAllPeriod ? 'Ada Belum Bayar' : `Belum Bayar (${targetMonthName.slice(0, 3)})`}
                    </button>
                  </div>

                  {/* Legend Status Mini */}
                  <div className="hidden xl:flex items-center gap-2 text-[11px] font-semibold text-slate-500 border-l border-slate-200 pl-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Lunas (✓)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Menunggu (⏳)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Belum (-)
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabel Matriks Penagihan Iuran Berdasarkan Grouping Blok */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold">
                        <th className="py-3 px-3 sticky left-0 bg-slate-900 z-10 whitespace-nowrap shadow-sm min-w-[190px]">
                          Blok & Nama Warga
                        </th>
                        {matrixData?.monthNames?.map((m: string) => {
                          const isSelectedCol = !isAllPeriod && m === targetMonthName;
                          return (
                            <th
                              key={m}
                              className={`py-3 px-2 text-center whitespace-nowrap transition ${
                                isSelectedCol ? 'bg-emerald-800 text-emerald-100 font-black' : ''
                              }`}
                            >
                              <span>{m.slice(0, 3)}</span>
                              {isSelectedCol && (
                                <span className="block text-[8px] font-bold text-emerald-200">
                                  Pilihan
                                </span>
                              )}
                            </th>
                          );
                        })}
                        <th className="py-3 px-2.5 text-center whitespace-nowrap">Total Lunas</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">Pengingat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedBlockKeys.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="py-12 text-center text-slate-400 font-medium text-xs">
                            Tidak ada data warga yang cocok dengan kriteria pencarian/filter.
                          </td>
                        </tr>
                      ) : (
                        sortedBlockKeys.map((blockKey) => {
                          const blockRows = groupedMatrixRows[blockKey];
                          const blockLunasCount = blockRows.filter((r: any) =>
                            isAllPeriod
                              ? r.totalLunasTahunIni > 0
                              : r.months?.[targetMonthName]?.status === 'Lunas'
                          ).length;
                          const blockBelumCount = blockRows.filter((r: any) =>
                            isAllPeriod
                              ? r.totalLunasTahunIni < 12
                              : r.months?.[targetMonthName]?.status !== 'Lunas'
                          ).length;

                          return (
                            <React.Fragment key={`group-${blockKey}`}>
                              {/* Header Baris Grouping Blok */}
                              <tr className="bg-slate-100/90 border-y border-slate-200 sticky top-0 z-5">
                                <td colSpan={15} className="py-2.5 px-4 font-bold text-slate-900">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <Building2 className="w-4 h-4 text-emerald-600" />
                                      <span className="text-xs uppercase tracking-wide font-black text-slate-900">
                                        {blockKey}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                                        {blockRows.length} Warga
                                      </span>
                                      {matrixFilterStatus === 'BELUM_INI' && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                          {blockBelumCount} Belum Bayar
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-600">
                                      <span className="text-emerald-700 font-bold">
                                        ✓ {blockLunasCount} Lunas
                                      </span>
                                      <span>•</span>
                                      <span className="text-rose-600 font-bold">
                                        - {blockBelumCount} Belum Bayar
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>

                              {/* Daftar Baris Warga dalam Blok */}
                              {blockRows.map((row: any) => {
                                const totalLunas = Object.values(row.months || {}).filter(
                                  (item: any) => item.status === 'Lunas'
                                ).length;

                                return (
                                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900 sticky left-0 bg-white z-1 shadow-sm whitespace-nowrap min-w-[190px]">
                                      <span className="font-bold text-emerald-700 mr-1.5">{row.blok}</span>
                                      <span className="text-slate-800">{row.nama}</span>
                                    </td>

                                    {matrixData?.monthNames?.map((m: string) => {
                                      const item = row.months?.[m] || { status: 'Belum Bayar' };
                                      const isSelectedCol = !isAllPeriod && m === targetMonthName;

                                      return (
                                        <td
                                          key={m}
                                          className={`py-2 px-1 text-center ${
                                            isSelectedCol ? 'bg-emerald-50/40' : ''
                                          }`}
                                        >
                                          {item.status === 'Lunas' ? (
                                            <span
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-extrabold bg-emerald-100 text-emerald-800 shadow-2xs hover:bg-emerald-200 transition cursor-help"
                                              title={`Lunas ${formatRupiah(item.nominal || row.tarif || 150000)} ${
                                                item.tanggal ? `\nTanggal: ${item.tanggal}` : ''
                                              }\nTercatat di Sheet DataIuran`}
                                            >
                                              ✓
                                            </span>
                                          ) : item.status === 'Menunggu' ? (
                                            <span
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 shadow-2xs hover:bg-amber-200 transition cursor-help"
                                              title={`Menunggu Verifikasi Bukti (${formatRupiah(item.nominal || 0)})`}
                                            >
                                              ⏳
                                            </span>
                                          ) : (
                                            <span
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-semibold text-rose-400 bg-rose-50/60 hover:bg-rose-100 transition cursor-help"
                                              title={`Belum Bayar (Tarif: ${formatRupiah(row.tarif || 150000)})`}
                                            >
                                              -
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}

                                    <td className="py-2 px-2.5 text-center font-bold text-slate-700 whitespace-nowrap">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                                          totalLunas >= 2
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : totalLunas === 1
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                      >
                                        {totalLunas} / 12
                                      </span>
                                    </td>

                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      {row.hp ? (
                                        <a
                                          href={createWaLink(
                                            row.hp,
                                            `Assalamualaikum, Bapak/Ibu ${row.nama} (${row.blok}), kami dari pengurus RT menginformasikan terkait rekapitulasi iuran kas RT. ${
                                              row.months?.[targetMonthName]?.status === 'Lunas'
                                                ? `Terima kasih atas pembayaran iuran ${
                                                    isAllPeriod ? 'tahun ' + matrixYear : 'bulan ' + targetMonthName
                                                  } yang telah tercatat lunas.`
                                                : `Mengingatkan bahwa iuran bulanan untuk periode ${
                                                    isAllPeriod
                                                      ? 'berjalan tahun ' + matrixYear
                                                      : targetMonthName + ' ' + matrixYear
                                                  } belum tercatat (Tarif: ${formatRupiah(
                                                    row.tarif || 150000
                                                  )}). Mohon konfirmasi atau transfer dan unggah buktinya melalui web kas RT. Terima kasih!`
                                            }`
                                          )}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold transition border border-emerald-200/80 shadow-2xs"
                                          title="Kirim Pesan WhatsApp Pengingat Iuran"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                          <span>WA</span>
                                        </a>
                                      ) : (
                                        <span className="text-[10px] text-slate-300">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 7: LAPORAN & EXPORT */}
        {activeTab === 'laporan' && (() => {
          const isAll = selectedTargetPeriod === 'ALL';
          const periodLabel = isAll ? `Semua Bulan (${matrixYear})` : getPeriodNameIndoHelper(selectedTargetPeriod);
          const twelveMonths = compute12MonthsCashflow();

          const reportIncomes = incomes.filter((inc) => isIncomeInPeriod(inc, selectedTargetPeriod, matrixYear));

          const reportExpenses = expenses.filter((exp) => {
            if (exp.status !== 'Sah') return false;
            if (isAll) {
              return exp.tanggal && exp.tanggal.startsWith(String(matrixYear));
            }
            return exp.tanggal && normalizePeriodCodeHelper(exp.tanggal) === selectedTargetPeriod;
          });

          const currentMonthData = !isAll ? twelveMonths.find((m) => m.periodCode === selectedTargetPeriod) : null;
          const reportSaldoAwal = isAll
            ? settings?.saldoAwal || 0
            : currentMonthData
            ? currentMonthData.saldoAwal
            : settings?.saldoAwal || 0;

          const reportTotalMasuk = reportIncomes.reduce((s, i) => s + i.nominal, 0);
          const reportTotalKeluar = reportExpenses.reduce((s, e) => s + e.nominal, 0);
          const reportSaldoAkhir = isAll
            ? reportSaldoAwal + reportTotalMasuk - reportTotalKeluar
            : currentMonthData
            ? currentMonthData.saldoAkhir
            : reportSaldoAwal + reportTotalMasuk - reportTotalKeluar;

          return (
            <div className="space-y-6">
              {/* TOP TOOLBAR: FILTER PERIODE & 3 TOMBOL EXPORT TERPISAH (NO-PRINT) */}
              <div className="no-print bg-white rounded-3xl p-5 shadow-xs border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Laporan Keuangan & Cetak Kas RT
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Laporan resmi pembukuan RT 011 / RW 028 Cluster Cleopatra. Pilih periode untuk melihat rincian & sisa saldo.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Selector Periode */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-2xl px-3 py-1.5 shadow-2xs">
                    <span className="text-xs font-semibold text-slate-500">Pilih Periode:</span>
                    <select
                      value={selectedTargetPeriod}
                      onChange={(e) => handleChangeTargetPeriod(e.target.value)}
                      className="bg-transparent text-xs font-extrabold text-slate-900 focus:outline-hidden cursor-pointer"
                    >
                      <option value="ALL">Semua Bulan ({matrixYear})</option>
                      {twelveMonths.map((m) => (
                        <option key={m.periodCode} value={m.periodCode}>
                          {m.monthName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3 Tombol Ekspor Terpisah */}
                  <button
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                    title="Download Tabel Laporan Lengkap Multi-Sheet dalam Format Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                    title="Download Data Pembukuan dalam Format CSV (.csv)"
                  >
                    <Download className="w-4 h-4 text-teal-100" />
                    <span>Download CSV (.csv)</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                    title="Buka Print Preview Cetak Kertas A4 atau Simpan sebagai PDF"
                  >
                    <Printer className="w-4 h-4 text-slate-200" />
                    <span>Cetak / PDF</span>
                  </button>
                </div>
              </div>

              {/* DOKUMEN RESMI LAPORAN KEUANGAN (PRINTABLE AREA) */}
              <div
                id="printable-financial-report"
                className="printable-area bg-white rounded-3xl p-6 sm:p-10 shadow-xs border border-slate-200 text-slate-800 space-y-6"
              >
                {/* 1. KOP SURAT RESMI CLEOPATRA */}
                <div className="pb-3 border-b-2 border-slate-900">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <img
                      src="/logo-cleopatra.jpg"
                      alt="Logo IPL Cleopatra"
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover ring-2 ring-emerald-600/30 shadow-md shrink-0"
                    />
                    <div className="flex-1 text-center sm:text-left">
                      <div className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-slate-600">
                        PENGURUS RT 011 / RW 028
                      </div>
                      <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-950 uppercase tracking-tight mt-0.5">
                        IPL CLEOPATRA - LAPORAN BULANAN
                      </h1>
                      <div className="text-xs sm:text-sm font-semibold text-emerald-800 mt-0.5">
                        Laporan Pertanggungjawaban Pembukuan & Arus Kas Keuangan RT
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                        Laporan Pertanggungjawaban Pembukuan & Arus Kas Keuangan RT • Perumahan Griya Bukit Jaya Cluster Cleopatra, RT 011 / RW 028
                      </p>
                    </div>
                  </div>
                  {/* Garis ganda pembatas kop surat */}
                  <div className="border-b border-slate-900 mt-3" />
                </div>

                {/* 2. BAR PERIODE & TANGGAL CETAK */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs py-1 px-1 text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-500">Periode Laporan:</span>
                    <span className="font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-full text-xs border border-slate-200">
                      {periodLabel}
                    </span>
                    {isAll ? (
                      <span className="text-[11px] text-slate-400 font-medium">(Laporan Keseluruhan Tahun {matrixYear})</span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">(Laporan Mutasi Periode Bulanan)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Tanggal Cetak: <strong className="text-slate-700">{formatDateIndo(new Date().toISOString().slice(0, 10))}</strong>
                  </div>
                </div>

                {/* 3. RINGKASAN SALDO KAS (4 KARTU METRIK) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Saldo Awal Kas
                    </div>
                    <div className="text-lg sm:text-xl font-black text-slate-800 mt-1">
                      {formatRupiah(reportSaldoAwal)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {isAll ? `Saldo Awal Tahun ${matrixYear}` : `Saldo Awal ${periodLabel}`}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 shadow-2xs">
                    <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                      Penerimaan Kas (Masuk)
                    </div>
                    <div className="text-lg sm:text-xl font-black text-blue-800 mt-1">
                      {formatRupiah(reportTotalMasuk)}
                    </div>
                    <div className="text-[10px] text-blue-600/80 mt-0.5">
                      {reportIncomes.length} transaksi kas masuk
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 shadow-2xs">
                    <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                      Pengeluaran Kas (Keluar)
                    </div>
                    <div className="text-lg sm:text-xl font-black text-rose-800 mt-1">
                      {formatRupiah(reportTotalKeluar)}
                    </div>
                    <div className="text-[10px] text-rose-600/80 mt-0.5">
                      {reportExpenses.length} transaksi kas keluar
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200 shadow-2xs">
                    <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                      Sisa Saldo Kas Akhir
                    </div>
                    <div className="text-lg sm:text-xl font-black text-emerald-800 mt-1">
                      {formatRupiah(reportSaldoAkhir)}
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">
                      {isAll ? `Saldo Akhir Kas ${matrixYear}` : `Sisa Saldo Kas ${periodLabel}`}
                    </div>
                  </div>
                </div>

                {/* 4. LAPORAN KESELURUHAN: TABEL REKAPITULASI 12 BULAN (JIKA DIPILIH SEMUA BULAN) */}
                {isAll && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                          Rekapitulasi Arus Kas Keseluruhan 12 Bulan (Tahun {matrixYear})
                        </h2>
                        <p className="text-[11px] text-slate-500">
                          Mutasi saldo awal, penerimaan, pengeluaran, surplus/defisit, dan saldo akhir tiap bulan secara berurutan.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="py-2.5 px-3 text-center w-12">No</th>
                            <th className="py-2.5 px-3">Periode Bulan</th>
                            <th className="py-2.5 px-3 text-right">Saldo Awal</th>
                            <th className="py-2.5 px-3 text-right text-blue-700">Penerimaan (Masuk)</th>
                            <th className="py-2.5 px-3 text-right text-rose-700">Pengeluaran (Keluar)</th>
                            <th className="py-2.5 px-3 text-right">Surplus / (Defisit)</th>
                            <th className="py-2.5 px-3 text-right text-emerald-800">Saldo Akhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {twelveMonths.map((m) => (
                            <tr key={m.periodCode} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-semibold">{m.monthNumber}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{m.monthName}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-700">{formatRupiah(m.saldoAwal)}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-blue-700 font-semibold">
                                {m.totalMasuk > 0 ? formatRupiah(m.totalMasuk) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-rose-700 font-semibold">
                                {m.totalKeluar > 0 ? formatRupiah(m.totalKeluar) : '-'}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-bold ${
                                  m.surplusDefisit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {m.surplusDefisit !== 0 ? formatRupiah(m.surplusDefisit) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                                {formatRupiah(m.saldoAkhir)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300 text-xs">
                          <tr>
                            <td colSpan={2} className="py-3 px-3 text-center uppercase tracking-wider">
                              TOTAL AKUMULASI TAHUN {matrixYear}
                            </td>
                            <td className="py-3 px-3 text-right font-mono">{formatRupiah(settings?.saldoAwal || 0)}</td>
                            <td className="py-3 px-3 text-right font-mono text-blue-700">{formatRupiah(reportTotalMasuk)}</td>
                            <td className="py-3 px-3 text-right font-mono text-rose-700">{formatRupiah(reportTotalKeluar)}</td>
                            <td
                              className={`py-3 px-3 text-right font-mono ${
                                reportTotalMasuk - reportTotalKeluar >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {formatRupiah(reportTotalMasuk - reportTotalKeluar)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-emerald-800">{formatRupiah(reportSaldoAkhir)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. TABEL RINCIAN PENERIMAAN KAS MASUK PERIODE */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Rincian Penerimaan Kas Masuk ({periodLabel})
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Daftar seluruh pembayaran iuran warga, sumbangan, donasi, dan penerimaan kas lainnya yang telah diverifikasi.
                      </p>
                    </div>
                    <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                      Total: {formatRupiah(reportTotalMasuk)}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">No</th>
                          <th className="py-2.5 px-3">Tanggal</th>
                          <th className="py-2.5 px-3">Sumber / Nama Warga</th>
                          <th className="py-2.5 px-3">Kategori</th>
                          <th className="py-2.5 px-3">Bulan Tagihan</th>
                          <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {reportIncomes.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400 text-xs italic">
                              Tidak ada data penerimaan kas masuk pada periode {periodLabel}.
                            </td>
                          </tr>
                        ) : (
                          reportIncomes.map((inc, idx) => (
                            <tr key={inc.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                              <td className="py-2 px-3 whitespace-nowrap text-slate-700 font-mono text-[11px]">
                                {inc.tanggal ? formatDateIndo(inc.tanggal) : '-'}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900">{inc.sumber || '-'}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                                  {inc.kategori || 'Iuran Bulanan'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-600 text-[11px]">
                                {Array.isArray(inc.bulan) ? inc.bulan.join(', ') : inc.bulan || '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-blue-700">
                                {formatRupiah(inc.nominal)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {reportIncomes.length > 0 && (
                        <tfoot className="bg-slate-50 font-black text-slate-900 border-t border-slate-200 text-xs">
                          <tr>
                            <td colSpan={5} className="py-2.5 px-3 text-right uppercase tracking-wider">
                              Subtotal Penerimaan Kas Masuk:
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                              {formatRupiah(reportTotalMasuk)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 6. TABEL RINCIAN PENGELUARAN KAS KELUAR PERIODE */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Rincian Pengeluaran Kas Keluar ({periodLabel})
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Daftar seluruh belanja operasional lingkungan, keamanan, sampah, perawatan fasilitas, dan kasbon petugas.
                      </p>
                    </div>
                    <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full">
                      Total: {formatRupiah(reportTotalKeluar)}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12">No</th>
                          <th className="py-2.5 px-3">Tanggal</th>
                          <th className="py-2.5 px-3">Kategori Pengeluaran</th>
                          <th className="py-2.5 px-3">Penerima / Pihak Terkait</th>
                          <th className="py-2.5 px-3">Keterangan / Keperluan</th>
                          <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {reportExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400 text-xs italic">
                              Tidak ada data pengeluaran kas pada periode {periodLabel}.
                            </td>
                          </tr>
                        ) : (
                          reportExpenses.map((exp, idx) => (
                            <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                              <td className="py-2 px-3 whitespace-nowrap text-slate-700 font-mono text-[11px]">
                                {exp.tanggal ? formatDateIndo(exp.tanggal) : '-'}
                              </td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                                  {exp.kategori || 'Operasional'}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-900">{exp.penerima || '-'}</td>
                              <td className="py-2 px-3 text-slate-600 text-[11px] max-w-xs truncate" title={exp.keterangan}>
                                {exp.keterangan || '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                                {formatRupiah(exp.nominal)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {reportExpenses.length > 0 && (
                        <tfoot className="bg-slate-50 font-black text-slate-900 border-t border-slate-200 text-xs">
                          <tr>
                            <td colSpan={5} className="py-2.5 px-3 text-right uppercase tracking-wider">
                              Subtotal Pengeluaran Kas Keluar:
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                              {formatRupiah(reportTotalKeluar)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 7. BAGIAN TANDA TANGAN 3 PENGURUS RT (BREAK-INSIDE-AVOID UNTUK PRINT) */}
                <div className="pt-6 border-t-2 border-slate-200 break-inside-avoid space-y-6">
                  <div className="text-right text-xs text-slate-600">
                    Bekasi, <span className="font-semibold text-slate-800">{formatDateIndo(new Date().toISOString().slice(0, 10))}</span>
                  </div>

                  <div className="text-center">
                    <p className="text-xs uppercase font-extrabold text-slate-700 tracking-wider">
                      PENGURUS RT 011 / RW 028 CLUSTER CLEOPATRA
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mengetahui dan Mengesahkan Laporan Keuangan Kas Lingkungan
                    </p>
                  </div>

                  {/* 3 Kolom Tanda Tangan */}
                  <div className="grid grid-cols-3 gap-4 text-center pt-2">
                    {/* Bendahara */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold text-slate-700">Bendahara RT 011</div>
                      <div className="h-24 sm:h-28 flex items-end justify-center w-full">
                        <div className="w-36 sm:w-44 border-b-2 border-slate-800" />
                      </div>
                      <div className="text-xs sm:text-sm font-black text-slate-900 mt-1">
                        Eri Raihanul Firdaus
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Pengelola Keuangan & Kas RT</div>
                    </div>

                    {/* Sekretaris */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold text-slate-700">Sekretaris RT 011</div>
                      <div className="h-24 sm:h-28 flex items-end justify-center w-full">
                        <div className="w-36 sm:w-44 border-b-2 border-slate-800" />
                      </div>
                      <div className="text-xs sm:text-sm font-black text-slate-900 mt-1">
                        Aris Setiawan
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Administrasi & Pencatatan</div>
                    </div>

                    {/* Ketua RT */}
                    <div className="flex flex-col items-center">
                      <div className="text-xs font-bold text-slate-700">Ketua RT 011 / RW 028</div>
                      <div className="h-24 sm:h-28 flex items-end justify-center w-full">
                        <div className="w-36 sm:w-44 border-b-2 border-slate-800" />
                      </div>
                      <div className="text-xs sm:text-sm font-black text-slate-900 mt-1">
                        Firmansyah
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">Penanggung Jawab Lingkungan</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 text-center pt-4 border-t border-slate-100">
                    Dokumen ini digenerate secara otomatis dari Sistem Aplikasi Manajemen & Transparansi Iuran Kas Warga IPL Cleopatra.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 8: PENGATURAN RT */}
        {activeTab === 'pengaturan' && settings && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pengaturan & Konfigurasi RT</h1>
              <p className="text-xs text-slate-500">
                Atur informasi identitas RT, nomor rekening pembayaran, kontak WhatsApp bendahara, dan password admin.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Komplek / Perumahan</label>
                  <input
                    type="text"
                    value={settings.namaKomplek}
                    onChange={(e) => setSettings({ ...settings, namaKomplek: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Identitas RT / RW</label>
                  <input
                    type="text"
                    value={settings.namaRt}
                    onChange={(e) => setSettings({ ...settings, namaRt: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Bank Transfer</label>
                  <input
                    type="text"
                    value={settings.namaBank}
                    onChange={(e) => setSettings({ ...settings, namaBank: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Rekening Kas</label>
                  <input
                    type="text"
                    value={settings.nomorRekening}
                    onChange={(e) => setSettings({ ...settings, nomorRekening: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Atas Nama Rekening</label>
                  <input
                    type="text"
                    value={settings.atasNama}
                    onChange={(e) => setSettings({ ...settings, atasNama: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">No. WhatsApp Bendahara / Admin</label>
                  <input
                    type="text"
                    value={settings.nomorWaAdmin}
                    onChange={(e) => setSettings({ ...settings, nomorWaAdmin: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password / PIN Admin</label>
                  <input
                    type="text"
                    value={settings.adminPin}
                    onChange={(e) => setSettings({ ...settings, adminPin: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Saldo Awal Kas RT (Rp)</label>
                <input
                  type="number"
                  value={settings.saldoAwal}
                  onChange={(e) => setSettings({ ...settings, saldoAwal: Number(e.target.value) })}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pesan Pengumuman untuk Warga</label>
                <textarea
                  rows={2}
                  value={settings.pesanPengumuman}
                  onChange={(e) => setSettings({ ...settings, pesanPengumuman: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Folder Penyimpanan Google Drive</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Link Folder Utama Google Drive
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        value={settings.linkFolderUtamaDrive || ''}
                        onChange={(e) => setSettings({ ...settings, linkFolderUtamaDrive: e.target.value })}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                      />
                      {settings.linkFolderUtamaDrive && (
                        <a
                          href={settings.linkFolderUtamaDrive}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0"
                          title="Buka Folder Drive"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Link Folder Penyimpanan Bukti & Struk
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        value={settings.linkPenyimpananBuktiDrive || ''}
                        onChange={(e) => setSettings({ ...settings, linkPenyimpananBuktiDrive: e.target.value })}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300"
                      />
                      {settings.linkPenyimpananBuktiDrive && (
                        <a
                          href={settings.linkPenyimpananBuktiDrive}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200"
                          title="Buka Folder Penyimpanan Bukti"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Link ini dicatat di sheet <strong>buktistruk</strong> sebagai acuan link penyimpanan berkas.
                    </p>
                  </div>

                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      URL Web App Google Apps Script (Auto-Upload ke Drive)
                    </label>
                    <input
                      type="url"
                      value={settings.googleDriveWebhookUrl || ''}
                      onChange={(e) => setSettings({ ...settings, googleDriveWebhookUrl: e.target.value })}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 font-mono"
                    />
                    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Target Folder Drive: 1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB
                        </span>
                        <a
                          href="https://script.google.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span>Buka script.google.com</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        File skrip siap pakai telah dibuat di folder proyek: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-800">google_apps_script_code.js</code>. Tempel kodenya ke Apps Script, klik Deploy sebagai Web App, lalu masukkan tautan URL-nya di atas.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
              >
                Simpan Perubahan
              </button>
            </form>
          </div>
        )}

        {/* TAB: TUNGGAKAN LAMA */}
        {activeTab === 'tunggakan' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Data Tunggakan Lama Warga</h1>
                <p className="text-xs text-slate-500">
                  Daftar tunggakan iuran dari kepengurusan periode sebelumnya (Google Sheet: TunggakanLama).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hidden sm:inline-block">
                  Sumber: Google Sheet <strong>TunggakanLama</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetAddTunggakanForm();
                    setShowAddTunggakanModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Catatan Tunggakan</span>
                </button>
              </div>
            </div>

            {/* Rekap Ringkas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-medium text-slate-500">Total Warga Menunggak</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{tunggakanLama.length} Rumah</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  <span className="font-semibold text-slate-700">{tunggakanLama.filter((t) => !isPindahOrNonWarga(t)).length}</span> Warga Aktif •{' '}
                  <span className="font-bold text-amber-700">{tunggakanLama.filter((t) => isPindahOrNonWarga(t)).length}</span> Bekas Warga (Pindah)
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-xs">
                <div className="text-xs font-bold text-amber-700">Belum Lunas</div>
                <div className="text-2xl font-black text-amber-700 mt-1">
                  {tunggakanLama.filter((t) => t.status === 'Belum Lunas').length} Rumah
                </div>
                <div className="text-[11px] text-amber-600 mt-0.5">Memerlukan penagihan lanjutan</div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-xs">
                <div className="text-xs font-bold text-rose-700">Total Nominal Tunggakan</div>
                <div className="text-2xl font-black text-rose-700 mt-1">
                  {formatRupiah(
                    tunggakanLama
                      .filter((t) => t.status === 'Belum Lunas')
                      .reduce((sum, t) => sum + t.jumlah, 0)
                  )}
                </div>
                <div className="text-[11px] text-rose-500 mt-0.5">Total piutang kas RT belum tertagih</div>
              </div>
            </div>

            {/* Tabel Tunggakan */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="Cari nama warga / blok..."
                    value={tunggakanSearch}
                    onChange={(e) => setTunggakanSearch(e.target.value)}
                    className="w-full sm:max-w-xs text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {/* Filter Kategori Warga */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTunggakanCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        tunggakanCategoryFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Semua ({tunggakanLama.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTunggakanCategoryFilter('warga')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        tunggakanCategoryFilter === 'warga'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Warga Aktif ({tunggakanLama.filter((t) => !isPindahOrNonWarga(t)).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTunggakanCategoryFilter('pindah')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        tunggakanCategoryFilter === 'pindah'
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : 'text-amber-700 hover:text-amber-900'
                      }`}
                    >
                      Bekas Warga / Pindah ({tunggakanLama.filter((t) => isPindahOrNonWarga(t)).length})
                    </button>
                  </div>
                </div>

                <span className="text-xs text-slate-500 font-medium">
                  Menampilkan{' '}
                  {
                    tunggakanLama
                      .filter((t) => {
                        const nama = (t.namaWarga || (t as any).nama || '').toLowerCase();
                        const blok = (t.blok || '').toLowerCase();
                        const q = tunggakanSearch.toLowerCase();
                        if (q && !nama.includes(q) && !blok.includes(q)) return false;
                        if (tunggakanCategoryFilter === 'warga') return !isPindahOrNonWarga(t);
                        if (tunggakanCategoryFilter === 'pindah') return isPindahOrNonWarga(t);
                        return true;
                      }).length
                  }{' '}
                  data
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Tanggal Catat</th>
                      <th className="py-3.5 px-4">Nama Warga</th>
                      <th className="py-3.5 px-4">Periode Menunggak</th>
                      <th className="py-3.5 px-4">Tunggakan Awal</th>
                      <th className="py-3.5 px-4">Sudah Masuk Kas</th>
                      <th className="py-3.5 px-4">Sisa Piutang</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center w-48 min-w-[190px]">Aksi Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tunggakanLama
                      .filter((t) => {
                        const nama = (t.namaWarga || (t as any).nama || '').toLowerCase();
                        const blok = (t.blok || '').toLowerCase();
                        const q = tunggakanSearch.toLowerCase();
                        if (q && !nama.includes(q) && !blok.includes(q)) return false;
                        if (tunggakanCategoryFilter === 'warga') return !isPindahOrNonWarga(t);
                        if (tunggakanCategoryFilter === 'pindah') return isPindahOrNonWarga(t);
                        return true;
                      })
                      .map((t) => {
                        const nama = t.namaWarga || (t as any).nama || 'Warga';
                        const awal = t.nominalAwal || (t.jumlah + (t.terbayar || 0));
                        const bayar = t.terbayar || 0;
                        const sisa = t.jumlah;
                        const isLunas = t.status === 'Lunas' || sisa === 0;
                        const isDicicil = !isLunas && bayar > 0;
                        const isPindah = isPindahOrNonWarga(t);

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-4 font-medium text-slate-600">{formatDateIndo(t.tanggal)}</td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{nama}</div>
                              {t.blok && (
                                <div className="text-[11px] text-slate-500 font-medium">Blok: {t.blok}</div>
                              )}
                              {isPindah ? (
                                <div className="mt-1 flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 w-fit">
                                    <Building2 className="w-3 h-3 text-amber-600" />
                                    <span>Bekas Warga (Pindah Rumah)</span>
                                  </span>
                                  {t.catatanPindah && (
                                    <span className="text-[10px] text-slate-500 italic max-w-xs truncate" title={t.catatanPindah}>
                                      {t.catatanPindah}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-block text-[10px] text-emerald-700 font-medium mt-0.5">
                                  Warga Aktif RT
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {t.keterangan || (t as any).bulanTunggakan || ((t as any).bulanList?.join(', ')) || '-'}
                            </td>
                            <td className="py-3 px-4 text-slate-500 font-semibold">
                              {formatRupiah(awal)}
                            </td>
                            <td className="py-3 px-4 font-bold text-emerald-700">
                              {bayar > 0 ? formatRupiah(bayar) : '-'}
                            </td>
                            <td className="py-3 px-4 font-black text-rose-600 text-sm">
                              {isLunas ? 'Rp 0' : formatRupiah(sisa)}
                            </td>
                            <td className="py-3 px-4">
                              {isLunas ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Lunas
                                </span>
                              ) : isDicicil ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                  Dicicil
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Belum Lunas
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center w-48 min-w-[200px]">
                              <div className="flex items-center justify-center gap-1.5 mx-auto">
                                {!isLunas && (
                                  <button
                                    onClick={() => handleOpenTunggakanBayarModal(t)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                                    title="Catat Pembayaran Cicilan atau Cash / Lunas"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Bayar / Cicil</span>
                                  </button>
                                )}
                                {(t.riwayatPembayaran?.length || 0) > 0 && (
                                  <button
                                    onClick={() => setShowTunggakanHistoryModal(t)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-200 cursor-pointer active:scale-95"
                                    title="Lihat Riwayat Cicilan"
                                  >
                                    Riwayat ({t.riwayatPembayaran?.length})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTunggakan(t)}
                                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer active:scale-95"
                                  title="Hapus Data Catatan Tunggakan Ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: DATA KASBON */}
        {activeTab === 'kasbon' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Data Kasbon Petugas / Pengurus</h1>
                <p className="text-xs text-slate-500">
                  Catatan pinjaman kasbon aktif petugas keamanan/kebersihan RT (Google Sheet: DataKasbon).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl hidden sm:inline-block">
                  Sumber: Google Sheet <strong>DataKasbon</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewKasbonNama('');
                    setNewKasbonNominal('');
                    setNewKasbonKeterangan('Keluarga / Keperluan Mendesak');
                    setNewKasbonTanggal(new Date().toISOString().slice(0, 10));
                    setShowAddKasbonModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Catat Kasbon Baru</span>
                </button>
              </div>
            </div>

            {/* Rekap Ringkas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-medium text-slate-500">Total Catatan Kasbon</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{kasbon.length} Catatan</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Pinjaman petugas terdaftar</div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-cyan-200 bg-cyan-50/30 shadow-xs">
                <div className="text-xs font-bold text-cyan-700">Kasbon Belum Lunas</div>
                <div className="text-2xl font-black text-cyan-700 mt-1">
                  {kasbon.filter((k) => k.status === 'Belum Lunas').length} Orang
                </div>
                <div className="text-[11px] text-cyan-600 mt-0.5">Sisa pinjaman yang berjalan</div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-xs">
                <div className="text-xs font-bold text-rose-700">Total Nominal Kasbon Aktif</div>
                <div className="text-2xl font-black text-rose-700 mt-1">
                  {formatRupiah(
                    kasbon
                      .filter((k) => k.status === 'Belum Lunas')
                      .reduce((sum, k) => sum + k.nominal, 0)
                  )}
                </div>
                <div className="text-[11px] text-rose-500 mt-0.5">Total dana kas RT yang terpinjam</div>
              </div>
            </div>

            {/* Tabel Kasbon */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Cari nama peminjam atau keperluan..."
                  value={kasbonSearch}
                  onChange={(e) => setKasbonSearch(e.target.value)}
                  className="w-full sm:max-w-xs text-xs px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-xs text-slate-500 font-medium">
                  Menampilkan{' '}
                  {
                    kasbon.filter((k) => {
                      const nama = k.namaPeminjam || (k as any).nama || '';
                      return (
                        nama.toLowerCase().includes(kasbonSearch.toLowerCase()) ||
                        k.keterangan.toLowerCase().includes(kasbonSearch.toLowerCase())
                      );
                    }).length
                  }{' '}
                  data
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Tanggal Pinjam</th>
                      <th className="py-3.5 px-4">Nama Petugas</th>
                      <th className="py-3.5 px-4">Keperluan / Keterangan</th>
                      <th className="py-3.5 px-4">Pinjaman Awal</th>
                      <th className="py-3.5 px-4">Sudah Dikembalikan</th>
                      <th className="py-3.5 px-4">Sisa Kasbon</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-center w-48 min-w-[190px]">Aksi Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kasbon
                      .filter((k) => {
                        const nama = k.namaPeminjam || (k as any).nama || '';
                        return (
                          nama.toLowerCase().includes(kasbonSearch.toLowerCase()) ||
                          k.keterangan.toLowerCase().includes(kasbonSearch.toLowerCase())
                        );
                      })
                      .map((k) => {
                        const nama = k.namaPeminjam || (k as any).nama || 'Petugas';
                        const tgl = k.tglBackdate || k.timestamp || (k as any).tanggal || '';
                        const awal = k.nominalAwal || (k.nominal + (k.terbayar || 0));
                        const bayar = k.terbayar || 0;
                        const sisa = k.nominal;
                        const isLunas = k.status === 'Lunas' || sisa === 0;
                        const isDicicil = !isLunas && bayar > 0;

                        return (
                          <tr key={k.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-4 font-medium text-slate-600">{formatDateIndo(tgl)}</td>
                            <td className="py-3 px-4 font-bold text-slate-900">{nama}</td>
                            <td className="py-3 px-4 text-slate-700 font-medium">{k.keterangan}</td>
                            <td className="py-3 px-4 text-slate-500 font-semibold">
                              {formatRupiah(awal)}
                            </td>
                            <td className="py-3 px-4 font-bold text-emerald-700">
                              {bayar > 0 ? formatRupiah(bayar) : '-'}
                            </td>
                            <td className="py-3 px-4 font-black text-rose-600 text-sm">
                              {isLunas ? 'Rp 0' : formatRupiah(sisa)}
                            </td>
                            <td className="py-3 px-4">
                              {isLunas ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Lunas
                                </span>
                              ) : isDicicil ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                  Dicicil
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">
                                  Belum Lunas
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center w-48 min-w-[200px]">
                              <div className="flex items-center justify-center gap-1.5 mx-auto">
                                {!isLunas && (
                                  <button
                                    onClick={() => handleOpenKasbonBayarModal(k)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                                    title="Catat Pengembalian (Cicilan atau Cash / Lunas)"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Bayar / Angsur</span>
                                  </button>
                                )}
                                {(k.riwayatPembayaran?.length || 0) > 0 && (
                                  <button
                                    onClick={() => setShowKasbonHistoryModal(k)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition border border-slate-200 cursor-pointer active:scale-95"
                                    title="Lihat Riwayat Angsuran"
                                  >
                                    Riwayat ({k.riwayatPembayaran?.length})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteKasbon(k)}
                                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer active:scale-95"
                                  title="Hapus Data Catatan Kasbon Ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL VERIFIKASI BUKTI DETAIL */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative max-h-[95vh] overflow-y-auto">
            <button
              onClick={() => setSelectedProof(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              ✕
            </button>

            <h3 className="font-extrabold text-slate-900 text-base mb-1">
              Verifikasi Bukti Transfer Warga
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Nomor Tiket: <span className="font-mono font-bold text-slate-800">{selectedProof.id}</span>
            </p>

            {/* Folder Google Drive Reference */}
            <div className="flex items-center justify-between p-2.5 mb-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs">
              <span className="text-slate-600 font-medium">Folder Penyimpanan Google Drive:</span>
              <a
                href="https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold hover:underline"
              >
                <span>Buka Folder Drive Bukti</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Proof Image Box */}
            {(selectedProof.buktiUrl || selectedProof.driveUrl) && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 mb-4 flex flex-col items-center p-3">
                <img
                  src={toDirectImg(selectedProof.buktiUrl || selectedProof.driveUrl)}
                  alt="Bukti Transfer"
                  className="max-h-80 w-auto object-contain rounded-xl shadow"
                />
                <a
                  href={selectedProof.driveUrl || selectedProof.buktiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Foto Asli di Google Drive</span>
                </a>
              </div>
            )}

            {/* Resident Details */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-2.5 mb-5">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Warga:</span>
                <span className="font-bold text-slate-900">{selectedProof.residentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Blok Rumah:</span>
                <span className="font-bold text-slate-900">{selectedProof.blok}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nomor WhatsApp:</span>
                <span className="font-bold text-slate-900">{selectedProof.hp || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bulan yang Dibayar:</span>
                <span className="font-bold text-slate-900">{selectedProof.bulan?.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal Transfer:</span>
                <span className="font-black text-emerald-700 text-sm">{formatRupiah(selectedProof.nominal)}</span>
              </div>
              {selectedProof.catatanWarga && (
                <div className="pt-2 border-t border-slate-200 text-slate-600">
                  <span className="text-slate-500 block mb-0.5">Catatan Warga:</span>
                  <span className="italic">{selectedProof.catatanWarga}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {selectedProof.status === 'Menunggu Verifikasi' && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleApproveProof(selectedProof)}
                    disabled={isVerifying}
                    className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Setujui (Kas Masuk)</span>
                  </button>

                  <button
                    onClick={() => handleRejectProof(selectedProof)}
                    disabled={isVerifying}
                    className="py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Tolak Bukti</span>
                  </button>
                </div>
              )}

              {selectedProof.status === 'Terverifikasi' && (
                <div className="flex flex-col sm:flex-row gap-2">
                  {(() => {
                    const resident = residents.find(
                      (r) => r.id === selectedProof.residentId || r.nama.toLowerCase() === selectedProof.residentName.toLowerCase()
                    );
                    const targetHp = selectedProof.hp || resident?.hp;
                    if (!targetHp) return null;

                    const periodeStr = selectedProof.bulan && selectedProof.bulan.length > 0
                      ? selectedProof.bulan.join(', ')
                      : (settings?.periodeAktif || '2026-11');

                    const waMsg = `Assalamualaikum, Bapak/Ibu ${selectedProof.residentName}.\n\nKami informasikan pembayaran iuran RT 011 / RW 028 sudah *diterima dan diverifikasi*.\n\n*Rincian pembayaran:*\nNama: ${selectedProof.residentName}\nBlok: ${selectedProof.blok}\nKategori: ${selectedProof.kategori || 'Iuran Bulanan'}\nPeriode: ${periodeStr}\nNominal: ${formatRupiah(selectedProof.nominal)}\nStatus: *Terverifikasi*\n\nTerima kasih atas pembayarannya.\nPengurus RT 011 / RW 028`;

                    return (
                      <a
                        href={createWaLink(targetHp, waMsg)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Kirim WA Konfirmasi Lunas</span>
                      </a>
                    );
                  })()}
                  <button
                    onClick={() => handleCancelProof(selectedProof)}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                  >
                    Batalkan Verifikasi
                  </button>
                </div>
              )}

              {selectedProof.status === 'Ditolak' && (
                <button
                  onClick={() => handleCancelProof(selectedProof)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                >
                  Kembalikan ke Antrean Verifikasi
                </button>
              )}

              <div className="pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleDeleteProof(selectedProof)}
                  disabled={isVerifying}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition flex items-center justify-center gap-1.5 border border-red-200"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Bukti Ini (Transaksi Salah)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATAT PENGELUARAN */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowExpenseModal(false);
                resetExpenseForm();
              }}
              className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              ✕
            </button>

            <h3 className="font-extrabold text-slate-900 text-base mb-1">Catat Pengeluaran Kas RT</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pengeluaran yang dicatat di sini otomatis mengurangi total saldo kas RT.
            </p>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={newExpenseDate}
                    onChange={(e) => setNewExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value as 'Fixed' | 'Variabel')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                  >
                    <option value="Fixed">Fixed</option>
                    <option value="Variabel">Variabel</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nominal Pengeluaran (Rp)</label>
                <input
                  type="number"
                  required
                  placeholder="Contoh: 350000"
                  value={newExpenseNominal}
                  onChange={(e) => setNewExpenseNominal(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-rose-700"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Penerima / Toko</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pak Slamet (Satpam) / Toko Listrik Sinar"
                  value={newExpenseRecipient}
                  onChange={(e) => setNewExpenseRecipient(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Keterangan Rincian Pengeluaran</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Contoh: Pembelian lampu LED sorot pos gerbang utama 2 pcs"
                  value={newExpenseDesc}
                  onChange={(e) => setNewExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Foto Struk / Nota (Opsional)</label>
                  {newExpenseReceipt && (
                    <button
                      type="button"
                      onClick={handleClearExpenseReceipt}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus Foto</span>
                    </button>
                  )}
                </div>

                <input
                  ref={expenseFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNewExpenseReceiptFileName(file.name);
                    const reader = new FileReader();
                    reader.onload = () => setNewExpenseReceipt(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                  className={`w-full text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer ${
                    newExpenseReceipt ? 'hidden' : 'block'
                  }`}
                />

                {newExpenseReceipt && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={newExpenseReceipt}
                        alt="Preview Nota"
                        className="w-12 h-12 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {newExpenseReceiptFileName || 'Foto struk / nota'}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3 inline" />
                          Foto struk siap diunggah
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => expenseFileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition"
                      >
                        Ganti File
                      </button>
                      <button
                        type="button"
                        onClick={handleClearExpenseReceipt}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold text-rose-600 transition flex items-center gap-1"
                        title="Batalkan foto yang salah upload"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>Batal</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Status Sinkronisasi Google Drive */}
                {settings?.googleDriveWebhookUrl ? (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[11px] text-emerald-800">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Webhook Drive Aktif: Foto otomatis diunggah ke Google Drive BuktiFoto</span>
                    </div>
                    <a
                      href="https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 hover:text-emerald-900 font-bold inline-flex items-center gap-1 hover:underline shrink-0"
                    >
                      <span>Buka Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Webhook Drive Belum Dikonfigurasi
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowExpenseModal(false);
                          setActiveTab('pengaturan');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer text-[10.5px]"
                      >
                        Atur di Pengaturan RT &rarr;
                      </button>
                    </div>
                    <p className="text-amber-700 leading-relaxed text-[10.5px]">
                      Foto struk tetap aman tersimpan internal di sistem. Agar otomatis masuk ke folder Google Drive <strong>BuktiFoto</strong>, masukkan URL Web App Google Apps Script di tab <strong>Pengaturan RT</strong>.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition mt-2 shadow-sm"
              >
                Simpan Transaksi Pengeluaran
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU STRUK PENGELUARAN */}
      {selectedExpenseReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col">
            <button
              onClick={() => setSelectedExpenseReceipt(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <Coins className="w-5 h-5 text-rose-600" />
                <span>Bukti Struk / Nota Pengeluaran</span>
              </h3>
              <p className="text-xs text-slate-500">
                ID Transaksi: <span className="font-mono font-bold text-slate-800">{selectedExpenseReceipt.id}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {selectedExpenseReceipt.buktiUrl ? (
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-900/5 flex items-center justify-center min-h-[220px] max-h-[360px] p-2">
                  <img
                    src={selectedExpenseReceipt.buktiUrl}
                    alt={`Struk ${selectedExpenseReceipt.keterangan}`}
                    className="max-h-[340px] w-auto max-w-full object-contain rounded-xl shadow-sm"
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  Tidak ada foto struk yang terlampir
                </div>
              )}

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-2">
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Tanggal Pengeluaran:</span>
                  <span className="font-bold text-slate-900">{formatDateIndo(selectedExpenseReceipt.tanggal)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Penerima / Toko:</span>
                  <span className="font-bold text-slate-900">{selectedExpenseReceipt.penerima}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Kategori:</span>
                  <span className="font-semibold px-2 py-0.5 rounded text-[11px] bg-slate-200 text-slate-700">
                    {selectedExpenseReceipt.kategori}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500">Nominal:</span>
                  <span className="font-black text-rose-600 text-sm">- {formatRupiah(selectedExpenseReceipt.nominal)}</span>
                </div>
                <div className="pt-0.5">
                  <span className="text-slate-500 block mb-0.5">Keterangan:</span>
                  <p className="font-semibold text-slate-800 bg-white p-2 rounded-lg border border-slate-200">
                    {selectedExpenseReceipt.keterangan || '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {selectedExpenseReceipt.buktiUrl && (
                  <a
                    href={selectedExpenseReceipt.buktiUrl}
                    download={`struk_${selectedExpenseReceipt.id}.png`}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Gambar</span>
                  </a>
                )}
                {selectedExpenseReceipt.driveUrl ? (
                  <a
                    href={selectedExpenseReceipt.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka File di Drive</span>
                  </a>
                ) : (
                  <a
                    href="https://drive.google.com/drive/folders/1vtrUVcUZ_gnrF638A9B9DzmiTwPzp8CB"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Folder Drive Bukti</span>
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpenseReceipt(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shrink-0"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CATAT PEMASUKAN MANUAL */}
      {showIncomeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowIncomeModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Tutup"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="font-extrabold text-slate-900 text-base">Catat Kas Masuk Manual</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gunakan formulir ini untuk mencatat pembayaran iuran tunai warga, THR, kegiatan, atau donasi langsung.
              </p>
            </div>

            <form onSubmit={handleCreateIncome} className="space-y-4 text-xs">
              {/* BARIS 1: TANGGAL & KATEGORI IURAN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanggal Transaksi</label>
                  <input
                    type="date"
                    required
                    value={newIncomeDate}
                    onChange={(e) => setNewIncomeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Pilihan Kategori Iuran / Pemasukan</label>
                  <select
                    value={newIncomeCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {KATEGORI_INCOME_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* BARIS 2: NAMA WARGA (DROPDOWN SEARCH) & BLOK RUMAH OTOMATIS */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    {isManualNonWarga ? 'Nama Pembayar / Pihak Luar' : 'Identitas Warga Pembayar'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualNonWarga(!isManualNonWarga);
                      setNewIncomeResidentId('');
                      setNewIncomeNama('');
                      setNewIncomeBlok('');
                      setWargaIncomeSearch('');
                    }}
                    className="text-[11px] text-emerald-600 hover:underline font-semibold"
                  >
                    {isManualNonWarga ? '← Pilih dari Daftar Warga RT' : '+ Pembayar Luar (Bukan Warga)'}
                  </button>
                </div>

                {!isManualNonWarga ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Kolom Nama Warga (Dropdown Search) */}
                    <div className="sm:col-span-2 relative">
                      <div className="relative">
                        <input
                          type="text"
                          required
                          placeholder="Ketik untuk cari nama warga atau blok..."
                          value={wargaIncomeSearch}
                          onFocus={() => setIsWargaDropdownOpen(true)}
                          onChange={(e) => {
                            setWargaIncomeSearch(e.target.value);
                            setNewIncomeNama(e.target.value);
                            setIsWargaDropdownOpen(true);
                          }}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Dropdown List Warga */}
                      {isWargaDropdownOpen && (
                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                          {residents
                            .filter((r) => {
                              if (!wargaIncomeSearch.trim()) return true;
                              const q = wargaIncomeSearch.toLowerCase();
                              return (
                                r.nama.toLowerCase().includes(q) ||
                                r.blok.toLowerCase().includes(q)
                              );
                            })
                            .slice(0, 30)
                            .map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => handleSelectIncomeResident(r)}
                                className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between text-xs transition"
                              >
                                <div>
                                  <span className="font-bold text-slate-900">{r.nama}</span>
                                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                    Blok: {r.blok}
                                  </span>
                                </div>
                                <span className="font-bold text-emerald-700 text-[11px]">
                                  {formatRupiah(r.tarif || 150000)}/bln
                                </span>
                              </button>
                            ))}
                          {residents.filter((r) => {
                            if (!wargaIncomeSearch.trim()) return true;
                            const q = wargaIncomeSearch.toLowerCase();
                            return (
                              r.nama.toLowerCase().includes(q) ||
                              r.blok.toLowerCase().includes(q)
                            );
                          }).length === 0 && (
                            <div className="px-3 py-3 text-center text-slate-400 text-xs">
                              Warga tidak ditemukan
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Kolom Blok / No Rumah (Muncul Otomatis) */}
                    <div>
                      <input
                        type="text"
                        readOnly
                        placeholder="Blok otomatis..."
                        value={newIncomeBlok ? `Blok: ${newIncomeBlok}` : ''}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 font-bold cursor-default"
                        title="Blok dan nomor rumah terisi otomatis saat nama warga dipilih"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Nama Pembayar / Donatur luar..."
                        value={newIncomeNama}
                        onChange={(e) => setNewIncomeNama(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Alamat / Instansi / Keterangan..."
                        value={newIncomeBlok}
                        onChange={(e) => setNewIncomeBlok(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* BARIS 3: PERIODE PILIHAN BAYAR (BISA 1 BULAN, 2 BULAN, DST) */}
              {newIncomeCategory === 'Iuran Bulanan' && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="font-bold text-slate-800">
                      Periode Bulan yang Dibayar ({newIncomeMonths.length} Bulan Terpilih)
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">Cepat:</span>
                      {[1, 2, 3, 6, 12].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleQuickMonthSelect(cnt)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition border ${
                            newIncomeMonths.length === cnt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cnt === 12 ? '1 Thn' : `${cnt} Bln`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Multi-Select Pills Bulan */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                    {BULAN_OPTIONS.map((m) => {
                      const isSelected = newIncomeMonths.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleToggleIncomeMonth(m)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold text-center transition border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {m.replace(' 2026', '')}
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-[11px] text-slate-500 pt-1 flex justify-between items-center">
                    <span>
                      Bulan terpilih: <span className="font-bold text-slate-800">{newIncomeMonths.join(', ')}</span>
                    </span>
                    <span className="text-emerald-700 font-bold">
                      {formatRupiah(newIncomeTarif)} x {newIncomeMonths.length} bln
                    </span>
                  </div>
                </div>
              )}

              {/* BARIS 4: NOMINAL & CATATAN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Total Nominal Kas Masuk (Rp)</label>
                  <input
                    type="number"
                    required
                    placeholder="150000"
                    value={newIncomeNominal}
                    onChange={(e) => setNewIncomeNominal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-emerald-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {newIncomeCategory === 'Iuran Bulanan' && (
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Otomatis terkalkulasi ({newIncomeMonths.length} bulan x {formatRupiah(newIncomeTarif)})
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Titip tunai di pos ronda / bendahara"
                    value={newIncomeNote}
                    onChange={(e) => setNewIncomeNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Transaksi Kas Masuk</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT WARGA */}
      {showResidentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowResidentModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              ✕
            </button>

            <h3 className="font-extrabold text-slate-900 text-base mb-1">
              {editingResident ? 'Edit Data Warga' : 'Tambah Warga Baru'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Informasi data warga penghuni rumah cluster.</p>

            <form onSubmit={handleSaveResident} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Kepala Keluarga / Warga</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={resNama}
                  onChange={(e) => setResNama(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Blok / Nomor Rumah</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: A1/02"
                    value={resBlok}
                    onChange={(e) => setResBlok(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tarif Iuran (Rp/bln)</label>
                  <input
                    type="number"
                    required
                    value={resTarif}
                    onChange={(e) => setResTarif(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nomor WhatsApp</label>
                <input
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={resHp}
                  onChange={(e) => setResHp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status Hunian</label>
                <select
                  value={resStatus}
                  onChange={(e) => setResStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Aktif">Aktif (Dihuni)</option>
                  <option value="Nonaktif">Nonaktif (Rumah Kosong)</option>
                  <option value="Pindah">Pindah</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition mt-2 shadow-sm"
              >
                Simpan Data Warga
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TUTUP BUKU & PINDAH BULAN */}
      {showRolloverModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative max-h-[95vh] overflow-y-auto">
            <button
              onClick={() => setShowRolloverModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Tutup Buku & Pindah Bulan
                </h3>
                <p className="text-xs text-slate-500">
                  Kalkulasi saldo akhir bulan berjalan dan bawa otomatis menjadi saldo awal bulan baru.
                </p>
              </div>
            </div>

            {/* Rekap Kalkulasi Saldo Berdasarkan Periode Terpilih */}
            {(() => {
              const sourcePeriodLabel = getPeriodNameIndoHelper(rolloverSourcePeriod);
              const nextPeriodLabel = getPeriodNameIndoHelper(rolloverTargetMonth);

              // 1. Saldo Awal Periode yang Ditutup
              const histEntry = saldoAwalHistory.find((s) => s.periode === rolloverSourcePeriod);
              const calculatedSourceSaldoAwal = histEntry
                ? histEntry.jumlah
                : rolloverSourcePeriod === (settings?.periodeAktif || '2026-11')
                ? Number(settings?.saldoAwal) || 0
                : Number(settings?.saldoAwal) || 0;

              // 2. Pemasukan Sah Khusus Periode Terpilih
              const sourceIncomesTotal = incomes
                .filter((i) => {
                  if (i.status !== 'Sah') return false;
                  const bList = Array.isArray(i.bulan) ? i.bulan : i.bulan ? [i.bulan] : [];
                  if (bList.length > 0) {
                    return bList.some((b) => b.includes(rolloverSourcePeriod) || b.toLowerCase().includes(sourcePeriodLabel.toLowerCase()));
                  }
                  return Boolean(i.tanggal && i.tanggal.startsWith(rolloverSourcePeriod));
                })
                .reduce((sum, i) => sum + i.nominal, 0);

              // 3. Pengeluaran Sah Khusus Periode Terpilih
              const sourceExpensesTotal = expenses
                .filter((e) => e.status === 'Sah' && Boolean(e.tanggal && e.tanggal.startsWith(rolloverSourcePeriod)))
                .reduce((sum, e) => sum + e.nominal, 0);

              // 4. Saldo Akhir Periode Terpilih yang Otomatis Dimutasikan ke Periode Baru
              const calculatedSaldoAkhir = calculatedSourceSaldoAwal + sourceIncomesTotal - sourceExpensesTotal;
              const finalSaldoAwalBaru = rolloverCustomSaldo ? Number(rolloverCustomSaldo) : calculatedSaldoAkhir;

              // Daftar opsi bulan yang bisa ditutup
              const availablePeriodOptions = (dashboardData?.targetRealisasiIuran?.availablePeriods || [])
                .filter((p: any) => p.code !== 'ALL')
                .map((p: any) => ({ code: p.code, label: p.label }));

              // Pastikan rolloverSourcePeriod ada dalam opsi
              if (!availablePeriodOptions.some((p: any) => p.code === rolloverSourcePeriod)) {
                availablePeriodOptions.unshift({
                  code: rolloverSourcePeriod,
                  label: sourcePeriodLabel,
                });
              }

              return (
                <div className="space-y-4">
                  {/* Pilihan Periode Yang Ditutup */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <label className="block text-xs font-black text-slate-900 uppercase tracking-tight">
                          1. Pilih Periode Kas yang Ditutup & Dimutasikan
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Saldo akhir dari periode ini akan otomatis dimutasikan menjadi Saldo Awal bulan berikutnya.
                        </p>
                      </div>
                      <select
                        value={rolloverSourcePeriod}
                        onChange={(e) => handleSourcePeriodChange(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      >
                        {availablePeriodOptions.map((p: any) => (
                          <option key={p.code} value={p.code}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Breakdown Mutasi Saldo */}
                    <div className="p-3.5 rounded-xl bg-white border border-emerald-200 space-y-2 text-xs shadow-2xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Saldo Awal Periode ({sourcePeriodLabel}):</span>
                        <span className="font-bold text-slate-900">{formatRupiah(calculatedSourceSaldoAwal)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>+ Total Kas Masuk Periode ({sourcePeriodLabel}):</span>
                        <span className="font-bold">+{formatRupiah(sourceIncomesTotal)}</span>
                      </div>
                      <div className="flex justify-between text-rose-600">
                        <span>- Total Kas Keluar Periode ({sourcePeriodLabel}):</span>
                        <span className="font-bold">-{formatRupiah(sourceExpensesTotal)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-slate-900">
                        <span>= Saldo Akhir Mutasi (Saldo Awal Baru):</span>
                        <span className="text-emerald-700 text-base">{formatRupiah(calculatedSaldoAkhir)}</span>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={(e) => handleRolloverMonth(e, calculatedSaldoAkhir, calculatedSourceSaldoAwal)} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          2. Target Periode Baru (Bulan Berikutnya)
                        </label>
                        <input
                          type="text"
                          value={rolloverTargetMonth}
                          onChange={(e) => {
                            setRolloverTargetMonth(e.target.value);
                            setRolloverKeterangan(
                              `Saldo Awal Bulan ${getPeriodNameIndoHelper(e.target.value)} (Pindahan Kas ${sourcePeriodLabel})`
                            );
                          }}
                          placeholder="Contoh: 2026-12"
                          className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                          required
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Format: <code className="bg-slate-100 px-1 py-0.5 rounded">YYYY-MM</code> ({nextPeriodLabel})
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nominal Saldo Awal Baru (Rp)
                        </label>
                        <input
                          type="number"
                          value={rolloverCustomSaldo}
                          onChange={(e) => setRolloverCustomSaldo(e.target.value)}
                          placeholder={`Otomatis: ${calculatedSaldoAkhir}`}
                          className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Biarkan kosong untuk menggunakan hasil kalkulasi mutasi otomatis.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Keterangan Mutasi Saldo Awal Baru
                      </label>
                      <input
                        type="text"
                        value={rolloverKeterangan}
                        onChange={(e) => setRolloverKeterangan(e.target.value)}
                        placeholder="Contoh: Saldo Awal Bulan Desember 2026 (Pindahan Kas November 2026)"
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>

                    {/* Riwayat Saldo Awal */}
                    {saldoAwalHistory.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-slate-500" />
                          <span>Riwayat Saldo Awal Sebelumnya ({saldoAwalHistory.length})</span>
                        </div>
                        <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-[11px]">
                          {saldoAwalHistory.map((s) => (
                            <div key={s.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                              <div>
                                <span className="font-bold text-slate-800">{s.periode ? getPeriodNameIndoHelper(s.periode) : s.tanggal}</span>
                                <p className="text-[10px] text-slate-500">{s.keterangan}</p>
                              </div>
                              <span className="font-black text-emerald-700">{formatRupiah(s.jumlah)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowRolloverModal(false)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingRollover}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        {isSubmittingRollover ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Memproses Pindah Bulan...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Konfirmasi & Pindah Bulan ({nextPeriodLabel})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 1: BAYAR / CICIL TUNGGAKAN */}
      {selectedTunggakan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Bayar / Cicil Tunggakan Warga</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {selectedTunggakan.namaWarga} ({selectedTunggakan.blok || (selectedTunggakan as any).blokRumah || 'Blok -'})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTunggakan(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitTunggakanBayar} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Sisa Tunggakan Saat Ini</div>
                  <div className="text-base font-extrabold text-rose-600 mt-0.5">
                    {formatRupiah(selectedTunggakan.jumlah)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 font-medium">Telah Dicicil</div>
                  <div className="text-sm font-bold text-emerald-600 mt-0.5">
                    {formatRupiah(selectedTunggakan.terbayar || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Metode Pelunasan</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTunggakanBayarType('lunas');
                      setTunggakanBayarNominal(String(selectedTunggakan.jumlah));
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      tunggakanBayarType === 'lunas'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Lunas Penuh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTunggakanBayarType('cicil');
                      setTunggakanBayarNominal('');
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      tunggakanBayarType === 'cicil'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Cicil / Sebagian
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Pembayaran <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="1"
                    max={selectedTunggakan.jumlah}
                    value={tunggakanBayarNominal}
                    onChange={(e) => setTunggakanBayarNominal(e.target.value)}
                    placeholder="Contoh: 100000"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
                {tunggakanBayarNominal && Number(tunggakanBayarNominal) > 0 && (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1">
                    Sisa setelah bayar: {formatRupiah(Math.max(0, selectedTunggakan.jumlah - Number(tunggakanBayarNominal)))}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cara Bayar</label>
                  <select
                    value={tunggakanBayarMetode}
                    onChange={(e) => setTunggakanBayarMetode(e.target.value as 'Cash' | 'Transfer')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Cash">Cash / Tunai</option>
                    <option value="Transfer">Transfer Bank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={tunggakanBayarTanggal}
                    onChange={(e) => setTunggakanBayarTanggal(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
                <input
                  type="text"
                  value={tunggakanBayarCatatan}
                  onChange={(e) => setTunggakanBayarCatatan(e.target.value)}
                  placeholder="Contoh: Titip lewat satpam pos 1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-800 leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Dana pembayaran akan <strong>otomatis masuk ke Kas Masuk RT</strong> dan langsung menambah <strong>Saldo Kas Riil RT</strong>.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTunggakan(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTunggakanBayar}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmittingTunggakanBayar ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Pembayaran</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RIWAYAT PEMBAYARAN TUNGGAKAN */}
      {showTunggakanHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Riwayat Pembayaran Tunggakan</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  {showTunggakanHistoryModal.namaWarga} ({showTunggakanHistoryModal.blok || (showTunggakanHistoryModal as any).blokRumah || 'Blok -'})
                </p>
              </div>
              <button
                onClick={() => setShowTunggakanHistoryModal(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Total Dicicil / Bayar</div>
                  <div className="text-base font-extrabold text-emerald-600">
                    {formatRupiah(showTunggakanHistoryModal.terbayar || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Sisa Tunggakan</div>
                  <div className="text-base font-extrabold text-rose-600">
                    {formatRupiah(showTunggakanHistoryModal.jumlah)}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">Daftar Transaksi Pembayaran:</div>
                {(!showTunggakanHistoryModal.riwayatPembayaran || showTunggakanHistoryModal.riwayatPembayaran.length === 0) ? (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada riwayat pembayaran tercatat.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {showTunggakanHistoryModal.riwayatPembayaran.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800">{formatRupiah(item.nominal)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {formatDateIndo(item.tanggal)} • <span className="font-semibold text-emerald-700">{item.metode}</span>
                            {item.catatan && ` • "${item.catatan}"`}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          Kas Masuk
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowTunggakanHistoryModal(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: BAYAR / ANGSUR KASBON */}
      {selectedKasbon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-teal-50/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-xs">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Pengembalian / Angsur Kasbon</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{selectedKasbon.namaPeminjam}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedKasbon(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitKasbonBayar} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Sisa Kasbon Saat Ini</div>
                  <div className="text-base font-extrabold text-amber-600 mt-0.5">
                    {formatRupiah(selectedKasbon.nominal)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500 font-medium">Telah Dikembalikan</div>
                  <div className="text-sm font-bold text-teal-600 mt-0.5">
                    {formatRupiah(selectedKasbon.terbayar || 0)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Metode Pengembalian</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setKasbonBayarType('lunas');
                      setKasbonBayarNominal(String(selectedKasbon.nominal));
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      kasbonBayarType === 'lunas'
                        ? 'border-teal-600 bg-teal-50 text-teal-800 ring-2 ring-teal-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Lunas Penuh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setKasbonBayarType('cicil');
                      setKasbonBayarNominal('');
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      kasbonBayarType === 'cicil'
                        ? 'border-teal-600 bg-teal-50 text-teal-800 ring-2 ring-teal-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Cicil / Angsur
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Pengembalian <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="1"
                    max={selectedKasbon.nominal}
                    value={kasbonBayarNominal}
                    onChange={(e) => setKasbonBayarNominal(e.target.value)}
                    placeholder="Contoh: 100000"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>
                {kasbonBayarNominal && Number(kasbonBayarNominal) > 0 && (
                  <p className="text-[11px] text-teal-700 font-medium mt-1">
                    Sisa kasbon setelah dibayar: {formatRupiah(Math.max(0, selectedKasbon.nominal - Number(kasbonBayarNominal)))}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cara Bayar</label>
                  <select
                    value={kasbonBayarMetode}
                    onChange={(e) => setKasbonBayarMetode(e.target.value as 'Cash' | 'Transfer')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="Cash">Cash / Tunai</option>
                    <option value="Transfer">Transfer Bank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={kasbonBayarTanggal}
                    onChange={(e) => setKasbonBayarTanggal(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
                <input
                  type="text"
                  value={kasbonBayarCatatan}
                  onChange={(e) => setKasbonBayarCatatan(e.target.value)}
                  placeholder="Contoh: Potong honor satpam / bayar tunai"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 text-[11px] text-teal-800 leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>
                  Dana pengembalian kasbon <strong>otomatis masuk ke Kas Masuk RT</strong> dan langsung menambah <strong>Saldo Kas Riil RT</strong>.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedKasbon(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingKasbonBayar}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmittingKasbonBayar ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Pengembalian</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RIWAYAT PENGEMBALIAN KASBON */}
      {showKasbonHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Riwayat Pengembalian Kasbon</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  {showKasbonHistoryModal.namaPeminjam} (Awal: {formatRupiah(showKasbonHistoryModal.nominalAwal || (showKasbonHistoryModal.nominal + (showKasbonHistoryModal.terbayar || 0)))})
                </p>
              </div>
              <button
                onClick={() => setShowKasbonHistoryModal(null)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Total Dikembalikan</div>
                  <div className="text-base font-extrabold text-teal-600">
                    {formatRupiah(showKasbonHistoryModal.terbayar || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">Sisa Pinjaman</div>
                  <div className="text-base font-extrabold text-amber-600">
                    {formatRupiah(showKasbonHistoryModal.nominal)}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">Daftar Transaksi Pengembalian:</div>
                {(!showKasbonHistoryModal.riwayatPembayaran || showKasbonHistoryModal.riwayatPembayaran.length === 0) ? (
                  <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada riwayat pengembalian tercatat.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {showKasbonHistoryModal.riwayatPembayaran.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-800">{formatRupiah(item.nominal)}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {formatDateIndo(item.tanggal)} • <span className="font-semibold text-teal-700">{item.metode}</span>
                            {item.catatan && ` • "${item.catatan}"`}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold text-[10px]">
                          Kas Masuk
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowKasbonHistoryModal(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-xs"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH CATATAN TUNGGAKAN BARU */}
      {showAddTunggakanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Catat Tunggakan Baru Warga</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Catatan riwayat piutang iuran warga kepengurusan terdahulu/berjalan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTunggakanModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddTunggakan} className="p-6 space-y-4">
              {/* STATUS / KATEGORI PENUNGGAK */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kategori Penunggak <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTunggakanResidentType('warga');
                      setNewTunggakanCatatanPindah('');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      newTunggakanResidentType === 'warga'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Warga Aktif RT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTunggakanResidentType('pindah');
                      if (!newTunggakanCatatanPindah) {
                        setNewTunggakanCatatanPindah('Bekas warga (sudah pindah rumah), masih ada sisa tunggakan');
                      }
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      newTunggakanResidentType !== 'warga'
                        ? 'bg-amber-500 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-amber-200" />
                    <span>Bekas Warga (Pindah Rumah)</span>
                  </button>
                </div>

                {newTunggakanResidentType === 'warga' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pilih Warga Aktif <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2 relative">
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder="Ketik nama atau blok warga..."
                            value={wargaTunggakanSearch}
                            onFocus={() => setIsWargaTunggakanDropdownOpen(true)}
                            onChange={(e) => {
                              setWargaTunggakanSearch(e.target.value);
                              setNewTunggakanNama(e.target.value);
                              setIsWargaTunggakanDropdownOpen(true);
                            }}
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
                          />
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        </div>

                        {/* Dropdown Warga */}
                        {isWargaTunggakanDropdownOpen && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                            {residents
                              .filter((r) => {
                                if (!wargaTunggakanSearch.trim()) return true;
                                const q = wargaTunggakanSearch.toLowerCase();
                                return r.nama.toLowerCase().includes(q) || r.blok.toLowerCase().includes(q);
                              })
                              .slice(0, 30)
                              .map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => handleSelectTunggakanResident(r)}
                                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between text-xs transition cursor-pointer"
                                >
                                  <div>
                                    <span className="font-bold text-slate-900">{r.nama}</span>
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                      Blok: {r.blok}
                                    </span>
                                    {r.status === 'Pindah' && (
                                      <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                        Pindah
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-bold text-emerald-700 text-[11px]">
                                    {formatRupiah(r.tarif || 150000)}/bln
                                  </span>
                                </button>
                              ))}
                            {residents.filter((r) => {
                              if (!wargaTunggakanSearch.trim()) return true;
                              const q = wargaTunggakanSearch.toLowerCase();
                              return r.nama.toLowerCase().includes(q) || r.blok.toLowerCase().includes(q);
                            }).length === 0 && (
                              <div className="px-3 py-3 text-center text-slate-400 text-xs">
                                Warga tidak ditemukan
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <input
                          type="text"
                          readOnly
                          placeholder="Blok otomatis..."
                          value={newTunggakanBlok ? `Blok: ${newTunggakanBlok}` : ''}
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-default"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Form Tunggakan Bekas Warga (Pindah Rumah) / Non-Warga */
                  <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/70 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <Building2 className="w-4 h-4 text-amber-600" />
                      <span>Data Tunggakan Bekas Warga / Pindah Rumah</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Nama Bekas Warga / Pihak Penunggak <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Pak Herman / Ibu Siti (Eks Warga)"
                          value={newTunggakanNama}
                          onChange={(e) => setNewTunggakanNama(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Blok Rumah Lama
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Blok B1/05"
                          value={newTunggakanBlok}
                          onChange={(e) => setNewTunggakanBlok(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {/* Kolom di Bawah Warga: Keterangan / Alamat Pindah Rumah */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Keterangan Pindah Rumah / Catatan Alamat Baru
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Sudah pindah rumah ke Bogor / Rumah dikontrakkan / Alamat baru..."
                        value={newTunggakanCatatanPindah}
                        onChange={(e) => setNewTunggakanCatatanPindah(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-[10px] text-amber-700 mt-0.5 block">
                        Catatan ini akan tersimpan agar pengurus RT mudah melacak piutang eks-warga yang sudah pindah.
                      </span>
                    </div>

                    {/* Tarif saat menunggak */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-slate-600 font-medium">Tarif Iuran Bulanan saat menunggak:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-500">Rp</span>
                        <input
                          type="number"
                          value={newTunggakanTarif}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setNewTunggakanTarif(val);
                            setNewTunggakanNominal(String(val * Math.max(1, newTunggakanMonths.length)));
                          }}
                          className="w-28 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-amber-500 text-right"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PERIODE BULAN TUNGGAKAN (SEPERTI GAMBAR 1 & 2) */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="font-bold text-slate-800 text-xs">
                      Periode Bulan yang Menunggak ({newTunggakanMonths.length} Bulan Terpilih)
                    </label>
                    <select
                      value={newTunggakanYear}
                      onChange={(e) => handleChangeTunggakanYear(Number(e.target.value))}
                      className="text-[11px] font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg focus:ring-1 focus:ring-slate-900 cursor-pointer shadow-2xs"
                      title="Pilih tahun untuk daftar bulan di bawah"
                    >
                      {[2022, 2023, 2024, 2025, 2026, 2027].map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-semibold mr-1">Cepat:</span>
                    {[1, 2, 3, 6, 12].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => handleQuickTunggakanMonthSelect(cnt)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition border cursor-pointer ${
                          newTunggakanMonths.length === cnt
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cnt === 12 ? '1 Thn' : `${cnt} Bln`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 12 Bulan Grid Buttons (Exact visual match to image 2) */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                  {BULAN_NAMES.map((monthName) => {
                    const monthWithYear = `${monthName} ${newTunggakanYear}`;
                    const isSelected = newTunggakanMonths.includes(monthWithYear);
                    return (
                      <button
                        key={monthName}
                        type="button"
                        onClick={() => handleToggleTunggakanMonth(monthWithYear)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-semibold text-center transition border cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {monthName}
                      </button>
                    );
                  })}
                </div>

                {/* Status Bulan Terpilih & Perhitungan */}
                <div className="text-[11px] text-slate-500 pt-1 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-t border-slate-200/60 mt-1">
                  <span className="truncate max-w-[280px]" title={newTunggakanMonths.join(', ')}>
                    Bulan terpilih: <span className="font-bold text-slate-800">{newTunggakanMonths.join(', ') || '-'}</span>
                  </span>
                  <span className="text-emerald-700 font-bold shrink-0">
                    {formatRupiah(newTunggakanTarif)} x {newTunggakanMonths.length} bln
                  </span>
                </div>
              </div>

              {/* NOMINAL & TANGGAL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Nominal Tunggakan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newTunggakanNominal}
                      onChange={(e) => setNewTunggakanNominal(e.target.value)}
                      placeholder="150000"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-rose-600 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Terkalkulasi: {newTunggakanMonths.length} bln x {formatRupiah(newTunggakanTarif)} (bisa diedit)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Catat</label>
                  <input
                    type="date"
                    value={newTunggakanTanggal}
                    onChange={(e) => setNewTunggakanTanggal(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* KETERANGAN PERIODE MENUNGGAK */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Keterangan Periode Menunggak <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTunggakanKeterangan}
                  onChange={(e) => setNewTunggakanKeterangan(e.target.value)}
                  placeholder="Contoh: Oktober 2025 - November 2026"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Akan tampil pada kolom <strong>Periode Menunggak</strong> di tabel
                </span>
              </div>

              {/* INFO NOTICE */}
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Data tunggakan ini akan tercatat sebagai <strong>Piutang Kas RT</strong>. Saat dilakukan pembayaran (cash atau dicicil), penerimaan dana akan <strong>otomatis masuk ke Kas Masuk RT</strong>.
                </span>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTunggakanModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAddTunggakan}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingAddTunggakan ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Tunggakan Baru</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: TAMBAH KASBON BARU */}
      {showAddKasbonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Catat Kasbon Baru Petugas</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Pencairan pinjaman kasbon dari kas RT</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddKasbonModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddKasbon} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Petugas / Peminjam <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newKasbonNama}
                  onChange={(e) => setNewKasbonNama(e.target.value)}
                  placeholder="Contoh: Pak Herman (Satpam)"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Pinjaman <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="1"
                    value={newKasbonNominal}
                    onChange={(e) => setNewKasbonNominal(e.target.value)}
                    placeholder="Contoh: 500000"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pencairan</label>
                <input
                  type="date"
                  value={newKasbonTanggal}
                  onChange={(e) => setNewKasbonTanggal(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keperluan / Keterangan</label>
                <input
                  type="text"
                  value={newKasbonKeterangan}
                  onChange={(e) => setNewKasbonKeterangan(e.target.value)}
                  placeholder="Contoh: Keperluan keluarga mendesak"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Pencairan kasbon ini akan <strong>otomatis dicatat ke Pengeluaran Kas RT</strong> dan langsung mengurangi <strong>Saldo Kas Riil RT</strong>.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddKasbonModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAddKasbon}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmittingAddKasbon ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Kasbon Baru</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: DAFTAR WARGA BELUM BAYAR IURAN BULANAN */}
      {showBelumBayarModal && dashboardData?.targetRealisasiIuran && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Daftar Warga Belum Bayar Iuran Bulanan
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Periode: <strong className="text-slate-700">{dashboardData.targetRealisasiIuran.periodeLabel || dashboardData.targetRealisasiIuran.periode}</strong> • Total Belum Bayar: <span className="font-bold text-rose-600">{dashboardData.targetRealisasiIuran.wargaBelumBayarCount} KK</span> ({formatRupiah(dashboardData.targetRealisasiIuran.sisaNominalBelumTertagih)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBelumBayarModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchBelumBayar}
                  onChange={(e) => setSearchBelumBayar(e.target.value)}
                  placeholder="Cari nama warga atau blok rumah..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* List Warga */}
            <div className="p-6 overflow-y-auto flex-1 space-y-2.5">
              {(() => {
                const list = (dashboardData.targetRealisasiIuran.wargaBelumBayarList || []).filter((w: any) => {
                  const q = searchBelumBayar.toLowerCase();
                  return w.nama.toLowerCase().includes(q) || (w.blok && w.blok.toLowerCase().includes(q));
                });

                if (list.length === 0) {
                  return (
                    <div className="py-12 text-center text-xs text-slate-400">
                      {searchBelumBayar
                        ? 'Tidak ada warga belum bayar yang cocok dengan pencarian.'
                        : 'Luar biasa! Semua warga aktif telah melunasi iuran periode ini.'}
                    </div>
                  );
                }

                return list.map((w: any, idx: number) => {
                  const waNumber = w.hp ? (w.hp.startsWith('0') ? '62' + w.hp.slice(1) : w.hp) : '';
                  const waText = encodeURIComponent(
                    `Assalamualaikum, Bapak/Ibu ${w.nama} (${w.blok}), kami dari pengurus RT menginfokan tagihan Iuran Bulanan periode ${dashboardData.targetRealisasiIuran.periodeLabel || dashboardData.targetRealisasiIuran.periode} sebesar Rp ${(w.tarif || 150000).toLocaleString('id-ID')}. Pembayaran dapat ditransfer atau tunai ke bendahara RT. Terima kasih.`
                  );
                  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${waText}` : null;

                  return (
                    <div
                      key={w.id || idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 font-bold flex items-center justify-center text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{w.nama}</span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200">
                              {w.blok}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Tarif Iuran: <strong className="text-slate-800">{formatRupiah(w.tarif || 150000)}</strong>
                            {w.hp && <span> • WA: {w.hp}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition border border-emerald-200"
                            title="Kirim pesan pengingat tagihan iuran via WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowBelumBayarModal(false);
                            handleOpenIncomeModal();
                            const rFound = residents.find((r) => r.id === w.id);
                            if (rFound) {
                              handleSelectIncomeResident(rFound);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Catat Bayar</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                Daftar terhubung langsung ke Master Warga & Data Iuran.
              </span>
              <button
                type="button"
                onClick={() => setShowBelumBayarModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
