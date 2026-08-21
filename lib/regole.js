/**
 * Regole della lega e ricostruzione dello stato.
 *
 * Le rose non sono un dato salvato: sono il risultato di rigiocare il registro
 * dei movimenti dall'inizio. Ogni acquisto, svincolo e scambio è una riga in
 * append, quindi annullare l'ultima operazione è sempre possibile e la
 * contabilità non può divergere dalla realtà.
 */

export const RUOLI = ["P", "D", "C", "A"];

/** Tipi di movimento ammessi nel registro. */
export const ACQUISTO = "acquisto";
export const SVINCOLO = "svincolo";
export const SCAMBIO = "scambio";

/** Svincolo per cambio campionato: rimborso pieno, il giocatore esce dal listone. */
export const ESTERO = "estero";
/** Svincolo volontario: rimborso della metà per eccesso, il giocatore torna acquistabile. */
export const VOLONTARIO = "volontario";

/** 87 pagati restituiscono 44, non 43: la metà è arrotondata per eccesso. */
export function rimborsoPer(price, tipo) {
  const p = Math.max(0, Number(price) || 0);
  return tipo === ESTERO ? p : Math.ceil(p / 2);
}

/**
 * Un giocatore svincolato volontariamente riparte dal prezzo che è stato
 * rimborsato: chi lo ha liberato a 44 lo rimette sul mercato a 44.
 */
export function baseDopoSvincolo(price) {
  return Math.max(1, rimborsoPer(price, VOLONTARIO));
}

const vuota = () => ({ spesi: 0, rosa: new Map(), conta: { P: 0, D: 0, C: 0, A: 0 } });

function aggiungi(t, playerId, ruolo, price) {
  if (t.rosa.has(playerId)) return;
  t.rosa.set(playerId, { price, ruolo });
  t.conta[ruolo] = (t.conta[ruolo] || 0) + 1;
}

function togli(t, playerId) {
  const g = t.rosa.get(playerId);
  if (!g) return null;
  t.rosa.delete(playerId);
  t.conta[g.ruolo] = Math.max(0, (t.conta[g.ruolo] || 0) - 1);
  return g;
}

/**
 * Rigioca il registro e restituisce lo stato corrente.
 * - squadre: crediti spesi, rosa e conteggio per ruolo
 * - fuori:   giocatori usciti dal campionato, non più acquistabili
 * - base:    prezzo minimo di ripartenza per gli svincolati volontari
 * - inRosa:  giocatori attualmente di proprietà di qualcuno
 */
export function replay(setup, movimenti = []) {
  const squadre = {};
  for (const t of setup.teams) squadre[t.id] = vuota();
  const fuori = new Set();
  const base = new Map();

  for (const m of movimenti) {
    // Le righe scritte prima dell'introduzione del registro sono tutti acquisti.
    const tipo = m.tipo || ACQUISTO;

    if (tipo === ACQUISTO) {
      const t = squadre[m.teamId];
      if (!t) continue;
      aggiungi(t, m.playerId, m.ruolo, m.price);
      t.spesi += m.price;
      base.delete(m.playerId);
      continue;
    }

    if (tipo === SVINCOLO) {
      const t = squadre[m.teamId];
      if (!t) continue;
      const g = togli(t, m.playerId);
      if (!g) continue;
      t.spesi -= m.rimborso;
      if (m.motivo === ESTERO) fuori.add(m.playerId);
      else base.set(m.playerId, m.base ?? baseDopoSvincolo(g.price));
      continue;
    }

    if (tipo === SCAMBIO) {
      const a = squadre[m.teamA];
      const b = squadre[m.teamB];
      if (!a || !b) continue;
      // Gli scambi non muovono crediti: il costo si azzera per chi riceve
      // e resta a carico di chi ha comprato, che non recupera nulla.
      const daA = (m.playersA || []).map((id) => [id, togli(a, id)]).filter(([, g]) => g);
      const daB = (m.playersB || []).map((id) => [id, togli(b, id)]).filter(([, g]) => g);
      daA.forEach(([id, g]) => aggiungi(b, id, g.ruolo, 0));
      daB.forEach(([id, g]) => aggiungi(a, id, g.ruolo, 0));
    }
  }

  const inRosa = new Set();
  for (const t of Object.values(squadre)) for (const id of t.rosa.keys()) inRosa.add(id);

  // Numeri derivati, usati sia dall'interfaccia sia dalla validazione lato server.
  for (const t of setup.teams) {
    const s = squadre[t.id];
    s.left = setup.budget - s.spesi;
    s.slotsLeft = RUOLI.reduce((n, r) => n + Math.max(0, setup.slots[r] - s.conta[r]), 0);
    // Va lasciato almeno un credito per ogni altro slot ancora da riempire.
    s.maxBid = Math.max(0, s.left - Math.max(0, s.slotsLeft - 1));
    s.picks = [...s.rosa.entries()].map(([playerId, g]) => ({ playerId, ...g }));
  }

  return { squadre, fuori, base, inRosa };
}

