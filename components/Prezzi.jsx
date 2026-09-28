"use client";

import React, { useState } from "react";
import { Shell, T, Btn, display, mono, body, inputStyle } from "@/components/AstaLive";

const PREZZO = "19,90";
const NOME = "Banditore";

/** Le due colonne del confronto. I dati sul kit vengono dalla sua scheda prodotto. */
const KIT = {
  eyebrow: "il kit con i pulsanti",
  prezzo: "199,90 €",
  nota: "una volta sola",
  righe: [
    ["10 pulsanti USB e 4 hub", true],
    ["Un PC Windows o Mac a cui collegarli", false],
    ["Tutti nella stessa stanza, via cavo", false],
    ["Qualcuno che porta e monta il kit", false],
    ["La soddisfazione del pulsante vero", true],
  ],
};

const APP = {
  eyebrow: NOME.toLowerCase(),
  prezzo: `${PREZZO} €`,
  nota: "a stagione, per tutta la lega",
  righe: [
    ["Il telefono che avete già in tasca", true],
    ["Niente da installare né da collegare", true],
    ["Funziona anche con chi è fuori città", true],
    ["Si apre con un link, si entra con un codice", true],
    ["Nessun pulsante da schiacciare", false],
  ],
};

const INCLUSO = [
  ["Listone in un secondo", "Carichi il CSV o l'Excel e riconosce da solo nome, squadra, ruolo, quotazione e Id."],
  ["Classic e Mantra", "Nel Mantra vedi i ruoli dettagliati in asta e la copertura di ogni rosa."],
  ["Tetto di spesa sempre giusto", "Calcolato sul server: nessuno può offrire più di quanto gli resta per completare la rosa."],
  ["Rose pronte da caricare", "A fine asta scarichi il file nel formato che il sito della tua lega si aspetta."],
  ["Mercato di riparazione", "Svincoli con rimborso pieno o a metà, scambi tra squadre, e il listone di gennaio aggiornato senza perdere le rose."],
];

