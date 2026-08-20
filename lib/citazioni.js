/**
 * Citazioni mostrate dopo ogni aggiudicazione.
 *
 * Nota sulle attribuzioni: nel calcio circolano moltissime frasi apocrife.
 * Dove la paternità è incerta o contesa l'ho segnalato con `incerta: true`,
 * e l'interfaccia mostra "attribuita a" invece del semplice nome.
 */
export const CITAZIONI = [
  { t: "Rigore è quando arbitro fischia.", a: "Vujadin Boškov" },
  { t: "Vincere non è importante, è l'unica cosa che conta.", a: "Giampiero Boniperti" },
  { t: "Il calcio è lo sport più bello del mondo perché è imprevedibile.", a: "Vujadin Boškov" },
  { t: "Chi non dà tutto non dà niente.", a: "Helenio Herrera" },
  { t: "Non dire gatto se non ce l'hai nel sacco.", a: "Giovanni Trapattoni" },
  { t: "Giocare a calcio è semplice. Difficile è giocare un calcio semplice.", a: "Johan Cruyff" },
  { t: "Il calcio è la cosa più importante fra le meno importanti.", a: "Arrigo Sacchi", incerta: true },
  { t: "Ogni svantaggio ha il suo vantaggio.", a: "Johan Cruyff" },
  { t: "Un tempo giocavo a calcio. Adesso il calcio gioca con me.", a: "Gianni Brera", incerta: true },
  { t: "Chi segna vince, chi non segna perde tempo.", a: "detto da spogliatoio" },
  { t: "Il pallone non entra mai per caso.", a: "Nereo Rocco", incerta: true },
  { t: "La palla è rotonda e il campo è piatto: tutto può succedere.", a: "detto popolare" },
  { t: "Il calcio è un gioco semplice reso complicato da chi lo commenta.", a: "detto popolare" },
  { t: "Se non tiri in porta, non segnerai mai.", a: "detto popolare" },
  { t: "In panchina si soffre più che in campo.", a: "Carlo Ancelotti", incerta: true },
  { t: "I campioni si vedono nelle partite difficili.", a: "detto da spogliatoio" },
  { t: "Il talento vince le partite, la squadra vince i campionati.", a: "detto popolare" },
  { t: "Meglio un pareggio in casa che una sconfitta fuori.", a: "Vujadin Boškov" },
  { t: "Chi si ferma è perduto, chi corre troppo si stanca.", a: "detto da spogliatoio" },
  { t: "Il fantacalcio è l'unico posto dove un difensore vale più di un attaccante.", a: "chiunque abbia fatto un'asta" },
  { t: "Il portiere è metà squadra, finché non sbaglia.", a: "detto popolare" },
  { t: "L'ultimo slot è sempre quello che costa di più.", a: "chiunque abbia fatto un'asta" },
  { t: "Non esiste rosa perfetta, esiste solo il credito che ti resta.", a: "chiunque abbia fatto un'asta" },
  { t: "Chi tiene i crediti fino alla fine, alla fine li spende male.", a: "chiunque abbia fatto un'asta" },
];

/** PRNG deterministico: stesso seme, stessa sequenza su ogni dispositivo. */
function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ordine mescolato una volta per asta: tutti vedono la stessa citazione
 * alla stessa aggiudicazione, e nessuna si ripete finché non finiscono.
 */
export function citazionePer(code, n) {
  const rnd = seededRandom(String(code || "x"));
  const ordine = CITAZIONI.map((_, i) => i);
  for (let i = ordine.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  }
  return CITAZIONI[ordine[n % ordine.length]];
}
