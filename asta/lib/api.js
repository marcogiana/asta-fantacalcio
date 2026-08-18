const PIN_KEY = "fcasta:pin";
const ME_KEY = "fcasta:me";

export const getPin = () => (typeof window === "undefined" ? "" : localStorage.getItem(PIN_KEY) || "");
export const setPin = (v) => localStorage.setItem(PIN_KEY, v || "");

export const getMe = () => {
  try {
    return JSON.parse(localStorage.getItem(ME_KEY) || "null");
  } catch {
    return null;
  }
};
export const setMe = (m) => localStorage.setItem(ME_KEY, JSON.stringify(m));
export const clearMe = () => localStorage.removeItem(ME_KEY);

export async function snapshot() {
  const r = await fetch("/api/asta", { cache: "no-store" });
  if (!r.ok) throw new Error("snapshot");
  return r.json();
}

/** Ritorna { data } se ci sono novità, null se lo stato è invariato. */
export async function pollLive(rev) {
  const r = await fetch(`/api/asta/live?rev=${rev}`, { cache: "no-store" });
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
