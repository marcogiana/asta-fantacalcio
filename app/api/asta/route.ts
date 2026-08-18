import { NextResponse } from "next/server";
import { getRedis, K, readLive, tryBid, bumpRev, pushTicker, parseBid } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const asObj = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const bad = (msg: string, code = 400) => NextResponse.json({ error: msg }, { status: code });

/** Snapshot completo: serve solo all'apertura dell'app. */
export async function GET() {
  const [setupRaw, playersRaw] = (await getRedis().pipeline().get(K.setup).get(K.players).exec()) as any[];
  if (!setupRaw) return NextResponse.json({ setup: null });
  const live = await readLive();
  return NextResponse.json({
    setup: asObj(setupRaw),
    players: playersRaw ? asObj(playersRaw) : [],
    live,
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
  if (pin && body.pin !== pin) return bad("PIN dell'asta non valido.", 403);

  const setupRaw = await getRedis().get(K.setup);
  const setup: any = setupRaw ? asObj(setupRaw) : null;

  switch (body.action) {
    /* ---------- creazione ---------- */
    case "create": {
      if (setup && !body.force) return bad("Un'asta è già aperta. Chiudila prima di crearne un'altra.", 409);
      if (!body.setup?.teams?.length || !body.players?.length) return bad("Servono squadre e listone.");
      await getRedis()
        .pipeline()
        .del(K.lot)
        .del(K.bid)
        .del(K.assigned)
        .del(K.ticker)
        .set(K.players, JSON.stringify(body.players))
        .set(K.setup, JSON.stringify(body.setup))
        .set(K.rev, 1)
        .exec();
      return NextResponse.json({ ok: true });
    }

    case "reset": {
      await getRedis()
        .pipeline()
        .del(K.setup)
        .del(K.players)
        .del(K.lot)
        .del(K.bid)
        .del(K.assigned)
        .del(K.ticker)
        .del(K.rev)
        .exec();
      return NextResponse.json({ ok: true });
    }
  }

  if (!setup) return bad("Nessuna asta aperta.", 409);

  switch (body.action) {
    /* ---------- il banditore apre un lotto ---------- */
    case "open": {
      const { playerId, nome } = body;
      if (!playerId) return bad("Manca il giocatore.");
      const already = ((await getRedis().lrange(K.assigned, 0, -1)) as any[]).map(asObj);
      if (already.some((a) => a.playerId === playerId)) return bad("Giocatore già assegnato.", 409);
      await getRedis().pipeline().set(K.lot, JSON.stringify({ playerId, openedAt: Date.now() })).del(K.bid).exec();
      await pushTicker(`All'asta ${nome || playerId}`);
      await bumpRev();
      return NextResponse.json(await readLive());
    }

    /* ---------- rilancio ---------- */
    case "bid": {
      const { playerId, amount, teamId, teamName } = body;
      const lotRaw = await getRedis().get(K.lot);
      const lot: any = lotRaw ? asObj(lotRaw) : null;
      if (!lot) return bad("Nessun lotto aperto.", 409);
      if (lot.playerId !== playerId) return bad("Il lotto è cambiato.", 409);
      if (!Number.isInteger(amount) || amount < 1) return bad("Importo non valido.");

      const team = setup.teams.find((t: any) => t.id === teamId);
      if (!team) return bad("Squadra sconosciuta.", 403);

      // Tetto di spesa ricalcolato lato server: nessuno può offrire più del consentito.
      const assigned = ((await getRedis().lrange(K.assigned, 0, -1)) as any[]).map(asObj);
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
      const beaten = await tryBid(amount, teamId, closesAt);
      if (beaten !== 0) {
        return NextResponse.json({ ...(await readLive()), rejected: beaten }, { status: 409 });
      }
      await pushTicker(`${teamName || team.name} → ${amount}`);
      await bumpRev();
      return NextResponse.json(await readLive());
    }

    /* ---------- aggiudica ---------- */
    case "assign": {
      const [lotRaw, bidRaw] = (await getRedis().pipeline().get(K.lot).get(K.bid).exec()) as any[];
      const lot: any = lotRaw ? asObj(lotRaw) : null;
      const { bid, bidderId } = parseBid(bidRaw as string | null);
      if (!lot || !bidderId || bid < 1) return bad("Niente da aggiudicare.", 409);
      const entry = {
        playerId: lot.playerId,
        teamId: bidderId,
        price: bid,
        ruolo: body.ruolo,
        at: Date.now(),
      };
      await getRedis().pipeline().rpush(K.assigned, JSON.stringify(entry)).del(K.lot).del(K.bid).exec();
      const tn = setup.teams.find((t: any) => t.id === bidderId)?.name || bidderId;
      await pushTicker(`${body.nome || lot.playerId} a ${tn} per ${bid}`);
      await bumpRev();
      return NextResponse.json(await readLive());
    }

    /* ---------- ritira il lotto ---------- */
    case "drop": {
      await getRedis().pipeline().del(K.lot).del(K.bid).exec();
      await pushTicker(`${body.nome || "Lotto"} ritirato`);
      await bumpRev();
      return NextResponse.json(await readLive());
    }

    /* ---------- annulla l'ultima aggiudicazione ---------- */
    case "undo": {
      const last = await getRedis().rpop(K.assigned);
      if (!last) return bad("Nessuna aggiudicazione da annullare.", 409);
      await pushTicker(`Annullato: ${body.nome || asObj(last).playerId}`);
      await bumpRev();
      return NextResponse.json(await readLive());
    }

    default:
      return bad("Azione sconosciuta.");
  }
}
