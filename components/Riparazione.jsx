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

/* ============================ report di gennaio ============================ */

function Sezione({ titolo, conta, children }) {
  if (!conta) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
          {titolo}
        </span>
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 800, color: T.paper }}>{conta}</span>
      </div>
      {children}
    </div>
  );
}

function Riga({ p, destra, tono }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ background: T.ink, border: "1px solid " + T.line, borderRadius: 9 }}
    >
      <Chip ruolo={p.ruolo} size={16} />
      <span className="flex-1 min-w-0 truncate" style={{ fontFamily: body, fontSize: 13.5, color: T.paper }}>
        {p.nome} <span style={{ color: T.dim, fontSize: 11 }}>{p.squadra}</span>
      </span>
      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 800, color: tono || T.dim }}>{destra}</span>
    </div>
  );
}

/** Testo del report, per incollarlo nel gruppo prima di cominciare. */
function reportTesto(report, proprietari) {
  const L = [];
  if (report.usciti.length) {
    L.push("*Hanno lasciato il campionato*");
    report.usciti.forEach((p) => {
      const o = proprietari[p.id];
      L.push(`${p.nome} (${p.squadra}) — ${o ? `${o.team}, rimborso ${o.price}` : "svincolato"}`);
    });
    L.push("");
  }
  if (report.cambiSquadra.length) {
    L.push("*Hanno cambiato squadra*");
    report.cambiSquadra.forEach((c) => L.push(`${c.nome}: ${c.da} → ${c.a}`));
    L.push("");
  }
  if (report.nuovi.length) {
    L.push(`*Nuovi in listone* (${report.nuovi.length})`);
    report.nuovi.slice(0, 40).forEach((p) => L.push(`${p.ruolo} ${p.nome} (${p.squadra})${p.quot ? ` — qt ${p.quot}` : ""}`));
    if (report.nuovi.length > 40) L.push(`…e altri ${report.nuovi.length - 40}`);
  }
  return L.join("\n").trim();
}

