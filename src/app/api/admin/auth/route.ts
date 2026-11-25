import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb, addLog } from '@/lib/db';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminCookieOptions,
  isAdminAuthenticated,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// In-memory brute-force guard (per IP, 8 percobaan gagal dalam 5 menit)
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;
const failedLoginMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function timingSafePinMatch(input: string, expected: string): boolean {
  const hashA = crypto.createHash('sha256').update(input).digest();
  const hashB = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function GET(req: NextRequest) {
  const authenticated = isAdminAuthenticated(req);
  return NextResponse.json({ success: true, authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = failedLoginMap.get(ip);
    if (record && now < record.resetAt && record.count >= MAX_FAILED_ATTEMPTS) {
      const waitMin = Math.max(1, Math.ceil((record.resetAt - now) / 60000));
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${waitMin} menit.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const pin = body?.pin;
    if (!pin || typeof pin !== 'string' || pin.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Password / PIN admin wajib diisi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const expectedPin = String(process.env.ADMIN_PIN || db.settings.adminPin || '').trim();

    if (expectedPin && timingSafePinMatch(pin.trim(), expectedPin)) {
      failedLoginMap.delete(ip);
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

    // Catat percobaan gagal
    if (!record || now >= record.resetAt) {
      failedLoginMap.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      record.count += 1;
      failedLoginMap.set(ip, record);
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
