import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { Query, type Models } from "node-appwrite";
import { DB_ID, TABLES, createSessionClient } from "@/lib/appwrite";
import { PROFILE_KEYS, type Activity, type ActivityWithApp, type AiMatch, type Application, type Profile, type Resume } from "@/lib/types";

export const getSession = cache(async () => {
  const session = await createSessionClient();
  if (!session) redirect("/login");
  let user: Models.User<Models.Preferences>;
  try {
    user = await session.account.get();
  } catch {
    redirect("/login");
  }
  return { ...session, user };
});

export async function getUser() {
  const { user } = await getSession();
  const prefs = user.prefs as { login?: string; avatar?: string };
  return {
    id: user.$id,
    name: user.name || prefs.login || "You",
    login: prefs.login ?? "",
    avatar: prefs.avatar ?? "",
  };
}

export async function getProfile(): Promise<Profile> {
  const { user } = await getSession();
  const saved = ((user.prefs as { profile?: Partial<Profile> }).profile ?? {}) as Partial<Profile>;
  const [first = "", ...rest] = (user.name || "").trim().split(/\s+/);
  const profile = Object.fromEntries(PROFILE_KEYS.map((k) => [k, saved[k] ?? ""])) as Profile;
  // First visit: start from the GitHub account's name and email.
  if (!saved.first_name && !saved.last_name) {
    profile.first_name = first;
    profile.last_name = rest.join(" ");
  }
  if (!saved.email) profile.email = user.email || "";
  return profile;
}

const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

function parseMatch(v: unknown): AiMatch | null {
  if (typeof v !== "string" || !v) return null;
  try {
    return JSON.parse(v) as AiMatch;
  } catch {
    return null;
  }
}

export function toApplication(r: Models.DefaultRow): Application {
  return {
    id: r.$id,
    company: r.company,
    role: r.role,
    status: r.status,
    position: r.position ?? 0,
    location: r.location ?? null,
    work_mode: r.work_mode ?? null,
    salary: r.salary ?? null,
    job_url: r.job_url ?? null,
    source: r.source ?? null,
    job_description: r.job_description ?? null,
    resume_id: r.resume_id ?? null,
    applied_at: day(r.applied_at),
    follow_up_at: day(r.follow_up_at),
    notes: r.notes ?? null,
    ai_match: parseMatch(r.ai_match),
    cover_letter: r.cover_letter ?? null,
    created_at: r.$createdAt,
    updated_at: r.$updatedAt,
  };
}

function toResume(r: Models.DefaultRow): Resume {
  return {
    id: r.$id,
    name: r.name,
    file_path: r.file_id ?? null,
    content: r.content ?? "",
    is_default: Boolean(r.is_default),
    created_at: r.$createdAt,
  };
}

function toActivity(r: Models.DefaultRow): Activity {
  return { id: r.$id, application_id: r.application_id, kind: r.kind, title: r.title, created_at: r.$createdAt };
}

export async function getApplications(): Promise<Application[]> {
  const { tables } = await getSession();
  const res = await tables.listRows({
    databaseId: DB_ID,
    tableId: TABLES.applications,
    queries: [Query.orderAsc("position"), Query.limit(1000)],
  });
  return res.rows.map(toApplication);
}

export async function getApplication(id: string): Promise<Application | null> {
  const { tables } = await getSession();
  try {
    return toApplication(await tables.getRow({ databaseId: DB_ID, tableId: TABLES.applications, rowId: id }));
  } catch {
    return null;
  }
}

export async function getResumes(): Promise<Resume[]> {
  const { tables } = await getSession();
  const res = await tables.listRows({
    databaseId: DB_ID,
    tableId: TABLES.resumes,
    queries: [Query.orderDesc("is_default"), Query.orderDesc("$createdAt"), Query.limit(100)],
  });
  return res.rows.map(toResume);
}

export async function getActivities(applicationId?: string, limit = 12): Promise<ActivityWithApp[]> {
  const { tables } = await getSession();
  const queries = [Query.orderDesc("$createdAt"), Query.limit(limit)];
  if (applicationId) queries.push(Query.equal("application_id", applicationId));
  const res = await tables.listRows({ databaseId: DB_ID, tableId: TABLES.activities, queries });
  const activities = res.rows.map(toActivity);

  const ids = [...new Set(activities.map((a) => a.application_id))];
  const apps = ids.length
    ? await tables.listRows({
        databaseId: DB_ID,
        tableId: TABLES.applications,
        queries: [Query.equal("$id", ids), Query.select(["$id", "company", "role"]), Query.limit(ids.length)],
      })
    : { rows: [] as Models.DefaultRow[] };
  const byId = new Map(apps.rows.map((r) => [r.$id, { company: r.company as string, role: r.role as string }]));
  return activities.map((a) => ({ ...a, applications: byId.get(a.application_id) ?? null }));
}
