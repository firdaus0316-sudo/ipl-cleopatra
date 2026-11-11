'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Upload,
  Search,
  Receipt,
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Camera,
  RefreshCw,
  ChevronDown,
  Lock,
  Menu,
  X,
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart as PieChartIcon,
  BarChart3,
  Users,
  FileText,
  BadgeAlert,
  ArrowUpRight,
  HelpCircle,
  CalendarCheck,
  MessageCircle,
  Building2,
} from 'lucide-react';
import { formatRupiah, formatDateIndo, createWaLink } from '@/lib/format';

interface SafeSettings {
  namaRt: string;
  namaKomplek: string;
  alamat: string;
  namaBank: string;
  nomorRekening: string;
  atasNama: string;
  nomorWaAdmin: string;
  pesanPengumuman: string;
}

interface PublicResident {
  id: string;
  nama: string;
  blok: string;
  hp: string;
  tarif: number;
}

interface PublicProof {
  id: string;
  residentName: string;
  blok: string;
  kategori: string;
  bulan: string[];
  nominal: number;
  status: 'Menunggu Verifikasi' | 'Terverifikasi' | 'Ditolak';
  adminNote?: string;
  createdAt: string;
  verifiedAt?: string;
  buktiUrl: string;
}

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

const EXPENSE_COLORS: Record<string, string> = {
  Kasbon: '#0284c7',
  Variabel: '#f59e0b',
  Tetap: '#10b981',
  'Keamanan / Satpam': '#8b5cf6',
  'Kebersihan / Sampah': '#ec4899',
  'Operasional RT': '#3b82f6',
  'Perbaikan / Pemeliharaan': '#f97316',
  Lainnya: '#94a3b8',
};

const INCOME_COLORS: Record<string, string> = {
  'Iuran Bulanan': '#10b981',
  'Iuran Bulanan (Reguler)': '#10b981',
  'Iuran Agustusan': '#f59e0b',
  'Iuran THR': '#ec4899',
  'Dana Hibah / Donasi': '#8b5cf6',
  'Tunggakan Terbayar': '#0284c7',
  'Pemasukan Lainnya': '#64748b',
};

