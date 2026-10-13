import "server-only";
import { cookies } from "next/headers";
import { Account, Client, Storage, TablesDB, Users } from "node-appwrite";

export const SESSION_COOKIE = "jobtrail-session";
export const DB_ID = "jobtrail";
export const TABLES = { applications: "applications", resumes: "resumes", activities: "activities" } as const;
export const RESUME_BUCKET = "resumes";

function baseClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_PROJECT_ID!);
}

// Acts as the signed-in user, so Appwrite's row permissions decide what it sees.
export async function createSessionClient() {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return null;
  const client = baseClient().setSession(session);
  return {
    account: new Account(client),
    tables: new TablesDB(client),
    storage: new Storage(client),
  };
}

// API-key client: only for sign-in plumbing (creating the session, saving
// GitHub profile prefs). Never used to read or write tracker data.
export function createAdminClient() {
  const client = baseClient().setKey(process.env.APPWRITE_API_KEY!);
  return { account: new Account(client), users: new Users(client) };
}
