"use client";

import { useSyncExternalStore } from "react";

export const HELPER_URL = process.env.NEXT_PUBLIC_AI_HELPER_URL || "http://127.0.0.1:4777";

export type HelperState = "checking" | "online" | "offline";

// Chrome asks the user before a website may reach this computer ("Local Network
// Access"). Naming the target lets it show that prompt instead of failing.
const LOOPBACK = { targetAddressSpace: "loopback" } as RequestInit;

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
    const res = await fetch(`${HELPER_URL}/health`, { ...LOOPBACK, signal: AbortSignal.timeout(2500) });
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
      ...LOOPBACK,
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

// ---- auto-fill ---------------------------------------------------------------

export type AutofillRun = {
  id: string;
  state: "filling" | "review" | "submitted" | "closed" | "error";
  ats: "greenhouse" | "lever" | "ashby" | "other";
  url: string;
  steps: { at: number; text: string }[];
  filled: { label: string; value: string }[];
  needs: string[];
  error: string | null;
};

async function helperJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${HELPER_URL}${path}`, { ...LOOPBACK, ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error("The AI helper isn't running on this PC");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && path === "/apply") throw new Error("Restart the AI helper to get auto-fill");
  if (!res.ok) throw new Error(body.error || `AI helper error ${res.status}`);
  return body.result as T;
}

export function startAutofill(input: unknown) {
  return helperJson<AutofillRun>("/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function autofillStatus(id: string) {
  return helperJson<AutofillRun>(`/apply/${encodeURIComponent(id)}`);
}

export function detectAts(url: string | null): AutofillRun["ats"] | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (/(^|\.)greenhouse\.io$/.test(u.hostname) || u.searchParams.has("gh_jid")) return "greenhouse";
    if (/(^|\.)lever\.co$/.test(u.hostname)) return "lever";
    if (/(^|\.)ashbyhq\.com$/.test(u.hostname)) return "ashby";
    return "other";
  } catch {
    return null;
  }
}
