"use client";

import { useEffect, useRef, useState } from "react";

/** true quando l'app gira installata sulla Home, non in una scheda del browser. */
export function inApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS non espone display-mode nelle versioni più vecchie: questa è la sua.
    window.navigator.standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Gli iPad recenti si dichiarano Macintosh: li riconosco dal touch.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Tiene lo schermo acceso mentre l'asta è in corso.
 *
 * Durante un'asta il telefono resta sul tavolo per minuti interi tra un
 * rilancio e l'altro, e si spegne: chi lo riprende in mano deve sbloccarlo
 * e ha già perso il lotto. Il wake lock evita tutto questo.
 *
 * Il blocco si perde ogni volta che la pagina va in background, quindi va
 * riacquisito al ritorno. Su Safari richiede iOS 18.4 o successivo; dove
 * manca, `attivo` resta false e l'interfaccia non promette nulla.
 */
export function useWakeLock(attivo) {
  const lock = useRef(null);
  const [tenuto, setTenuto] = useState(false);

  useEffect(() => {
    if (!attivo || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let vivo = true;

    const prendi = async () => {
      if (!vivo || document.visibilityState !== "visible" || lock.current) return;
      try {
        lock.current = await navigator.wakeLock.request("screen");
        setTenuto(true);
        lock.current.addEventListener("release", () => {
          lock.current = null;
          setTenuto(false);
        });
      } catch {
        // Rifiutato (batteria quasi scarica, permessi): l'asta funziona comunque.
        setTenuto(false);
      }
    };

    const alRitorno = () => document.visibilityState === "visible" && prendi();

    prendi();
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alRitorno);
      lock.current?.release?.().catch(() => {});
      lock.current = null;
      setTenuto(false);
    };
  }, [attivo]);

  return tenuto;
}

/**
 * Stato dell'installazione.
 *
 * Su Android il browser offre l'evento beforeinstallprompt e si installa con
 * un tocco. iOS non ha nulla di simile: l'unica via è Condividi → Aggiungi a
 * Home, quindi lì possiamo solo spiegare come si fa.
 */
export function useInstalla() {
  const [installabile, setInstallabile] = useState(false);
  const [dentro, setDentro] = useState(true); // parto da true: niente lampo al caricamento
  const evento = useRef(null);

  useEffect(() => {
    setDentro(inApp());

    const cattura = (e) => {
      e.preventDefault();
      evento.current = e;
      setInstallabile(true);
    };
    const installata = () => {
      setDentro(true);
      setInstallabile(false);
    };

    window.addEventListener("beforeinstallprompt", cattura);
    window.addEventListener("appinstalled", installata);
    return () => {
      window.removeEventListener("beforeinstallprompt", cattura);
      window.removeEventListener("appinstalled", installata);
    };
  }, []);

  const installa = async () => {
    const e = evento.current;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    evento.current = null;
    setInstallabile(false);
    return outcome === "accepted";
  };

  return { installabile, dentro, ios: isIOS(), installa };
}
