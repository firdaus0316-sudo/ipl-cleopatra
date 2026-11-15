'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Layout Error Caught:', error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 antialiased">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 mb-2">
            Proteksi Crash Global
          </span>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Pemulihan Sistem Otomatis
          </h1>

          <p className="text-slate-300 text-sm mt-2 leading-relaxed">
            Sistem berhasil menangani kendala rendering. Data kas warga Anda tetap aman tersimpan di Google Sheets.
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
              className="w-full py-3 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition active:scale-95 text-sm"
            >
              Muat Ulang Aplikasi
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="w-full py-2.5 px-4 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition text-sm"
            >
              Buka Halaman Utama
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
