"use client";

import { useSyncExternalStore } from "react";

export const HELPER_URL = process.env.NEXT_PUBLIC_AI_HELPER_URL || "http://127.0.0.1:4777";

export type HelperState = "checking" | "online" | "offline";

// One shared health check for the whole page, however many components ask.
// The helper only runs on the PC, so AI features light up only when it answers.
let state: HelperState = "checking";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function set(next: HelperState) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

async function check() {
  try {
    const res = await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2500) });
    set(res.ok ? "online" : "offline");
  } catch {
    set("offline");
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    check();
    timer = setInterval(check, 15000);
    window.addEventListener("focus", check);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    }
  };
}

export function useHelper(): HelperState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => "checking",
  );
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
