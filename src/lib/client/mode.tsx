"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { browserCheckEnabled } from "@/lib/assisted/browserCheck";

/**
 * How checks run in this deployment:
 *  - "server"   : optional Pump.fun API key configured on the server (automatic)
 *  - "browser"  : optional in-browser experiment enabled (automatic)
 *  - "assisted" : free default — the user opens each profile and marks the result
 */
export type CheckMode = "server" | "browser" | "assisted";

interface ModeInfo {
  mode: CheckMode;
  ready: boolean;
}

const Ctx = createContext<ModeInfo>({ mode: "assisted", ready: false });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<ModeInfo>({ mode: browserCheckEnabled() ? "browser" : "assisted", ready: false });
  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h: { verification?: string }) => {
        if (!alive) return;
        const server = h.verification === "official" || h.verification === "unofficial";
        setInfo({ mode: server ? "server" : browserCheckEnabled() ? "browser" : "assisted", ready: true });
      })
      .catch(() => alive && setInfo((i) => ({ ...i, ready: true })));
    return () => {
      alive = false;
    };
  }, []);
  return <Ctx.Provider value={info}>{children}</Ctx.Provider>;
}

export const useCheckMode = () => useContext(Ctx);
