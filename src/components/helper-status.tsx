"use client";

import Link from "next/link";
import { useHelper } from "@/lib/ai-helper";
import { cn } from "@/lib/utils";

export function HelperStatus({ compact = false }: { compact?: boolean }) {
  const state = useHelper();
  const label = state === "online" ? "AI helper on" : state === "offline" ? "AI helper off" : "Checking AI…";
  return (
    <Link
      href="/settings"
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
        compact && "px-2",
      )}
      title={state === "offline" ? "Start the helper on your PC to use AI features" : "Antigravity CLI is connected"}
    >
      <span className="relative flex size-2">
        {state === "online" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            state === "online" ? "bg-emerald-400" : state === "offline" ? "bg-zinc-500" : "bg-amber-400",
          )}
        />
      </span>
      {!compact && label}
    </Link>
  );
}
