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

// Un'asta per deploy. Cambia il suffisso per ricominciare da zero senza cancellare nulla.
const NS = process.env.ASTA_NAMESPACE || "asta:v1";
export const K = {
  setup: `${NS}:setup`,
  players: `${NS}:players`,
  lot: `${NS}:lot`,
  bid: `${NS}:bid`,
  assigned: `${NS}:assigned`,
  ticker: `${NS}:ticker`,
  rev: `${NS}:rev`,
};

/**
 * Rilancio atomico. Il valore di K.bid è "importo|squadra|scadenza".
 * Lo script confronta l'importo già presente e scrive solo se l'offerta è più alta,
 * così due rilanci nello stesso istante non possono sovrascriversi a vicenda.
 * Nessun uso di cjson: solo confronto numerico sul prefisso.
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
export async function tryBid(amount: number, teamId: string, closesAt: number | null) {
  const payload = `${amount}|${teamId}|${closesAt ?? ""}`;
  const res = await getRedis().eval(BID_LUA, [K.bid], [String(amount), payload]);
  return Number(res);
}

export function parseBid(raw: string | null) {
  if (!raw) return { bid: 0, bidderId: null as string | null, closesAt: null as number | null };
  const [a, t, c] = String(raw).split("|");
  return { bid: Number(a) || 0, bidderId: t || null, closesAt: c ? Number(c) : null };
}

export async function bumpRev() {
  return Number(await getRedis().incr(K.rev));
}

export async function pushTicker(text: string) {
  await getRedis().lpush(K.ticker, JSON.stringify({ t: Date.now(), text }));
  await getRedis().ltrim(K.ticker, 0, 23);
}

const asObj = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

export async function readLive() {
  const [rev, lotRaw, bidRaw, assignedRaw, tickerRaw] = (await getRedis()
    .pipeline()
    .get(K.rev)
    .get(K.lot)
    .get(K.bid)
    .lrange(K.assigned, 0, -1)
    .lrange(K.ticker, 0, -1)
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
