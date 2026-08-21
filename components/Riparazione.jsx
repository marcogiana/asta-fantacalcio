"use client";

import React, { useState, useMemo } from "react";
import {
  RUOLI,
  rimborsoPer,
  baseDopoSvincolo,
  verificaScambio,
  ESTERO,
  VOLONTARIO,
} from "@/lib/regole";
import { T, Btn, display, mono, body, Chip, Import } from "@/components/AstaLive";

const RUOLO_NOME = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };

function Tab({ attivo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2"
      style={{
        background: attivo ? T.paper : "transparent",
        color: attivo ? T.ink : T.dim,
        border: "1px solid " + (attivo ? T.paper : T.line),
        borderRadius: 10,
        fontFamily: display,
        fontWeight: 800,
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}

function SelettoreSquadra({ setup, stato, valore, onChange, escludi }) {
  return (
    <div className="flex flex-wrap gap-1">
      {setup.teams
        .filter((t) => t.id !== escludi)
        .map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="px-3 py-2"
            style={{
              background: valore === t.id ? T.paper : "transparent",
              color: valore === t.id ? T.ink : T.dim,
              border: "1px solid " + (valore === t.id ? T.paper : T.line),
              borderRadius: 999,
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {t.name}
            <span style={{ opacity: 0.6 }}> {stato.squadre[t.id]?.picks.length ?? 0}</span>
          </button>
        ))}
    </div>
  );
}

/** Elenco della rosa con selezione. `modo` cambia da singola a multipla. */
function Rosa({ picks, byId, selezione, onToggle, modo = "multi" }) {
  const perRuolo = useMemo(() => {
    const m = { P: [], D: [], C: [], A: [] };
    picks.forEach((p) => m[p.ruolo]?.push(p));
    Object.values(m).forEach((l) => l.sort((a, b) => b.price - a.price));
    return m;
  }, [picks]);

  if (!picks.length)
    return (
      <div style={{ color: T.dim, fontFamily: body, fontSize: 13 }} className="py-6 text-center">
        Rosa vuota.
      </div>
    );

  return (
    <div className="space-y-3">
      {RUOLI.map((r) =>
        perRuolo[r].length ? (
          <div key={r}>
            <div className="flex items-center gap-2 mb-1">
              <Chip ruolo={r} size={15} />
              <span
                style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".16em", color: T.dim }}
                className="uppercase"
              >
                {RUOLO_NOME[r]}
              </span>
            </div>
            <div className="space-y-1">
              {perRuolo[r].map((p) => {
                const sel = selezione.includes(p.playerId);
                return (
                  <button
                    key={p.playerId}
                    onClick={() => onToggle(p.playerId)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    style={{
                      background: sel ? T[r] : T.ink,
                      color: sel ? (r === "P" ? T.ink : "#fff") : T.paper,
                      border: "1px solid " + (sel ? T[r] : T.line),
                      borderRadius: 9,
                    }}
                  >
                    <span className="flex-1 min-w-0 truncate" style={{ fontFamily: body, fontSize: 14, fontWeight: 500 }}>
                      {byId[p.playerId]?.nome || p.playerId}
                      <span style={{ opacity: 0.55, fontSize: 11 }}> {byId[p.playerId]?.squadra}</span>
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 800 }}>{p.price}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
      {modo === "singolo" && (
        <div style={{ color: T.dim, fontFamily: body, fontSize: 11 }}>Tocca un giocatore per svincolarlo.</div>
      )}
    </div>
  );
}

/* ============================ svincoli ============================ */
function Svincoli({ setup, stato, byId, onSvincola, busy }) {
  const [team, setTeam] = useState(setup.teams[0]?.id);
  const [sel, setSel] = useState([]);
  const s = stato.squadre[team];
  const scelto = sel[0] ? s?.rosa.get(sel[0]) : null;
  const nome = sel[0] ? byId[sel[0]]?.nome : "";

  const fai = async (motivo) => {
    const ok = await onSvincola({ playerId: sel[0], teamId: team, motivo, nome });
    if (ok) setSel([]);
  };

  return (
    <div className="space-y-4">
      <SelettoreSquadra setup={setup} stato={stato} valore={team} onChange={(v) => { setTeam(v); setSel([]); }} />

      {s && (
        <div style={{ fontFamily: mono, fontSize: 11, color: T.dim }}>
          {s.picks.length} in rosa · {s.left} crediti · {s.slotsLeft} slot liberi
        </div>
      )}

      <Rosa picks={s?.picks || []} byId={byId} selezione={sel} onToggle={(id) => setSel(sel[0] === id ? [] : [id])} modo="singolo" />

      {scelto && (
        <div
          className="sticky bottom-0 pt-3 pb-1 space-y-2"
          style={{ background: T.ink2, borderTop: "1px solid " + T.line }}
        >
          <div style={{ fontFamily: display, fontWeight: 800, fontSize: 17, color: T.paper }}>
            {nome} · pagato {scelto.price}
          </div>
          <Btn full disabled={busy} onClick={() => fai(ESTERO)}>
            Andato in un altro campionato · +{rimborsoPer(scelto.price, ESTERO)}
          </Btn>
          <div style={{ color: T.dim, fontFamily: body, fontSize: 11, lineHeight: 1.4 }}>
            Rimborso pieno. Il giocatore esce dal listone e nessuno potrà più comprarlo.
          </div>
          <Btn tone="ghost" full disabled={busy} onClick={() => fai(VOLONTARIO)}>
            Svincolo volontario · +{rimborsoPer(scelto.price, VOLONTARIO)}
          </Btn>
          <div style={{ color: T.dim, fontFamily: body, fontSize: 11, lineHeight: 1.4 }}>
            Metà per eccesso. Torna acquistabile con base d'asta {baseDopoSvincolo(scelto.price)}.
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ scambi ============================ */
function Scambi({ setup, stato, byId, onScambio, busy }) {
  const [a, setA] = useState(setup.teams[0]?.id);
  const [b, setB] = useState(setup.teams[1]?.id);
  const [pa, setPa] = useState([]);
  const [pb, setPb] = useState([]);

  const errore = useMemo(
    () => (a && b ? verificaScambio(setup, stato, a, b, pa, pb) : "Scegli due squadre."),
    [setup, stato, a, b, pa, pb]
  );

  const tog = (lista, set) => (id) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const nomi = (ids) => ids.map((id) => byId[id]?.nome || id).join(", ");

  const fai = async () => {
    const ok = await onScambio({ teamA: a, teamB: b, playersA: pa, playersB: pb, nomiA: nomi(pa), nomiB: nomi(pb) });
    if (ok) {
      setPa([]);
      setPb([]);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase mb-2">
          cede
        </div>
        <SelettoreSquadra setup={setup} stato={stato} valore={a} onChange={(v) => { setA(v); setPa([]); }} escludi={b} />
        <div className="mt-3">
          <Rosa picks={stato.squadre[a]?.picks || []} byId={byId} selezione={pa} onToggle={tog(pa, setPa)} />
        </div>
      </div>

      <div className="text-center" style={{ fontFamily: mono, fontSize: 20, color: T.dim }}>
        ⇄
      </div>

      <div>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase mb-2">
          riceve
        </div>
        <SelettoreSquadra setup={setup} stato={stato} valore={b} onChange={(v) => { setB(v); setPb([]); }} escludi={a} />
        <div className="mt-3">
          <Rosa picks={stato.squadre[b]?.picks || []} byId={byId} selezione={pb} onToggle={tog(pb, setPb)} />
        </div>
      </div>

      <div
        className="sticky bottom-0 pt-3 pb-1 space-y-2"
        style={{ background: T.ink2, borderTop: "1px solid " + T.line }}
      >
        {(pa.length > 0 || pb.length > 0) && (
          <div style={{ fontFamily: body, fontSize: 13, color: T.paper, lineHeight: 1.4 }}>
            {nomi(pa) || "nessuno"} <span style={{ color: T.dim }}>⇄</span> {nomi(pb) || "nessuno"}
          </div>
        )}
        {errore && (pa.length > 0 || pb.length > 0) && (
          <div style={{ color: T.A, fontFamily: body, fontSize: 12, lineHeight: 1.4 }}>{errore}</div>
        )}
        <Btn full disabled={!!errore || busy} onClick={fai}>
          Registra lo scambio
        </Btn>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 11, lineHeight: 1.4 }}>
          I crediti non si muovono: chi cede non recupera la spesa, chi riceve prende il giocatore a costo zero.
        </div>
      </div>
    </div>
  );
}

/* ============================ listone di gennaio ============================ */
function Listone({ nListone, onListone, busy }) {
  const [esito, setEsito] = useState(null);
  const [conferma, setConferma] = useState(false);

  if (esito)
    return (
      <div className="space-y-3">
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 19, color: T.paper }}>Listone aggiornato</div>
        <div style={{ fontFamily: body, fontSize: 13, color: T.dim, lineHeight: 1.55 }}>
          {esito.nuovi} giocatori nuovi · {esito.aggiornati} aggiornati
          {esito.conservati > 0 && ` · ${esito.conservati} non più nel listone ma ancora in rosa`}
          {esito.rimossi > 0 && ` · ${esito.rimossi} tolti`}
        </div>
        {esito.conservati > 0 && (
          <div style={{ color: T.P, fontFamily: body, fontSize: 12.5, lineHeight: 1.45 }}>
            I {esito.conservati} giocatori non più in Serie A restano nelle rose finché non li svincoli come
            «andato in un altro campionato»: così chi li ha comprati recupera l'intero importo.
          </div>
        )}
        {esito.cambiSquadra?.length > 0 && (
          <div>
            <div
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }}
              className="uppercase mb-1"
            >
              hanno cambiato squadra
            </div>
            <div className="space-y-1">
              {esito.cambiSquadra.slice(0, 12).map((c, i) => (
                <div key={i} style={{ fontFamily: body, fontSize: 12.5, color: T.paper }}>
                  {c.nome} <span style={{ color: T.dim }}>{c.da} → {c.a}</span>
                </div>
              ))}
              {esito.cambiSquadra.length > 12 && (
                <div style={{ color: T.dim, fontFamily: mono, fontSize: 11 }}>
                  e altri {esito.cambiSquadra.length - 12}
                </div>
              )}
            </div>
          </div>
        )}
        <Btn tone="ghost" full onClick={() => { setEsito(null); setConferma(false); }}>
          Fatto
        </Btn>
      </div>
    );

  if (!conferma)
    return (
      <div className="space-y-4">
        <div style={{ fontFamily: mono, fontSize: 12, color: T.paper }}>{nListone} giocatori in listone</div>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 13, lineHeight: 1.55 }}>
          A gennaio puoi caricare il listone aggiornato. Le rose non si toccano: chi ha cambiato squadra resta a
          chi l'ha comprato, con il club nuovo. Chi non è più in Serie A rimane in rosa, segnalato, finché non lo
          svincoli.
        </div>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
          Serve un listone con la colonna Id, la stessa usata alla creazione dell'asta: è l'Id che tiene insieme
          rose e giocatori.
        </div>
        <Btn full disabled={busy} onClick={() => setConferma(true)}>
          Carica il listone aggiornato
        </Btn>
      </div>
    );

  return (
    <div className="space-y-3">
      <Import onDone={async (players) => setEsito(await onListone(players))} />
      <Btn tone="ghost" full onClick={() => setConferma(false)}>
        Annulla
      </Btn>
    </div>
  );
}

/* ============================ pannello ============================ */
export default function Riparazione({ setup, stato, byId, onSvincola, onScambio, onFase, onListone, nListone, busy }) {
  const [tab, setTab] = useState("svincoli");
  const aperta = setup.fase === "riparazione";

  if (!aperta)
    return (
      <div className="space-y-4">
        <div style={{ color: T.dim, fontFamily: body, fontSize: 13, lineHeight: 1.5 }}>
          A mercato aperto puoi svincolare giocatori e registrare scambi. Le aste dei nuovi acquisti funzionano
          come sempre: gli svincolati volontari ripartono dalla loro base, non da 1.
        </div>
        <Btn full disabled={busy} onClick={() => onFase("riparazione")}>
          Apri il mercato di riparazione
        </Btn>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
          Se a gennaio esce un listone nuovo, caricalo dalla scheda Listone appena aperto il mercato: senza,
          i giocatori arrivati in Serie A a gennaio non sono chiamabili.
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Tab attivo={tab === "svincoli"} onClick={() => setTab("svincoli")}>
          Svincoli
        </Tab>
        <Tab attivo={tab === "scambi"} onClick={() => setTab("scambi")}>
          Scambi
        </Tab>
        <Tab attivo={tab === "listone"} onClick={() => setTab("listone")}>
          Listone
        </Tab>
      </div>

      {tab === "svincoli" ? (
        <Svincoli setup={setup} stato={stato} byId={byId} onSvincola={onSvincola} busy={busy} />
      ) : tab === "scambi" ? (
        <Scambi setup={setup} stato={stato} byId={byId} onScambio={onScambio} busy={busy} />
      ) : (
        <Listone nListone={nListone} onListone={onListone} busy={busy} />
      )}

      <div className="pt-2">
        <Btn tone="ghost" full disabled={busy} onClick={() => onFase("asta")}>
          Chiudi il mercato
        </Btn>
      </div>
    </div>
  );
}
