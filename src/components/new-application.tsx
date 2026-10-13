"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createApplication } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { callHelper, useHelper } from "@/lib/ai-helper";
import { STATUSES, STATUS_META, type Resume, type Status, type WorkMode } from "@/lib/types";
import { StatusDot } from "@/components/status-badge";

type Extracted = {
  company: string;
  role: string;
  location: string;
  work_mode: WorkMode | "";
  salary: string;
  summary: string;
  description?: string;
};

const EMPTY = {
  company: "",
  role: "",
  status: "wishlist" as Status,
  location: "",
  work_mode: "" as WorkMode | "",
  salary: "",
  job_url: "",
  source: "",
  job_description: "",
  resume_id: "",
  follow_up_at: "",
};

const SOURCES = ["LinkedIn", "Naukri", "Company site", "Referral", "Wellfound", "Indeed", "Other"];

export function NewApplicationButton({
  resumes,
  defaultStatus = "wishlist",
  trigger,
}: {
  resumes: Pick<Resume, "id" | "name" | "is_default">[];
  defaultStatus?: Status;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const helper = useHelper();
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaultResume = resumes.find((r) => r.is_default)?.id ?? "";
  const [form, setForm] = useState({ ...EMPTY, status: defaultStatus, resume_id: defaultResume });

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm({ ...EMPTY, status: defaultStatus, resume_id: defaultResume });
    setPaste("");
  }

  async function autofill() {
    const text = paste.trim();
    if (!text) return;
    setExtracting(true);
    const isUrl = /^https?:\/\/\S+$/i.test(text);
    try {
      const result = isUrl
        ? await callHelper<Extracted>("fetchPosting", { url: text })
        : await callHelper<Extracted>("extract", { text });
      setForm((f) => ({
        ...f,
        company: result.company || f.company,
        role: result.role || f.role,
        location: result.location || f.location,
        work_mode: (result.work_mode as WorkMode) || f.work_mode,
        salary: result.salary || f.salary,
        job_url: isUrl ? text : f.job_url,
        source: isUrl ? guessSource(text) || f.source : f.source,
        job_description: isUrl ? result.description || f.job_description : text,
      }));
      toast.success("Filled in from the posting", { description: result.summary || undefined });
    } catch (e) {
      toast.error("Couldn't autofill", { description: (e as Error).message });
    } finally {
      setExtracting(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createApplication({
        ...form,
        work_mode: form.work_mode || null,
        resume_id: form.resume_id || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${form.company} added`);
      setOpen(false);
      reset();
      if (res.data) router.push(`/applications/${res.data.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-1.5">
            <Plus className="size-4" />
            New application
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl scrollbar-thin">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>Paste the job link or posting to fill this in automatically, or type it yourself.</DialogDescription>
        </DialogHeader>

        <div className="border-b bg-muted/30 px-6 py-4">
          <div className="relative">
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="https://company.com/careers/frontend-engineer   — or paste the job description"
              className="min-h-[72px] resize-none bg-background pr-36 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-2 bottom-2 gap-1.5"
              disabled={!paste.trim() || extracting || helper !== "online"}
              onClick={autofill}
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5 text-primary" />}
              {extracting ? "Reading…" : "Autofill with AI"}
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            {helper === "online"
              ? "Runs on your PC with the Antigravity CLI. Takes 20–60 seconds."
              : "AI autofill works when the helper is running on your PC."}
          </p>
        </div>

        <form onSubmit={submit} className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <Field label="Company" required>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Acme Inc." required />
          </Field>
          <Field label="Role" required>
            <Input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Frontend Engineer" required />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v as Status)}>
              <SelectTrigger className="w-full">
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
          </Field>
          <Field label="Resume used">
            <Select value={form.resume_id || "none"} onValueChange={(v) => set("resume_id", v === "none" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a resume" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None yet</SelectItem>
                {resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Bengaluru / Remote" />
          </Field>
          <Field label="Work mode">
            <Select value={form.work_mode || "any"} onValueChange={(v) => set("work_mode", v === "any" ? "" : (v as WorkMode))}>
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
          </Field>
          <Field label="Salary">
            <Input value={form.salary} onChange={(e) => set("salary", e.target.value)} placeholder="₹12–18 LPA" />
          </Field>
          <Field label="Source">
            <Select value={form.source || "none"} onValueChange={(v) => set("source", v === "none" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Where you found it" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Job link" className="sm:col-span-2">
            <Input type="url" value={form.job_url} onChange={(e) => set("job_url", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Job description" className="sm:col-span-2">
            <Textarea
              value={form.job_description}
              onChange={(e) => set("job_description", e.target.value)}
              placeholder="Paste it here so AI can match your resume and write a cover letter later."
              className="min-h-28 text-sm scrollbar-thin"
            />
          </Field>
          <DialogFooter className="mt-1 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="min-w-28">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Add application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function guessSource(url: string) {
  const host = url.toLowerCase();
  if (host.includes("linkedin.")) return "LinkedIn";
  if (host.includes("naukri.")) return "Naukri";
  if (host.includes("wellfound.") || host.includes("angel.co")) return "Wellfound";
  if (host.includes("indeed.")) return "Indeed";
  return "Company site";
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 text-xs text-muted-foreground">
        {label}
        {required && <span className="text-primary">*</span>}
      </Label>
      {children}
    </div>
  );
}
