"use client";

import { useState, useTransition } from "react";
import { Check, Copy, FileText, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { saveCoverLetter } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { callHelper, useHelper, type HelperState } from "@/lib/ai-helper";
import { matchResumes, type ResumeLite } from "@/lib/match";
import type { AiMatch, Application } from "@/lib/types";
import { cn } from "@/lib/utils";

function HelperHint({ state, needsJd }: { state: HelperState; needsJd: boolean }) {
  if (needsJd) return <p className="text-xs text-muted-foreground">Add the job description first.</p>;
  if (state === "offline")
    return (
      <p className="text-xs text-muted-foreground">
        Start the AI helper on your PC to use this. <a href="/settings" className="text-primary hover:underline">How?</a>
      </p>
    );
  return null;
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#199e70" : score >= 50 ? "#c98500" : "#e66767";
  return (
    <div className="relative grid size-[88px] shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums leading-none">{Math.round(score)}</p>
        <p className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">match</p>
      </div>
    </div>
  );
}

export function AiMatchPanel({ app, resumes }: { app: Application; resumes: ResumeLite[] }) {
  const helper = useHelper();
  const [match, setMatch] = useState<AiMatch | null>(app.ai_match);
  const [running, setRunning] = useState(false);
  const needsJd = !app.job_description?.trim();

  async function analyze() {
    if (resumes.length === 0) {
      toast.error("Upload a resume first");
      return;
    }
    setRunning(true);
    try {
      setMatch(await matchResumes(app, app.job_description ?? "", resumes));
    } catch (e) {
      toast.error("Analysis failed", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="relative overflow-hidden">
      {match && <div className="glow-orange pointer-events-none absolute inset-x-0 top-0 h-32 opacity-60" />}
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" /> Resume match
        </CardTitle>
        <CardDescription>Which resume fits this job, and what it&apos;s missing</CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant={match ? "secondary" : "default"}
            onClick={analyze}
            disabled={running || helper !== "online" || needsJd}
            className="gap-1.5"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : match ? <RefreshCw className="size-3.5" /> : <Wand2 className="size-3.5" />}
            {running ? "Analyzing…" : match ? "Re-run" : "Analyze"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="relative">
        <HelperHint state={helper} needsJd={needsJd} />
        {running && !match && (
          <div className="space-y-2 py-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <p className="pt-1 text-xs text-muted-foreground">Reading the job and your resumes… up to a minute.</p>
          </div>
        )}
        {match && (
          <div className={cn("space-y-5 transition-opacity", running && "opacity-50")}>
            <div className="flex items-center gap-4">
              <ScoreRing score={match.score} />
              <div className="min-w-0">
                <p className="text-sm leading-relaxed">{match.verdict}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                  <FileText className="size-3 text-primary" />
                  Best resume: <span className="font-medium">{match.best_resume_name}</span>
                </p>
              </div>
            </div>
            <Keywords title="You have" words={match.matched_keywords} tone="good" />
            <Keywords title="Missing from your resume" words={match.missing_keywords} tone="gap" />
            {match.suggestions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Suggested edits</p>
                <ul className="space-y-2">
                  {match.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Keywords({ title, words, tone }: { title: string; words: string[]; tone: "good" | "gap" }) {
  if (!words.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <span
            key={w}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              tone === "good" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200",
            )}
          >
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

const TONES = ["Confident and warm", "Formal", "Enthusiastic", "Concise"];

export function CoverLetterPanel({
  app,
  resumes,
  candidateName,
}: {
  app: Application;
  resumes: ResumeLite[];
  candidateName: string;
}) {
  const helper = useHelper();
  const [text, setText] = useState(app.cover_letter ?? "");
  const [saved, setSaved] = useState(app.cover_letter ?? "");
  const [tone, setTone] = useState(TONES[0]);
  const preferred =
    app.ai_match?.best_resume_id ?? app.resume_id ?? resumes.find((r) => r.is_default)?.id ?? resumes[0]?.id ?? "";
  const [resumeId, setResumeId] = useState(preferred);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, startSaving] = useTransition();
  const needsJd = !app.job_description?.trim();

  async function generate() {
    const resume = resumes.find((r) => r.id === resumeId);
    if (!resume) {
      toast.error("Pick a resume first");
      return;
    }
    setRunning(true);
    try {
      const { letter } = await callHelper<{ letter: string }>("coverLetter", {
        jobDescription: app.job_description,
        resumeText: resume.content,
        company: app.company,
        role: app.role,
        tone,
        name: candidateName,
      });
      setText(letter.trim());
      const res = await saveCoverLetter(app.id, letter.trim());
      if (res.ok) setSaved(letter.trim());
    } catch (e) {
      toast.error("Couldn't write the letter", { description: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-primary" /> Cover letter
        </CardTitle>
        <CardDescription>Drafted from your resume, for this job. Edit freely.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={resumeId} onValueChange={setResumeId}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue placeholder="Resume" />
            </SelectTrigger>
            <SelectContent>
              {resumes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            variant={text ? "secondary" : "default"}
            onClick={generate}
            disabled={running || helper !== "online" || needsJd || resumes.length === 0}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            {running ? "Writing…" : text ? "Rewrite" : "Write it"}
          </Button>
        </div>
        <HelperHint state={helper} needsJd={needsJd} />
        {(text || running) && (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={cn("min-h-72 text-sm leading-relaxed scrollbar-thin", running && "animate-pulse")}
              disabled={running}
            />
            <div className="flex items-center justify-end gap-2">
              {text !== saved && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() =>
                    startSaving(async () => {
                      const res = await saveCoverLetter(app.id, text);
                      if (res.ok) {
                        setSaved(text);
                        toast.success("Saved");
                      } else toast.error(res.error);
                    })
                  }
                >
                  Save changes
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={async () => {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
