import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NS = process.env.ASTA_NAMESPACE || "asta:v2";
const LISTA = `${NS}:lista`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Registra un indirizzo interessato. L'hash evita i doppioni da solo. */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta illeggibile." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return NextResponse.json({ error: "Indirizzo non valido." }, { status: 400 });
  }

  // Campo libero, quindi lo riduco a un numero o lo scarto.
  const quanti = Number(String(body.quanti || "").replace(/\D/g, "")) || null;

  try {
    const r = getRedis();
    const gia = await r.hget(LISTA, email);
    if (gia) return NextResponse.json({ ok: true, gia: true });

    await r.hset(LISTA, {
      [email]: JSON.stringify({
        at: Date.now(),
        quanti: quanti && quanti <= 40 ? quanti : null,
      }),
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Archivio irraggiungibile: meglio dirlo che perdere il contatto in silenzio.
    return NextResponse.json(
      { error: "Non riesco a salvare adesso. Riprova tra poco, oppure scrivimi direttamente." },
      { status: 503 }
    );
  }
}

/**
 * Esporta gli indirizzi raccolti, in CSV.
 * Protetto da ASTA_ADMIN_TOKEN: senza quella variabile la rotta non risponde,
 * così una dimenticanza non espone gli indirizzi di nessuno.
 */
export async function GET(req: Request) {
  const atteso = process.env.ASTA_ADMIN_TOKEN;
  const dato = new URL(req.url).searchParams.get("token");
  if (!atteso || dato !== atteso) {
    return new NextResponse(null, { status: 404 });
  }

  const tutti = (await getRedis().hgetall(LISTA)) || {};
  const righe = [["email", "iscritto_il", "persone_in_lega"]];
  for (const [email, raw] of Object.entries(tutti)) {
    const v: any = typeof raw === "string" ? JSON.parse(raw) : raw;
    righe.push([email, new Date(v.at).toISOString().slice(0, 16).replace("T", " "), v.quanti ?? ""]);
  }

  const csv = righe.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": 'attachment; filename="lista-interessati.csv"',
      "Cache-Control": "no-store",
    },
  });
}
