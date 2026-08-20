const PIN_KEY = "fcasta:pin";
const RECENTI_KEY = "fcasta:recenti";

export const getPin = () => (typeof window === "undefined" ? "" : localStorage.getItem(PIN_KEY) || "");
export const setPin = (v) => localStorage.setItem(PIN_KEY, v || "");

/* ---- squadra scelta: una per asta ---- */
export const getMe = (code) => {
  try {
    return JSON.parse(localStorage.getItem(`fcasta:me:${code}`) || "null");
  } catch {
    return null;
  }
};
export const setMe = (code, m) => localStorage.setItem(`fcasta:me:${code}`, JSON.stringify(m));
export const clearMe = (code) => localStorage.removeItem(`fcasta:me:${code}`);

/* ---- elenco locale delle aste viste da questo dispositivo ---- */
export function getRecenti() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTI_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Sposta l'asta in cima e tiene le ultime dieci. */
export function ricorda({ code, nome, squadre, mode }) {
  const altre = getRecenti().filter((r) => r.code !== code);
  const lista = [{ code, nome, squadre, mode, visto: Date.now() }, ...altre].slice(0, 10);
  localStorage.setItem(RECENTI_KEY, JSON.stringify(lista));
  return lista;
}

export function dimentica(code) {
  const lista = getRecenti().filter((r) => r.code !== code);
  localStorage.setItem(RECENTI_KEY, JSON.stringify(lista));
  return lista;
}

/* ---- rete ---- */
export async function snapshot(code) {
  const r = await fetch(`/api/asta?code=${encodeURIComponent(code)}`, { cache: "no-store" });
  if (r.status === 404) {
    const e = new Error("Asta non trovata.");
    e.notFound = true;
    throw e;
  }
  if (!r.ok) throw new Error("snapshot");
  return r.json();
}

/** Ritorna i dati se ci sono novità, null se lo stato è invariato. */
export async function pollLive(code, rev) {
  const r = await fetch(`/api/asta/live?code=${encodeURIComponent(code)}&rev=${rev}`, { cache: "no-store" });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error("poll");
  return r.json();
}

/** Ogni mutazione passa da qui. Lancia un Error con messaggio leggibile. */
export async function act(action, payload = {}) {
  const r = await fetch("/api/asta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, pin: getPin(), ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || "Operazione non riuscita.");
    e.live = data.rev !== undefined ? data : null;
    e.rejected = data.rejected;
    throw e;
  }
  return data;
}
