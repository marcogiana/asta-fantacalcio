"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { Setup, Shell } from "@/components/AstaLive";

export default function Nuova() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async ({ setup, players }) => {
    setBusy(true);
    setErr("");
    try {
      const { code } = await api.act("create", { setup, players });
      api.ricorda({ code, nome: setup.nome, squadre: setup.teams.length, mode: setup.mode });
      router.push(`/a/${code}`);
    } catch (e) {
      setErr(e.message || "Non riesco a creare l'asta.");
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Setup onCreate={create} busy={busy} />
      {err && (
        <div className="px-4 pb-8" style={{ color: "#E85145", fontSize: 13 }}>
          {err}
        </div>
      )}
    </Shell>
  );
}