export default function PublicPage() {
  const [tab, setTab] = useState<'dashboard' | 'upload' | 'status' | 'transparansi'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [settings, setSettings] = useState<SafeSettings | null>(null);
  const [residents, setResidents] = useState<PublicResident[]>([]);
  const [saldoKas, setSaldoKas] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSheetLocked, setIsSheetLocked] = useState(false);

  // Warga Picker
  const [isWargaPickerOpen, setIsWargaPickerOpen] = useState(false);
  const [wargaSearchQuery, setWargaSearchQuery] = useState('');

  // Form State
  const [selectedResidentId, setSelectedResidentId] = useState('');
  const [residentName, setResidentName] = useState('');
  const [blok, setBlok] = useState('');
  const [hp, setHp] = useState('');
  const [kategori, setKategori] = useState('Iuran Bulanan (Reguler)');
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['November 2026']);
  const [customNominal, setCustomNominal] = useState<string>('150000');
  const [catatanWarga, setCatatanWarga] = useState('');
  const [buktiImage, setBuktiImage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<PublicProof | null>(null);
  const [formError, setFormError] = useState('');

  // Status Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [proofList, setProofList] = useState<PublicProof[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [selectedProofPreview, setSelectedProofPreview] = useState<PublicProof | null>(null);

  const statusSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return (residents || [])
      .filter((r) => r.nama.toLowerCase().includes(q) || r.blok.toLowerCase().includes(q))
      .slice(0, 10);
  }, [residents, searchQuery]);

  // Transparency State
  const [transparencyData, setTransparencyData] = useState<any>(null);
  const [isLoadingTrans, setIsLoadingTrans] = useState(false);

  // Billing Matrix State (Sama seperti Admin)
  const [matrixYear, setMatrixYear] = useState<number>(2026);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState<boolean>(false);
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const [matrixFilterStatus, setMatrixFilterStatus] = useState<'ALL' | 'LUNAS_INI' | 'BELUM_INI'>('ALL');
  const [matrixPeriod, setMatrixPeriod] = useState<string>('2026-11');
  const [matrixSelectedBlock, setMatrixSelectedBlock] = useState<string>('ALL');

  const fetchMatrixData = async (year: number) => {
    setIsLoadingMatrix(true);
    try {
      const res = await fetch(`/api/admin/billing-matrix?year=${year}`);
      const data = await res.json();
      if (data.success) {
        setMatrixData(data);
      }
    } catch (err) {
      console.error('Error fetching billing matrix in citizen portal:', err);
    } finally {
      setIsLoadingMatrix(false);
    }
  };

  // Modals for Pos Piutang & Kasbon
  const [showTunggakanDetailModal, setShowTunggakanDetailModal] = useState(false);
  const [showKasbonDetailModal, setShowKasbonDetailModal] = useState(false);

  // Interactive Chart Slices hover
  const [hoveredExpenseCat, setHoveredExpenseCat] = useState<string | null>(null);
  const [hoveredIncomeCat, setHoveredIncomeCat] = useState<string | null>(null);

  // Router & Admin PIN Modal State
  const router = useRouter();
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [isAdminVerifying, setIsAdminVerifying] = useState(false);
  const [showPinText, setShowPinText] = useState(false);

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPinInput.trim()) {
      setAdminPinError('Silakan masukkan password admin.');
      return;
    }
    setAdminPinError('');
    setIsAdminVerifying(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPinInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('cleo_admin_auth', 'true');
        setShowAdminPinModal(false);
        setAdminPinInput('');
        window.location.href = '/admin';
      } else {
        setAdminPinError(data.error || 'Password / PIN admin tidak sesuai.');
      }
    } catch {
      setAdminPinError('Gagal menghubungkan ke server.');
    } finally {
      setIsAdminVerifying(false);
    }
  };

  const loadData = () => {
    setIsSyncing(true);
    const ts = Date.now();
    fetch(`/api/public/data?t=${ts}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSettings(data.settings);
          setResidents(data.residents);
          if (data.saldoKas !== undefined) setSaldoKas(data.saldoKas);
          setIsSheetLocked(Boolean(data.isSheetLocked));
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsSyncing(false));

    // Also fetch transparency data for Dashboard & Pos Piutang
    fetch(`/api/public/transparency?t=${ts}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTransparencyData(data);
          if (data.summary?.saldoAkhir !== undefined) {
            setSaldoKas(data.summary.saldoAkhir);
          }
        }
      })
      .catch((err) => console.error(err));

    // Fetch billing matrix data
    fetchMatrixData(matrixYear);
  };

  useEffect(() => {
    localStorage.removeItem('cleo_admin_auth');
    loadData();
  }, []);

  const filteredResidents = useMemo(() => {
    if (!wargaSearchQuery) return residents;
    const q = wargaSearchQuery.toLowerCase();
    return residents.filter(
      (r) => r.nama.toLowerCase().includes(q) || r.blok.toLowerCase().includes(q)
    );
  }, [residents, wargaSearchQuery]);

  const currentResidentTarif = useMemo(() => {
    const r = residents.find((x) => x.id === selectedResidentId);
    return r?.tarif || 150000;
  }, [residents, selectedResidentId]);

  const handleSelectResident = (r: PublicResident) => {
    setSelectedResidentId(r.id);
    setResidentName(r.nama);
    setBlok(r.blok);
    setHp(r.hp);
    const tarif = r.tarif || 150000;
    setCustomNominal(String(tarif * Math.max(1, selectedMonths.length)));
    setIsWargaPickerOpen(false);
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
    setSelectedMonths(selected);
    setCustomNominal(String(currentResidentTarif * selected.length));
  };

  const handleToggleMonth = (month: string) => {
    let updated: string[];
    if (selectedMonths.includes(month)) {
      if (selectedMonths.length === 1) return;
      updated = selectedMonths.filter((m) => m !== month);
    } else {
      updated = [...selectedMonths, month];
    }
    setSelectedMonths(updated);
    setCustomNominal(String(currentResidentTarif * Math.max(1, updated.length)));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Ukuran file maksimal 8 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setBuktiImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!residentName || !blok) {
      setFormError('Silakan pilih atau isi data nama warga dan blok rumah.');
      return;
    }

    if (!buktiImage) {
      setFormError('Mohon lampirkan foto bukti transfer.');
      return;
    }

    if (!customNominal || Number(customNominal) <= 0) {
      setFormError('Nominal pembayaran wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/public/submit-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: selectedResidentId,
          residentName,
          blok,
          hp,
          kategori,
          bulan: selectedMonths,
          nominal: Number(customNominal),
          buktiUrl: buktiImage,
          catatanWarga,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(data.data);
        setBuktiImage('');
        setCatatanWarga('');
      } else {
        setFormError(data.error || 'Gagal mengirim bukti pembayaran.');
      }
    } catch {
      setFormError('Terjadi gangguan jaringan internet. Silakan coba kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRekening = () => {
    if (settings?.nomorRekening) {
      navigator.clipboard.writeText(settings.nomorRekening);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fetchStatus = (q = '') => {
    setIsLoadingStatus(true);
    fetch(`/api/public/status?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setProofList(data.data);
      })
      .finally(() => setIsLoadingStatus(false));
  };

  useEffect(() => {
    if (tab === 'status') {
      fetchStatus(searchQuery);
    } else if (tab === 'transparansi') {
      setIsLoadingTrans(true);
      fetch('/api/public/transparency')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setTransparencyData(data);
        })
        .finally(() => setIsLoadingTrans(false));
      fetchMatrixData(matrixYear);
    } else if (tab === 'dashboard') {
      setIsLoadingTrans(true);
      fetch('/api/public/transparency')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setTransparencyData(data);
        })
        .finally(() => setIsLoadingTrans(false));
    }
  }, [tab, matrixYear]);

  // Calculations for Expense Pie
  const expenseCatEntries = useMemo(() => {
    if (!transparencyData?.expenseByCategory) return [];
    return Object.entries(transparencyData.expenseByCategory)
      .map(([cat, val]: [string, any]) => ({
        label: cat,
        value: Number(val),
        color: EXPENSE_COLORS[cat] || '#64748b',
      }))
      .filter((e) => e.value > 0);
  }, [transparencyData]);

  const totalExpenseForPie = useMemo(() => {
    return expenseCatEntries.reduce((sum, e) => sum + e.value, 0);
  }, [expenseCatEntries]);

  // Calculations for Income Pie
  const incomeCatEntries = useMemo(() => {
    if (!transparencyData?.incomeByCategory) {
      if (transparencyData?.summary?.totalPemasukan) {
        return [{ label: 'Iuran Bulanan', value: transparencyData.summary.totalPemasukan, color: '#10b981' }];
      }
      return [];
    }
    return Object.entries(transparencyData.incomeByCategory)
      .map(([cat, val]: [string, any]) => ({
        label: cat,
        value: Number(val),
        color: INCOME_COLORS[cat] || '#10b981',
      }))
      .filter((e) => e.value > 0);
  }, [transparencyData]);

  const totalIncomeForPie = useMemo(() => {
    return incomeCatEntries.reduce((sum, e) => sum + e.value, 0);
  }, [incomeCatEntries]);

  // Calculations for Monthly Bar Chart
  const monthlyFlowData = useMemo(() => {
    return transparencyData?.monthlyFlow || [];
  }, [transparencyData]);

  const maxBarValue = useMemo(() => {
    if (!monthlyFlowData.length) return 5000000;
    const maxVal = Math.max(
      ...monthlyFlowData.map((d: any) => Math.max(d.masuk || 0, d.keluar || 0)),
      1000000
    );
    return maxVal;
  }, [monthlyFlowData]);

  // Helper for Donut Stroke-Dasharray
  const renderDonutSlices = (entries: { label: string; value: number; color: string }[], total: number) => {
    if (total <= 0 || !entries.length) {
      return (
        <circle
          cx="60"
          cy="60"
          r="40"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
        />
      );
    }

    const radius = 40;
    const circumference = 2 * Math.PI * radius; // ~251.327
    let accumulatedDash = 0;

    return entries.map((slice, i) => {
      const sliceLength = (slice.value / total) * circumference;
      const dashOffset = -accumulatedDash;
      accumulatedDash += sliceLength;

      return (
        <circle
          key={i}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={slice.color}
          strokeWidth="16"
          strokeDasharray={`${sliceLength} ${circumference - sliceLength}`}
          strokeDashoffset={dashOffset}
          className="transition-all duration-300 hover:opacity-80 cursor-pointer"
        />
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col lg:flex-row pb-20 lg:pb-0">
      {/* SIDEBAR NAVIGATION (Modern Dark Slate Layout matching Admin Cleopatra) */}
      <aside className="w-full lg:w-64 bg-[#0b1329] text-white shrink-0 lg:min-h-screen border-r border-slate-800/80 flex flex-col justify-between sticky top-0 z-40">
        <div>
          {/* BRAND HEADER */}
          <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo-cleopatra.jpg"
                alt="Logo IPL Cleopatra"
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-emerald-500/40 shadow-md shrink-0"
              />
              <div className="min-w-0">
                <div className="font-black text-white text-base leading-tight tracking-tight flex items-center gap-1.5">
                  <span>IPL Cleopatra</span>
                </div>
                <div className="text-[11px] font-bold text-emerald-400 tracking-wide mt-0.5 truncate">
                  Administrasi Keuangan RT
                </div>
              </div>
            </div>

            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Toggle Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* STATUS PILL ON SIDEBAR */}
          <div className="px-4 pt-3 hidden lg:block">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px]">
              <span className="flex items-center gap-2 text-slate-300 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Portal Warga
              </span>
              <span className="text-emerald-400 font-mono font-bold">RT 011 / RW 028</span>
            </div>
          </div>

          {/* MENU NAVIGATION LINKS */}
          <nav className={`p-3 space-y-1.5 ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
            {/* 1. Dashboard Warga */}
            <button
              onClick={() => {
                setTab('dashboard');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                tab === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${tab === 'dashboard' ? 'text-white' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div>Dashboard Warga</div>
                <div className="text-[10px] font-normal opacity-80">Ringkasan kas, grafik & piutang</div>
              </div>
            </button>

            {/* 2. Form Setor Iuran */}
            <button
              onClick={() => {
                setTab('upload');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                tab === 'upload'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Upload className={`w-4 h-4 shrink-0 ${tab === 'upload' ? 'text-white' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div>Form Setor Iuran</div>
                <div className="text-[10px] font-normal opacity-80">Kirim bukti transfer & rekening</div>
              </div>
            </button>

            {/* 3. Cek Status Pembayaran */}
            <button
              onClick={() => {
                setTab('status');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                tab === 'status'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Search className={`w-4 h-4 shrink-0 ${tab === 'status' ? 'text-white' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div>Cek Status Pembayaran</div>
                <div className="text-[10px] font-normal opacity-80">Lacak verifikasi bukti & no. tiket</div>
              </div>
            </button>

            {/* 4. Buku Penagihan & Matriks */}
            <button
              onClick={() => {
                setTab('transparansi');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                tab === 'transparansi'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <CalendarCheck className={`w-4 h-4 shrink-0 ${tab === 'transparansi' ? 'text-white' : 'text-emerald-400'}`} />
              <div className="flex-1">
                <div>Buku Penagihan & Matriks</div>
                <div className="text-[10px] font-normal opacity-80">Pos piutang & matriks iuran 12 bulan</div>
              </div>
            </button>
          </nav>
        </div>

        {/* SIDEBAR FOOTER: TOMBOL MASUK ADMIN DENGAN PIN */}
        <div className={`p-4 border-t border-slate-800/80 bg-[#070c1b] ${isMobileMenuOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="mb-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
            Akses Pengurus RT
          </div>
          <button
            type="button"
            onClick={() => {
              setAdminPinInput('');
              setAdminPinError('');
              setShowPinText(false);
              setShowAdminPinModal(true);
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-emerald-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700 shadow-sm active:scale-95"
            title="Khusus Pengurus & Bendahara RT"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Login Admin RT</span>
            <Lock className="w-3 h-3 text-slate-400 ml-auto" />
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto pb-24 lg:pb-8">
        {/* TOP GREETING BAR */}
        <div className="mb-6 bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {tab === 'dashboard' && 'Dashboard Warga - Transparansi & Keuangan RT'}
                {tab === 'upload' && 'Konfirmasi Pembayaran Iuran Warga'}
                {tab === 'status' && 'Cek Status Verifikasi Iuran Warga'}
                {tab === 'transparansi' && 'Buku Penagihan & Matriks Iuran Warga'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cluster Cleopatra • RT 011 / RW 028 • Terbuka & Real-time untuk seluruh warga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={isSyncing}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex items-center gap-1.5"
              title="Segarkan data kas"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
              <span>{isSyncing ? 'Memperbarui...' : 'Segarkan Data'}</span>
            </button>
          </div>
        </div>

        {/* Spreadsheet Status Notification if Locked */}
        {isSheetLocked && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-bold">Google Sheets Baru Belum Berstatus Publik (Viewer):</strong>
              <p className="mt-0.5 text-amber-800">
                Buka spreadsheet &gt; klik <strong>Bagikan (Share)</strong> di kanan atas &gt; ubah Akses Umum menjadi <strong>&quot;Siapa saja yang memiliki link&quot;</strong> sebagai <strong>&quot;Pelihat (Viewer)&quot;</strong>.
              </p>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-xl bg-amber-200/70 hover:bg-amber-300 text-amber-950 font-bold text-xs shrink-0"
            >
              Cek Ulang
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 1: DASHBOARD WARGA (RINGKASAN, GRAFIK BAR, PIE & PIUTANG) */}
        {/* ============================================================ */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {/* 1. TIGA KARTU UTAMA KAS RIIL RT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Saldo Kas RT Saat Ini
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2 tracking-tight">
                  {formatRupiah(transparencyData?.summary?.saldoAkhir ?? saldoKas)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <span>Saldo Awal: {formatRupiah(transparencyData?.summary?.saldoAwal || 0)}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Total Kas Masuk
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2 tracking-tight">
                  {formatRupiah(transparencyData?.summary?.totalPemasukan || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Iuran bulanan & donasi terverifikasi
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Total Kas Keluar
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rose-600 mt-2 tracking-tight">
                  {formatRupiah(transparencyData?.summary?.totalPengeluaran || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Operasional, satpam, sampah & kasbon
                </div>
              </div>
            </div>

            {/* DUA GRAFIK BERDAMPINGAN: GRAFIK BAR (KIRI) DAN GRAFIK PIE PENGELUARAN (KANAN) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* SISI KIRI: GRAFIK BAR ARUS KAS MASUK VS KELUAR BULANAN */}
              <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-emerald-600" />
                        <h3 className="font-black text-slate-900 text-sm sm:text-base">
                          Grafik Bar: Pemasukan vs Pengeluaran Bulanan
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Perbandingan arus kas masuk dan kas keluar per bulan (2026).
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                        <span className="text-slate-700 text-[11px]">Kas Masuk</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded bg-rose-500"></span>
                        <span className="text-slate-700 text-[11px]">Kas Keluar</span>
                      </div>
                    </div>
                  </div>

                  {/* Bar visualization */}
                  <div className="pt-2">
                    <div className="h-56 flex items-end justify-between gap-1 px-1">
                      {monthlyFlowData.map((d: any, idx: number) => {
                        const masukPct = Math.min(100, Math.round(((d.masuk || 0) / maxBarValue) * 100));
                        const keluarPct = Math.min(100, Math.round(((d.keluar || 0) / maxBarValue) * 100));

                        return (
                          <div
                            key={idx}
                            className="flex-1 flex flex-col items-center justify-end h-full group relative"
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute -top-14 hidden group-hover:flex flex-col items-center z-20 pointer-events-none whitespace-nowrap bg-slate-900 text-white text-[10px] p-2 rounded-lg shadow-xl">
                              <span className="font-bold text-slate-200">{d.month} 2026</span>
                              <span className="text-emerald-400">Masuk: {formatRupiah(d.masuk || 0)}</span>
                              <span className="text-rose-400">Keluar: {formatRupiah(d.keluar || 0)}</span>
                              <div className="w-2 h-2 bg-slate-900 rotate-45 -mb-1 mt-0.5"></div>
                            </div>

                            {/* Bars container */}
                            <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-44">
                              {/* Masuk Bar */}
                              <div
                                style={{ height: `${Math.max(4, masukPct)}%` }}
                                className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                                  d.masuk > 0 ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200'
                                }`}
                              ></div>
                              {/* Keluar Bar */}
                              <div
                                style={{ height: `${Math.max(4, keluarPct)}%` }}
                                className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                                  d.keluar > 0 ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-200'
                                }`}
                              ></div>
                            </div>

                            {/* Month Label */}
                            <span className="text-[10px] font-bold text-slate-500 mt-2 truncate">
                              {d.month}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* SISI KANAN: GRAFIK PIE HANYA PENGELUARAN SAJA */}
              <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4 text-rose-500" />
                      <div>
                        <h4 className="font-black text-slate-900 text-sm sm:text-base">
                          Posisi Kategori Pengeluaran
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Total Pengeluaran Kas RT: <strong className="text-rose-600 font-bold">{formatRupiah(totalExpenseForPie)}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
                    {/* Donut SVG */}
                    <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        {renderDonutSlices(expenseCatEntries, totalExpenseForPie)}
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <TrendingDown className="w-6 h-6 text-rose-500/70" />
                      </div>
                    </div>

                    {/* Categories Breakdown List */}
                    <div className="flex-1 w-full space-y-2 text-xs">
                      {expenseCatEntries.length === 0 ? (
                        <p className="text-slate-400 text-xs">Belum ada catatan pengeluaran.</p>
                      ) : (
                        <>
                          {expenseCatEntries.map((cat, i) => {
                            const pct = totalExpenseForPie > 0 ? Math.round((cat.value / totalExpenseForPie) * 100) : 0;
                            return (
                              <div
                                key={i}
                                onMouseEnter={() => setHoveredExpenseCat(cat.label)}
                                onMouseLeave={() => setHoveredExpenseCat(null)}
                                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: cat.color }}
                                  ></span>
                                  <span className="font-bold text-slate-800 truncate">{cat.label}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-black text-rose-700">{formatRupiah(cat.value)}</span>
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-white border border-slate-200 text-slate-600">
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {/* BARIS TOTAL KELUAR DI POSISI KOTAK MERAH */}
                          <div className="pt-1.5 border-t border-slate-200/90">
                            <div className="p-2.5 rounded-xl bg-rose-50/90 border border-rose-200/90 flex items-center justify-between gap-2 shadow-2xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0"></span>
                                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wide">
                                  Total Keluar
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-black text-rose-600 text-sm">
                                  {formatRupiah(totalExpenseForPie)}
                                </span>
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  100%
                                </span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. QUICK ACTION HERO BANNER */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-base font-extrabold">Sudah Melakukan Transfer Iuran Bulan Ini?</h4>
                <p className="text-xs text-emerald-100 mt-1 max-w-xl">
                  Lampirkan bukti transfer bank atau M-Banking Anda melalui formulir konfirmasi pembayaran agar tercatat otomatis oleh pengurus RT.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTab('upload')}
                  className="px-4 py-2.5 rounded-xl bg-white text-emerald-900 font-extrabold text-xs hover:bg-emerald-50 transition shadow-sm"
                >
                  Konfirmasi Setor Iuran
                </button>
                <button
                  type="button"
                  onClick={() => setTab('status')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700/60 hover:bg-emerald-700 text-white font-bold text-xs transition border border-emerald-500/40"
                >
                  Cek Status
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: FORM SETOR IURAN */}
        {/* ============================================================ */}
        {tab === 'upload' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* BANK ACCOUNT CARD */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Rekening Kas Lingkungan RT
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    Bank {settings?.namaBank || 'BCA'}
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold">Nomor Rekening Kas:</div>
                    <div className="font-mono text-lg sm:text-xl font-black text-slate-900">
                      {settings?.nomorRekening || '7829104820'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={copyRekening}
                    className="ml-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-600">
                <div>
                  Atas Nama: <strong className="text-slate-900">{settings?.atasNama || 'KAS RT 011 CLEOPATRA'}</strong>
                </div>
                <div>
                  Saldo Kas RT Saat Ini: <strong className="text-emerald-600">{formatRupiah(saldoKas)}</strong>
                </div>
              </div>
            </div>

            {/* FORM CARD */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-7 shadow-sm">
              <div className="border-b border-slate-100 pb-3.5 mb-5">
                <h2 className="text-base font-black text-slate-900">Formulir Konfirmasi Pembayaran</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Isi data nama warga dan lampirkan foto bukti transfer untuk diverifikasi oleh bendahara RT.
                </p>
              </div>

              {submitSuccess ? (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-emerald-950">Bukti Berhasil Dikirim</h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Nomor Tiket: <strong className="font-mono">{submitSuccess.id}</strong>
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-4 text-left text-xs border border-emerald-200 space-y-2 text-slate-700 shadow-2xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama / Blok:</span>
                      <strong className="text-slate-900">{submitSuccess.residentName} ({submitSuccess.blok})</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bulan Dibayar:</span>
                      <strong className="text-slate-900">{submitSuccess.bulan.join(', ')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nominal:</span>
                      <strong className="text-emerald-700 font-black">{formatRupiah(submitSuccess.nominal)}</strong>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <span className="text-slate-500">Status:</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                        Menunggu Verifikasi
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setSubmitSuccess(null)}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition flex items-center justify-center gap-2"
                    >
                      Kirim Bukti Lain
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {formError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* SELECT WARGA BUTTON */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">
                      Pilih Nama Warga / Blok Rumah <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsWargaPickerOpen(true)}
                      className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-emerald-500 flex items-center justify-between text-xs transition"
                    >
                      {residentName ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold bg-slate-100 text-slate-900 px-2 py-0.5 rounded-lg border border-slate-200">
                            {blok}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{residentName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-- Klik untuk memilih warga / blok rumah --</span>
                      )}
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>

                  {/* KATEGORI */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">Kategori Iuran</label>
                    <select
                      value={kategori}
                      onChange={(e) => setKategori(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Iuran Bulanan (Reguler)">Iuran Bulanan (Reguler)</option>
                      <option value="Iuran Agustusan">Iuran Agustusan</option>
                      <option value="Iuran THR (Tunjangan Hari Raya)">Iuran THR</option>
                      <option value="Iuran Perbaikan Selokan">Iuran Perbaikan Selokan</option>
                      <option value="Dana Hibah / Donasi">Dana Hibah / Donasi</option>
                      <option value="Pemasukan Lainnya">Pemasukan Lainnya</option>
                    </select>
                  </div>

                  {/* POLA PERIODE BULAN YANG DIBAYAR (SESUAI GAMBAR 2) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="font-extrabold text-slate-900 text-xs sm:text-sm">
                        Periode Bulan yang Dibayar ({selectedMonths.length} Bulan Terpilih)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-bold mr-0.5">Cepat:</span>
                        {[1, 2, 3, 6, 12].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => handleQuickMonthSelect(cnt)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                              selectedMonths.length === cnt
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {cnt === 12 ? '1 Thn' : `${cnt} Bln`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Multi-Select Pills 12 Bulan (Grid 4 Kolom) */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                      {BULAN_OPTIONS.map((m) => {
                        const isSelected = selectedMonths.includes(m);
                        const monthLabel = m.replace(' 2026', '');
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleToggleMonth(m)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-semibold text-center transition border ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {monthLabel}
                          </button>
                        );
                      })}
                    </div>

                    {/* Ringkasan Bulan Terpilih & Kalkulasi Tarif */}
                    <div className="text-xs pt-1.5 border-t border-slate-200/90 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-slate-600">
                        Bulan terpilih: <span className="font-black text-slate-900">{selectedMonths.join(', ')}</span>
                      </div>
                      <div className="text-emerald-700 font-black">
                        {formatRupiah(currentResidentTarif)} x {selectedMonths.length} bln
                      </div>
                    </div>
                  </div>

                  {/* DUA KOLOM BERDAMPINGAN: TOTAL NOMINAL KAS MASUK & CATATAN TAMBAHAN (SESUAI GAMBAR 2) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Total Nominal Kas Masuk (Rp) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        value={customNominal}
                        onChange={(e) => setCustomNominal(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-black text-emerald-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                        Otomatis terkalkulasi ({selectedMonths.length} bulan x {formatRupiah(currentResidentTarif)})
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Catatan Tambahan (Opsional)
                      </label>
                      <input
                        type="text"
                        value={catatanWarga}
                        onChange={(e) => setCatatanWarga(e.target.value)}
                        placeholder="Contoh: Titip tunai di pos ronda / bendahara"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* BUKTI FOTO TRANSFER (M-BANKING / STRUK) */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5">
                      Foto Bukti Transfer (M-Banking / Struk) <span className="text-rose-500">*</span>
                    </label>

                    {buktiImage ? (
                      <div className="border border-slate-300 rounded-xl p-3 bg-slate-50 flex flex-col items-center">
                        <img
                          src={buktiImage}
                          alt="Bukti Transfer"
                          className="max-h-60 w-auto object-contain rounded-lg shadow-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setBuktiImage('')}
                          className="mt-2.5 text-xs font-bold text-rose-600 hover:underline"
                        >
                          Ganti Foto Bukti
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2.5 p-5 border border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition">
                        <Camera className="w-5 h-5 text-slate-500" />
                        <span className="font-bold text-slate-700">
                          Pilih / Ambil Foto Bukti Transfer
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* SUBMIT BUTTON */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-black text-xs transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isSubmitting ? (
                      <span>Mengirim Bukti...</span>
                    ) : (
                      <>
                        <span>Kirim Bukti Pembayaran</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: CEK STATUS */}
        {/* ============================================================ */}
        {tab === 'status' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 max-w-4xl mx-auto">
            <div>
              <h2 className="text-base font-black text-slate-900">Pencarian Bukti Pembayaran</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cari status pembayaran berdasarkan nama warga, nomor blok rumah, atau nomor tiket transfer.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsStatusDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (searchQuery.trim()) setIsStatusDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setIsStatusDropdownOpen(false), 200);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setIsStatusDropdownOpen(false);
                        fetchStatus(searchQuery);
                      }
                    }}
                    placeholder="Ketik nama atau blok (contoh: Eri atau E-1/32)..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-9"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setIsStatusDropdownOpen(false);
                        fetchStatus('');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {isStatusDropdownOpen && statusSuggestions.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Pilih Nama Warga ({statusSuggestions.length} ditemukan)
                    </div>
                    {statusSuggestions.map((r) => (
                      <div
                        key={r.id}
                        onMouseDown={() => {
                          setSearchQuery(r.nama);
                          setIsStatusDropdownOpen(false);
                          fetchStatus(r.nama);
                        }}
                        className="px-3.5 py-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between border-b border-slate-50 transition"
                      >
                        <div>
                          <span className="font-bold text-slate-900 text-xs">{r.nama}</span>
                          <span className="ml-2 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                            Blok {r.blok}
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-600 font-semibold">Pilih &rarr;</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsStatusDropdownOpen(false);
                  fetchStatus(searchQuery);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm self-start"
              >
                Cari
              </button>
            </div>

            {isLoadingStatus ? (
              <div className="py-12 text-center text-xs text-slate-400">Memuat data...</div>
            ) : proofList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Belum ada data bukti pembayaran yang cocok.
              </div>
            ) : (
              <div className="space-y-2.5">
                {proofList.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProofPreview(p)}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition flex items-center justify-between text-xs cursor-pointer shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                          {p.blok}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">{p.residentName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {p.bulan?.join(', ')} • <strong className="text-slate-800">{formatRupiah(p.nominal)}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {p.status === 'Terverifikasi' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Lunas
                        </span>
                      )}
                      {p.status === 'Menunggu Verifikasi' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                          Menunggu
                        </span>
                      )}
                      {p.status === 'Ditolak' && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900">
                          Ditolak
                        </span>
                      )}
                      <Eye className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: BUKU PENAGIHAN & MATRIKS IURAN (BESERTA POS PIUTANG) */}
        {/* ============================================================ */}
        {tab === 'transparansi' && (
          <div className="space-y-6">
            {/* 1. POS PIUTANG & PINJAMAN BERJALAN (TERPISAH DARI KAS RIIL RT) */}
            <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-2xl p-4 sm:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight uppercase">
                  POS PIUTANG & PINJAMAN BERJALAN (TERPISAH DARI KAS RIIL RT)
                </h2>
              </div>
              <p className="text-xs text-slate-600 mb-4">
                Dana pembayaran cicilan/lunas dari warga dan pengembalian kasbon petugas otomatis masuk ke Kas Masuk RT saat diterima.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* KARTU 1: PIUTANG TUNGGAKAN WARGA */}
                <div className="bg-[#fffdfa] border border-amber-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-100/70 text-amber-800 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm">
                            Piutang Tunggakan Warga
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Sheet: TunggakanLama
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                        {transparencyData?.posPiutang?.tunggakan?.countBelumLunas ?? 9} Warga Belum Lunas
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] text-slate-500 font-medium">
                        Sisa Piutang Yang Belum Tertagih:
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-[#853406] mt-0.5 tracking-tight">
                        {formatRupiah(transparencyData?.posPiutang?.tunggakan?.sisaBelumBayar ?? 30435000)}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-amber-100 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        Total Awal: <strong className="font-bold text-slate-800">{formatRupiah(transparencyData?.posPiutang?.tunggakan?.totalAwal ?? 30435000)}</strong>
                      </span>
                      <span>
                        Sudah Masuk Kas: <strong className="font-bold text-emerald-700">{formatRupiah(transparencyData?.posPiutang?.tunggakan?.totalTerbayar ?? 0)}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowTunggakanDetailModal(true)}
                    className="mt-4 w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-300 text-amber-900 text-xs font-bold transition flex items-center justify-center gap-2"
                  >
                    <span>Lihat Rincian Piutang Tunggakan Warga</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* KARTU 2: PINJAMAN KASBON PETUGAS */}
                <div className="bg-[#fafffe] border border-cyan-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-cyan-100/70 text-cyan-800 flex items-center justify-center shrink-0">
                          <Wallet className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm">
                            Pinjaman Kasbon Petugas
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Sheet: DataKasbon
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-900">
                        {transparencyData?.posPiutang?.kasbon?.countBelumLunas ?? 4} Petugas Berjalan
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-[11px] text-slate-500 font-medium">
                        Sisa Kasbon Belum Dikembalikan:
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-cyan-950 mt-0.5 tracking-tight">
                        {formatRupiah(transparencyData?.posPiutang?.kasbon?.sisaBelumKembali ?? 1400000)}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-cyan-100 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        Kasbon Awal: <strong className="font-bold text-slate-800">{formatRupiah(transparencyData?.posPiutang?.kasbon?.totalAwal ?? 1400000)}</strong>
                      </span>
                      <span>
                        Sudah Kembali ke Kas: <strong className="font-bold text-emerald-700">{formatRupiah(transparencyData?.posPiutang?.kasbon?.totalTerbayar ?? 0)}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowKasbonDetailModal(true)}
                    className="mt-4 w-full py-2.5 px-3 rounded-xl bg-cyan-50 hover:bg-cyan-100/80 border border-cyan-300 text-cyan-900 text-xs font-bold transition flex items-center justify-center gap-2"
                  >
                    <span>Lihat Rincian Pinjaman Kasbon Petugas</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. BUKU PENAGIHAN & MATRIKS IURAN (SAMA SEPERTI DI ADMIN) */}
            <div className="space-y-4">
              {/* Header & Filter Tahun */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                      <span>Buku Penagihan & Matriks Iuran</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Tahun {matrixYear}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Terkoneksi langsung ke Google Sheet <strong>DataIuran</strong> & <strong>MasterWarga</strong>. Status lunas tercatat otomatis.
                    </p>
                  </div>
                </div>

                {/* Dropdown Tahun */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white shadow-2xs text-slate-800 text-xs font-bold hover:border-emerald-500 transition self-start sm:self-auto shrink-0">
                  <span className="text-slate-500 font-medium">Tahun:</span>
                  <select
                    value={matrixYear}
                    onChange={(e) => {
                      const yr = Number(e.target.value);
                      setMatrixYear(yr);
                      fetchMatrixData(yr);
                    }}
                    className="bg-transparent font-extrabold text-slate-900 text-xs focus:outline-none cursor-pointer"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                    <option value={2027}>2027</option>
                  </select>
                </div>
              </div>

              {/* Quick Summary Cards (Statistik Matriks Dinamis) */}
              {(() => {
                const ALL_MONTH_NAMES = [
                  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                ];
                const isAll = matrixPeriod === 'ALL';
                let targetM = 'November';
                if (!isAll && matrixPeriod) {
                  const parts = matrixPeriod.split('-');
                  if (parts.length === 2) {
                    const idx = parseInt(parts[1], 10) - 1;
                    if (idx >= 0 && idx < 12) targetM = ALL_MONTH_NAMES[idx];
                  }
                }

                const getBlockGroup = (blokStr?: string): string => {
                  if (!blokStr) return 'Lainnya';
                  const trimmed = blokStr.trim().toUpperCase();
                  const match = trimmed.match(/^[A-Z]+/);
                  if (match) return `Blok ${match[0]}`;
                  return 'Lainnya';
                };

                const blockCounts: Record<string, number> = {};
                (matrixData?.data || []).forEach((row: any) => {
                  const grp = getBlockGroup(row.blok);
                  blockCounts[grp] = (blockCounts[grp] || 0) + 1;
                });
                const availableBlocks = Object.keys(blockCounts).sort().map((name) => ({
                  name,
                  count: blockCounts[name],
                }));

                const filteredList = (matrixData?.data || []).filter((row: any) => {
                  if (matrixSearch.trim()) {
                    const q = matrixSearch.toLowerCase();
                    const matchNama = row.nama?.toLowerCase().includes(q);
                    const matchBlok = row.blok?.toLowerCase().includes(q);
                    if (!matchNama && !matchBlok) return false;
                  }
                  const grp = getBlockGroup(row.blok);
                  if (matrixSelectedBlock !== 'ALL' && grp !== matrixSelectedBlock) {
                    return false;
                  }
                  if (matrixFilterStatus === 'LUNAS_INI') {
                    if (isAll) return row.totalLunasTahunIni > 0;
                    return row.months?.[targetM]?.status === 'Lunas';
                  }
                  if (matrixFilterStatus === 'BELUM_INI') {
                    if (isAll) return row.totalLunasTahunIni < 12;
                    return row.months?.[targetM]?.status !== 'Lunas';
                  }
                  return true;
                });

                const groupedRows: Record<string, any[]> = {};
                filteredList.forEach((row: any) => {
                  const grp = getBlockGroup(row.blok);
                  if (!groupedRows[grp]) groupedRows[grp] = [];
                  groupedRows[grp].push(row);
                });
                Object.keys(groupedRows).forEach((grp) => {
                  groupedRows[grp].sort((a: any, b: any) =>
                    a.blok.localeCompare(b.blok, undefined, { numeric: true })
                  );
                });
                const sortedGroupKeys = Object.keys(groupedRows).sort();

                const statsTarget = matrixData?.monthlyStats?.[targetM] || { lunas: 0, belum: 0, nominal: 0 };
                const secM = targetM === 'November' ? 'Desember' : 'November';
                const statsSec = matrixData?.monthlyStats?.[secM] || { lunas: 0, belum: 0, nominal: 0 };

                return (
                  <div className="space-y-4">
                    {/* Statistik Matriks Cards */}
                    {matrixData?.monthlyStats && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                          <div className="text-[11px] font-bold text-slate-500 mb-0.5">Total Warga Aktif</div>
                          <div className="text-xl font-black text-slate-900">{matrixData.totalResidents || residents.length} KK</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Tercatat di Sheet MasterWarga</div>
                        </div>

                        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                          <div className="text-[11px] font-bold text-emerald-800 mb-0.5">
                            {isAll ? `Realisasi ${targetM}` : `Lunas ${targetM} ${matrixYear}`}
                          </div>
                          <div className="text-xl font-black text-emerald-700">
                            {statsTarget.lunas} KK
                          </div>
                          <div className="text-[10px] text-emerald-600 mt-0.5">
                            {formatRupiah(statsTarget.nominal)} terkumpul
                          </div>
                        </div>

                        <div className="bg-teal-50/70 p-3.5 rounded-xl border border-teal-200 shadow-2xs">
                          <div className="text-[11px] font-bold text-teal-800 mb-0.5">Lunas {secM} {matrixYear}</div>
                          <div className="text-xl font-black text-teal-700">
                            {statsSec.lunas} KK
                          </div>
                          <div className="text-[10px] text-teal-600 mt-0.5">
                            {formatRupiah(statsSec.nominal)}
                          </div>
                        </div>

                        <div
                          onClick={() => setMatrixFilterStatus('BELUM_INI')}
                          className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200 shadow-2xs cursor-pointer hover:bg-rose-100/70 transition"
                          title="Klik untuk memfilter daftar belum bayar"
                        >
                          <div className="text-[11px] font-bold text-rose-800 mb-0.5 flex items-center justify-between">
                            <span>{isAll ? 'Belum Bayar (Berjalan)' : `Belum Bayar ${targetM}`}</span>
                            <span className="text-[9px] underline text-rose-600">Filter</span>
                          </div>
                          <div className="text-xl font-black text-rose-700">
                            {statsTarget.belum} KK
                          </div>
                          <div className="text-[10px] text-rose-600 mt-0.5">Warga belum menyelesaikan iuran</div>
                        </div>
                      </div>
                    )}

                    {/* Filter Bar: Pencarian, Periode Bulan, Blok, & Status */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                        <div className="relative flex-1 min-w-[180px]">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Cari nama warga atau blok..."
                            value={matrixSearch}
                            onChange={(e) => setMatrixSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                          />
                        </div>

                        {/* Filter Periode Bulan */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                          <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px] font-bold text-slate-500">Periode:</span>
                          <select
                            value={matrixPeriod}
                            onChange={(e) => setMatrixPeriod(e.target.value)}
                            className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer"
                          >
                            <option value="ALL">Semua Bulan ({matrixYear})</option>
                            {ALL_MONTH_NAMES.map((m, idx) => {
                              const mPad = String(idx + 1).padStart(2, '0');
                              const code = `${matrixYear}-${mPad}`;
                              return (
                                <option key={code} value={code}>
                                  {m} {matrixYear}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Filter Blok */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-[11px] font-bold text-slate-500">Blok:</span>
                          <select
                            value={matrixSelectedBlock}
                            onChange={(e) => setMatrixSelectedBlock(e.target.value)}
                            className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer"
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
                              matrixFilterStatus === 'LUNAS_INI' ? 'bg-emerald-600 text-white shadow-2xs' : 'hover:text-emerald-700'
                            }`}
                          >
                            {isAll ? 'Sudah Ada Bayar' : `Lunas (${targetM.slice(0, 3)})`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixFilterStatus('BELUM_INI')}
                            className={`px-3 py-1 rounded-lg transition ${
                              matrixFilterStatus === 'BELUM_INI' ? 'bg-rose-600 text-white shadow-2xs' : 'hover:text-rose-700'
                            }`}
                          >
                            {isAll ? 'Ada Belum Bayar' : `Belum Bayar (${targetM.slice(0, 3)})`}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Tabel Matriks Penagihan Iuran Berdasarkan Grouping Blok */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                      {isLoadingMatrix ? (
                        <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                          <span>Memuat data matriks iuran...</span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-slate-900 text-white font-bold">
                                <th className="py-3 px-3 sticky left-0 bg-slate-900 z-10 whitespace-nowrap shadow-sm min-w-[190px]">
                                  Blok & Nama Warga
                                </th>
                                {matrixData?.monthNames?.map((m: string) => {
                                  const isSelCol = !isAll && m === targetM;
                                  return (
                                    <th
                                      key={m}
                                      className={`py-3 px-2 text-center whitespace-nowrap transition ${
                                        isSelCol ? 'bg-emerald-800 text-emerald-100 font-black' : ''
                                      }`}
                                    >
                                      <span>{m.slice(0, 3)}</span>
                                      {isSelCol && <span className="block text-[8px] font-bold text-emerald-200">Pilihan</span>}
                                    </th>
                                  );
                                })}
                                <th className="py-3 px-2.5 text-center whitespace-nowrap">Total Lunas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sortedGroupKeys.length === 0 ? (
                                <tr>
                                  <td colSpan={14} className="py-12 text-center text-slate-400 font-medium text-xs">
                                    Tidak ada data warga yang cocok dengan kriteria pencarian/filter.
                                  </td>
                                </tr>
                              ) : (
                                sortedGroupKeys.map((blockKey) => {
                                  const bRows = groupedRows[blockKey];
                                  const bLunas = bRows.filter((r: any) =>
                                    isAll ? r.totalLunasTahunIni > 0 : r.months?.[targetM]?.status === 'Lunas'
                                  ).length;
                                  const bBelum = bRows.filter((r: any) =>
                                    isAll ? r.totalLunasTahunIni < 12 : r.months?.[targetM]?.status !== 'Lunas'
                                  ).length;

                                  return (
                                    <React.Fragment key={`group-${blockKey}`}>
                                      <tr className="bg-slate-100/90 border-y border-slate-200 sticky top-0 z-5">
                                        <td colSpan={14} className="py-2 px-4 font-bold text-slate-900">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <Building2 className="w-4 h-4 text-emerald-600" />
                                              <span className="text-xs uppercase tracking-wide font-black text-slate-900">
                                                {blockKey}
                                              </span>
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                                                {bRows.length} Warga
                                              </span>
                                              {matrixFilterStatus === 'BELUM_INI' && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                                  {bBelum} Belum Bayar
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                                              <span className="text-emerald-700 font-bold">✓ {bLunas} Lunas</span>
                                              <span>•</span>
                                              <span className="text-rose-600 font-bold">- {bBelum} Belum Bayar</span>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>

                                      {bRows.map((row: any) => {
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
                                              const isSelCol = !isAll && m === targetM;

                                              return (
                                                <td
                                                  key={m}
                                                  className={`py-2 px-1 text-center ${isSelCol ? 'bg-emerald-50/40' : ''}`}
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
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR FOR SMARTPHONES */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070c1b]/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => { setTab('dashboard'); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition ${
            tab === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-1" />
          <span className="text-[10px] leading-none">Dashboard</span>
        </button>

        <button
          onClick={() => { setTab('upload'); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition ${
            tab === 'upload' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="w-5 h-5 mb-1" />
          <span className="text-[10px] leading-none">Setor Iuran</span>
        </button>

        <button
          onClick={() => { setTab('status'); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition ${
            tab === 'status' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-5 h-5 mb-1" />
          <span className="text-[10px] leading-none">Cek Status</span>
        </button>

        <button
          onClick={() => { setTab('transparansi'); setIsMobileMenuOpen(false); }}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition ${
            tab === 'transparansi' ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarCheck className="w-5 h-5 mb-1" />
          <span className="text-[10px] leading-none">Matriks</span>
        </button>

        <button
          onClick={() => {
            setAdminPinInput('');
            setAdminPinError('');
            setShowPinText(false);
            setShowAdminPinModal(true);
          }}
          className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition text-slate-400 hover:text-emerald-400"
        >
          <Shield className="w-5 h-5 mb-1" />
          <span className="text-[10px] leading-none">Admin</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: RINCIAN PIUTANG TUNGGAKAN WARGA (GAMBAR 2) */}
      {/* ============================================================ */}
      {showTunggakanDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Rincian Piutang Tunggakan Warga</h3>
                  <p className="text-[11px] text-slate-500">Transparansi Piutang Berjalan Kas RT (Sheet: TunggakanLama)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTunggakanDetailModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex justify-between items-center">
              <span>Total Sisa Piutang:</span>
              <span className="text-base font-black text-amber-950">
                {formatRupiah(transparencyData?.posPiutang?.tunggakan?.sisaBelumBayar ?? 30435000)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-1 text-xs">
              {(transparencyData?.posPiutang?.tunggakan?.list || []).map((t: any) => (
                <div
                  key={t.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{t.namaWarga}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.keterangan || 'Tunggakan iuran'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-amber-900 text-sm">{formatRupiah(t.jumlah)}</div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTunggakanDetailModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: RINCIAN PINJAMAN KASBON PETUGAS (GAMBAR 2) */}
      {/* ============================================================ */}
      {showKasbonDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Rincian Pinjaman Kasbon Petugas</h3>
                  <p className="text-[11px] text-slate-500">Transparansi Pinjaman Berjalan Petugas RT (Sheet: DataKasbon)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowKasbonDetailModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 p-3 bg-cyan-50 rounded-xl border border-cyan-200 text-xs text-cyan-900 flex justify-between items-center">
              <span>Total Sisa Kasbon Berjalan:</span>
              <span className="text-base font-black text-cyan-950">
                {formatRupiah(transparencyData?.posPiutang?.kasbon?.sisaBelumKembali ?? 1400000)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-1 text-xs">
              {(transparencyData?.posPiutang?.kasbon?.list || []).map((k: any) => (
                <div
                  key={k.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{k.namaPeminjam}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Keperluan: {k.keterangan || 'Pinjaman Kasbon'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-cyan-950 text-sm">{formatRupiah(k.nominal)}</div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-900">
                      {k.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowKasbonDetailModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SEARCH WARGA */}
      {isWargaPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
              <h3 className="font-black text-slate-900 text-sm">Pilih Data Warga / Blok</h3>
              <button
                onClick={() => setIsWargaPickerOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <div className="py-2.5">
              <input
                type="text"
                autoFocus
                value={wargaSearchQuery}
                onChange={(e) => setWargaSearchQuery(e.target.value)}
                placeholder="Cari nama atau nomor blok..."
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pt-1 text-xs">
              {filteredResidents.length === 0 ? (
                <div className="py-8 text-center text-slate-400">Warga tidak ditemukan.</div>
              ) : (
                filteredResidents.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectResident(r)}
                    className="w-full text-left p-3 rounded-xl hover:bg-slate-100 border border-transparent hover:border-slate-200 flex items-center justify-between transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold bg-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-900">
                          {r.blok}
                        </span>
                        <span className="font-bold text-slate-900">{r.nama}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tarif: {formatRupiah(r.tarif)}/bln {r.hp && `• WA: ${r.hp}`}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW DETAIL TIKET */}
      {selectedProofPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-200">
              <h3 className="font-black text-slate-900 text-sm">Rincian Bukti Pembayaran</h3>
              <button
                onClick={() => setSelectedProofPreview(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-3 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Tiket:</span>
                <span className="font-mono font-bold text-slate-900">{selectedProofPreview.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Warga:</span>
                <strong className="text-slate-900">{selectedProofPreview.residentName} ({selectedProofPreview.blok})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bulan:</span>
                <strong className="text-slate-900">{selectedProofPreview.bulan.join(', ')}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal:</span>
                <strong className="text-emerald-700 font-black">{formatRupiah(selectedProofPreview.nominal)}</strong>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold">{selectedProofPreview.status}</span>
              </div>
              {selectedProofPreview.adminNote && (
                <div className="pt-1 text-slate-600">
                  <span>Catatan Admin: </span>
                  <span className="italic">{selectedProofPreview.adminNote}</span>
                </div>
              )}
            </div>

            {selectedProofPreview.buktiUrl && (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 p-1.5 mb-3 flex justify-center">
                <img
                  src={selectedProofPreview.buktiUrl}
                  alt="Bukti Transfer"
                  className="max-h-60 w-auto object-contain rounded-lg"
                />
              </div>
            )}

            <button
              onClick={() => setSelectedProofPreview(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* MODAL VERIFIKASI PASSWORD ADMIN - SPLIT 2 JENDELA */}
      {showAdminPinModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-4xl xl:max-w-5xl w-full shadow-2xl overflow-hidden relative my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Close Button Top Right */}
            <button
              type="button"
              onClick={() => {
                setShowAdminPinModal(false);
                setAdminPinInput('');
                setAdminPinError('');
              }}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-900/80 border border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-800 transition shadow-sm"
              title="Tutup & Kembali ke Portal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
              {/* JENDELA KIRI: TULISAN & INFORMASI SISTEM KAS RT */}
              <div className="lg:col-span-7 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 sm:p-10 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between relative overflow-hidden">
                {/* Accent glow */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10">
                  {/* Brand Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <img
                      src="/logo-cleopatra.jpg"
                      alt="Logo IPL Cleopatra"
                      className="w-11 h-11 rounded-2xl object-cover shadow-md ring-2 ring-emerald-500/30"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-base tracking-tight">IPL Cleopatra</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Sistem Kas RT
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-medium">
                        {settings?.namaRt || 'RT 011 / RW 028'} • {settings?.namaKomplek || 'Cluster Cleopatra'}
                      </div>
                    </div>
                  </div>

                  {/* Headline & Tulisan Utama */}
                  <div className="space-y-3 max-w-lg">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-[11px] font-bold text-slate-300">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Portal Administrasi Keuangan RT</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-snug">
                      Pengelolaan Kas Riil & Iuran Warga yang{' '}
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">
                        Transparan, Rapi, dan Akuntabel
                      </span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Sistem terpadu pengurus RT untuk verifikasi bukti transfer, pencatatan kas masuk & pengeluaran operasional, pembukuan matriks 12 bulan, serta pemantauan piutang tunggakan warga dan kasbon.
                    </p>
                  </div>

                  {/* 3 Fitur Utama */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-6">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm backdrop-blur-sm">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-bold text-white text-xs">Verifikasi Kas Riil</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Validasi bukti transfer warga sebelum masuk kas.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm backdrop-blur-sm">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2">
                        <CalendarCheck className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-bold text-white text-xs">Matriks 12 Bulan</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Buku penagihan otomatis per blok rumah & rekap.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm backdrop-blur-sm">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mb-2">
                        <Wallet className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="font-bold text-white text-xs">Tunggakan & Kasbon</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        Pos piutang warga dan pinjaman petugas terpisah.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Kiri */}
                <div className="pt-6 mt-6 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    Enkripsi PIN & Proteksi Akun Pengurus
                  </span>
                  <span>v2.4 Pro</span>
                </div>
              </div>

              {/* JENDELA KANAN: FORM MASUK ADMIN */}
              <div className="lg:col-span-5 bg-slate-900/95 p-6 sm:p-10 flex flex-col justify-center relative">
                <div className="w-full max-w-sm mx-auto">
                  <div className="mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                      <Lock className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Masuk Admin RT</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Masukkan Password / PIN Admin untuk membuka panel pengurus dan bendahara RT.
                    </p>
                  </div>

                  {adminPinError && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{adminPinError}</span>
                    </div>
                  )}

                  <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Password / PIN Akses Admin
                      </label>
                      <div className="relative">
                        <input
                          type={showPinText ? 'text' : 'password'}
                          autoFocus
                          required
                          value={adminPinInput}
                          onChange={(e) => setAdminPinInput(e.target.value)}
                          placeholder="Masukkan password admin..."
                          className="w-full pl-3.5 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPinText(!showPinText)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                          title={showPinText ? 'Sembunyikan' : 'Tampilkan'}
                        >
                          {showPinText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <button
                        type="submit"
                        disabled={isAdminVerifying}
                        className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-xs shadow-lg shadow-emerald-900/40 transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isAdminVerifying ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Memverifikasi Akses...</span>
                          </>
                        ) : (
                          <>
                            <span>Masuk ke Panel Pengurus</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminPinModal(false);
                          setAdminPinInput('');
                          setAdminPinError('');
                        }}
                        className="w-full py-2.5 rounded-xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition"
                      >
                        Batal & Tetap di Portal Warga
                      </button>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
                      <p className="text-[11px] text-slate-500">
                        Hanya untuk Ketua RT, Sekretaris, dan Bendahara.
                      </p>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION (Quick shortcuts for phone screens) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0b1329] border-t border-slate-800 flex justify-around py-2 px-1 shadow-2xl">
        <button
          onClick={() => setTab('dashboard')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition ${
            tab === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-[10px]">Dashboard</span>
        </button>

        <button
          onClick={() => setTab('upload')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition ${
            tab === 'upload' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span className="text-[10px]">Setor Iuran</span>
        </button>

        <button
          onClick={() => setTab('status')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition ${
            tab === 'status' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="text-[10px]">Cek Status</span>
        </button>

        <button
          onClick={() => setTab('transparansi')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition ${
            tab === 'transparansi' ? 'text-emerald-400 font-bold' : 'text-slate-400'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span className="text-[10px]">Buku Matriks</span>
        </button>
      </div>
    </div>
  );
}
