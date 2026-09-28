import Prezzi from "@/components/Prezzi";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Banditore — l'asta del fantacalcio dal telefono",
  description: "19,90 € a stagione per tutta la lega. Niente pulsanti da comprare, niente PC da collegare.",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <Prezzi />;
}
