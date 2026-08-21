"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as api from "@/lib/api";
import { citazionePer } from "@/lib/citazioni";
import { replay, baseLotto } from "@/lib/regole";
import Riparazione from "@/components/Riparazione";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/* ============================ design tokens ============================ */
export const T = {
  ink: "#141026",
  ink2: "#1E1734",
  ink3: "#2A2046",
  line: "rgba(244,242,247,0.14)",
  paper: "#F4F2F7",
  dim: "#9C93B8",
  P: "#E8B93A",
  D: "#2FA86B",
  C: "#4A7DF0",
  A: "#E85145",
};
const RUOLI = ["P", "D", "C", "A"];
const MANTRA = ["Por", "Dd", "Dc", "Ds", "E", "M", "C", "W", "T", "A", "Pc"];
const MANTRA_NOME = {
  Por: "Portiere", Dd: "Difensore destro", Dc: "Difensore centrale", Ds: "Difensore sinistro",
  E: "Esterno", M: "Mediano", C: "Centrale", W: "Ala", T: "Trequartista",
  A: "Attaccante", Pc: "Punta centrale",
};
// A quale macro-ruolo appartiene ogni ruolo Mantra: serve quando il listone non ha la colonna R.
const MANTRA_MACRO = {
  Por: "P", Dd: "D", Dc: "D", Ds: "D",
  E: "C", M: "C", C: "C", W: "C", T: "C",
  A: "A", Pc: "A",
};
const RUOLO_NOME = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
export const display = "'Bricolage Grotesque', 'Inter Tight', system-ui, sans-serif";
export const mono = "'Azeret Mono', ui-monospace, monospace";
export const body = "'Inter Tight', system-ui, sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;600;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter+Tight:wght@400;500;600&display=swap');
*{box-sizing:border-box}
.fc-root{-webkit-tap-highlight-color:transparent}
.fc-flip{animation:fcflip .28s cubic-bezier(.2,.9,.2,1)}
@keyframes fcflip{0%{transform:translateY(-14px) scale(.94);opacity:.2}100%{transform:none;opacity:1}}
.fc-crawl{animation:fccrawl 22s linear infinite}
@keyframes fccrawl{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.fc-pulse{animation:fcpulse 1.1s ease-in-out infinite}
.fc-quote{animation:fcquote .5s cubic-bezier(.2,.9,.2,1)}
@keyframes fcquote{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}
.fc-ticket{animation:fcticket .34s cubic-bezier(.2,.9,.25,1) both}
@keyframes fcticket{0%{opacity:0;transform:translateY(16px) scale(.985)}100%{opacity:1;transform:none}}
/* Il timbro cade come un timbro vero: arriva grande, schiaccia, rimbalza. */
.fc-stamp{animation:fcstamp .42s cubic-bezier(.2,1.5,.4,1) .16s both}
@keyframes fcstamp{
  0%{opacity:0;transform:rotate(-13deg) scale(2.8)}
  55%{opacity:1;transform:rotate(-13deg) scale(.9)}
  100%{opacity:.94;transform:rotate(-13deg) scale(1)}
}
.fc-late{animation:fclate .45s ease .42s both}
@keyframes fclate{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}
.fc-count{animation:fccount .38s cubic-bezier(.2,1.3,.4,1) .1s both}
@keyframes fccount{0%{opacity:0;transform:scale(.72)}100%{opacity:1;transform:none}}
@keyframes fcpulse{0%,100%{opacity:.45}50%{opacity:1}}
.fc-btn:active{transform:scale(.97)}
.fc-btn{transition:transform .08s ease}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #F4F2F7;outline-offset:2px}
input,select,textarea{font-family:${body};font-size:16px}
::placeholder{color:#7C7396}
@media (prefers-reduced-motion:reduce){
  .fc-flip,.fc-crawl,.fc-pulse,.fc-quote,.fc-ticket,.fc-stamp,.fc-late,.fc-count{animation:none!important}
  .fc-stamp{opacity:.94;transform:rotate(-13deg)}
}
`;

/* ============================ stato ============================ */
const EMPTY_LIVE = { rev: 0, lot: null, assigned: [], ticker: [] };

/* ============================ helpers ============================ */
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function normRuolo(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return null;
  if (/^(P|POR|GK|GOL)/.test(s)) return "P";
  if (/^(D|DIF|DC|DD|DS|B)/.test(s)) return "D";
  if (/^(C|CEN|M|MED|T|W|E)/.test(s)) return "C";
  if (/^(A|ATT|PC|F)/.test(s)) return "A";
  return null;
}

function normMantra(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  const hit = MANTRA.find((m) => m.toLowerCase() === s);
  return hit || null;
}

/** "Dc;Dd" oppure "W/T" -> ["Dc","Dd"]. I listoni usano separatori diversi. */
function parseMantra(v) {
  return String(v || "")
    .split(/[;/,|]+/)
    .map(normMantra)
    .filter(Boolean)
    .filter((r, i, a) => a.indexOf(r) === i);
}

const HEAD = {
  nome: ["nome", "name", "calciatore", "giocatore", "player", "cognome"],
  squadra: ["squadra", "team", "club", "sq"],
  ruolo: ["ruolo", "r", "rm", "pos", "posizione", "role"],
  // L'ordine è la priorità: Qt.A viene prima di FVM.
  quot: ["qt.a", "qt.a m", "quotazione", "qt", "qa", "quot", "prezzo", "valore", "fvm"],
  fcId: ["id", "id calciatore", "idcalciatore", "codice", "cod"],
  rm: ["rm", "ruolo mantra", "r mantra", "ruolomantra", "mantra"],
};
const matchHead = (cell, keys) => {
  const s = String(cell || "").trim().toLowerCase();
  return keys.some((k) => s === k || s.startsWith(k));
};

function toRows(file, buf, text) {
  const name = (file?.name || "").toLowerCase();
  if (/\.(xlsx|xlsm|xls)$/.test(name) && buf) {
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  }
  const out = Papa.parse(text, { skipEmptyLines: true });
  return out.data;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const hasNome = r.some((c) => matchHead(c, HEAD.nome));
    const hasRuolo = r.some((c) => matchHead(c, HEAD.ruolo));
    if (hasNome && hasRuolo) return i;
  }
  return 0;
}

function guessCols(header) {
  const used = new Set();
  const norm = (c) => String(c || "").trim().toLowerCase();
  // Prima la corrispondenza esatta, poi il prefisso: altrimenti "r" si mangerebbe "rm".
  const pick = (keys) => {
    // Scorro le chiavi in ordine di priorità: la prima che trova una colonna vince.
    for (const k of keys) {
      const exact = header.findIndex((c, idx) => !used.has(idx) && norm(c) === k);
      if (exact >= 0) {
        used.add(exact);
        return exact;
      }
    }
    for (const k of keys) {
      const pre = header.findIndex((c, idx) => !used.has(idx) && norm(c).startsWith(k));
      if (pre >= 0) {
        used.add(pre);
        return pre;
      }
    }
    return -1;
  };
  // L'ordine conta: i nomi più specifici per primi.
  const fcId = pick(HEAD.fcId);
  const rm = pick(HEAD.rm);
  const ruolo = pick(HEAD.ruolo);
  const nome = pick(HEAD.nome);
  const squadra = pick(HEAD.squadra);
  const quot = pick(HEAD.quot);
  return { nome, squadra, ruolo, quot, fcId, rm };
}

function buildPlayers(rows, headerRow, cols) {
  const seen = new Set();
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nome = String(r[cols.nome] ?? "").trim();
    if (!nome) continue;
    const rm = cols.rm >= 0 ? parseMantra(r[cols.rm]) : [];
    // Se il listone non ha la colonna R, ricavo il macro-ruolo dal primo ruolo Mantra.
    const ruolo = normRuolo(cols.ruolo >= 0 ? r[cols.ruolo] : "") || (rm.length ? MANTRA_MACRO[rm[0]] : null);
    if (!ruolo) continue;
    const squadra = String(cols.squadra >= 0 ? r[cols.squadra] ?? "" : "").trim();
    const quot = Number(String(cols.quot >= 0 ? r[cols.quot] ?? "" : "").replace(",", ".")) || null;
    // Id del listone ufficiale: serve per l'import su Leghe Fantacalcio.
    const fcId = String(cols.fcId >= 0 ? r[cols.fcId] ?? "" : "").trim();
    let id = slug(nome + "-" + squadra);
    while (seen.has(id)) id += "x";
    seen.add(id);
    out.push({ id, fcId, nome, squadra, ruolo, quot, rm });
  }
  return out;
}

export const fmt = (n) => new Intl.NumberFormat("it-IT").format(n);

/* ============================ small UI pieces ============================ */
export function Chip({ ruolo, size = 22 }) {
  return (
    <span
      style={{
        background: T[ruolo],
        color: ruolo === "P" ? "#2A2046" : "#fff",
        width: size,
        height: size,
        fontFamily: mono,
        fontWeight: 800,
        fontSize: size * 0.52,
      }}
      className="inline-flex items-center justify-center rounded shrink-0"
    >
      {ruolo}
    </span>
  );
}

/** Etichette dei ruoli Mantra, colorate secondo il macro-ruolo di appartenenza. */
function ChipsMantra({ rm, size = 11 }) {
  if (!rm || !rm.length) return null;
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {rm.map((m) => (
        <span
          key={m}
          title={MANTRA_NOME[m]}
          style={{
            border: "1px solid " + T[MANTRA_MACRO[m]],
            color: T[MANTRA_MACRO[m]],
            fontFamily: mono,
            fontWeight: 800,
            fontSize: size,
            padding: "1px 5px",
            borderRadius: 5,
            lineHeight: 1.5,
          }}
        >
          {m}
        </span>
      ))}
    </span>
  );
}

export function Btn({ children, onClick, disabled, tone = "solid", full, style = {} }) {
  const base = {
    fontFamily: display,
    fontWeight: 800,
    letterSpacing: "-0.01em",
    borderRadius: 12,
    padding: "13px 16px",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.38 : 1,
  };
  const tones = {
    solid: { background: T.paper, color: T.ink },
    ghost: { background: "transparent", color: T.paper, borderColor: T.line },
    danger: { background: "transparent", color: T.A, borderColor: "rgba(232,81,69,.45)" },
  };
  return (
    <button
      className={"fc-btn " + (full ? "w-full" : "")}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...tones[tone], ...style }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span style={{ color: T.dim, fontFamily: mono, fontSize: 10, letterSpacing: ".14em" }} className="uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputStyle = {
  width: "100%",
  background: T.ink,
  color: T.paper,
  border: "1px solid " + T.line,
  borderRadius: 10,
  padding: "11px 12px",
};

export function Sheet({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(10,7,20,.7)" }}>
      <div
        className="w-full sm:max-w-lg max-h-full overflow-y-auto"
        style={{ background: T.ink2, borderTop: "1px solid " + T.line, borderRadius: "18px 18px 0 0" }}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-4 py-3"
          style={{ background: T.ink2, borderBottom: "1px solid " + T.line }}
        >
          <span style={{ fontFamily: display, fontWeight: 800, color: T.paper }}>{title}</span>
          <button onClick={onClose} style={{ color: T.dim, fontFamily: mono, fontSize: 12 }}>
            CHIUDI
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ============================ import panel ============================ */
function Import({ onDone, mantra }) {
  const [rows, setRows] = useState(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [cols, setCols] = useState({ nome: -1, squadra: -1, ruolo: -1, quot: -1, fcId: -1, rm: -1 });
  const [err, setErr] = useState("");
  const [text, setText] = useState("");

  const ingest = (rws) => {
    if (!rws || rws.length < 2) {
      setErr("Il file non contiene righe leggibili. Serve una colonna nome e una ruolo.");
      return;
    }
    const h = findHeaderRow(rws);
    setRows(rws);
    setHeaderRow(h);
    setCols(guessCols(rws[h] || []));
    setErr("");
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const txt = new TextDecoder("utf-8").decode(buf);
      ingest(toRows(f, new Uint8Array(buf), txt));
    } catch {
      setErr("Non riesco a leggere il file. Prova a esportarlo in CSV e incollarlo qui sotto.");
    }
  };

  const preview = useMemo(() => (rows ? buildPlayers(rows, headerRow, cols) : []), [rows, headerRow, cols]);
  const header = rows ? rows[headerRow] || [] : [];
  const counts = useMemo(() => {
    const c = { P: 0, D: 0, C: 0, A: 0 };
    preview.forEach((p) => (c[p.ruolo] += 1));
    return c;
  }, [preview]);

  return (
    <div className="space-y-4">
      <div style={{ color: T.dim, fontFamily: body, fontSize: 13, lineHeight: 1.5 }}>
        Carica il listone in CSV o Excel. Riconosco da solo le colonne nome, squadra, ruolo e quotazione — se sbaglio, correggi
        sotto.
      </div>

      <label
        className="block text-center py-6 cursor-pointer"
        style={{ border: "1px dashed " + T.line, borderRadius: 14, color: T.paper, fontFamily: display, fontWeight: 800 }}
      >
        Scegli file .csv / .xlsx
        <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm" onChange={onFile} className="hidden" />
      </label>

      {!rows && (
        <details>
          <summary style={{ color: T.dim, fontFamily: mono, fontSize: 11, letterSpacing: ".1em" }} className="uppercase cursor-pointer">
            oppure incolla il testo
          </summary>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"Nome;Squadra;Ruolo;Quotazione\nVlahovic;Juventus;A;24"}
            style={{ ...inputStyle, marginTop: 8, fontFamily: mono, fontSize: 12 }}
          />
          <div className="mt-2">
            <Btn tone="ghost" onClick={() => ingest(Papa.parse(text.trim(), { skipEmptyLines: true }).data)}>
              Leggi testo
            </Btn>
          </div>
        </details>
      )}

      {err && (
        <div style={{ color: T.A, fontFamily: body, fontSize: 13 }}>{err}</div>
      )}

      {rows && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="riga intestazione">
              <select value={headerRow} onChange={(e) => { const h = +e.target.value; setHeaderRow(h); setCols(guessCols(rows[h] || [])); }} style={inputStyle}>
                {rows.slice(0, 12).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}: {String((r || []).slice(0, 4).join(" · ")).slice(0, 34)}
                  </option>
                ))}
              </select>
            </Field>
            {["nome", "squadra", "ruolo", "quot", "fcId", "rm"].map((k) => (
              <Field
                key={k}
                label={k === "quot" ? "quotazione" : k === "fcId" ? "id listone" : k === "rm" ? "ruoli mantra" : k}
              >
                <select value={cols[k]} onChange={(e) => setCols({ ...cols, [k]: +e.target.value })} style={inputStyle}>
                  <option value={-1}>— nessuna —</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>
                      {String(h || "col " + (i + 1)).slice(0, 26)}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>

          <div style={{ background: T.ink, borderRadius: 12, border: "1px solid " + T.line }} className="p-3">
            <div style={{ fontFamily: mono, fontSize: 12, color: T.paper }}>
              {fmt(preview.length)} giocatori letti
            </div>
            <div className="flex gap-3 mt-2">
              {RUOLI.map((r) => (
                <span key={r} className="flex items-center gap-1" style={{ fontFamily: mono, fontSize: 12, color: T.dim }}>
                  <Chip ruolo={r} size={18} /> {counts[r]}
                </span>
              ))}
            </div>
            {cols.rm >= 0 && (
              <div style={{ fontFamily: mono, fontSize: 11, color: T.dim }} className="mt-2">
                {preview.filter((p) => p.rm.length > 1).length} giocatori con più ruoli Mantra
              </div>
            )}
            {cols.fcId < 0 && (
              <div style={{ color: T.P, fontFamily: body, fontSize: 12, lineHeight: 1.45 }} className="mt-2">
                Nessuna colonna Id riconosciuta. L'asta funziona comunque, ma l'export per Leghe Fantacalcio
                dovrà appoggiarsi ai soli nomi.
              </div>
            )}
            <div className="mt-3 space-y-1">
              {preview.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center gap-2" style={{ fontFamily: body, fontSize: 13, color: T.paper }}>
                  <Chip ruolo={p.ruolo} size={16} />
                  <span className="font-semibold">{p.nome}</span>
                  <span style={{ color: T.dim }}>{p.squadra}</span>
                  {p.quot ? <span style={{ fontFamily: mono, color: T.dim }}>{p.quot}</span> : null}
                </div>
              ))}
            </div>
          </div>

          {mantra && cols.rm < 0 && (
            <div style={{ color: T.A, fontFamily: body, fontSize: 13, lineHeight: 1.45 }}>
              Modalità Mantra senza colonna RM: seleziona la colonna dei ruoli Mantra qui sopra, oppure usa il
              listone ufficiale di Fantacalcio.it che la contiene.
            </div>
          )}
          <Btn full disabled={preview.length === 0 || (mantra && cols.rm < 0)} onClick={() => onDone(preview)}>
            Conferma listone
          </Btn>
        </>
      )}
    </div>
  );
}

/* ============================ setup ============================ */
export function Setup({ onCreate, busy }) {
  const [budget, setBudget] = useState(500);
  const [slots, setSlots] = useState({ P: 3, D: 8, C: 8, A: 6 });
  const [names, setNames] = useState(["", ""]);
  const [timer, setTimer] = useState(10);
  const [mode, setMode] = useState("classic");
  const [nomeLega, setNomeLega] = useState("");
  const [players, setPlayers] = useState(null);
  const [step, setStep] = useState(1);

  const teams = names.map((n) => n.trim()).filter(Boolean);
  const totSlots = RUOLI.reduce((s, r) => s + (+slots[r] || 0), 0);

  return (
    <div className="px-4 pb-10 pt-6 mx-auto" style={{ maxWidth: 560 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: T.dim }} className="uppercase">
        nuova asta · passo {step} di 3
      </div>
      <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 34, color: T.paper, letterSpacing: "-0.03em", lineHeight: 1.05 }} className="mt-2 mb-6">
        {step === 1 ? "Regole della lega" : step === 2 ? "Chi partecipa" : "Il listone"}
      </h1>

      {step === 1 && (
        <div className="space-y-4">
          <Field label="modalità">
            <div className="flex gap-2">
              {[
                ["classic", "Classic"],
                ["mantra", "Mantra"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setMode(v)}
                  className="flex-1 py-3 fc-btn"
                  style={{
                    background: mode === v ? T.paper : "transparent",
                    color: mode === v ? T.ink : T.dim,
                    border: "1px solid " + (mode === v ? T.paper : T.line),
                    borderRadius: 10,
                    fontFamily: display,
                    fontWeight: 800,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          {mode === "mantra" && (
            <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
              Gli slot restano per macro-ruolo, come su Leghe Fantacalcio. I ruoli Mantra vengono mostrati in
              asta e contati nelle rose, così vedi se ti mancano un Dc o un W prima di svenarti su un'ala.
            </div>
          )}
          <Field label="nome della lega">
            <input
              value={nomeLega}
              onChange={(e) => setNomeLega(e.target.value)}
              placeholder="Es. Lega Ele Luci"
              style={inputStyle}
            />
          </Field>
          <Field label="crediti a testa">
            <input type="number" value={budget} onChange={(e) => setBudget(+e.target.value)} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            {RUOLI.map((r) => (
              <Field key={r} label={RUOLO_NOME[r]}>
                <input
                  type="number"
                  value={slots[r]}
                  onChange={(e) => setSlots({ ...slots, [r]: Math.max(0, +e.target.value) })}
                  style={{ ...inputStyle, fontFamily: mono, textAlign: "center" }}
                />
              </Field>
            ))}
          </div>
          <div style={{ fontFamily: mono, fontSize: 12, color: T.dim }}>{totSlots} giocatori per rosa</div>
          <Field label="secondi dall'ultimo rilancio (0 = chiude il banditore)">
            <input type="number" value={timer} onChange={(e) => setTimer(Math.max(0, +e.target.value))} style={{ ...inputStyle, fontFamily: mono }} />
          </Field>
          <Btn full onClick={() => setStep(2)} disabled={budget < 1 || totSlots < 1 || !nomeLega.trim()}>
            Avanti
          </Btn>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {names.map((n, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span style={{ fontFamily: mono, color: T.dim, fontSize: 12, width: 22 }}>{String(i + 1).padStart(2, "0")}</span>
              <input
                value={n}
                placeholder="Nome squadra"
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                style={inputStyle}
              />
              {names.length > 2 && (
                <button onClick={() => setNames(names.filter((_, j) => j !== i))} style={{ color: T.dim, fontFamily: mono, padding: 6 }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <Btn tone="ghost" full onClick={() => setNames([...names, ""])}>
            Aggiungi squadra
          </Btn>
          <div className="flex gap-2 pt-2">
            <Btn tone="ghost" onClick={() => setStep(1)}>
              Indietro
            </Btn>
            <Btn full disabled={teams.length < 2} onClick={() => setStep(3)}>
              Avanti
            </Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {!players ? (
            <Import onDone={setPlayers} mantra={mode === "mantra"} />
          ) : (
            <>
              <div style={{ background: T.ink2, borderRadius: 12, border: "1px solid " + T.line }} className="p-4">
                <div style={{ fontFamily: display, fontWeight: 800, color: T.paper, fontSize: 20 }}>
                  {fmt(players.length)} giocatori · {teams.length} squadre
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: T.dim }} className="mt-1">
                  {mode === "mantra" ? "Mantra" : "Classic"} · {fmt(budget)} crediti · {totSlots} slot ·{" "}
                  {timer > 0 ? timer + "s per rilanciare" : "chiusura manuale"}
                </div>
              </div>
              <Btn tone="ghost" full onClick={() => setPlayers(null)}>
                Cambia listone
              </Btn>
              <Btn
                full
                disabled={busy}
                onClick={() =>
                  onCreate({
                    setup: {
                      budget,
                      slots,
                      timer,
                      mode,
                      nome: nomeLega.trim() || "Asta fantacalcio",
                      createdAt: Date.now(),
                      teams: teams.map((n, i) => ({ id: "t" + i + "-" + slug(n), name: n })),
                    },
                    players,
                  })
                }
              >
                {busy ? "Apro l'asta…" : "Apri l'asta"}
              </Btn>
            </>
          )}
          <Btn tone="ghost" onClick={() => setStep(2)}>
            Indietro
          </Btn>
        </div>
      )}
    </div>
  );
}

/* ============================ join ============================ */
function Join({ setup, taken, onJoin, onReset, onShare, code }) {
  const [sel, setSel] = useState("");
  const [host, setHost] = useState(false);
  return (
    <div className="px-4 pb-10 pt-8 mx-auto" style={{ maxWidth: 480 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: T.dim }} className="uppercase">
        {setup.nome || "asta aperta"} · {code} · {fmt(setup.budget)} crediti
      </div>
      <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 36, color: T.paper, letterSpacing: "-0.03em", lineHeight: 1.05 }} className="mt-2 mb-6">
        Qual è la tua squadra?
      </h1>
      <div className="space-y-2">
        {setup.teams.map((t) => (
          <button
            key={t.id}
            onClick={() => setSel(t.id)}
            className="w-full text-left px-4 py-3 flex items-center justify-between fc-btn"
            style={{
              background: sel === t.id ? T.paper : T.ink2,
              color: sel === t.id ? T.ink : T.paper,
              border: "1px solid " + (sel === t.id ? T.paper : T.line),
              borderRadius: 12,
              fontFamily: display,
              fontWeight: 800,
              fontSize: 17,
            }}
          >
            {t.name}
            {taken.includes(t.id) && sel !== t.id && (
              <span style={{ fontFamily: mono, fontSize: 10, color: T.dim }}>GIÀ IN ASTA</span>
            )}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-3 mt-5" style={{ color: T.paper, fontFamily: body, fontSize: 14 }}>
        <input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} style={{ width: 20, height: 20 }} />
        Sono io il banditore
      </label>
      <div style={{ color: T.dim, fontFamily: body, fontSize: 12 }} className="mt-1">
        Il banditore mette i giocatori all'asta e aggiudica. Bastano un banditore e un dispositivo a testa.
      </div>
      <div className="mt-5">
        <Btn full disabled={!sel} onClick={() => onJoin({ teamId: sel, host })}>
          Entra
        </Btn>
      </div>
      <div className="mt-2">
        <Btn tone="ghost" full onClick={onShare}>
          Invita gli altri
        </Btn>
      </div>
      <button onClick={onReset} style={{ color: T.dim, fontFamily: mono, fontSize: 11 }} className="mt-8 underline">
        chiudi questa asta e ricomincia
      </button>
    </div>
  );
}

/* ============================ auction ============================ */
/** Da "#2FA86B" a "rgba(47,168,107,.14)": serve per gli aloni sotto il prezzo. */
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Il cartellino del lotto aggiudicato.
 * Il linguaggio è quello della sala d'asta: un biglietto con la tacca laterale,
 * il timbro che cade di sbieco e la parte staccabile in fondo con la citazione.
 */
function Cartellino({ colpo, ruolo, mantra, io }) {
  const c = T[ruolo] || T.C;
  const notch = { position: "absolute", width: 22, height: 22, borderRadius: "50%", background: T.ink, top: "50%", marginTop: -11 };

  return (
    <div
      className="fc-ticket relative overflow-hidden"
      style={{
        background: T.ink2,
        border: "1px solid " + T.line,
        borderRadius: 18,
        boxShadow: `0 0 0 1px ${alpha(c, 0.18)}, 0 18px 40px -22px ${alpha(c, 0.55)}`,
      }}
    >
      {/* banda del ruolo: la stessa che apre la card del lotto, così si riconosce la continuità */}
      <div style={{ height: 5, background: c }} />

      <div className="relative px-5 pt-5 pb-6">
        {/* alone diffuso dietro il prezzo */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(120% 90% at 82% 78%, ${alpha(c, 0.16)}, transparent 62%)`,
            pointerEvents: "none",
          }}
        />

        {/* timbro */}
        <div
          aria-hidden
          className="fc-stamp"
          style={{
            position: "absolute",
            right: 14,
            top: 14,
            border: `2.5px solid ${c}`,
            color: c,
            borderRadius: 8,
            padding: "4px 9px",
            fontFamily: mono,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: ".16em",
            transformOrigin: "center",
          }}
        >
          AGGIUDICATO
        </div>

        <div className="relative">
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".22em", color: T.dim }} className="uppercase">
            lotto {String(colpo.lotto).padStart(3, "0")}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2" style={{ maxWidth: "66%" }}>
            <Chip ruolo={ruolo} size={18} />
            {mantra && <ChipsMantra rm={colpo.rm} size={9} />}
          </div>

          <div
            style={{
              fontFamily: display,
              fontWeight: 800,
              fontSize: "clamp(26px, 8.2vw, 34px)",
              lineHeight: 1,
              letterSpacing: "-0.035em",
              color: T.paper,
              maxWidth: "92%",
            }}
            className="mt-3"
          >
            {colpo.nome}
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".16em", color: T.dim }} className="uppercase mt-1">
            {colpo.club}
          </div>

          {/* la riga che conta: chi se l'è preso e a quanto */}
          <div className="flex items-end justify-between gap-4 mt-5">
            <div className="min-w-0">
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
                {io ? "è tuo" : "va a"}
              </div>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: "clamp(18px, 5.4vw, 22px)",
                  letterSpacing: "-0.02em",
                  color: T.paper,
                  lineHeight: 1.15,
                }}
                className="truncate"
              >
                {colpo.team}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className="fc-count"
                style={{
                  fontFamily: mono,
                  fontWeight: 800,
                  fontSize: "clamp(42px, 13vw, 56px)",
                  lineHeight: 0.85,
                  letterSpacing: "-0.05em",
                  color: c,
                }}
              >
                {colpo.price}
              </div>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase mt-1">
                crediti
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* perforazione: sopra il lotto, sotto la parte staccabile */}
      <div className="relative" style={{ height: 1 }}>
        <div style={{ ...notch, left: -11 }} />
        <div style={{ ...notch, right: -11 }} />
        <div style={{ borderTop: "1px dashed " + T.line, margin: "0 14px" }} />
      </div>

      <div className="fc-late px-5 py-5">
        <div style={{ fontFamily: display, fontWeight: 600, fontSize: 17, lineHeight: 1.32, letterSpacing: "-0.012em", color: T.paper }}>
          «{colpo.cit.t}»
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".1em", color: T.dim }} className="mt-2">
          {colpo.cit.incerta ? "attribuita a " : "— "}
          {colpo.cit.a}
        </div>
      </div>
    </div>
  );
}

