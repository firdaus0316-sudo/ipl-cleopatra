import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_WEBHOOK_URL,
  SHEET_GIDS,
  fetchCsvByGid,
} from '@/lib/googleSheet';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const deep = searchParams.get('deep') === '1';

  const checkSheet = async (gid: string) => {
    const t0 = Date.now();
    try {
      const csv = await fetchCsvByGid(gid, 1);
      const rows = Math.max(0, csv.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1);
      return { ok: true, rows, ms: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Sheet unreachable', ms: Date.now() - t0 };
    }
  };

  try {
    const [masterWarga, dataIuran, dataPengeluaran, kasDansos, saldoAwalDansos] = await Promise.all([
      checkSheet(SHEET_GIDS.masterwarga),
      checkSheet(SHEET_GIDS.dataiuran),
      checkSheet(SHEET_GIDS.datapengeluaran),
      checkSheet(SHEET_GIDS.kasdansos),
      checkSheet(SHEET_GIDS.saldoawaldansos),
    ]);

    let webhook: { ok: boolean; status?: number; ms: number; error?: string } | undefined;
    if (deep) {
      const whUrl =
        process.env.GOOGLE_SCRIPT_WEBHOOK_URL ||
        process.env.GOOGLE_WEBHOOK_URL ||
        DEFAULT_WEBHOOK_URL;
      const whT0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(whUrl, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        webhook = { ok: res.ok, status: res.status, ms: Date.now() - whT0 };
      } catch (err: any) {
        clearTimeout(timer);
        webhook = { ok: false, error: err?.message || 'Webhook timeout', ms: Date.now() - whT0 };
      }
    }

    const sheetsOk = masterWarga.ok && dataIuran.ok && dataPengeluaran.ok && kasDansos.ok && saldoAwalDansos.ok;
    const allOk = sheetsOk && (!deep || Boolean(webhook?.ok));

    return NextResponse.json(
      {
        ok: allOk,
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        totalMs: Date.now() - startedAt,
        sheets: {
          masterWarga,
          dataIuran,
          dataPengeluaran,
          kasDansos,
          saldoAwalDansos,
        },
        ...(webhook ? { webhook } : {}),
      },
      {
        status: allOk ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        error: err?.message || 'Internal health check error',
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  }
}
