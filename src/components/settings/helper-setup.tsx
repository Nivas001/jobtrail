"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { HELPER_URL, useHelper } from "@/lib/ai-helper";
import { cn } from "@/lib/utils";

export function HelperSetup({ origin }: { origin: string }) {
  const state = useHelper();
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-4",
          state === "online" ? "border-emerald-500/30 bg-emerald-500/5" : "bg-card/50",
        )}
      >
        <span
          className={cn(
            "size-2.5 rounded-full",
            state === "online" ? "bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400" : state === "offline" ? "bg-zinc-500" : "bg-amber-400",
          )}
        />
        <div>
          <p className="font-medium">
            {state === "online" ? "Connected" : state === "offline" ? "Not running" : "Checking…"}
          </p>
          <p className="text-sm text-muted-foreground">
            {state === "online"
              ? `AI features use the Antigravity CLI through ${HELPER_URL}.`
              : "AI buttons stay disabled until the helper answers on this PC."}
          </p>
        </div>
      </div>

      <ol className="space-y-4 text-sm">
        <Step n={1} title="It's already installed as a background service">
          <Code>systemctl --user status jobtrail-helper</Code>
        </Step>
        <Step n={2} title="If it isn't running, start it">
          <Code>systemctl --user enable --now jobtrail-helper</Code>
        </Step>
        <Step n={3} title="This site must be on its allowed list">
          <p className="mb-2 text-muted-foreground">
            The helper only answers pages it trusts. This page is <span className="font-mono text-foreground">{origin}</span>.
          </p>
          <Code>~/.config/jobtrail/helper.env → JOBTRAIL_ORIGINS</Code>
        </Step>
        <Step n={4} title="Let this site reach your PC">
          <p className="text-muted-foreground">
            On the hosted site your browser asks once whether it may access apps or devices on your local network. Choose{" "}
            <span className="text-foreground">Allow</span>. If you blocked it, re-enable it from the site settings next to the address bar.
          </p>
        </Step>
      </ol>
      <p className="text-xs text-muted-foreground">
        Nothing leaves your PC except the prompt the Antigravity CLI sends to Google. No API key is stored anywhere.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="mb-2 font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex items-center gap-2 rounded-lg border bg-background px-3 py-2 font-mono text-xs">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <button
        type="button"
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
