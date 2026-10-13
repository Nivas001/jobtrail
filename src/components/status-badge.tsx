import { STATUS_META, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: STATUS_META[status].color, boxShadow: `0 0 10px ${STATUS_META[status].color}66` }}
    />
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground/90", className)}
      style={{ borderColor: `${meta.color}40`, backgroundColor: `${meta.color}1a` }}
    >
      <StatusDot status={status} className="size-1.5" />
      {meta.label}
    </span>
  );
}
