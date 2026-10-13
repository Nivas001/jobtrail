import { STATUSES, STATUS_META, type Status } from "@/lib/types";

// Stacked share of applications per stage, direct-labelled below so colour
// never carries the meaning alone.
export function PipelineBar({ counts }: { counts: Record<Status, number> }) {
  const total = STATUSES.reduce((a, s) => a + counts[s], 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <div
              key={s}
              className="h-full first:rounded-l-full last:rounded-r-full transition-[flex-grow] duration-500"
              style={{ flexGrow: counts[s], backgroundColor: STATUS_META[s].color }}
              title={`${STATUS_META[s].label}: ${counts[s]}`}
            />
          ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <div key={s}>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_META[s].color }} />
              {STATUS_META[s].label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {counts[s]}
              {total > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{Math.round((counts[s] / total) * 100)}%</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
