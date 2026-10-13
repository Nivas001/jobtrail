"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, Loader2, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addNote, deleteApplication, updateApplication, type ApplicationInput } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusDot } from "@/components/status-badge";
import { STATUSES, STATUS_META, type Activity, type Application, type Resume, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusSelect({ app }: { app: Application }) {
  const [status, setStatus] = useState<Status>(app.status);
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      onValueChange={(v) => {
        const next = v as Status;
        setStatus(next);
        start(async () => {
          const res = await updateApplication(app.id, { status: next });
          if (!res.ok) {
            setStatus(app.status);
            toast.error(res.error);
          } else toast.success(`Moved to ${STATUS_META[next].label}`);
        });
      }}
    >
      <SelectTrigger className="w-40" disabled={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusDot status={s} />
            {STATUS_META[s].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ApplicationMenu({ app }: { app: Application }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {app.job_url && (
            <DropdownMenuItem asChild>
              <a href={app.job_url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open job posting
              </a>
            </DropdownMenuItem>
          )}
          {app.job_url && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {app.company}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the application, its AI analysis, cover letter and notes. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await deleteApplication(app.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(`${app.company} deleted`);
                    router.push("/board");
                  }
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type DetailsForm = {
  company: string;
  role: string;
  location: string;
  work_mode: string;
  salary: string;
  source: string;
  job_url: string;
  resume_id: string;
  applied_at: string;
  follow_up_at: string;
};

function toForm(app: Application): DetailsForm {
  return {
    company: app.company,
    role: app.role,
    location: app.location ?? "",
    work_mode: app.work_mode ?? "",
    salary: app.salary ?? "",
    source: app.source ?? "",
    job_url: app.job_url ?? "",
    resume_id: app.resume_id ?? "",
    applied_at: app.applied_at ?? "",
    follow_up_at: app.follow_up_at ?? "",
  };
}

export function DetailsCard({ app, resumes }: { app: Application; resumes: Pick<Resume, "id" | "name">[] }) {
  const [form, setForm] = useState(() => toForm(app));
  const [base, setBase] = useState(() => toForm(app));
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const set = (key: keyof DetailsForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    start(async () => {
      const res = await updateApplication(app.id, form as ApplicationInput);
      if (!res.ok) toast.error(res.error);
      else {
        setBase(form);
        toast.success("Details saved");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
        {dirty && (
          <CardAction className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setForm(base)}>
              Reset
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        <Row label="Company">
          <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
        </Row>
        <Row label="Role">
          <Input value={form.role} onChange={(e) => set("role", e.target.value)} />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Applied on">
            <Input type="date" value={form.applied_at} onChange={(e) => set("applied_at", e.target.value)} />
          </Row>
          <Row label="Follow up on">
            <Input type="date" value={form.follow_up_at} onChange={(e) => set("follow_up_at", e.target.value)} />
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Location">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="—" />
          </Row>
          <Row label="Work mode">
            <Select value={form.work_mode || "any"} onValueChange={(v) => set("work_mode", v === "any" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Not set</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Salary">
            <Input value={form.salary} onChange={(e) => set("salary", e.target.value)} placeholder="—" />
          </Row>
          <Row label="Source">
            <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="—" />
          </Row>
        </div>
        <Row label="Resume sent">
          <Select value={form.resume_id || "none"} onValueChange={(v) => set("resume_id", v === "none" ? "" : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {resumes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Job link">
          <Input type="url" value={form.job_url} onChange={(e) => set("job_url", e.target.value)} placeholder="https://" />
        </Row>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function JobDescriptionCard({ app }: { app: Application }) {
  const [editing, setEditing] = useState(!app.job_description);
  const [text, setText] = useState(app.job_description ?? "");
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const long = (app.job_description?.length ?? 0) > 900;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Job description</CardTitle>
        <CardDescription>Used by AI for matching and cover letters</CardDescription>
        {!editing && (
          <CardAction>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full job description here."
              className="min-h-56 text-sm scrollbar-thin"
            />
            <div className="flex justify-end gap-2">
              {app.job_description && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await updateApplication(app.id, { job_description: text });
                    if (!res.ok) toast.error(res.error);
                    else setEditing(false);
                  })
                }
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <p className={cn("text-sm leading-relaxed whitespace-pre-wrap text-foreground/85", long && !expanded && "max-h-64 overflow-hidden")}>
              {app.job_description}
            </p>
            {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card" />}
            {long && (
              <Button size="sm" variant="link" className="mt-1 px-0" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Show less" : "Show all"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_COLOR: Record<string, string> = {
  created: "bg-primary",
  status: "bg-sky-400",
  ai: "bg-violet-400",
  note: "bg-zinc-400",
};

export function TimelineCard({ app, activities }: { app: Application; activities: Activity[] }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes & timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await addNote(app.id, note);
              if (!res.ok) toast.error(res.error);
              else setNote("");
            });
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — e.g. Spoke to recruiter" />
          <Button type="submit" size="icon" disabled={pending || !note.trim()} aria-label="Add note">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
        <ol className="relative space-y-4 border-l pl-5">
          {activities.map((a) => (
            <li key={a.id} className="relative">
              <span className={cn("absolute top-1.5 -left-[25px] size-2 rounded-full ring-4 ring-card", KIND_COLOR[a.kind] ?? "bg-zinc-400")} />
              <p className={cn("text-sm", a.kind === "note" ? "whitespace-pre-wrap" : "text-foreground/90")}>{a.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
