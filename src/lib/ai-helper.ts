"use client";

import { useEffect, useState } from "react";

export const HELPER_URL = process.env.NEXT_PUBLIC_AI_HELPER_URL || "http://127.0.0.1:4777";

export type HelperState = "checking" | "online" | "offline";

// The helper only runs on the PC, so AI features light up only when it answers.
export function useHelper(): HelperState {
  const [state, setState] = useState<HelperState>("checking");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2500) });
        if (alive) setState(res.ok ? "online" : "offline");
      } catch {
        if (alive) setState("offline");
      }
    };
    check();
    const timer = setInterval(check, 15000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return state;
}

export async function callHelper<T>(task: string, input: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${HELPER_URL}/ai/${task}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new Error("The AI helper isn't running on this PC");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `AI helper error ${res.status}`);
  return body.result as T;
}
