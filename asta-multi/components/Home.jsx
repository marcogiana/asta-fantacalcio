"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { Shell, Btn, Field, inputStyle, T, display, mono, body } from "@/components/AstaLive";

const quando = (t) => {
  const g = Math.floor((Date.now() - t) / 86400000);
  if (g === 0) return "oggi";
  if (g === 1) return "ieri";
  if (g < 30) return `${g} giorni fa`;
  return new Date(t).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
};

export default function Home() {
  const router = useRouter();
  const [recenti, setRecenti] = useState([]);
  const [codice, setCodice] = useState("");
  const [err, setErr] = useState("");
  const [cerco, setCerco] = useState(false);

  useEffect(() => setRecenti(api.getRecenti()), []);

  const entra = async (c) => {
    const code = String(c || "").trim().toUpperCase();
    if (code.length !== 5) {
      setErr("Il codice è di 5 caratteri.");
      return;
    }
    setCerco(true);
    setErr("");
    try {
      await api.snapshot(code);
      router.push(`/a/${code}`);
    } catch (e) {
      setErr(e.notFound ? "Nessuna asta con questo codice." : "Non riesco a raggiungere il server.");
      setCerco(false);
    }
  };

  return (
    <Shell>
      <div className="px-4 pb-12 pt-10">
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: T.dim }} className="uppercase">
          asta fantacalcio
        </div>
        <h1
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontSize: 40,
            color: T.paper,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
          className="mt-2 mb-8"
        >
          Ognuno dal
          <br />
          proprio telefono.
        </h1>

        <Btn full onClick={() => router.push("/nuova")}>
          Crea una nuova asta
        </Btn>

        <div className="mt-8">
          <Field label="entra con un codice">
            <div className="flex gap-2">
              <input
                value={codice}
                onChange={(e) => setCodice(e.target.value.toUpperCase().slice(0, 5))}
                onKeyDown={(e) => e.key === "Enter" && entra(codice)}
                placeholder="ABCDE"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  ...inputStyle,
                  fontFamily: mono,
                  fontWeight: 800,
                  fontSize: 24,
                  letterSpacing: ".22em",
                  textAlign: "center",
                }}
              />
              <Btn tone="ghost" disabled={codice.length !== 5 || cerco} onClick={() => entra(codice)}>
                {cerco ? "…" : "Vai"}
              </Btn>
            </div>
          </Field>
          {err && (
            <div style={{ color: T.A, fontFamily: body, fontSize: 13 }} className="mt-2">
              {err}
            </div>
          )}
        </div>

        {recenti.length > 0 && (
          <div className="mt-10">
            <div
              style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".22em", color: T.dim }}
              className="uppercase mb-2"
            >
              le tue aste
            </div>
            <div className="space-y-2">
              {recenti.map((r) => (
                <div
                  key={r.code}
                  className="flex items-center gap-3 px-3 py-3"
                  style={{ background: T.ink2, border: "1px solid " + T.line, borderRadius: 12 }}
                >
                  <button className="flex-1 text-left min-w-0" onClick={() => router.push(`/a/${r.code}`)}>
                    <div
                      style={{ color: T.paper, fontFamily: display, fontWeight: 800, fontSize: 16 }}
                      className="truncate"
                    >
                      {r.nome || "Asta"}
                    </div>
                    <div style={{ color: T.dim, fontFamily: mono, fontSize: 11 }}>
                      {r.code} · {r.squadre} squadre · {r.mode === "mantra" ? "Mantra" : "Classic"} ·{" "}
                      {quando(r.visto)}
                    </div>
                  </button>
                  <button
                    onClick={() => setRecenti(api.dimentica(r.code))}
                    title="Togli dall'elenco (non cancella l'asta)"
                    style={{ color: T.dim, fontFamily: mono, fontSize: 12, padding: 8 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ color: T.dim, fontFamily: body, fontSize: 11, lineHeight: 1.45 }} className="mt-3">
              Questo elenco è salvato su questo dispositivo. Da un altro telefono si entra con il codice.
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
