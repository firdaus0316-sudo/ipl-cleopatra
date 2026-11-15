'use client';

import React, { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log crash details safely for observability
    console.error('App Crash Protection Caught Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 mb-2">
          Sistem Terlindungi & Data Aman
        </span>

        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
          Terjadi Gangguan Sementara
        </h1>

        <p className="text-slate-600 text-sm mt-2 leading-relaxed">
          Jangan khawatir, seluruh data kas dan catatan iuran Anda tetap <strong>tersimpan aman 100%</strong> di Google Sheets. Sistem berhasil mengisolasi gangguan agar tidak merusak tampilan.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={() => {
              try {
                reset();
              } catch {
                window.location.reload();
              }
            }}
            className="w-full py-3 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 text-sm"
          >
            Muat Ulang Halaman
          </button>

          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="w-full py-2.5 px-4 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition text-sm"
          >
            Kembali ke Beranda Warga
          </button>
        </div>

        {process.env.NODE_ENV !== 'production' && error?.message && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-[11px] text-slate-500 font-mono overflow-auto max-h-32">
            {error.message}
          </div>
        )}
      </div>
    </div>
  );
}
