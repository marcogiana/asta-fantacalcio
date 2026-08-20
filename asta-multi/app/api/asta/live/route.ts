import { NextResponse } from "next/server";
import { getRedis, K, readLive, normCodice, CODICE_RE } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling economico. Il client manda la revisione che ha in mano:
 * se il server è alla stessa, risponde 204 senza leggere altro.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = normCodice(u.searchParams.get("code"));
  if (!CODICE_RE.test(code)) return new NextResponse(null, { status: 400 });

  const since = Number(u.searchParams.get("rev") ?? -1);
  const rev = Number(await getRedis().get(K(code).rev)) || 0;
  if (since === rev) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await readLive(code), { headers: { "Cache-Control": "no-store" } });
}
