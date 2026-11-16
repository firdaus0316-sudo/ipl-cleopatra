import { NextRequest, NextResponse } from 'next/server';
import { getDb, addLog } from '@/lib/db';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminCookieOptions,
  isAdminAuthenticated,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authenticated = isAdminAuthenticated(req);
  return NextResponse.json({ success: true, authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const db = getDb();

    if (pin && String(pin).trim() === String(db.settings.adminPin).trim()) {
      addLog('Login Admin', 'Admin berhasil login ke panel pengurus RT', 'Admin');
      const token = createAdminSessionToken();
      const res = NextResponse.json({
        success: true,
        message: 'Login berhasil.',
        role: 'admin',
      });
      res.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
      return res;
    }

    return NextResponse.json(
      { success: false, error: 'Password / PIN admin tidak sesuai.' },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logout berhasil.' });
  res.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
