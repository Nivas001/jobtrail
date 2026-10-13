import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActivityWithApp, Application, Resume } from "@/lib/types";

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const meta = data.user.user_metadata ?? {};
  return {
    id: data.user.id,
    name: (meta.full_name as string) || (meta.user_name as string) || "You",
    login: (meta.user_name as string) || "",
    avatar: (meta.avatar_url as string) || "",
  };
});

export async function getApplications(): Promise<Application[]> {
  await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Application[];
}

export async function getApplication(id: string): Promise<Application | null> {
  await getUser();
  const supabase = await createClient();
  const { data } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  return (data as Application) ?? null;
}

export async function getResumes(): Promise<Resume[]> {
  await getUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Resume[];
}

export async function getActivities(applicationId?: string, limit = 12): Promise<ActivityWithApp[]> {
  await getUser();
  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select("*, applications(company, role)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (applicationId) query = query.eq("application_id", applicationId);
  const { data, error } = await query;
  if (error) throw error;
  return data as ActivityWithApp[];
}
