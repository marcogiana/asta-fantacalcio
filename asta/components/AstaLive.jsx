"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as api from "@/lib/api";
import Papa from "papaparse";
import * as XLSX from "xlsx";

/* ============================ design tokens ============================ */
const T = {
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
const RUOLO_NOME = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };
const display = "'Bricolage Grotesque', 'Inter Tight', system-ui, sans-serif";
const mono = "'Azeret Mono', ui-monospace, monospace";
const body = "'Inter Tight', system-ui, sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;600;800&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter+Tight:wght@400;500;600&display=swap');
*{box-sizing:border-box}
.fc-root{-webkit-tap-highlight-color:transparent}
.fc-flip{animation:fcflip .28s cubic-bezier(.2,.9,.2,1)}
@keyframes fcflip{0%{transform:translateY(-14px) scale(.94);opacity:.2}100%{transform:none;opacity:1}}
.fc-crawl{animation:fccrawl 22s linear infinite}
@keyframes fccrawl{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.fc-pulse{animation:fcpulse 1.1s ease-in-out infinite}
@keyframes fcpulse{0%,100%{opacity:.45}50%{opacity:1}}
.fc-btn:active{transform:scale(.97)}
.fc-btn{transition:transform .08s ease}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #F4F2F7;outline-offset:2px}
input,select,textarea{font-family:${body};font-size:16px}
::placeholder{color:#7C7396}
@media (prefers-reduced-motion:reduce){.fc-flip,.fc-crawl,.fc-pulse{animation:none!important}}
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

const HEAD = {
  nome: ["nome", "name", "calciatore", "giocatore", "player", "cognome"],
  squadra: ["squadra", "team", "club", "sq"],
  ruolo: ["ruolo", "r", "rm", "pos", "posizione", "role"],
  quot: ["quotazione", "qt", "qa", "quot", "qtaa", "prezzo", "valore", "fvm"],
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
  const pick = (keys) => {
    const i = header.findIndex((c) => matchHead(c, keys));
    return i >= 0 ? i : -1;
  };
  return { nome: pick(HEAD.nome), squadra: pick(HEAD.squadra), ruolo: pick(HEAD.ruolo), quot: pick(HEAD.quot) };
}

function buildPlayers(rows, headerRow, cols) {
  const seen = new Set();
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nome = String(r[cols.nome] ?? "").trim();
    if (!nome) continue;
    const ruolo = normRuolo(cols.ruolo >= 0 ? r[cols.ruolo] : "");
    if (!ruolo) continue;
    const squadra = String(cols.squadra >= 0 ? r[cols.squadra] ?? "" : "").trim();
    const quot = Number(String(cols.quot >= 0 ? r[cols.quot] ?? "" : "").replace(",", ".")) || null;
    let id = slug(nome + "-" + squadra);
    while (seen.has(id)) id += "x";
    seen.add(id);
    out.push({ id, nome, squadra, ruolo, quot });
  }
  return out;
}

function derive(setup, assigned) {
  const map = {};
  for (const t of setup.teams) {
    map[t.id] = { spent: 0, count: { P: 0, D: 0, C: 0, A: 0 }, picks: [] };
  }
  for (const a of assigned) {
    const m = map[a.teamId];
    if (!m) continue;
    m.spent += a.price;
    m.count[a.ruolo] = (m.count[a.ruolo] || 0) + 1;
    m.picks.push(a);
  }
  for (const t of setup.teams) {
    const m = map[t.id];
    m.left = setup.budget - m.spent;
    m.slotsLeft = RUOLI.reduce((s, r) => s + Math.max(0, setup.slots[r] - m.count[r]), 0);
    m.maxBid = Math.max(0, m.left - Math.max(0, m.slotsLeft - 1));
  }
  return map;
}

const fmt = (n) => new Intl.NumberFormat("it-IT").format(n);

/* ============================ small UI pieces ============================ */
function Chip({ ruolo, size = 22 }) {
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

function Btn({ children, onClick, disabled, tone = "solid", full, style = {} }) {
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span style={{ color: T.dim, fontFamily: mono, fontSize: 10, letterSpacing: ".14em" }} className="uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputStyle = {
  width: "100%",
  background: T.ink,
  color: T.paper,
  border: "1px solid " + T.line,
  borderRadius: 10,
  padding: "11px 12px",
};

function Sheet({ title, children, onClose }) {
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
function Import({ onDone }) {
  const [rows, setRows] = useState(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [cols, setCols] = useState({ nome: -1, squadra: -1, ruolo: -1, quot: -1 });
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
            {["nome", "squadra", "ruolo", "quot"].map((k) => (
              <Field key={k} label={k === "quot" ? "quotazione" : k}>
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

          <Btn full disabled={preview.length === 0} onClick={() => onDone(preview)}>
            Conferma listone
          </Btn>
        </>
      )}
    </div>
  );
}

/* ============================ setup ============================ */
function Setup({ onCreate, busy }) {
  const [budget, setBudget] = useState(500);
  const [slots, setSlots] = useState({ P: 3, D: 8, C: 8, A: 6 });
  const [names, setNames] = useState(["", ""]);
  const [timer, setTimer] = useState(10);
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
          <Btn full onClick={() => setStep(2)} disabled={budget < 1 || totSlots < 1}>
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
            <Import onDone={setPlayers} />
          ) : (
            <>
              <div style={{ background: T.ink2, borderRadius: 12, border: "1px solid " + T.line }} className="p-4">
                <div style={{ fontFamily: display, fontWeight: 800, color: T.paper, fontSize: 20 }}>
                  {fmt(players.length)} giocatori · {teams.length} squadre
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: T.dim }} className="mt-1">
                  {fmt(budget)} crediti · {totSlots} slot · {timer > 0 ? timer + "s per rilanciare" : "chiusura manuale"}
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
function Join({ setup, taken, onJoin, onReset }) {
  const [sel, setSel] = useState("");
  const [host, setHost] = useState(false);
  return (
    <div className="px-4 pb-10 pt-8 mx-auto" style={{ maxWidth: 480 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: T.dim }} className="uppercase">
        asta aperta · {fmt(setup.budget)} crediti
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
      <button onClick={onReset} style={{ color: T.dim, fontFamily: mono, fontSize: 11 }} className="mt-8 underline">
        chiudi questa asta e ricomincia
      </button>
    </div>
  );
}

/* ============================ auction ============================ */
export default function App() {
  const [phase, setPhase] = useState("boot"); // boot | setup | join | live | offline
  const [setup, setSetup] = useState(null);
  const [players, setPlayers] = useState([]);
  const [live, setLive] = useState(EMPTY_LIVE);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // 'call' | 'rose' | 'export'
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
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
        const snap = await api.snapshot();
        if (!snap.setup) {
          setPhase("setup");
          return;
        }
        setSetup(snap.setup);
        setPlayers(snap.players || []);
        setLive(snap.live || EMPTY_LIVE);
        const mine = api.getMe();
        if (mine && snap.setup.teams.some((t) => t.id === mine.teamId)) {
          setMe(mine);
          setPhase("live");
        } else setPhase("join");
      } catch {
        setPhase("offline");
      }
    })();
  }, []);

  /* ---- poll ---- */
  const pull = useCallback(async () => {
    try {
      const lv = await api.pollLive(liveRef.current?.rev ?? -1);
      if (lv) setLive(lv);
    } catch {
      /* rete ballerina: riprova al giro dopo */
    }
  }, []);
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

  const st = useMemo(() => (setup ? derive(setup, live.assigned) : null), [setup, live.assigned]);
  const mine = me && st ? st[me.teamId] : null;
  const lot = live.lot;
  const lotPlayer = lot ? byId[lot.playerId] : null;
  const assignedIds = useMemo(() => new Set(live.assigned.map((a) => a.playerId)), [live.assigned]);

  const canBidRole = lotPlayer && mine ? mine.count[lotPlayer.ruolo] < setup.slots[lotPlayer.ruolo] : false;
  const isLeader = lot && me && lot.bidderId === me.teamId;
  const secsLeft = lot && lot.closesAt ? Math.max(0, Math.ceil((lot.closesAt - now) / 1000)) : null;

  /* ---- writes ---- */
  const run = async (action, payload, label) => {
    try {
      const lv = await api.act(action, payload);
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

  /* ---- host auto-close on timer ---- */
  useEffect(() => {
    if (!me?.host || !lot?.closesAt || !lot.bidderId) return;
    if (now >= lot.closesAt) assign();
  }, [now, lot, me]);

  /* ---- lifecycle actions ---- */
  const create = async ({ setup: s, players: p }) => {
    setBusy(true);
    try {
      await api.act("create", { setup: s, players: p });
      setSetup(s);
      setPlayers(p);
      setLive(EMPTY_LIVE);
      setPhase("join");
    } catch (e) {
      say(e.message || "Non riesco a salvare l'asta.");
    }
    setBusy(false);
  };

  const join = async (m) => {
    api.setMe(m);
    setMe(m);
    setPhase("live");
    pull();
  };

  const reset = async () => {
    if (!window.confirm("Cancello asta, rose e listone per tutti. Procedo?")) return;
    try {
      await api.act("reset");
    } catch (e) {
      say(e.message);
      return;
    }
    api.clearMe();
    setSetup(null);
    setPlayers([]);
    setLive(EMPTY_LIVE);
    setMe(null);
    setPhase("setup");
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

  if (phase === "setup")
    return (
      <Shell>
        <Setup onCreate={create} busy={busy} />
      </Shell>
    );

  if (phase === "join")
    return (
      <Shell>
        <Join setup={setup} taken={[]} onJoin={join} onReset={reset} />
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
              {me.host ? " · banditore" : ""}
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
                  {mine.count[r]}
                  <span style={{ color: T.dim }}>/{setup.slots[r]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, color: T.dim }} className="mt-1">
          offerta massima {fmt(mine.maxBid)} · devi lasciare 1 credito per ognuno dei {mine.slotsLeft} slot liberi
        </div>
      </div>

      {/* stage */}
      <div className="px-4 pt-5" style={{ paddingBottom: 150 }}>
        {!lot ? (
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
              <div className="flex items-center gap-2">
                <Chip ruolo={lotPlayer?.ruolo || "C"} size={20} />
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
                    {lot.bidderId ? "in testa · " + teamName(lot.bidderId) : "base d'asta"}
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
                    {lot.bid || 1}
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
          {me.host && (
            <Btn tone="ghost" onClick={undo} disabled={!live.assigned.length}>
              Annulla ultimo
            </Btn>
          )}
        </div>
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
                const next = lot.bidderId ? lot.bid + inc : inc;
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
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em" }}>{lot.bidderId ? "+" + inc : "APRO"}</div>
                  </button>
                );
              })}
              <CustomBid max={mine.maxBid} min={(lot.bidderId ? lot.bid : 0) + 1} disabled={!canBidRole || isLeader} onBid={bid} />
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
          <Rose setup={setup} st={st} byId={byId} onExport={() => exportCsv(setup, live.assigned, byId)} />
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
function Shell({ children }) {
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
function Search({ players, assignedIds, onPick }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const res = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => (r ? p.ruolo === r : true))
      .filter((p) => (needle ? p.nome.toLowerCase().includes(needle) || p.squadra.toLowerCase().includes(needle) : true))
      .slice(0, 60);
  }, [players, q, r, assignedIds]);

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
            <span className="flex-1" style={{ color: T.paper, fontFamily: display, fontWeight: 800, fontSize: 15 }}>
              {p.nome}
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
function Rose({ setup, st, byId, onExport }) {
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
                              <span style={{ color: T.dim, fontSize: 11 }}>{byId[p.playerId]?.squadra}</span>
                            </span>
                            <span style={{ fontFamily: mono }}>{p.price}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <Btn tone="ghost" full onClick={onExport}>
          Scarica le rose in CSV
        </Btn>
      </div>
    </div>
  );
}

function exportCsv(setup, assigned, byId) {
  const rows = [["Squadra", "Ruolo", "Giocatore", "Club", "Prezzo"]];
  for (const t of setup.teams) {
    for (const r of RUOLI) {
      assigned
        .filter((a) => a.teamId === t.id && a.ruolo === r)
        .forEach((a) => rows.push([t.name, r, byId[a.playerId]?.nome || "", byId[a.playerId]?.squadra || "", a.price]));
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "rose-asta.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
