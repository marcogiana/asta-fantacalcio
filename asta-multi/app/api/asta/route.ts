import { NextResponse } from "next/server";
import {
  getRedis, K, readLive, tryBid, bumpRev, pushTicker, parseBid,
  nuovoCodice, normCodice, CODICE_RE, TUTTE_LE_CHIAVI, rinnovaScadenza,
} from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asObj = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const bad = (msg: string, code = 400) => NextResponse.json({ error: msg }, { status: code });

/** Snapshot di una singola asta. */
export async function GET(req: Request) {
  const code = normCodice(new URL(req.url).searchParams.get("code"));
  if (!CODICE_RE.test(code)) return bad("Codice asta non valido.", 400);

  const k = K(code);
  const [setupRaw, playersRaw] = (await getRedis().pipeline().get(k.setup).get(k.players).exec()) as any[];
  if (!setupRaw) return NextResponse.json({ error: "Asta non trovata." }, { status: 404 });

  return NextResponse.json({
    code,
    setup: asObj(setupRaw),
    players: playersRaw ? asObj(playersRaw) : [],
    live: await readLive(code),
  });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Richiesta illeggibile.");
  }

  const pin = process.env.ASTA_PIN;
  if (pin && body.pin !== pin) return bad("PIN non valido.", 403);

  /* ---------- creazione: genera un codice nuovo ---------- */
  if (body.action === "create") {
    if (!body.setup?.teams?.length || !body.players?.length) return bad("Servono squadre e listone.");

    // Ritento in caso di collisione, che con 30^5 combinazioni è remota ma non impossibile.
    let code = "";
    for (let i = 0; i < 6; i++) {
      const c = nuovoCodice();
      const preso = await getRedis().exists(K(c).setup);
      if (!preso) {
        code = c;
        break;
      }
    }
    if (!code) return bad("Non riesco a generare un codice libero. Riprova.", 500);

    const k = K(code);
    await getRedis()
      .pipeline()
      .set(k.players, JSON.stringify(body.players))
      .set(k.setup, JSON.stringify({ ...body.setup, code, createdAt: Date.now() }))
      .set(k.rev, 1)
      .exec();
    await rinnovaScadenza(code);
    return NextResponse.json({ ok: true, code });
  }

  /* ---------- da qui serve un codice valido ---------- */
  const code = normCodice(body.code);
  if (!CODICE_RE.test(code)) return bad("Codice asta non valido.", 400);
  const k = K(code);

  if (body.action === "reset") {
    await getRedis().del(...TUTTE_LE_CHIAVI(code));
    return NextResponse.json({ ok: true });
  }

  const setupRaw = await getRedis().get(k.setup);
  const setup: any = setupRaw ? asObj(setupRaw) : null;
  if (!setup) return bad("Asta non trovata.", 404);

  switch (body.action) {
    /* ---------- il banditore apre un lotto ---------- */
    case "open": {
      const { playerId, nome } = body;
      if (!playerId) return bad("Manca il giocatore.");
      const already = ((await getRedis().lrange(k.assigned, 0, -1)) as any[]).map(asObj);
      if (already.some((a) => a.playerId === playerId)) return bad("Giocatore già assegnato.", 409);
      await getRedis().pipeline().set(k.lot, JSON.stringify({ playerId, openedAt: Date.now() })).del(k.bid).exec();
      await pushTicker(code, `All'asta ${nome || playerId}`);
      await bumpRev(code);
      await rinnovaScadenza(code);
      return NextResponse.json(await readLive(code));
    }

    /* ---------- rilancio ---------- */
    case "bid": {
      const { playerId, amount, teamId, teamName } = body;
      const lotRaw = await getRedis().get(k.lot);
      const lot: any = lotRaw ? asObj(lotRaw) : null;
      if (!lot) return bad("Nessun lotto aperto.", 409);
      if (lot.playerId !== playerId) return bad("Il lotto è cambiato.", 409);
      if (!Number.isInteger(amount) || amount < 1) return bad("Importo non valido.");

      const team = setup.teams.find((t: any) => t.id === teamId);
      if (!team) return bad("Squadra sconosciuta.", 403);

      // Tetto di spesa ricalcolato lato server: non si aggira dal client.
      const assigned = ((await getRedis().lrange(k.assigned, 0, -1)) as any[]).map(asObj);
      const mine = assigned.filter((a) => a.teamId === teamId);
      const spent = mine.reduce((s, a) => s + a.price, 0);
      const counts: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
      mine.forEach((a) => (counts[a.ruolo] = (counts[a.ruolo] || 0) + 1));
      const slotsLeft = ["P", "D", "C", "A"].reduce(
        (s, r) => s + Math.max(0, setup.slots[r] - (counts[r] || 0)),
        0
      );
      const maxBid = Math.max(0, setup.budget - spent - Math.max(0, slotsLeft - 1));
      if (slotsLeft === 0) return bad("Rosa completa.", 409);
      if (amount > maxBid) return bad(`Puoi offrire al massimo ${maxBid}.`, 409);

      const closesAt = setup.timer > 0 ? Date.now() + setup.timer * 1000 : null;
      const beaten = await tryBid(code, amount, teamId, closesAt);
      if (beaten !== 0) {
        return NextResponse.json({ ...(await readLive(code)), rejected: beaten }, { status: 409 });
      }
      await pushTicker(code, `${teamName || team.name} → ${amount}`);
      await bumpRev(code);
      await rinnovaScadenza(code);
      return NextResponse.json(await readLive(code));
    }

    /* ---------- aggiudica ---------- */
    case "assign": {
      const [lotRaw, bidRaw] = (await getRedis().pipeline().get(k.lot).get(k.bid).exec()) as any[];
      const lot: any = lotRaw ? asObj(lotRaw) : null;
      const { bid, bidderId } = parseBid(bidRaw as string | null);
      if (!lot || !bidderId || bid < 1) return bad("Niente da aggiudicare.", 409);
      const entry = { playerId: lot.playerId, teamId: bidderId, price: bid, ruolo: body.ruolo, at: Date.now() };
      await getRedis().pipeline().rpush(k.assigned, JSON.stringify(entry)).del(k.lot).del(k.bid).exec();
      const tn = setup.teams.find((t: any) => t.id === bidderId)?.name || bidderId;
      await pushTicker(code, `${body.nome || lot.playerId} a ${tn} per ${bid}`);
      await bumpRev(code);
      await rinnovaScadenza(code);
      return NextResponse.json(await readLive(code));
    }

    /* ---------- ritira il lotto ---------- */
    case "drop": {
      await getRedis().pipeline().del(k.lot).del(k.bid).exec();
      await pushTicker(code, `${body.nome || "Lotto"} ritirato`);
      await bumpRev(code);
      return NextResponse.json(await readLive(code));
    }

    /* ---------- annulla l'ultima aggiudicazione ---------- */
    case "undo": {
      const last = await getRedis().rpop(k.assigned);
      if (!last) return bad("Nessuna aggiudicazione da annullare.", 409);
      await pushTicker(code, `Annullato: ${body.nome || asObj(last).playerId}`);
      await bumpRev(code);
      return NextResponse.json(await readLive(code));
    }

    default:
      return bad("Azione sconosciuta.");
  }
}