/** Prezzo di partenza di un lotto: 1, oppure la base di ripartenza se è uno svincolato. */
export const baseLotto = (stato, playerId) => stato.base.get(playerId) || 1;

/**
 * Uno scambio è valido se nessuna delle due squadre sfora gli slot per ruolo.
 * Restituisce null se va bene, altrimenti il motivo del rifiuto.
 */
export function verificaScambio(setup, stato, teamA, teamB, playersA, playersB) {
  if (teamA === teamB) return "Le due squadre devono essere diverse.";
  if (!playersA.length && !playersB.length) return "Seleziona almeno un giocatore.";

  const sim = (t, esce, entra) => {
    const s = stato.squadre[t];
    const conta = { ...s.conta };
    for (const id of esce) {
      const g = s.rosa.get(id);
      if (!g) return { errore: "Un giocatore selezionato non è più in rosa." };
      conta[g.ruolo] -= 1;
    }
    for (const id of entra) {
      const g = stato.squadre[t === teamA ? teamB : teamA].rosa.get(id);
      if (!g) return { errore: "Un giocatore selezionato non è più in rosa." };
      conta[g.ruolo] += 1;
    }
    return { conta };
  };

  for (const [t, esce, entra] of [
    [teamA, playersA, playersB],
    [teamB, playersB, playersA],
  ]) {
    const r = sim(t, esce, entra);
    if (r.errore) return r.errore;
    const nome = setup.teams.find((x) => x.id === t)?.name || t;
    for (const ruolo of RUOLI) {
      if (r.conta[ruolo] > setup.slots[ruolo]) {
        return `${nome} arriverebbe a ${r.conta[ruolo]} ${ruolo}, oltre il limite di ${setup.slots[ruolo]}.`;
      }
    }
  }
  return null;
}

/* ============================ aggiornamento del listone ============================ */

/**
 * Fonde il listone di gennaio con quello già in uso, senza rompere le rose.
 *
 * Tre regole, in ordine di importanza:
 *  1. L'identità di un giocatore è l'Id ufficiale, non "nome-squadra". Chi cambia
 *     squadra a gennaio mantiene lo stesso id interno, quindi resta nella rosa
 *     di chi l'ha comprato, e ne aggiorniamo solo club, ruolo e quotazione.
 *  2. Chi sparisce dal nuovo listone ma è in una rosa viene conservato e marcato
 *     `uscito`: senza di lui la rosa perderebbe un nome e l'export un Id.
 *     Va svincolato come "andato in un altro campionato".
 *  3. Chi sparisce e non è in nessuna rosa viene rimosso: ha lasciato la Serie A
 *     e non deve più essere chiamabile.
 */
export function fondiListone(vecchi, nuovi, inRosa = new Set()) {
  const perFcId = new Map();
  const perId = new Map();
  for (const p of vecchi) {
    if (p.fcId) perFcId.set(String(p.fcId), p);
    perId.set(p.id, p);
  }

  const out = [];
  const usati = new Set();
  const presi = new Set();
  const esito = {
    aggiornati: 0,
    nuovi: 0,
    conservati: 0,
    rimossi: 0,
    cambiSquadra: [],
    // Elenchi completi per il report di gennaio, non solo i conteggi.
    nuoviList: [],
    uscitiList: [],
  };

  for (const n of nuovi) {
    const vecchio = (n.fcId && perFcId.get(String(n.fcId))) || null;

    if (vecchio) {
      // Stesso giocatore: tengo l'id interno, aggiorno tutto il resto.
      if (vecchio.squadra && n.squadra && vecchio.squadra !== n.squadra) {
        esito.cambiSquadra.push({ nome: n.nome, da: vecchio.squadra, a: n.squadra });
      }
      out.push({ ...vecchio, ...n, id: vecchio.id, uscito: false });
      usati.add(vecchio.id);
      esito.aggiornati += 1;
    } else {
      // Giocatore mai visto: evito collisioni con gli id già presenti.
      let id = n.id;
      while (presi.has(id) || perId.has(id)) id += "x";
      const creato = { ...n, id, uscito: false };
      out.push(creato);
      esito.nuovi += 1;
      esito.nuoviList.push(creato);
    }
    presi.add(out[out.length - 1].id);
  }

  // Chi non compare nel nuovo listone: conservato se è in rosa, altrimenti eliminato.
  for (const v of vecchi) {
    if (usati.has(v.id) || presi.has(v.id)) continue;
    if (inRosa.has(v.id)) {
      const fuori = { ...v, uscito: true };
      out.push(fuori);
      esito.conservati += 1;
      esito.uscitiList.push(fuori);
    } else {
      esito.rimossi += 1;
    }
  }

  // I più cari per primi: è l'ordine con cui si guardano davvero questi elenchi.
  const perValore = (a, b) => (b.quot || 0) - (a.quot || 0);
  esito.nuoviList.sort(perValore);
  esito.uscitiList.sort(perValore);

  return { players: out, esito };
}
