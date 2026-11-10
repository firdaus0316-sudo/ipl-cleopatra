import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const db = getDb();
    let proofs = db.proofs;

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
      // Provide blurred or small preview link if needed
      buktiUrl: p.buktiUrl,
    }));

    return NextResponse.json({
      success: true,
      data: safeList,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
