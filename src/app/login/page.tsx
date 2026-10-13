import type { Metadata } from "next";
import { Briefcase, FileText, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { GitHubButton } from "./github-button";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "not-allowed": "That GitHub account isn't allowed to use this tracker.",
  auth: "Sign-in didn't complete. Please try again.",
  "missing-code": "Sign-in didn't complete. Please try again.",
  "provider-off": "GitHub sign-in is switched off in Appwrite (Auth → Settings → GitHub).",
  start: "Couldn't start sign-in. Check that this site's hostname is a Web platform in Appwrite.",
};

const FEATURES = [
  { icon: Briefcase, title: "Every application on one board", text: "Drag cards from Wishlist to Offer." },
  { icon: Sparkles, title: "Resume match, before you apply", text: "Find your best resume and the keywords it's missing." },
  { icon: FileText, title: "Cover letters in seconds", text: "Drafted from your real experience." },
];

export default async function LoginPage(props: PageProps<"/login">) {
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-16">
      <div className="glow-orange pointer-events-none absolute inset-x-0 top-0 h-[480px]" />
      <div className="relative w-full max-w-sm">
        <Logo className="mb-10 justify-center text-lg" />
        <h1 className="text-center text-3xl font-semibold tracking-tight">Land the next one.</h1>
        <p className="mt-2 text-center text-muted-foreground">
          Your job search, organised, with an AI assistant that runs on your own PC.
        </p>

        <div className="mt-8 rounded-2xl border bg-card/70 p-5 shadow-2xl shadow-black/40 backdrop-blur">
          <GitHubButton />
          {message && <p className="mt-3 text-center text-sm text-destructive">{message}</p>}
        </div>

        <ul className="mt-10 space-y-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-primary">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
