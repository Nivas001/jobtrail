"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ID, OAuthProvider, Permission, Query, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import {
  DB_ID,
  RESUME_BUCKET,
  SESSION_COOKIE,
  TABLES,
  createAdminClient,
  createSessionClient,
} from "@/lib/appwrite";
import { STATUSES, STATUS_META, WORK_MODES, type AiMatch, type Status } from "@/lib/types";

async function authed() {
  const session = await createSessionClient();
  if (!session) redirect("/login");
  let userId: string;
  try {
    userId = (await session.account.get()).$id;
  } catch {
    redirect("/login");
  }
  return { ...session, userId };
}

type Session = Awaited<ReturnType<typeof authed>>;

// Rows and files are readable and writable by their owner only.
const ownedBy = (userId: string) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

function refreshAll(id?: string) {
  revalidatePath("/");
  revalidatePath("/board");
  if (id) revalidatePath(`/applications/${id}`);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const asDateTime = (d: string | null | undefined) => (d ? `${d}T00:00:00.000+00:00` : null);
const today = () => new Date().toISOString().slice(0, 10);

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const applicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(120),
  role: z.string().trim().min(1, "Role is required").max(160),
  status: z.enum(STATUSES).default("wishlist"),
  location: z.preprocess(blankToNull, z.string().trim().max(120).nullable()).default(null),
  work_mode: z.preprocess(blankToNull, z.enum(WORK_MODES).nullable()).default(null),
  salary: z.preprocess(blankToNull, z.string().trim().max(80).nullable()).default(null),
  job_url: z.preprocess(blankToNull, z.url().max(1000).nullable()).default(null),
  source: z.preprocess(blankToNull, z.string().trim().max(80).nullable()).default(null),
  job_description: z.preprocess(blankToNull, z.string().max(60000).nullable()).default(null),
  resume_id: z.preprocess(blankToNull, z.string().max(36).nullable()).default(null),
  applied_at: z.preprocess(blankToNull, z.iso.date().nullable()).default(null),
  follow_up_at: z.preprocess(blankToNull, z.iso.date().nullable()).default(null),
  notes: z.preprocess(blankToNull, z.string().max(20000).nullable()).default(null),
});

export type ApplicationInput = z.input<typeof applicationSchema>;
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input";
}

function toRowData(values: Partial<z.output<typeof applicationSchema>>) {
  const data: Record<string, unknown> = { ...values };
  if ("applied_at" in values) data.applied_at = asDateTime(values.applied_at);
  if ("follow_up_at" in values) data.follow_up_at = asDateTime(values.follow_up_at);
  return data;
}

async function logActivity(s: Session, applicationId: string, kind: string, title: string) {
  await s.tables.createRow({
    databaseId: DB_ID,
    tableId: TABLES.activities,
    rowId: ID.unique(),
    data: { user_id: s.userId, application_id: applicationId, kind, title: title.slice(0, 2000) },
    permissions: ownedBy(s.userId),
  });
}

export async function createApplication(input: ApplicationInput): Promise<ActionResult<{ id: string }>> {
  const parsed = applicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const s = await authed();
  const values = parsed.data;
  if (values.status !== "wishlist" && !values.applied_at) values.applied_at = today();
  try {
    const row = await s.tables.createRow({
      databaseId: DB_ID,
      tableId: TABLES.applications,
      rowId: ID.unique(),
      data: { ...toRowData(values), user_id: s.userId, position: -Date.now() },
      permissions: ownedBy(s.userId),
    });
    await logActivity(s, row.$id, "created", `Added as ${STATUS_META[values.status].label}`);
    refreshAll();
    return { ok: true, data: { id: row.$id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

async function applyStatusChange(s: Session, id: string, from: Status, to: Status, extra: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...extra, status: to };
  if (to === "applied" || to === "interview" || to === "offer") {
    const row = await s.tables.getRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id });
    if (!row.applied_at) data.applied_at = asDateTime(today());
  }
  await s.tables.updateRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id, data });
  if (from !== to) await logActivity(s, id, "status", `Moved to ${STATUS_META[to].label}`);
}

export async function updateApplication(id: string, input: Partial<ApplicationInput>): Promise<ActionResult> {
  const parsed = applicationSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const s = await authed();
  // Only the fields the caller passed (schema defaults would wipe the rest).
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key in input));
  try {
    const before = await s.tables.getRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id });
    const data = toRowData(patch);
    if (patch.status && patch.status !== before.status) {
      await applyStatusChange(s, id, before.status, patch.status as Status, data);
    } else {
      await s.tables.updateRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id, data });
    }
    refreshAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function moveApplication(id: string, status: Status, position: number): Promise<ActionResult> {
  if (!STATUSES.includes(status) || !Number.isFinite(position)) return { ok: false, error: "Bad move" };
  const s = await authed();
  try {
    const before = await s.tables.getRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id });
    if (before.status !== status) await applyStatusChange(s, id, before.status, status, { position });
    else await s.tables.updateRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id, data: { position } });
    refreshAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const s = await authed();
  try {
    const acts = await s.tables.listRows({
      databaseId: DB_ID,
      tableId: TABLES.activities,
      queries: [Query.equal("application_id", id), Query.select(["$id"]), Query.limit(1000)],
    });
    await Promise.all(
      acts.rows.map((r) => s.tables.deleteRow({ databaseId: DB_ID, tableId: TABLES.activities, rowId: r.$id })),
    );
    await s.tables.deleteRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id });
    refreshAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function addNote(id: string, text: string): Promise<ActionResult> {
  const note = text.trim();
  if (!note) return { ok: false, error: "Note is empty" };
  const s = await authed();
  try {
    // Reading the row first confirms it belongs to this user.
    await s.tables.getRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id });
    await logActivity(s, id, "note", note);
    refreshAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const aiMatchSchema = z.object({
  score: z.number().min(0).max(100),
  best_resume_id: z.string().nullable(),
  best_resume_name: z.string().max(200),
  verdict: z.string().max(2000),
  matched_keywords: z.array(z.string().max(100)).max(30),
  missing_keywords: z.array(z.string().max(100)).max(30),
  suggestions: z.array(z.string().max(1000)).max(10),
  analyzed_at: z.string(),
});

