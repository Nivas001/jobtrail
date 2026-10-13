"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";
import { BellRing, MapPin, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { moveApplication } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyLogo } from "@/components/company-logo";
import { NewApplicationButton } from "@/components/new-application";
import { STATUSES, STATUS_META, type Application, type Resume, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

type Columns = Record<Status, Application[]>;

function group(apps: Application[]): Columns {
  const cols = Object.fromEntries(STATUSES.map((s) => [s, [] as Application[]])) as Columns;
  for (const a of [...apps].sort((x, y) => x.position - y.position)) cols[a.status].push(a);
  return cols;
}

function findColumn(cols: Columns, id: string): Status | undefined {
  if ((STATUSES as readonly string[]).includes(id)) return id as Status;
  return STATUSES.find((s) => cols[s].some((a) => a.id === id));
}

export function Board({
  apps,
  resumes,
}: {
  apps: Application[];
  resumes: Pick<Resume, "id" | "name" | "is_default">[];
}) {
  const router = useRouter();
  const [cols, setCols] = useState<Columns>(() => group(apps));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startCol, setStartCol] = useState<Status | null>(null);
  const [query, setQuery] = useState("");

  // Server data changed (e.g. after an action): take it unless mid-drag.
  const [seenApps, setSeenApps] = useState(apps);
  if (apps !== seenApps && !activeId) {
    setSeenApps(apps);
    setCols(group(apps));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cols;
    return Object.fromEntries(
      STATUSES.map((s) => [
        s,
        cols[s].filter((a) => `${a.company} ${a.role} ${a.location ?? ""}`.toLowerCase().includes(q)),
      ]),
    ) as Columns;
  }, [cols, query]);

  const active = activeId ? STATUSES.flatMap((s) => cols[s]).find((a) => a.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    setStartCol(findColumn(cols, id) ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(cols, String(active.id));
    const to = findColumn(cols, String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const moving = prev[from].find((a) => a.id === active.id);
      if (!moving) return prev;
      const target = prev[to];
      const overIndex = target.findIndex((a) => a.id === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((a) => a.id !== active.id),
        [to]: [...target.slice(0, index), { ...moving, status: to }, ...target.slice(index)],
      };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const id = String(active.id);
    setActiveId(null);
    if (!over) {
      setCols(group(apps));
      return;
    }
    const col = findColumn(cols, id);
    if (!col) return;
    let list = cols[col];
    const oldIndex = list.findIndex((a) => a.id === id);
    const overIndex = list.findIndex((a) => a.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex);
    const index = list.findIndex((a) => a.id === id);

    // Position halfway between neighbours, so only this card is written.
    const before = list[index - 1]?.position;
    const after = list[index + 1]?.position;
    const position =
      before === undefined && after === undefined
        ? 0
        : before === undefined
          ? after! - 1024
          : after === undefined
            ? before + 1024
            : (before + after) / 2;

    const original = apps.find((a) => a.id === id);
    if (original && original.status === col && original.position === position && startCol === col && overIndex === oldIndex) {
      return;
    }
    list = list.map((a) => (a.id === id ? { ...a, status: col, position } : a));
    setCols((prev) => ({ ...prev, [col]: list }));

    moveApplication(id, col, position).then((res) => {
      if (!res.ok) {
        toast.error("Couldn't move it", { description: res.error });
        setCols(group(apps));
      } else if (startCol !== col) {
        toast.success(`${original?.company ?? "Application"} → ${STATUS_META[col].label}`);
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6 lg:px-8">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role, city…"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {apps.length} application{apps.length === 1 ? "" : "s"} · drag cards to update their stage
        </p>
      </div>

      <DndContext
        id="jobtrail-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setCols(group(apps));
        }}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-6 scrollbar-thin sm:px-6 lg:px-8">
          {STATUSES.map((status) => (
            <Column key={status} status={status} items={filtered[status]} resumes={resumes} onOpen={(id) => router.push(`/applications/${id}`)} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {active ? <CardBody app={active} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  items,
  resumes,
  onOpen,
}: {
  status: Status;
  items: Application[];
  resumes: Pick<Resume, "id" | "name" | "is_default">[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  return (
    <section
      className={cn(
        "flex w-[260px] min-w-[240px] shrink-0 flex-col rounded-2xl border bg-card/40 transition-colors xl:w-auto xl:flex-1 xl:shrink",
        isOver && "bg-card/80",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
        <h2 className="text-sm font-medium">{meta.label}</h2>
        <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
        <NewApplicationButton
          resumes={resumes}
          defaultStatus={status}
          trigger={
            <Button variant="ghost" size="icon" className="ml-auto size-7" aria-label={`Add to ${meta.label}`}>
              <Plus className="size-4" />
            </Button>
          }
        />
      </header>
      <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-32 flex-1 flex-col gap-2 px-2 pb-2">
          {items.map((app) => (
            <SortableCard key={app.id} app={app} onOpen={onOpen} />
          ))}
          {items.length === 0 && (
            <div className="grid flex-1 place-items-center rounded-xl border border-dashed text-xs text-muted-foreground">
              {meta.hint}
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ app, onOpen }: { app: Application; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(app.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(app.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardBody app={app} />
    </div>
  );
}

function CardBody({ app, dragging }: { app: Application; dragging?: boolean }) {
  const followDays = app.follow_up_at ? differenceInCalendarDays(new Date(app.follow_up_at), new Date()) : null;
  const score = app.ai_match?.score;
  return (
    <article
      className={cn(
        "group cursor-grab rounded-xl border bg-card p-3 shadow-sm transition-[border-color,box-shadow] hover:border-foreground/15 active:cursor-grabbing",
        dragging && "rotate-[1.5deg] cursor-grabbing border-primary/40 shadow-2xl shadow-black/50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <CompanyLogo company={app.company} url={app.job_url} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{app.company}</p>
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{app.role}</p>
        </div>
      </div>
      {(app.location || app.work_mode || app.salary) && (
        <p className="mt-2.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {[app.location, app.work_mode && cap(app.work_mode), app.salary].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-1.5">
        {score !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
              score >= 75 ? "bg-emerald-500/12 text-emerald-300" : score >= 50 ? "bg-amber-500/12 text-amber-300" : "bg-rose-500/12 text-rose-300",
            )}
            title="AI resume match"
          >
            <Sparkles className="size-3" />
            {Math.round(score)}%
          </span>
        )}
        {followDays !== null && followDays <= 3 && (app.status === "applied" || app.status === "interview") && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              followDays < 0 ? "bg-destructive/15 text-destructive" : "bg-primary/12 text-primary",
            )}
          >
            <BellRing className="size-3" />
            {followDays < 0 ? "Overdue" : followDays === 0 ? "Today" : `${followDays}d`}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatDistanceToNowStrict(new Date(app.updated_at), { addSuffix: false })}
        </span>
      </div>
    </article>
  );
}

function cap(s: string) {
  return s === "onsite" ? "On-site" : s[0].toUpperCase() + s.slice(1);
}
