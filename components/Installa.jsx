"use client";

import React, { useState, useEffect } from "react";
import { useInstalla } from "@/lib/pwa";
import { T, Btn, mono, body, display } from "@/components/AstaLive";

const CHIAVE = "fcasta:installa-nascosto";

/**
 * Invito a installare l'app sulla Home.
 *
 * Su Android basta un tocco. Su iOS non esiste un prompt: Apple permette
 * l'installazione solo dal menu Condividi, quindi lì l'unica cosa utile è
 * spiegare dove si trova.
 *
 * Non compare mai quando l'app è già installata, e chi lo chiude non se lo
 * ritrova più.
 */
export default function Installa({ compatto = false }) {
  const { installabile, dentro, ios, installa } = useInstalla();
  const [nascosto, setNascosto] = useState(true);
  const [comeSiFa, setComeSiFa] = useState(false);

  useEffect(() => {
    try {
      setNascosto(localStorage.getItem(CHIAVE) === "1");
    } catch {
      setNascosto(false);
    }
  }, []);

  const chiudi = () => {
    setNascosto(true);
    try {
      localStorage.setItem(CHIAVE, "1");
    } catch {}
  };

  // Già installata, chiusa, o browser che non la sa installare (Safari desktop,
  // Firefox): in tutti questi casi non c'è niente di utile da dire.
  if (dentro || nascosto || (!installabile && !ios)) return null;

  return (
    <div
      className="relative px-4 py-3"
      style={{
        background: T.ink2,
        border: "1px solid " + T.line,
        borderRadius: 14,
        marginTop: compatto ? 16 : 24,
      }}
    >
      <button
        onClick={chiudi}
        aria-label="Nascondi"
        style={{ position: "absolute", top: 6, right: 8, color: T.dim, fontFamily: mono, fontSize: 12, padding: 6 }}
      >
        ✕
      </button>

      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: T.dim }} className="uppercase">
        tienila a portata
      </div>
      <div
        style={{ fontFamily: display, fontWeight: 800, fontSize: compatto ? 16 : 18, color: T.paper, lineHeight: 1.2 }}
        className="mt-1"
      >
        Aggiungi l&apos;asta alla schermata Home
      </div>
      <div style={{ fontFamily: body, fontSize: 12.5, color: T.dim, lineHeight: 1.45 }} className="mt-1">
        Si apre a schermo pieno, con più spazio per i rilanci, e lo schermo non si spegne durante l&apos;asta.
      </div>

      {installabile ? (
        <div className="mt-3">
          <Btn full onClick={installa}>
            Aggiungi alla Home
          </Btn>
        </div>
      ) : comeSiFa ? (
        <ol
          className="mt-3 space-y-1.5"
          style={{ fontFamily: body, fontSize: 13, color: T.paper, paddingLeft: 18, listStyle: "decimal" }}
        >
          <li>
            Tocca <b>Condividi</b> in fondo allo schermo, il quadrato con la freccia verso l&apos;alto
          </li>
          <li>
            Scorri e scegli <b>Aggiungi a Home</b>
          </li>
          <li>
            Conferma con <b>Aggiungi</b>: l&apos;icona compare tra le app
          </li>
        </ol>
      ) : (
        <div className="mt-3">
          <Btn tone="ghost" full onClick={() => setComeSiFa(true)}>
            Come si fa
          </Btn>
        </div>
      )}
    </div>
  );
}
