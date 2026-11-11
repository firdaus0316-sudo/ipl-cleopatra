import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fetchProofsFromSheet, fetchIncomesFromSheet } from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const db = getDb();

    // Auto-sync live proofs dari Google Sheet BuktiTransfer
    try {
      const pRes = await fetchProofsFromSheet();
      if (pRes.success && pRes.proofs.length > 0) {
        const deletedProofSet = new Set([...(db.deletedIncomeIds || []), ...(db.deletedProofIds || [])]);
        db.proofs = pRes.proofs.filter((p) => !deletedProofSet.has(p.id));
      }
    } catch {}

    // Auto-sync live incomes dari Google Sheet DataIuran
    try {
      const incRes = await fetchIncomesFromSheet();
      if (incRes.success && incRes.incomes.length > 0) {
        db.incomes = incRes.incomes;
      }
    } catch {}

    let proofs = db.proofs || [];

    if (q) {
      proofs = proofs.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.residentName.toLowerCase().includes(q) ||
          p.blok.toLowerCase().includes(q) ||
          p.hp.includes(q)
      );
    }

    // Return safe projection for public view
    const safeList = proofs.slice(0, 30).map((p) => ({
      id: p.id,
      residentName: p.residentName,
      blok: p.blok,
      kategori: p.kategori,
      bulan: p.bulan,
      nominal: p.nominal,
      status: p.status,
      adminNote: p.adminNote,
      createdAt: p.createdAt,
      verifiedAt: p.verifiedAt,
      buktiUrl: p.buktiUrl,
    }));

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
