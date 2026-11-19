import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { splitProofByPeriod } from '@/lib/format';
import {
  fetchProofsFromSheet,
  fetchIncomesFromSheet,
  fetchResidentsFromSheet,
  getDirectGoogleDriveImageUrl,
  syncAllDbNamesWithMaster,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const db = getDb();

    // Auto-sync live proofs, incomes & masterwarga secara paralel
    try {
      const [pRes, incRes, resRes] = await Promise.all([
        fetchProofsFromSheet().catch(() => ({ success: false, proofs: [] as any[] })),
        fetchIncomesFromSheet().catch(() => ({ success: false, incomes: [] as any[] })),
        fetchResidentsFromSheet().catch(() => ({ success: false, residents: [] as any[] })),
      ]);

      if (resRes.success && resRes.residents && resRes.residents.length > 0) {
        db.residents = resRes.residents;
      }

      if (pRes.success && pRes.proofs.length > 0) {
        const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);
        db.proofs = pRes.proofs.filter((p) => !deletedProofSet.has(p.id));
      }

      if (incRes.success && incRes.incomes.length > 0) {
        db.incomes = incRes.incomes;
      }
    } catch {}

    syncAllDbNamesWithMaster(db);
    let proofs = [...(db.proofs || [])];

    // Urutkan terbaru di atas (reverse dari urutan baris Google Sheet) sebelum slice
    proofs.reverse();

    if (q) {
      proofs = proofs.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.residentName.toLowerCase().includes(q) ||
          p.blok.toLowerCase().includes(q) ||
          p.hp.includes(q)
      );
    }

    // Return safe projection for public view (prioritaskan Menunggu Verifikasi di paling atas)
    proofs.sort((a, b) => {
      const rank = (s: string) => (s === 'Menunggu Verifikasi' ? 0 : 1);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
    });

    const safeList = proofs.slice(0, 50).flatMap((p) => {
      const slices = splitProofByPeriod(p);
      return slices.map((s) => ({
        id: s.totalSlices > 1 ? `${p.id} (${s.sliceIndex + 1}/${s.totalSlices})` : p.id,
        residentName: p.residentName,
        blok: p.blok,
        kategori: p.kategori,
        bulan: s.periodCode !== '-' ? [s.periodCode] : p.bulan,
        nominal: s.periodNominal,
        status: p.status,
        adminNote:
          s.totalSlices > 1
            ? `${p.adminNote || 'Periode terpisah'} (Periode ${s.sliceIndex + 1}/${s.totalSlices} dari total Rp ${Number(p.nominal).toLocaleString('id-ID')})`
            : p.adminNote,
        createdAt: p.createdAt,
        verifiedAt: p.verifiedAt,
        buktiUrl: getDirectGoogleDriveImageUrl(p.driveUrl || p.buktiUrl),
      }));
    });

    // Jika mencari nama/blok tertentu, tambahkan juga transaksi kas masuk resmi dari DataIuran
    if (q) {
      const matchingIncomes = (db.incomes || [])
        .filter(
          (i) =>
            i.status === 'Sah' &&
            (i.sumber.toLowerCase().includes(q) || (i.catatan && i.catatan.toLowerCase().includes(q)))
        )
        .slice(0, 20);

      const existingProofIds = new Set(safeList.map((p) => p.id));

      matchingIncomes.forEach((inc) => {
        // Jangan duplikasi jika buktiId sudah ada di list
        if (inc.buktiId && existingProofIds.has(inc.buktiId)) return;
        if (existingProofIds.has(inc.id)) return;

        // Ambil nama dan blok dari format "Nama Warga (Blok)"
        const match = inc.sumber.match(/^(.*?)(?:\s*\((.*?)\))?$/);
        const rName = match?.[1]?.trim() || inc.sumber;
        const rBlok = match?.[2]?.trim() || '';

        safeList.unshift({
          id: inc.id,
          residentName: rName,
          blok: rBlok,
          kategori: inc.kategori || 'Iuran Bulanan',
          bulan: inc.bulan || [],
          nominal: inc.nominal,
          status: 'Terverifikasi' as const,
          adminNote: inc.catatan || 'Pembayaran resmi tercatat di kas RT',
          createdAt: inc.tanggal,
          verifiedAt: inc.tanggal,
          buktiUrl: '',
        });
      });
    }

    return NextResponse.json({
      success: true,
      data: safeList,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
