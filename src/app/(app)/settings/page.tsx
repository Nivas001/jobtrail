import { headers } from "next/headers";
import { Sparkles, UserRound } from "lucide-react";
import { getProfile, getUser } from "@/lib/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelperSetup } from "@/components/settings/helper-setup";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [user, profile, h] = await Promise.all([getUser(), getProfile(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-6 text-sm text-muted-foreground">Signed in as @{user.login || user.name}</p>
      <Card id="profile" className="mb-4 scroll-mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-primary" /> Application profile
          </CardTitle>
          <CardDescription>
            Auto-fill answers the standard questions on Greenhouse, Lever and Ashby forms from this. Anything not here is
            left for you to fill in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initial={profile} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> AI helper
          </CardTitle>
          <CardDescription>
            Autofill, resume matching and cover letters run through the Antigravity CLI on your PC, so they work when you
            use Jobtrail on this computer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HelperSetup origin={`${proto}://${host}`} />
        </CardContent>
      </Card>
    </div>
  );
}
