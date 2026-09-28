import type { MetadataRoute } from "next";

/**
 * Manifest della web app. Next.js lo serve su /manifest.webmanifest e lo
 * collega da solo nel <head>: senza questo file iOS non offre l'installazione
 * sulla schermata Home, e senza installazione non esistono né lo schermo
 * pieno né le notifiche.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asta fantacalcio",
    short_name: "Asta",
    description: "Asta live del fantacalcio, ognuno dal proprio telefono",
    // standalone toglie la barra di Safari: sui telefoni piccoli sono
    // ~90px in più per i pulsanti di rilancio.
    display: "standalone",
    orientation: "portrait",
    start_url: "/",
    scope: "/",
    background_color: "#141026",
    theme_color: "#141026",
    lang: "it",
    categories: ["sports", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android ritaglia l'icona nella forma del sistema: queste hanno la safe zone.
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuova asta", short_name: "Nuova", url: "/nuova" },
    ],
  };
}
