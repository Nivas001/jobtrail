"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CircleCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { markAutoApplied, updateApplication } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { autofillStatus, callHelper, detectAts, startAutofill, useHelper, type AutofillRun } from "@/lib/ai-helper";
import { isMatchCurrent, matchResumes, type ResumeLite } from "@/lib/match";
import type { Application } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTO = "auto";

const ATS_LABEL = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", other: "this site" } as const;
const FINISHED: AutofillRun["state"][] = ["submitted", "closed", "error"];

async function pdfBase64(resumeId: string) {
  const res = await fetch(`/api/resumes/${resumeId}`);
  if (!res.ok) throw new Error("Couldn't load that resume");
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function AutofillPanel({
  app,
  resumes,
  profile,
}: {
  app: Application;
  resumes: ResumeLite[];
  profile: Record<string, string>;
}) {
  const helper = useHelper();
  const ats = detectAts(app.job_url);
  const fallback = resumes.find((r) => r.is_default) ?? resumes[0];
  // With several resumes the AI picks; with one there's nothing to choose.
  const [resumeId, setResumeId] = useState(resumes.length > 1 ? AUTO : (fallback?.id ?? ""));
  const [starting, setStarting] = useState(false);
  const [prep, setPrep] = useState<string[]>([]);
  const [run, setRun] = useState<AutofillRun | null>(null);
  const recorded = useRef(false);
  const sentResume = useRef("");

  const profileReady = Boolean(profile.first_name && profile.email);
  const blocker = !app.job_url
    ? "Add the job link first."
    : !profileReady
      ? "profile"
      : resumes.length === 0
        ? "Upload a resume first."
        : helper === "offline"
          ? "helper"
          : null;
  const busy = starting || run?.state === "filling";

  // Follow the run until the user submits or closes the window.
  useEffect(() => {
    if (!run || FINISHED.includes(run.state)) return;
    const timer = setInterval(async () => {
      try {
        setRun(await autofillStatus(run.id));
      } catch (e) {
        setRun((r) => r && { ...r, state: "error", error: (e as Error).message });
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [run?.id, run?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (run?.state !== "submitted" || recorded.current) return;
    recorded.current = true;
    markAutoApplied(app.id, run.ats, sentResume.current).then((res) => {
      if (res.ok) toast.success("Application submitted", { description: "Moved to Applied and logged on the timeline." });
      else toast.error("Couldn't update the application", { description: res.error });
    });
  }, [run?.state, run?.ats, app.id]);

  // Pick the resume that fits this job: a current saved match, else a fresh AI match.
  async function pickResume(note: (s: string) => void): Promise<{ resume: ResumeLite; description: string }> {
    let description = app.job_description?.trim() ?? "";
    if (resumeId !== AUTO) return { resume: resumes.find((r) => r.id === resumeId)!, description };
    if (isMatchCurrent(app.ai_match, resumes)) {
      const best = resumes.find((r) => r.id === app.ai_match!.best_resume_id)!;
      note(`Best match: ${best.name} (${Math.round(app.ai_match.score)}%)`);
      return { resume: best, description };
    }
    if (!description && app.job_url) {
      note("Reading the job posting");
      try {
        const posting = await callHelper<{ description: string }>("fetchPosting", { url: app.job_url });
        description = posting.description?.trim() ?? "";
        if (description) await updateApplication(app.id, { job_description: description });
      } catch {
        // Some postings need a login; fall back below.
      }
    }
    if (!description) {
      note(`No job description to compare with; using ${fallback.name}`);
      return { resume: fallback, description };
    }
    note(`Comparing your ${resumes.length} resumes with the job`);
    const match = await matchResumes(app, description, resumes);
    const best = resumes.find((r) => r.id === match.best_resume_id) ?? fallback;
    note(`Best match: ${best.name} (${Math.round(match.score)}%)`);
    return { resume: best, description };
  }

  async function start() {
    if (!app.job_url || resumes.length === 0) return;
    setStarting(true);
    setRun(null);
    setPrep([]);
    recorded.current = false;
    const note = (s: string) => setPrep((p) => [...p, s]);
    try {
      const { resume, description } = await pickResume(note);
      sentResume.current = resume.id;
      const started = await startAutofill({
        url: app.job_url,
        profile,
        resume: { name: `${resume.name.replace(/\.pdf$/i, "")}.pdf`, base64: await pdfBase64(resume.id) },
        resumeText: resume.content,
        coverLetter: app.cover_letter ?? "",
        job: { company: app.company, role: app.role, description },
      });
      setRun(started);
    } catch (e) {
      toast.error("Couldn't start auto-fill", { description: (e as Error).message });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4 text-primary" /> Auto-fill application
        </CardTitle>
        <CardDescription>
          {ats && ats !== "other"
            ? `Fills the ${ATS_LABEL[ats]} form in a browser window on your PC. You review it and click Submit.`
            : "Works best with Greenhouse, Lever and Ashby forms. You review it and click Submit."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocker === "profile" ? (
          <p className="text-xs text-muted-foreground">
            Fill in your{" "}
            <Link href="/settings#profile" className="text-primary hover:underline">
              application profile
            </Link>{" "}
            first.
          </p>
        ) : blocker === "helper" ? (
          <p className="text-xs text-muted-foreground">
            Start the AI helper on your PC to use this.{" "}
            <Link href="/settings" className="text-primary hover:underline">
              How?
            </Link>
          </p>
        ) : blocker ? (
          <p className="text-xs text-muted-foreground">{blocker}</p>
        ) : null}

        {resumes.length > 0 && (
          <Select value={resumeId} onValueChange={setResumeId} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Resume to attach">
              <SelectValue placeholder="Resume" />
            </SelectTrigger>
            <SelectContent>
              {resumes.length > 1 && <SelectItem value={AUTO}>Best match for this job (AI picks)</SelectItem>}
              {resumes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {isMatchCurrent(app.ai_match, resumes) && r.id === app.ai_match.best_resume_id ? " · best match" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant={run && run.state !== "error" ? "secondary" : "default"}
          className="w-full gap-1.5"
          onClick={start}
          disabled={Boolean(blocker) || busy || helper !== "online"}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {busy ? "Filling…" : run ? "Fill again" : "Open & fill the form"}
        </Button>

        {prep.length > 0 && (
          <ol className="space-y-1.5 pt-1 text-sm">
            {prep.map((s, i) => {
              const current = starting && !run && i === prep.length - 1;
              return (
                <li key={i} className="flex items-start gap-2">
                  {current ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn(current || s.startsWith("Best match") ? "text-foreground" : "text-muted-foreground")}>{s}</span>
                </li>
              );
            })}
          </ol>
        )}
        {run && <RunProgress run={run} />}
      </CardContent>
    </Card>
  );
}

function RunProgress({ run }: { run: AutofillRun }) {
  return (
    <div className="space-y-3 pt-1" aria-live="polite">
      <ol className="space-y-1.5 text-sm">
        {run.steps.map((s, i) => {
          const current = i === run.steps.length - 1 && run.state === "filling";
          return (
            <li key={s.at + s.text} className="flex items-start gap-2">
              {current ? (
                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(current ? "text-foreground" : "text-muted-foreground")}>{s.text}</span>
            </li>
          );
        })}
        {run.state === "filling" && run.steps.length === 0 && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" /> Starting the browser…
          </li>
        )}
      </ol>

      {run.state === "review" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Your turn: check the browser window</p>
          <p className="mt-0.5 text-muted-foreground">
            {run.filled.length} filled{run.needs.length ? `, ${run.needs.length} need you` : ""}. Jobtrail never clicks
            Submit. This updates when you do.
          </p>
        </div>
      )}
      {run.state === "submitted" && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <CircleCheck className="size-4 shrink-0 text-emerald-400" /> Submitted. Moved to Applied.
        </p>
      )}
      {run.state === "closed" && (
        <p className="text-xs text-muted-foreground">The form window was closed before submitting.</p>
      )}
      {run.state === "error" && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {run.error}
        </p>
      )}

      {run.needs.length > 0 && run.state !== "submitted" && (
        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Needs you</p>
          <ul className="space-y-1 text-sm">
            {run.needs.map((n) => (
              <li key={n} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="line-clamp-2">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.filled.length > 0 && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground">
            What was filled ({run.filled.length})
          </summary>
          <dl className="mt-2 space-y-2">
            {run.filled.map((f, i) => (
              <div key={i}>
                <dt className="line-clamp-1 text-xs text-muted-foreground">{f.label}</dt>
                <dd className="line-clamp-2">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
