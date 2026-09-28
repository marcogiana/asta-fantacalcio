import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Asta fantacalcio",
  description: "Asta live, ognuno dal proprio telefono",
  applicationName: "Asta",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Asta",
    // La barra di stato trasparente fa salire lo sfondo scuro fin sotto
    // l'orologio: senza questa riga resta una striscia bianca in cima.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // Next genera "mobile-web-app-capable"; le versioni di iOS precedenti alla
  // 17 leggono solo la forma con il prefisso apple.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Con la barra di stato trasparente il contenuto passa sotto il notch:
  // viewport-fit=cover attiva le safe-area, che l'app già usa in fondo.
  viewportFit: "cover",
  themeColor: "#141026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
