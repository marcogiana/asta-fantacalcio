import { NextResponse } from "next/server";
import { getRedis, K, readLive } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polling economico. Il client manda la revisione che ha in mano:
 * se il server è alla stessa, risponde 204 senza leggere altro.
 */
export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("rev") ?? -1);
  const rev = Number(await getRedis().get(K.rev)) || 0;
  if (since === rev) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await readLive(), { headers: { "Cache-Control": "no-store" } });
}