function Colonna({ dati, evidenza }) {
  return (
    <div
      className="flex-1 p-5"
      style={{
        background: evidenza ? T.ink2 : "transparent",
        border: "1px solid " + (evidenza ? T.line : "rgba(244,242,247,0.07)"),
        borderRadius: 16,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
        {dati.eyebrow}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: "-0.04em",
          color: evidenza ? T.paper : T.dim,
          lineHeight: 1.1,
        }}
        className="mt-1"
      >
        {dati.prezzo}
      </div>
      <div style={{ fontFamily: body, fontSize: 12, color: T.dim }}>{dati.nota}</div>

      <div className="mt-4 space-y-2">
        {dati.righe.map(([testo, positivo], i) => (
          <div key={i} className="flex gap-2" style={{ fontFamily: body, fontSize: 13.5, lineHeight: 1.4 }}>
            <span style={{ color: positivo ? T.D : T.dim, fontFamily: mono, flexShrink: 0 }}>
              {positivo ? "+" : "−"}
            </span>
            <span style={{ color: positivo ? T.paper : T.dim }}>{testo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Prezzi() {
  const [email, setEmail] = useState("");
  const [quanti, setQuanti] = useState("");
  const [stato, setStato] = useState("idle"); // idle | invio | fatto | errore
  const [errore, setErrore] = useState("");

  const valida = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const invia = async (e) => {
    e?.preventDefault();
    if (!valida || stato === "invio") return;
    setStato("invio");
    setErrore("");
    try {
      const r = await fetch("/api/lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), quanti: quanti.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Non riesco a registrare l'indirizzo.");
      setStato("fatto");
    } catch (err) {
      setErrore(err.message);
      setStato("errore");
    }
  };

  return (
    <Shell>
      <div className="px-4 pt-10 pb-14">
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: T.dim }} className="uppercase">
          {NOME} · asta live
        </div>

        <h1
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: "clamp(34px, 9vw, 46px)",
            color: T.paper,
            letterSpacing: "-0.038em",
            lineHeight: 0.98,
          }}
          className="mt-3"
        >
          Duecento euro di
          <br />
          pulsanti, oppure il
          <br />
          telefono che hai già.
        </h1>

        <p style={{ fontFamily: body, fontSize: 16, color: T.dim, lineHeight: 1.5, maxWidth: 480 }} className="mt-4">
          Il banditore chiama, tutti rilanciano dal proprio telefono, le rose si aggiornano mentre giocate. Niente
          hardware da comprare, niente PC da collegare, e chi è fuori città partecipa lo stesso.
        </p>

        {/* il confronto */}
        <div className="flex flex-col sm:flex-row gap-3 mt-9">
          <Colonna dati={KIT} />
          <Colonna dati={APP} evidenza />
        </div>
        <div style={{ fontFamily: body, fontSize: 12, color: T.dim, lineHeight: 1.45 }} className="mt-3">
          Prezzo del kit da 10 postazioni come indicato sul suo store. Dieci stagioni di {NOME} costano comunque
          meno di un kit.
        </div>

        {/* cosa include */}
        <div className="mt-12">
          <div
            style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".22em", color: T.dim }}
            className="uppercase mb-4"
          >
            cosa c'è dentro
          </div>
          <div className="space-y-5">
            {INCLUSO.map(([titolo, testo]) => (
              <div key={titolo}>
                <div style={{ fontFamily: display, fontWeight: 800, fontSize: 17, color: T.paper }}>{titolo}</div>
                <div style={{ fontFamily: body, fontSize: 14, color: T.dim, lineHeight: 1.5 }} className="mt-0.5">
                  {testo}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* raccolta indirizzi */}
        <div
          className="mt-12 p-5"
          style={{ background: T.ink2, border: "1px solid " + T.line, borderRadius: 16 }}
        >
          {stato === "fatto" ? (
            <div>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, color: T.paper }}>
                Ci sei.
              </div>
              <div style={{ fontFamily: body, fontSize: 14, color: T.dim, lineHeight: 1.5 }} className="mt-2">
                Ti scrivo una volta sola, quando apre, in tempo per la vostra asta. Nessun'altra mail.
              </div>
            </div>
          ) : (
            <form onSubmit={invia}>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 20, color: T.paper, lineHeight: 1.2 }}>
                Apre prima dell'asta di agosto
              </div>
              <div style={{ fontFamily: body, fontSize: 13.5, color: T.dim, lineHeight: 1.5 }} className="mt-1.5">
                Lascia la mail e ti avviso appena si può comprare. Una mail sola, niente newsletter.
              </div>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="la tua mail"
                autoComplete="email"
                style={{ ...inputStyle, marginTop: 14 }}
              />
              <input
                type="text"
                inputMode="numeric"
                value={quanti}
                onChange={(e) => setQuanti(e.target.value.slice(0, 3))}
                placeholder="quanti siete nella lega? (facoltativo)"
                style={{ ...inputStyle, marginTop: 8 }}
              />

              {errore && (
                <div style={{ color: T.A, fontFamily: body, fontSize: 13 }} className="mt-2">
                  {errore}
                </div>
              )}

              <div className="mt-3">
                <Btn full disabled={!valida || stato === "invio"} onClick={invia}>
                  {stato === "invio" ? "Un attimo…" : "Avvisami quando apre"}
                </Btn>
              </div>
              <div style={{ fontFamily: body, fontSize: 11.5, color: T.dim, lineHeight: 1.45 }} className="mt-2">
                Uso il tuo indirizzo solo per quell'avviso e per niente altro. Puoi scrivermi in qualunque momento
                per farlo cancellare.
              </div>
            </form>
          )}
        </div>

        <div style={{ fontFamily: mono, fontSize: 10, color: T.dim, lineHeight: 1.6 }} className="mt-10">
          {NOME} è un progetto indipendente, non collegato ad alcun altro servizio di fantacalcio.
        </div>
      </div>
    </Shell>
  );
}