function Report({ report, setup, stato, onSvincola, onChiudi, busy }) {
  const [fatti, setFatti] = useState([]);

  // Chi possiede i giocatori usciti, e quanto gli verrebbe rimborsato.
  const proprietari = useMemo(() => {
    const m = {};
    for (const t of setup.teams) {
      for (const p of stato.squadre[t.id]?.picks || []) {
        m[p.playerId] = { teamId: t.id, team: t.name, price: p.price };
      }
    }
    return m;
  }, [setup, stato]);

  const daSvincolare = report.usciti.filter((p) => proprietari[p.id] && !fatti.includes(p.id));

  const svincolaTutti = async () => {
    for (const p of daSvincolare) {
      const o = proprietari[p.id];
      const ok = await onSvincola({ playerId: p.id, teamId: o.teamId, motivo: ESTERO, nome: p.nome });
      if (ok) setFatti((f) => [...f, p.id]);
    }
  };

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(reportTesto(report, proprietari));
    } catch {}
  };

  return (
    <div className="space-y-5">
      <div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, color: T.paper }}>Listone aggiornato</div>
        <div style={{ fontFamily: mono, fontSize: 11, color: T.dim }} className="mt-1">
          {report.nuovi.length} nuovi · {report.aggiornati} aggiornati · {report.cambiSquadra.length} trasferiti
          {report.rimossi > 0 && ` · ${report.rimossi} tolti`}
        </div>
      </div>

      <Sezione titolo="hanno lasciato il campionato" conta={report.usciti.length}>
        <div className="space-y-1">
          {report.usciti.map((p) => {
            const o = proprietari[p.id];
            const fatto = fatti.includes(p.id);
            return (
              <Riga
                key={p.id}
                p={p}
                tono={fatto ? T.D : o ? T.A : T.dim}
                destra={fatto ? "svincolato" : o ? `${o.team} · +${o.price}` : "libero"}
              />
            );
          })}
        </div>
        {daSvincolare.length > 0 && (
          <div className="mt-2">
            <Btn full disabled={busy} onClick={svincolaTutti}>
              Svincola tutti · rimborso pieno
            </Btn>
            <div style={{ color: T.dim, fontFamily: body, fontSize: 11.5, lineHeight: 1.45 }} className="mt-1">
              Restituisce a ciascuna squadra l'intero importo pagato e libera gli slot. Puoi anche farlo uno alla
              volta dalla scheda Svincoli.
            </div>
          </div>
        )}
      </Sezione>

      <Sezione titolo="hanno cambiato squadra" conta={report.cambiSquadra.length}>
        <div className="space-y-1">
          {report.cambiSquadra.map((c, i) => (
            <div
              key={i}
              className="px-3 py-2"
              style={{ background: T.ink, border: "1px solid " + T.line, borderRadius: 9, fontFamily: body, fontSize: 13 }}
            >
              <span style={{ color: T.paper }}>{c.nome}</span>{" "}
              <span style={{ color: T.dim, fontSize: 11.5 }}>
                {c.da} → {c.a}
              </span>
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione titolo="nuovi in listone" conta={report.nuovi.length}>
        <div className="space-y-1">
          {report.nuovi.map((p) => (
            <Riga key={p.id} p={p} destra={p.quot ? `qt ${p.quot}` : ""} />
          ))}
        </div>
      </Sezione>

      <div className="space-y-2">
        <Btn tone="ghost" full onClick={copia}>
          Copia il report
        </Btn>
        <Btn tone="ghost" full onClick={onChiudi}>
          Chiudi
        </Btn>
      </div>
    </div>
  );
}

/* ============================ listone di gennaio ============================ */
function Listone({ nListone, report, setup, stato, onListone, onSvincola, busy }) {
  const [fresco, setFresco] = useState(null);
  const [conferma, setConferma] = useState(false);
  const [apri, setApri] = useState(false);

  const mostrato = fresco || (apri ? report : null);
  if (mostrato)
    return (
      <Report
        report={mostrato}
        setup={setup}
        stato={stato}
        onSvincola={onSvincola}
        busy={busy}
        onChiudi={() => {
          setFresco(null);
          setApri(false);
          setConferma(false);
        }}
      />
    );

  if (conferma)
    return (
      <div className="space-y-3">
        <Import onDone={async (players) => setFresco(await onListone(players))} />
        <Btn tone="ghost" full onClick={() => setConferma(false)}>
          Annulla
        </Btn>
      </div>
    );

  return (
    <div className="space-y-4">
      <div style={{ fontFamily: mono, fontSize: 12, color: T.paper }}>{nListone} giocatori in listone</div>
      <div style={{ color: T.dim, fontFamily: body, fontSize: 13, lineHeight: 1.55 }}>
        A gennaio carica il listone aggiornato. Le rose non si toccano: chi ha cambiato squadra resta a chi
        l'ha comprato, con il club nuovo. Chi non è più in Serie A rimane in rosa, segnalato, finché non lo
        svincoli.
      </div>
      <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
        Serve un listone con la colonna Id, la stessa usata alla creazione: è l'Id che tiene insieme rose e
        giocatori.
      </div>
      <Btn full disabled={busy} onClick={() => setConferma(true)}>
        Carica il listone aggiornato
      </Btn>
      {report && (
        <Btn tone="ghost" full onClick={() => setApri(true)}>
          Rivedi l'ultimo report · {new Date(report.at).toLocaleDateString("it-IT")}
        </Btn>
      )}
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
        <Listone
          nListone={nListone}
          report={setup.report}
          setup={setup}
          stato={stato}
          onListone={onListone}
          onSvincola={onSvincola}
          busy={busy}
        />
      )}

      <div className="pt-2">
        <Btn tone="ghost" full disabled={busy} onClick={() => onFase("asta")}>
          Chiudi il mercato
        </Btn>
      </div>
    </div>
  );
}
