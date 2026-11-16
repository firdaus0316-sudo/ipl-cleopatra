import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'cleo_admin_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 hari

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.GOOGLE_WEBHOOK_URL ||
    'ipl-cleopatra-rt011-rw028-session-secret-2026'
  );
}

/**
 * Buat token sesi admin bertanda tangan HMAC-SHA256.
 */
export function createAdminSessionToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${expiresAt}.${nonce}`;
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verifikasi token sesi admin secara aman (timing-safe).
 */
export function verifyAdminSessionToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expiresAtStr, nonce, providedSig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || isNaN(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const payload = `${expiresAtStr}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');

  try {
    const a = Buffer.from(providedSig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Cek apakah request HTTP membawa cookie sesi admin yang sah.
 */
export function isAdminAuthenticated(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(token);
}

export function unauthorizedAdminResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Sesi admin tidak valid atau telah berakhir. Silakan login kembali.',
      requireAuth: true,
    },
    { status: 401 }
  );
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === 'production',
  };
}
