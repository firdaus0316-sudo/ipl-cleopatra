import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 text-center">
        <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-black text-2xl">
          404
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
          Halaman Tidak Ditemukan
        </h1>

        <p className="text-slate-600 text-sm mt-2 leading-relaxed">
          Alamat atau tautan yang Anda tuju tidak ditemukan atau telah diperbarui.
        </p>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-block w-full py-3 px-4 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 text-sm"
          >
            Kembali ke Beranda Warga
          </Link>
        </div>
      </div>
    </div>
  );
}
