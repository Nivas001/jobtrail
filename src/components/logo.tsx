import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_-4px] shadow-primary/60">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 17c3-1 4-4 6-8s4-5 10-5" />
          <circle cx="4" cy="17" r="1.6" fill="currentColor" />
          <circle cx="20" cy="4" r="1.6" fill="currentColor" />
        </svg>
      </span>
      <span>Jobtrail</span>
    </span>
  );
}