export async function saveAiMatch(id: string, match: AiMatch): Promise<ActionResult> {
  const parsed = aiMatchSchema.safeParse(match);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const s = await authed();
  try {
    await s.tables.updateRow({
      databaseId: DB_ID,
      tableId: TABLES.applications,
      rowId: id,
      data: { ai_match: JSON.stringify(parsed.data) },
    });
    await logActivity(s, id, "ai", `AI match: ${Math.round(parsed.data.score)}% with ${parsed.data.best_resume_name}`);
    refreshAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function saveCoverLetter(id: string, text: string): Promise<ActionResult> {
  const s = await authed();
  try {
    await s.tables.updateRow({
      databaseId: DB_ID,
      tableId: TABLES.applications,
      rowId: id,
      data: { cover_letter: text.slice(0, 20000) },
    });
    refreshAll(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---- resumes ---------------------------------------------------------------

const MAX_RESUME_BYTES = 4_000_000;

export async function uploadResume(formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF file" };
  if (file.type !== "application/pdf") return { ok: false, error: "Only PDF resumes are supported" };
  if (file.size > MAX_RESUME_BYTES) return { ok: false, error: "PDF is larger than 4 MB" };

  const s = await authed();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let content = "";
  try {
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    content = text.replace(/[ \t]+\n/g, "\n").trim();
  } catch {
    return { ok: false, error: "Couldn't read text from that PDF" };
  }

  try {
    const stored = await s.storage.createFile({
      bucketId: RESUME_BUCKET,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(bytes, file.name),
      permissions: ownedBy(s.userId),
    });
    const existing = await s.tables.listRows({
      databaseId: DB_ID,
      tableId: TABLES.resumes,
      queries: [Query.select(["$id"]), Query.limit(1)],
    });
    await s.tables.createRow({
      databaseId: DB_ID,
      tableId: TABLES.resumes,
      rowId: ID.unique(),
      data: {
        user_id: s.userId,
        name: (name || file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ")).slice(0, 200),
        file_id: stored.$id,
        content,
        is_default: existing.total === 0,
      },
      permissions: ownedBy(s.userId),
    });
    revalidatePath("/resumes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setDefaultResume(id: string): Promise<ActionResult> {
  const s = await authed();
  try {
    const all = await s.tables.listRows({
      databaseId: DB_ID,
      tableId: TABLES.resumes,
      queries: [Query.select(["$id", "is_default"]), Query.limit(100)],
    });
    await Promise.all(
      all.rows
        .filter((r) => Boolean(r.is_default) !== (r.$id === id))
        .map((r) =>
          s.tables.updateRow({ databaseId: DB_ID, tableId: TABLES.resumes, rowId: r.$id, data: { is_default: r.$id === id } }),
        ),
    );
    revalidatePath("/resumes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function deleteResume(id: string): Promise<ActionResult> {
  const s = await authed();
  try {
    const row = await s.tables.getRow({ databaseId: DB_ID, tableId: TABLES.resumes, rowId: id });
    if (row.file_id) await s.storage.deleteFile({ bucketId: RESUME_BUCKET, fileId: row.file_id }).catch(() => {});
    await s.tables.deleteRow({ databaseId: DB_ID, tableId: TABLES.resumes, rowId: id });
    // Applications that were sent with it now point at nothing; clear them.
    const using = await s.tables.listRows({
      databaseId: DB_ID,
      tableId: TABLES.applications,
      queries: [Query.equal("resume_id", id), Query.select(["$id"]), Query.limit(1000)],
    });
    await Promise.all(
      using.rows.map((r) =>
        s.tables.updateRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: r.$id, data: { resume_id: null } }),
      ),
    );
    revalidatePath("/resumes");
    refreshAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---- auth --------------------------------------------------------------------

export async function signInWithGitHub() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const { account } = createAdminClient();
  let url: string;
  try {
    url = await account.createOAuth2Token({
      provider: OAuthProvider.Github,
      success: `${origin}/auth/callback`,
      failure: `${origin}/login?error=auth`,
      scopes: ["read:user", "user:email"],
    });
  } catch (e) {
    // 412 = GitHub provider switched off in Appwrite; otherwise usually the
    // site's hostname is missing from the project's Web platforms.
    const code = (e as { code?: number }).code;
    redirect(`/login?error=${code === 412 ? "provider-off" : "start"}`);
  }
  redirect(url);
}

export async function signOut() {
  const session = await createSessionClient();
  if (session) await session.account.deleteSession({ sessionId: "current" }).catch(() => {});
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
