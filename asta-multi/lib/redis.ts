import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

/** Creato alla prima richiesta, non all'import: così la build non richiede le credenziali. */
export function getRedis(): Redis {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Redis non configurato: collega Upstash al progetto su Vercel.");
  }
  _redis = new Redis({ url, token });
  return _redis;
}

const NS = process.env.ASTA_NAMESPACE || "asta:v2";

/** Alfabeto senza caratteri confondibili: niente O/0, I/1, S/5. */
const ALFABETO = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
export const CODICE_RE = /^[A-HJ-NP-RT-Z2-46-9]{5}$/;

export function nuovoCodice() {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return s;
}

export const normCodice = (c: unknown) => String(c || "").trim().toUpperCase();

/** Tutte le chiavi di una singola asta. */
export function K(code: string) {
  const p = `${NS}:${code}`;
  return {
    setup: `${p}:setup`,
    players: `${p}:players`,
    lot: `${p}:lot`,
    bid: `${p}:bid`,
    assigned: `${p}:assigned`,
    ticker: `${p}:ticker`,
    rev: `${p}:rev`,
  };
}

export const TUTTE_LE_CHIAVI = (code: string) => Object.values(K(code));

/** Le aste inattive scadono, così Redis non cresce all'infinito sul piano free. */
export const TTL_GIORNI = Number(process.env.ASTA_TTL_GIORNI || 180);
const TTL = TTL_GIORNI * 24 * 3600;

/** Rinnova la scadenza a ogni modifica: un'asta in uso non sparisce mai. */
export async function rinnovaScadenza(code: string) {
  const p = getRedis().pipeline();
  TUTTE_LE_CHIAVI(code).forEach((k) => p.expire(k, TTL));
  await p.exec();
}

/**
 * Rilancio atomico. Il valore di bid è "importo|squadra|scadenza".
 * Lo script scrive solo se l'offerta è più alta di quella presente,
 * così due rilanci simultanei non possono sovrascriversi a vicenda.
 */
const BID_LUA = `
local cur = redis.call('GET', KEYS[1])
local amt = tonumber(ARGV[1])
if not amt then return -1 end
if cur then
  local n = tonumber(string.match(cur, "^(%d+)"))
  if n and amt <= n then return n end
end
redis.call('SET', KEYS[1], ARGV[2])
return 0
`;

/** Ritorna 0 se il rilancio è passato, altrimenti l'importo che l'ha battuto. */
export async function tryBid(code: string, amount: number, teamId: string, closesAt: number | null) {
  const payload = `${amount}|${teamId}|${closesAt ?? ""}`;
  const res = await getRedis().eval(BID_LUA, [K(code).bid], [String(amount), payload]);
  return Number(res);
}

export function parseBid(raw: string | null) {
  if (!raw) return { bid: 0, bidderId: null as string | null, closesAt: null as number | null };
  const [a, t, c] = String(raw).split("|");
  return { bid: Number(a) || 0, bidderId: t || null, closesAt: c ? Number(c) : null };
}

export async function bumpRev(code: string) {
  return Number(await getRedis().incr(K(code).rev));
}

export async function pushTicker(code: string, text: string) {
  const k = K(code);
  await getRedis().lpush(k.ticker, JSON.stringify({ t: Date.now(), text }));
  await getRedis().ltrim(k.ticker, 0, 23);
}

const asObj = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

export async function readLive(code: string) {
  const k = K(code);
  const [rev, lotRaw, bidRaw, assignedRaw, tickerRaw] = (await getRedis()
    .pipeline()
    .get(k.rev)
    .get(k.lot)
    .get(k.bid)
    .lrange(k.assigned, 0, -1)
    .lrange(k.ticker, 0, -1)
    .exec()) as any[];

  const lotBase = lotRaw ? asObj(lotRaw) : null;
  const { bid, bidderId, closesAt } = parseBid(bidRaw as string | null);

  return {
    rev: Number(rev) || 0,
    lot: lotBase ? { ...lotBase, bid, bidderId, closesAt } : null,
    assigned: ((assignedRaw as any[]) || []).map(asObj),
    ticker: ((tickerRaw as any[]) || []).map(asObj),
  };
}
