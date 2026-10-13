"use client";

import { saveAiMatch } from "@/app/actions";
import { callHelper } from "@/lib/ai-helper";
import type { AiMatch, Application, Resume } from "@/lib/types";

export type ResumeLite = Pick<Resume, "id" | "name" | "content" | "is_default" | "created_at">;

// Ask the AI which resume fits the job best and save the analysis on the application.
export async function matchResumes(
  app: Pick<Application, "id" | "company" | "role">,
  jobDescription: string,
  resumes: ResumeLite[],
): Promise<AiMatch> {
  const result = await callHelper<Omit<AiMatch, "analyzed_at">>("match", {
    jobDescription,
    company: app.company,
    role: app.role,
    resumes: resumes.map((r) => ({ id: r.id, name: r.name, text: r.content })),
  });
  const known = resumes.find((r) => r.id === result.best_resume_id);
  const match: AiMatch = {
    ...result,
    score: Math.max(0, Math.min(100, result.score)),
    best_resume_id: known?.id ?? null,
    best_resume_name: known?.name ?? result.best_resume_name,
    analyzed_at: new Date().toISOString(),
  };
  const saved = await saveAiMatch(app.id, match);
  if (!saved.ok) throw new Error(`Couldn't save the analysis: ${saved.error}`);
  return match;
}

// A saved match is still good if its resume exists and no resume was added since.
export function isMatchCurrent(match: AiMatch | null, resumes: ResumeLite[]): match is AiMatch & { best_resume_id: string } {
  if (!match?.best_resume_id) return false;
  if (!resumes.some((r) => r.id === match.best_resume_id)) return false;
  const analyzed = new Date(match.analyzed_at).getTime();
  return resumes.every((r) => new Date(r.created_at).getTime() <= analyzed);
}
