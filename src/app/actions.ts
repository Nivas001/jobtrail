"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, STATUS_META, WORK_MODES, type AiMatch, type Status } from "@/lib/types";

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, userId: data.user.id };
}

function refreshAll(id?: string) {
  revalidatePath("/");
  revalidatePath("/board");
  if (id) revalidatePath(`/applications/${id}`);
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const applicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  role: z.string().trim().min(1, "Role is required").max(160),
  status: z.enum(STATUSES).default("wishlist"),
  location: z.preprocess(blankToNull, z.string().trim().max(120).nullable()).default(null),
  work_mode: z.preprocess(blankToNull, z.enum(WORK_MODES).nullable()).default(null),
  salary: z.preprocess(blankToNull, z.string().trim().max(80).nullable()).default(null),
  job_url: z.preprocess(blankToNull, z.url().nullable()).default(null),
  source: z.preprocess(blankToNull, z.string().trim().max(80).nullable()).default(null),
  job_description: z.preprocess(blankToNull, z.string().max(60000).nullable()).default(null),
  resume_id: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
  applied_at: z.preprocess(blankToNull, z.iso.date().nullable()).default(null),
  follow_up_at: z.preprocess(blankToNull, z.iso.date().nullable()).default(null),
  notes: z.preprocess(blankToNull, z.string().max(20000).nullable()).default(null),
});

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function createApplication(input: ApplicationInput): Promise<ActionResult<{ id: string }>> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { supabase } = await authed();
  const values = parsed.data;
  if (values.status !== "wishlist" && !values.applied_at) {
    values.applied_at = new Date().toISOString().slice(0, 10);
  }
  const { data, error } = await supabase
    .from("applications")
    .insert({ ...values, position: -Date.now() })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await supabase.from("activities").insert({
    application_id: data.id,
    kind: "created",
    title: `Added as ${STATUS_META[values.status].label}`,
  });
  refreshAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateApplication(id: string, input: Partial<ApplicationInput>): Promise<ActionResult> {
  const parsed = applicationSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { supabase } = await authed();
  // Only send the fields the caller actually passed (defaults would wipe others).
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => key in input),
  );
  const { data: before } = await supabase.from("applications").select("status").eq("id", id).single();
  const { error } = await supabase.from("applications").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (patch.status && before && before.status !== patch.status) {
    await logStatusChange(supabase, id, patch.status as Status);
  }
  refreshAll(id);
  return { ok: true };
}

async function logStatusChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  status: Status,
) {
  await supabase.from("activities").insert({
    application_id: id,
    kind: "status",
    title: `Moved to ${STATUS_META[status].label}`,
  });
  if (status === "applied") {
    await supabase
      .from("applications")
      .update({ applied_at: new Date().toISOString().slice(0, 10) })
      .eq("id", id)
      .is("applied_at", null);
  }
}

export async function moveApplication(id: string, status: Status, position: number): Promise<ActionResult> {
  if (!STATUSES.includes(status)) return { ok: false, error: "Bad status" };
  const { supabase } = await authed();
  const { data: before } = await supabase.from("applications").select("status").eq("id", id).single();
  const { error } = await supabase.from("applications").update({ status, position }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (before && before.status !== status) await logStatusChange(supabase, id, status);
  refreshAll(id);
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("applications").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refreshAll();
  return { ok: true };
}

export async function addNote(id: string, text: string): Promise<ActionResult> {
  const note = text.trim();
  if (!note) return { ok: false, error: "Note is empty" };
  const { supabase } = await authed();
  const { error } = await supabase
    .from("activities")
    .insert({ application_id: id, kind: "note", title: note.slice(0, 2000) });
  if (error) return { ok: false, error: error.message };
  refreshAll(id);
  return { ok: true };
}

const aiMatchSchema = z.object({
  score: z.number().min(0).max(100),
  best_resume_id: z.string().nullable(),
  best_resume_name: z.string(),
  verdict: z.string(),
  matched_keywords: z.array(z.string()),
  missing_keywords: z.array(z.string()),
  suggestions: z.array(z.string()),
  analyzed_at: z.string(),
});

export async function saveAiMatch(id: string, match: AiMatch): Promise<ActionResult> {
  const parsed = aiMatchSchema.safeParse(match);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { supabase } = await authed();
  const { error } = await supabase.from("applications").update({ ai_match: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await supabase.from("activities").insert({
    application_id: id,
    kind: "ai",
    title: `AI match: ${Math.round(parsed.data.score)}% with ${parsed.data.best_resume_name}`,
  });
  refreshAll(id);
  return { ok: true };
}

export async function saveCoverLetter(id: string, text: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase
    .from("applications")
    .update({ cover_letter: text.slice(0, 20000) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refreshAll(id);
  return { ok: true };
}

// ---- resumes ---------------------------------------------------------------

export async function uploadResume(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF file" };
  if (file.type !== "application/pdf") return { ok: false, error: "Only PDF resumes are supported" };
  if (file.size > 5_000_000) return { ok: false, error: "PDF is larger than 5 MB" };

  const { supabase, userId } = await authed();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let content = "";
  try {
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    content = text.replace(/[ \t]+\n/g, "\n").trim();
  } catch {
    return { ok: false, error: "Couldn't read text from that PDF" };
  }

  const path = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, bytes, { contentType: "application/pdf" });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { count } = await supabase.from("resumes").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("resumes").insert({
    name: name || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
    file_path: path,
    content,
    is_default: (count ?? 0) === 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/resumes");
  return { ok: true };
}

export async function setDefaultResume(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  await supabase.from("resumes").update({ is_default: false }).neq("id", id);
  const { error } = await supabase.from("resumes").update({ is_default: true }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/resumes");
  return { ok: true };
}

export async function deleteResume(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { data } = await supabase.from("resumes").select("file_path").eq("id", id).single();
  if (data?.file_path) await supabase.storage.from("resumes").remove([data.file_path]);
  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/resumes");
  return { ok: true };
}

export async function getResumeUrl(id: string): Promise<ActionResult<{ url: string }>> {
  const { supabase } = await authed();
  const { data } = await supabase.from("resumes").select("file_path").eq("id", id).single();
  if (!data?.file_path) return { ok: false, error: "No file" };
  const { data: signed, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(data.file_path, 60 * 10);
  if (error || !signed) return { ok: false, error: error?.message ?? "No URL" };
  return { ok: true, data: { url: signed.signedUrl } };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