/** Condivide il link dell'asta: menu nativo su mobile, appunti altrove. */
async function condividi(code, nome, say) {
  const url = `${window.location.origin}/a/${code}`;
  const testo = `${nome || "Asta fantacalcio"} — entra con il codice ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: nome || "Asta fantacalcio", text: testo, url });
      return;
    }
    await navigator.clipboard.writeText(`${testo}\n${url}`);
    say("Link copiato.");
  } catch (e) {
    if (e?.name !== "AbortError") say(`Codice asta: ${code}`);
  }
}

export default function App({ code }) {
  const [phase, setPhase] = useState("boot"); // boot | join | live | offline | assente
  const [setup, setSetup] = useState(null);
  const [players, setPlayers] = useState([]);
  const [live, setLive] = useState(EMPTY_LIVE);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'call' | 'rose' | 'export'
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [ultimoColpo, setUltimoColpo] = useState(null);
  const nAssegnati = useRef(null);
  const liveRef = useRef(EMPTY_LIVE);
  liveRef.current = live;

  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teamName = (id) => setup?.teams.find((t) => t.id === id)?.name || "—";

  const say = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  /* ---- boot ---- */
  useEffect(() => {
    (async () => {
      try {
        const snap = await api.snapshot(code);
        setSetup(snap.setup);
        setPlayers(snap.players || []);
        setLive(snap.live || EMPTY_LIVE);
        api.ricorda({
          code,
          nome: snap.setup.nome,
          squadre: snap.setup.teams.length,
          mode: snap.setup.mode,
        });
        const mine = api.getMe(code);
        if (mine && snap.setup.teams.some((t) => t.id === mine.teamId)) {
          setMe(mine);
          setPhase("live");
        } else setPhase("join");
      } catch (e) {
        setPhase(e.notFound ? "assente" : "offline");
      }
    })();
  }, [code]);

  /* ---- poll ---- */
  const pull = useCallback(async () => {
    try {
      const lv = await api.pollLive(code, liveRef.current?.rev ?? -1);
      if (lv) setLive(lv);
    } catch {
      /* rete ballerina: riprova al giro dopo */
    }
  }, [code]);
  useEffect(() => {
    if (phase !== "live") return;
    const a = setInterval(pull, 1200);
    const b = setInterval(() => setNow(Date.now()), 250);
    const onVis = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase, pull]);

  const isMantra = setup?.mode === "mantra";
  // Le rose sono ricostruite rigiocando il registro: acquisti, svincoli e scambi.
  const stato = useMemo(() => (setup ? replay(setup, live.assigned) : null), [setup, live.assigned]);
  const st = stato?.squadre;
  const mine = me && st ? st[me.teamId] : null;
  const inRiparazione = setup?.fase === "riparazione";
  const lot = live.lot;
  const lotPlayer = lot ? byId[lot.playerId] : null;
  const assignedIds = useMemo(() => new Set(live.assigned.map((a) => a.playerId)), [live.assigned]);

  const canBidRole = lotPlayer && mine ? mine.conta[lotPlayer.ruolo] < setup.slots[lotPlayer.ruolo] : false;
  const isLeader = lot && me && lot.bidderId === me.teamId;
  const secsLeft = lot && lot.closesAt ? Math.max(0, Math.ceil((lot.closesAt - now) / 1000)) : null;

  /* ---- writes ---- */
  const run = async (action, payload, label) => {
    try {
      const lv = await api.act(action, { code, ...payload });
      if (lv && lv.rev !== undefined) setLive(lv);
      return true;
    } catch (e) {
      if (e.live) setLive(e.live);
      say(e.message || `Non è passato ${label}.`);
      return false;
    }
  };

  const openLot = (p) => run("open", { playerId: p.id, nome: p.nome }, "l'apertura");

  const bid = (amount) =>
    run("bid", { playerId: lot.playerId, amount, teamId: me.teamId }, "il rilancio");

  const assign = () =>
    lot && lot.bidderId
      ? run("assign", { nome: lotPlayer?.nome, ruolo: lotPlayer?.ruolo }, "l'aggiudicazione")
      : null;

  const drop = () => run("drop", { nome: lotPlayer?.nome }, "il ritiro");

  const undo = () => {
    const last = live.assigned[live.assigned.length - 1];
    return run("undo", { nome: byId[last?.playerId]?.nome }, "l'annullamento");
  };

  /* ---- citazione dopo ogni aggiudicazione ---- */
  useEffect(() => {
    const n = live.assigned.length;
    // Al primo caricamento non mostro nulla: solo quando il numero cresce davvero.
    if (nAssegnati.current === null) {
      nAssegnati.current = n;
      return;
    }
    if (n <= nAssegnati.current) {
      nAssegnati.current = n;
      return;
    }
    nAssegnati.current = n;
    const last = live.assigned[n - 1];
    const p = byId[last.playerId] || {};
    const io = me && last.teamId === me.teamId;
    setUltimoColpo({
      nome: p.nome || "",
      club: p.squadra || "",
      ruolo: last.ruolo || p.ruolo || "C",
      rm: p.rm || [],
      team: teamName(last.teamId),
      price: last.price,
      io,
      lotto: n,
      cit: citazionePer(code, n - 1),
      fino: Date.now() + 9000,
    });
    // Una vibrazione breve solo a chi ha vinto il giocatore: il telefono è in tasca o sul tavolo.
    if (io && navigator.vibrate) {
      try {
        navigator.vibrate([14, 44, 22]);
      } catch {}
    }
  }, [live.assigned.length]);

  // La card sparisce da sola, e comunque appena si apre un lotto nuovo.
  useEffect(() => {
    if (!ultimoColpo) return;
    const ms = ultimoColpo.fino - Date.now();
    if (ms <= 0) return setUltimoColpo(null);
    const t = setTimeout(() => setUltimoColpo(null), ms);
    return () => clearTimeout(t);
  }, [ultimoColpo]);

  useEffect(() => {
    if (lot) setUltimoColpo(null);
  }, [lot?.playerId]);

  /* ---- host auto-close on timer ---- */
  useEffect(() => {
    if (!me?.host || !lot?.closesAt || !lot.bidderId) return;
    if (now >= lot.closesAt) assign();
  }, [now, lot, me]);

  const svincola = (p) => run("svincola", p, "lo svincolo");
  const scambio = (p) => run("scambio", p, "lo scambio");
  const cambiaFase = async (fase) => {
    const ok = await run("fase", { fase }, "il cambio di fase");
    if (ok) setSetup((s) => ({ ...s, fase }));
    return ok;
  };

  /* ---- lifecycle actions ---- */
  const join = async (m) => {
    api.setMe(code, m);
    setMe(m);
    setPhase("live");
    pull();
  };

  const reset = async () => {
    if (!window.confirm("Cancello questa asta, rose e listone per tutti. Procedo?")) return;
    try {
      await api.act("reset", { code });
    } catch (e) {
      say(e.message);
      return;
    }
    api.clearMe(code);
    api.dimentica(code);
    window.location.href = "/";
  };

  /* ============================ render ============================ */
  if (phase === "boot")
    return (
      <Shell>
        <div className="fc-pulse pt-24 text-center" style={{ fontFamily: mono, color: T.dim, fontSize: 12, letterSpacing: ".2em" }}>
          CARICO L'ASTA…
        </div>
      </Shell>
    );

  if (phase === "offline")
    return (
      <Shell>
        <div className="px-6 pt-16" style={{ color: T.paper, fontFamily: body }}>
          <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 28 }}>Non raggiungo il server</h1>
          <p className="mt-3" style={{ color: T.dim }}>
            Controlla la connessione e ricarica la pagina. Le rose sono salvate sul server, non si perde nulla.
          </p>
          <div className="mt-5">
            <Btn onClick={() => window.location.reload()}>Ricarica</Btn>
          </div>
        </div>
      </Shell>
    );

  if (phase === "assente")
    return (
      <Shell>
        <div className="px-6 pt-16" style={{ color: T.paper, fontFamily: body }}>
          <h1 style={{ fontFamily: display, fontWeight: 800, fontSize: 28 }}>Asta non trovata</h1>
          <p className="mt-3" style={{ color: T.dim }}>
            Il codice <b style={{ fontFamily: mono }}>{code}</b> non corrisponde a nessuna asta. Controlla il
            link, oppure l'asta è stata chiusa.
          </p>
          <div className="mt-5">
            <Btn onClick={() => (window.location.href = "/")}>Torna all'inizio</Btn>
          </div>
        </div>
      </Shell>
    );

  if (phase === "join")
    return (
      <Shell>
        <Join
          setup={setup}
          code={code}
          taken={[]}
          onJoin={join}
          onReset={reset}
          onShare={() => condividi(code, setup.nome, say)}
        />
      </Shell>
    );

  /* --- live --- */
  const roleColor = lotPlayer ? T[lotPlayer.ruolo] : T.dim;

  return (
    <Shell>
      {/* top bar: my wallet */}
      <div className="sticky top-0 z-30 px-4 py-3" style={{ background: T.ink, borderBottom: "1px solid " + T.line }}>
        <div className="flex items-baseline justify-between">
          <div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
              {teamName(me.teamId)}
              {me.host ? " · banditore" : ""} · {code}
            </div>
            <div style={{ fontFamily: mono, fontWeight: 800, fontSize: 26, color: T.paper, lineHeight: 1.1 }}>
              {fmt(mine.left)}
              <span style={{ fontSize: 11, color: T.dim, fontWeight: 400 }}> crediti</span>
            </div>
          </div>
          <div className="flex gap-3">
            {RUOLI.map((r) => (
              <div key={r} className="text-center">
                <Chip ruolo={r} size={18} />
                <div style={{ fontFamily: mono, fontSize: 11, color: T.paper, marginTop: 2 }}>
                  {mine.conta[r]}
                  <span style={{ color: T.dim }}>/{setup.slots[r]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {inRiparazione && (
          <div
            style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: T.P }}
            className="uppercase mt-1"
          >
            mercato di riparazione aperto
          </div>
        )}
        <div style={{ fontFamily: mono, fontSize: 10, color: T.dim }} className="mt-1">
          offerta massima {fmt(mine.maxBid)} · devi lasciare 1 credito per ognuno dei {mine.slotsLeft} slot liberi
        </div>
      </div>

      {/* stage */}
      <div className="px-4 pt-5" style={{ paddingBottom: 150 }}>
        {!lot && ultimoColpo ? (
          <Cartellino colpo={ultimoColpo} ruolo={ultimoColpo.ruolo} mantra={isMantra} io={ultimoColpo.io} />
        ) : !lot ? (
          <div
            className="py-14 text-center"
            style={{ border: "1px dashed " + T.line, borderRadius: 18, color: T.dim, fontFamily: body }}
          >
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em" }} className="uppercase">
              nessun lotto aperto
            </div>
            <div className="mt-2 px-6" style={{ fontSize: 14 }}>
              {me.host ? "Chiama il prossimo giocatore." : "Aspetta che il banditore chiami il prossimo giocatore."}
            </div>
          </div>
        ) : (
          <div style={{ background: T.ink2, borderRadius: 18, border: "1px solid " + T.line, overflow: "hidden" }}>
            <div style={{ height: 5, background: roleColor }} />
            <div className="p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip ruolo={lotPlayer?.ruolo || "C"} size={20} />
                {isMantra && <ChipsMantra rm={lotPlayer?.rm} size={12} />}
                <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".18em", color: T.dim }} className="uppercase">
                  {lotPlayer?.squadra || "—"}
                  {lotPlayer?.quot ? ` · quot ${lotPlayer.quot}` : ""}
                </span>
              </div>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: 40,
                  lineHeight: 0.98,
                  letterSpacing: "-0.035em",
                  color: T.paper,
                }}
                className="mt-2"
              >
                {lotPlayer?.nome || "Giocatore"}
              </div>

              <div className="mt-6 flex items-end justify-between gap-4">
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
                    {lot.bidderId
                      ? "in testa · " + teamName(lot.bidderId)
                      : (lot.base || 1) > 1
                      ? `svincolato · base ${lot.base}`
                      : "base d'asta"}
                  </div>
                  <div
                    key={lot.bid + "-" + (lot.bidderId || "")}
                    className="fc-flip"
                    style={{
                      fontFamily: mono,
                      fontWeight: 800,
                      fontSize: 72,
                      lineHeight: 0.9,
                      letterSpacing: "-0.05em",
                      color: lot.bidderId ? roleColor : T.dim,
                    }}
                  >
                    {lot.bid || lot.base || 1}
                  </div>
                </div>
                {secsLeft !== null && (
                  <div className="text-right">
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
                      chiude in
                    </div>
                    <div
                      className={secsLeft <= 3 ? "fc-pulse" : ""}
                      style={{ fontFamily: mono, fontWeight: 800, fontSize: 34, color: secsLeft <= 3 ? T.A : T.paper }}
                    >
                      {secsLeft}s
                    </div>
                  </div>
                )}
              </div>

              {!canBidRole && (
                <div style={{ color: T.A, fontFamily: body, fontSize: 13 }} className="mt-4">
                  Hai già {setup.slots[lotPlayer?.ruolo]} {RUOLO_NOME[lotPlayer?.ruolo]?.toLowerCase()}. Su questo non puoi offrire.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ticker */}
        {live.ticker.length > 0 && (
          <div className="mt-5">
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".22em", color: T.dim }} className="uppercase mb-2">
              ultimi movimenti
            </div>
            <div className="space-y-1">
              {live.ticker.slice(0, 6).map((e, i) => (
                <div key={e.t + "" + i} className="flex justify-between" style={{ fontFamily: mono, fontSize: 12, color: i === 0 ? T.paper : T.dim }}>
                  <span>{e.text}</span>
                  <span>{new Date(e.t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <Btn tone="ghost" full onClick={() => setSheet("rose")}>
            Rose e crediti
          </Btn>
          <Btn tone="ghost" onClick={() => condividi(code, setup.nome, say)}>
            Invita
          </Btn>
          {me.host && (
            <Btn tone="ghost" onClick={undo} disabled={!live.assigned.length}>
              Annulla ultimo
            </Btn>
          )}
        </div>
        {me.host && (
          <div className="mt-2">
            <Btn tone={inRiparazione ? "solid" : "ghost"} full onClick={() => setSheet("mercato")}>
              {inRiparazione ? "Mercato aperto · svincoli e scambi" : "Mercato di riparazione"}
            </Btn>
          </div>
        )}
        {me.host && (
          <button onClick={reset} style={{ color: T.dim, fontFamily: mono, fontSize: 10 }} className="mt-6 underline">
            chiudi asta e ricomincia
          </button>
        )}
      </div>

      {/* action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 px-4 pt-3"
        style={{ background: T.ink, borderTop: "1px solid " + T.line, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        {lot ? (
          <>
            <div className="flex gap-2">
              {[1, 5, 10].map((inc) => {
                // Senza offerte si parte dalla base: 1, o il prezzo di ripartenza di uno svincolato.
                const partenza = lot.base || 1;
                const next = lot.bidderId ? lot.bid + inc : partenza + (inc === 1 ? 0 : inc);
                const ok = canBidRole && !isLeader && next <= mine.maxBid;
                return (
                  <button
                    key={inc}
                    onClick={() => bid(next)}
                    disabled={!ok}
                    className="fc-btn flex-1 py-3"
                    style={{
                      background: ok ? T.paper : T.ink2,
                      color: ok ? T.ink : T.dim,
                      border: "1px solid " + (ok ? T.paper : T.line),
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ fontFamily: mono, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{next}</div>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em" }}>
                      {lot.bidderId ? "+" + inc : inc === 1 ? "BASE" : "+" + inc}
                    </div>
                  </button>
                );
              })}
              <CustomBid
              max={mine.maxBid}
              min={lot.bidderId ? lot.bid + 1 : lot.base || 1}
              disabled={!canBidRole || isLeader}
              onBid={bid}
            />
            </div>
            {isLeader && (
              <div style={{ fontFamily: mono, fontSize: 11, color: T[lotPlayer?.ruolo || "C"] }} className="text-center mt-2">
                SEI IN TESTA A {lot.bid}
              </div>
            )}
            {me.host && (
              <div className="flex gap-2 mt-2">
                <Btn tone="ghost" full onClick={drop}>
                  Ritira
                </Btn>
                <Btn full disabled={!lot.bidderId} onClick={assign}>
                  {lot.bidderId ? `Aggiudica a ${teamName(lot.bidderId)}` : "Nessuna offerta"}
                </Btn>
              </div>
            )}
          </>
        ) : me.host ? (
          <Btn full onClick={() => setSheet("call")}>
            Chiama un giocatore
          </Btn>
        ) : (
          <div className="fc-pulse text-center py-3" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: T.dim }}>
            IN ATTESA DEL BANDITORE
          </div>
        )}
      </div>

      {sheet === "call" && (
        <Sheet title="Chiama un giocatore" onClose={() => setSheet(null)}>
          <Search
            players={players}
            mantra={isMantra}
            assignedIds={assignedIds}
            onPick={async (p) => {
              await openLot(p);
              setSheet(null);
            }}
          />
        </Sheet>
      )}

      {sheet === "rose" && (
        <Sheet title="Rose e crediti" onClose={() => setSheet(null)}>
          <Rose setup={setup} st={st} byId={byId} mantra={isMantra} onExport={() => setSheet("export")} />
        </Sheet>
      )}

      {sheet === "mercato" && (
        <Sheet title={inRiparazione ? "Mercato di riparazione" : "Riparazione"} onClose={() => setSheet(null)}>
          <Riparazione
            setup={setup}
            stato={stato}
            byId={byId}
            busy={false}
            onFase={cambiaFase}
            onSvincola={svincola}
            onScambio={scambio}
          />
        </Sheet>
      )}

      {sheet === "export" && (
        <Sheet title="Esporta le rose" onClose={() => setSheet("rose")}>
          <Export setup={setup} st={st} byId={byId} onSay={say} />
        </Sheet>
      )}

      {toast && (
        <div
          className="fixed left-4 right-4 z-50 px-4 py-3 text-center"
          style={{ bottom: 130, background: T.paper, color: T.ink, borderRadius: 12, fontFamily: body, fontSize: 13, fontWeight: 600 }}
        >
          {toast}
        </div>
      )}
    </Shell>
  );
}

/* ============================ shell ============================ */
export function Shell({ children }) {
  return (
    <div className="fc-root min-h-screen" style={{ background: T.ink, fontFamily: body }}>
      <style>{CSS}</style>
      <div className="mx-auto" style={{ maxWidth: 620 }}>
        {children}
      </div>
    </div>
  );
}

/* ============================ custom bid ============================ */
function CustomBid({ max, min, disabled, onBid }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const n = parseInt(v, 10);
  const ok = Number.isFinite(n) && n >= min && n <= max;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="fc-btn py-3 px-3"
        style={{
          background: T.ink2,
          color: disabled ? T.dim : T.paper,
          border: "1px solid " + T.line,
          borderRadius: 12,
          fontFamily: mono,
          fontSize: 11,
        }}
      >
        ALTRO
      </button>
      {open && (
        <Sheet title="Quanto offri?" onClose={() => setOpen(false)}>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder={String(min)}
            style={{ ...inputStyle, fontFamily: mono, fontSize: 32, fontWeight: 800, textAlign: "center", padding: "18px 12px" }}
          />
          <div style={{ fontFamily: mono, fontSize: 11, color: T.dim }} className="mt-2 text-center">
            da {min} a {max}
          </div>
          <div className="mt-4">
            <Btn
              full
              disabled={!ok}
              onClick={() => {
                onBid(n);
                setV("");
                setOpen(false);
              }}
            >
              Offri {ok ? n : ""}
            </Btn>
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ============================ search ============================ */
function Search({ players, assignedIds, onPick, mantra }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const [mr, setMr] = useState("");
  const res = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => (r ? p.ruolo === r : true))
      .filter((p) => (mr ? (p.rm || []).includes(mr) : true))
      .filter((p) => (needle ? p.nome.toLowerCase().includes(needle) || p.squadra.toLowerCase().includes(needle) : true))
      .slice(0, 60);
  }, [players, q, r, mr, assignedIds]);

  return (
    <div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome o squadra" style={inputStyle} />
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setR("")}
          className="px-3 py-1"
          style={{
            background: r === "" ? T.paper : "transparent",
            color: r === "" ? T.ink : T.dim,
            border: "1px solid " + T.line,
            borderRadius: 999,
            fontFamily: mono,
            fontSize: 11,
          }}
        >
          TUTTI
        </button>
        {RUOLI.map((x) => (
          <button
            key={x}
            onClick={() => setR(r === x ? "" : x)}
            className="px-3 py-1"
            style={{
              background: r === x ? T[x] : "transparent",
              color: r === x ? (x === "P" ? T.ink : "#fff") : T.dim,
              border: "1px solid " + (r === x ? T[x] : T.line),
              borderRadius: 999,
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {x}
          </button>
        ))}
      </div>
      {mantra && (
        <div className="flex gap-1 flex-wrap mt-2">
          {MANTRA.map((m) => (
            <button
              key={m}
              onClick={() => setMr(mr === m ? "" : m)}
              title={MANTRA_NOME[m]}
              className="px-2 py-1"
              style={{
                background: mr === m ? T[MANTRA_MACRO[m]] : "transparent",
                color: mr === m ? "#fff" : T.dim,
                border: "1px solid " + (mr === m ? T[MANTRA_MACRO[m]] : T.line),
                borderRadius: 999,
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-1">
        {res.length === 0 && (
          <div style={{ color: T.dim, fontFamily: body, fontSize: 13 }} className="py-6 text-center">
            Nessun giocatore libero con questo filtro.
          </div>
        )}
        {res.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="w-full flex items-center gap-3 px-3 py-3 text-left fc-btn"
            style={{ background: T.ink, border: "1px solid " + T.line, borderRadius: 10 }}
          >
            <Chip ruolo={p.ruolo} size={20} />
            <span className="flex-1 min-w-0" style={{ color: T.paper, fontFamily: display, fontWeight: 800, fontSize: 15 }}>
              <span className="block truncate">{p.nome}</span>
              {mantra && <ChipsMantra rm={p.rm} size={9} />}
            </span>
            <span style={{ color: T.dim, fontFamily: mono, fontSize: 11 }}>{p.squadra}</span>
            {p.quot ? <span style={{ color: T.paper, fontFamily: mono, fontSize: 12 }}>{p.quot}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================ rose ============================ */
/** Quanti giocatori ha la squadra per ciascun ruolo Mantra. Chi ha due ruoli conta in entrambi. */
function coperturaMantra(picks, byId) {
  const c = {};
  MANTRA.forEach((m) => (c[m] = 0));
  picks.forEach((p) => (byId[p.playerId]?.rm || []).forEach((m) => (c[m] += 1)));
  return c;
}

function CoperturaMantra({ picks, byId }) {
  const c = coperturaMantra(picks, byId);
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid " + T.line }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase mb-2">
        copertura mantra
      </div>
      <div className="flex flex-wrap gap-1">
        {MANTRA.map((m) => (
          <span
            key={m}
            title={MANTRA_NOME[m]}
            style={{
              border: "1px solid " + (c[m] ? T[MANTRA_MACRO[m]] : T.line),
              color: c[m] ? T[MANTRA_MACRO[m]] : "#5C5478",
              fontFamily: mono,
              fontWeight: 800,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            {m} {c[m]}
          </span>
        ))}
      </div>
      <div style={{ color: T.dim, fontFamily: body, fontSize: 11, lineHeight: 1.4 }} className="mt-2">
        Chi ha più ruoli conta in ciascuno, quindi la somma supera il numero di giocatori.
      </div>
    </div>
  );
}

function Rose({ setup, st, byId, onExport, mantra }) {
  const [open, setOpen] = useState(setup.teams[0]?.id);
  return (
    <div>
      <div className="space-y-2">
        {setup.teams.map((t) => {
          const s = st[t.id];
          const isOpen = open === t.id;
          return (
            <div key={t.id} style={{ background: T.ink, border: "1px solid " + T.line, borderRadius: 12 }}>
              <button onClick={() => setOpen(isOpen ? null : t.id)} className="w-full flex items-center justify-between px-3 py-3">
                <span style={{ color: T.paper, fontFamily: display, fontWeight: 800, fontSize: 16 }}>{t.name}</span>
                <span style={{ fontFamily: mono, fontSize: 12, color: T.paper }}>
                  {fmt(s.left)}
                  <span style={{ color: T.dim }}> · {s.picks.length} pres.</span>
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3">
                  {RUOLI.map((r) => {
                    const list = s.picks.filter((p) => p.ruolo === r);
                    return (
                      <div key={r} className="mt-2">
                        <div className="flex items-center gap-2">
                          <Chip ruolo={r} size={16} />
                          <span style={{ fontFamily: mono, fontSize: 10, color: T.dim, letterSpacing: ".14em" }} className="uppercase">
                            {list.length}/{setup.slots[r]}
                          </span>
                        </div>
                        {list.map((p) => (
                          <div key={p.playerId} className="flex justify-between mt-1" style={{ fontFamily: body, fontSize: 13, color: T.paper }}>
                            <span>
                              {byId[p.playerId]?.nome}{" "}
                              <span style={{ color: T.dim, fontSize: 11 }}>{byId[p.playerId]?.squadra}</span>{" "}
                              {mantra && <ChipsMantra rm={byId[p.playerId]?.rm} size={9} />}
                            </span>
                            <span style={{ fontFamily: mono }}>{p.price}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {mantra && <CoperturaMantra picks={s.picks} byId={byId} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Btn tone="ghost" full onClick={onExport}>
          Esporta le rose
        </Btn>
      </div>
    </div>
  );
}

/* ============================ export ============================ */
function download(name, content, mime = "text/csv;charset=utf-8", bom = true) {
  const url = URL.createObjectURL(new Blob([(bom ? "\uFEFF" : "") + content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const csvRow = (cells) => cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
const fileSafe = (s) => slug(s) || "squadra";

/**
 * Righe di una singola rosa, ordinate per ruolo e prezzo decrescente.
 * Parte dalle rose ricostruite dal registro, non dai movimenti grezzi:
 * altrimenti gli svincolati resterebbero dentro e gli scambiati fuori.
 */
function rosaRows(st, teamId, byId) {
  const picks = st[teamId]?.picks || [];
  const out = [];
  for (const r of RUOLI) {
    picks
      .filter((a) => a.ruolo === r)
      .sort((a, b) => b.price - a.price)
      .forEach((a) => {
        const p = byId[a.playerId] || {};
        out.push({ fcId: p.fcId || "", nome: p.nome || "", ruolo: r, club: p.squadra || "", price: a.price });
      });
  }
  return out;
}

/**
 * Formato Leghe Fantacalcio (verificato su un export reale della lega).
 * Tre colonne senza intestazione: fantasquadra, id del listone, prezzo.
 * Una riga "$,$,$" precede ogni blocco squadra. Nessuna virgoletta, fine riga LF.
 */
function exportLeghe(setup, st, byId) {
  const lines = [];
  for (const t of setup.teams) {
    const rows = rosaRows(st, t.id, byId);
    if (!rows.length) continue;
    lines.push("$,$,$");
    for (const r of rows) {
      // La virgola nel nome squadra romperebbe il parsing: la sostituisco.
      lines.push([String(t.name).replace(/,/g, " "), r.fcId, r.price].join(","));
    }
  }
  // Newline finale: presente nei file prodotti dal sito.
  download("rosters.csv", lines.join("\n") + "\n", "text/csv;charset=utf-8", false);
}

/** Riepilogo unico, con la fantasquadra come colonna. */
function exportCompleto(setup, st, byId) {
  const rows = [csvRow(["Fantasquadra", "Id", "Nome", "Ruolo", "Squadra", "Costo"])];
  for (const t of setup.teams) {
    rosaRows(st, t.id, byId).forEach((r) =>
      rows.push(csvRow([t.name, r.fcId, r.nome, r.ruolo, r.club, r.price]))
    );
  }
  download("rose-complete.csv", rows.join("\n"));
}

/** Testo da incollare nel gruppo. */
function riepilogoTesto(setup, st, byId) {
  const lines = [];
  for (const t of setup.teams) {
    const rows = rosaRows(st, t.id, byId);
    const spesi = st[t.id]?.spesi ?? rows.reduce((s, r) => s + r.price, 0);
    lines.push(`*${t.name}* — ${spesi}/${setup.budget} crediti, ${rows.length} giocatori`);
    for (const r of RUOLI) {
      const g = rows.filter((x) => x.ruolo === r);
      if (g.length) lines.push(`${r}: ` + g.map((x) => `${x.nome} ${x.price}`).join(", "));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function Export({ setup, st, byId, onSay }) {
  const incompleti = setup.teams.filter((t) => {
    const need = RUOLI.reduce((s, r) => s + setup.slots[r], 0);
    return st[t.id].picks.length < need;
  });
  const senzaId = setup.teams.reduce(
    (n, t) => n + (st[t.id]?.picks || []).filter((a) => !byId[a.playerId]?.fcId).length,
    0
  );

  const copia = async () => {
    const txt = riepilogoTesto(setup, st, byId);
    try {
      await navigator.clipboard.writeText(txt);
      onSay("Riepilogo copiato.");
    } catch {
      download("rose.txt", txt, "text/plain;charset=utf-8");
    }
  };

  return (
    <div className="space-y-4">
      {incompleti.length > 0 && (
        <div style={{ color: T.P, fontFamily: body, fontSize: 13, lineHeight: 1.45 }}>
          Rose ancora incomplete: {incompleti.map((t) => t.name).join(", ")}. Puoi esportare comunque.
        </div>
      )}
      {senzaId > 0 && (
        <div style={{ color: T.A, fontFamily: body, fontSize: 13, lineHeight: 1.45 }}>
          {senzaId} giocatori sono senza Id del listone, e il file per Leghe Fantacalcio è costruito proprio
          sugli Id. Puoi comunque scaricare il riepilogo completo e caricare le rose a mano.
        </div>
      )}

      <div className="space-y-2">
        <Btn full disabled={senzaId > 0} onClick={() => exportLeghe(setup, st, byId)}>
          File per Leghe Fantacalcio
        </Btn>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
          Scarica <code style={{ fontFamily: mono }}>rosters.csv</code> con tutte le rose. Su Leghe Fantacalcio
          vai in Admin → Gestione Rose → Importa: il sito ti mostra le rose contenute nel file e ti fa
          assegnare una squadra per volta.
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <Btn tone="ghost" full onClick={() => exportCompleto(setup, st, byId)}>
          Riepilogo completo in un CSV
        </Btn>
        <div style={{ color: T.dim, fontFamily: body, fontSize: 12, lineHeight: 1.45 }}>
          Tutte le rose in un unico file, con la fantasquadra in colonna. Comodo per archivio e per Excel.
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <Btn tone="ghost" full onClick={copia}>
          Copia riepilogo per WhatsApp
        </Btn>
      </div>
    </div>
  );
}
