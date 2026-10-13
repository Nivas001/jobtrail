import { NextResponse, type NextRequest } from "next/server";
import { Query } from "node-appwrite";
import { SESSION_COOKIE, createAdminClient } from "@/lib/appwrite";

// GitHub → Appwrite sends the user back here with a one-time token. Turn it
// into a session cookie, but only for the GitHub account(s) allowed in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const userId = searchParams.get("userId");
  const secret = searchParams.get("secret");
  if (!userId || !secret) return NextResponse.redirect(`${origin}/login?error=missing-code`);

  const { account, users } = createAdminClient();
  let session;
  try {
    session = await account.createSession({ userId, secret });
  } catch {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // GitHub username + avatar from the public profile of the linked identity.
  let login = "";
  let avatar = "";
  try {
    const ids = await users.listIdentities({
      queries: [Query.equal("userId", userId), Query.equal("provider", "github"), Query.limit(1)],
    });
    const githubId = ids.identities[0]?.providerUid;
    if (githubId) {
      const res = await fetch(`https://api.github.com/user/${githubId}`, {
        headers: { accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (res.ok) {
        const profile = (await res.json()) as { login?: string; avatar_url?: string };
        login = profile.login ?? "";
        avatar = profile.avatar_url ?? "";
      }
    }
  } catch {
    // Profile lookup is best effort; the allowlist below still applies.
  }

  const allowed = (process.env.ALLOWED_GITHUB_LOGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(login.toLowerCase())) {
    await users.deleteSession({ userId, sessionId: session.$id }).catch(() => {});
    return NextResponse.redirect(`${origin}/login?error=not-allowed`);
  }

  if (login) {
    // Merge: prefs also hold the application profile.
    const prefs = await users.getPrefs({ userId }).catch(() => ({}));
    await users.updatePrefs({ userId, prefs: { ...prefs, login, avatar } }).catch(() => {});
  }

  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set(SESSION_COOKIE, session.secret, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expire),
  });
  return response;
}
