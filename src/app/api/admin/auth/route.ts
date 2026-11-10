import { NextRequest, NextResponse } from 'next/server';
import { getDb, addLog } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const db = getDb();

    if (pin === db.settings.adminPin) {
      addLog('Login Admin', 'Admin berhasil login ke panel pengurus RT', 'Admin');
      return NextResponse.json({
        success: true,
        message: 'Login berhasil.',
        role: 'admin',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Password / PIN admin tidak sesuai.' },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
