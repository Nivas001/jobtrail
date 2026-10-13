import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  FileText,
  MessagesSquare,
  Sparkles,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, startOfWeek, subWeeks } from "date-fns";
import { getActivities, getApplications, getResumes, getUser } from "@/lib/data";
import { STATUSES, type Application, type Status } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyLogo } from "@/components/company-logo";
import { NewApplicationButton } from "@/components/new-application";
import { StatusBadge } from "@/components/status-badge";
import { PipelineBar } from "@/components/dashboard/pipeline-bar";
import { WeeklyChart } from "@/components/dashboard/weekly-chart";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function weekly(apps: Application[]) {
  const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weeks = Array.from({ length: 10 }, (_, i) => subWeeks(thisWeek, 9 - i));
  return weeks.map((start) => {
    const end = subWeeks(start, -1);
    const count = apps.filter((a) => {
      if (!a.applied_at) return false;
      const d = new Date(a.applied_at);
      return d >= start && d < end;
    }).length;
    return { week: format(start, "d MMM"), count };
  });
}

export default async function DashboardPage() {
  const [user, apps, resumes, activities] = await Promise.all([
    getUser(),
    getApplications(),
    getResumes(),
    getActivities(undefined, 8),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  apps.forEach((a) => counts[a.status]++);
  const sent = apps.filter((a) => a.status !== "wishlist").length;
  const responses = counts.interview + counts.offer;
  const responseRate = sent ? Math.round((responses / sent) * 100) : 0;
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const sentThisWeek = apps.filter((a) => a.applied_at && new Date(a.applied_at) >= thisWeekStart).length;

  const today = new Date();
  const followUps = apps
    .filter((a) => a.follow_up_at && (a.status === "applied" || a.status === "interview"))
    .map((a) => ({ app: a, days: differenceInCalendarDays(new Date(a.follow_up_at!), today) }))
    .filter((f) => f.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);
  // Applied 10+ days ago with no reply and no follow-up planned: nudge.
  const stale = apps
    .filter((a) => a.status === "applied" && !a.follow_up_at && a.applied_at && differenceInCalendarDays(today, new Date(a.applied_at)) >= 10)
    .slice(0, 4);

  const resumeOptions = resumes.map(({ id, name, is_default }) => ({ id, name, is_default }));
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{format(today, "EEEE, d MMMM")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
        </div>
        <NewApplicationButton resumes={resumeOptions} />
      </div>

      {apps.length === 0 ? (
        <GettingStarted hasResume={resumes.length > 0} resumes={resumeOptions} />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={Briefcase} label="Active" value={counts.applied + counts.interview} sub={`${counts.wishlist} on wishlist`} />
            <Stat icon={TrendingUp} label="Response rate" value={`${responseRate}%`} sub={`${responses} of ${sent} sent`} />
            <Stat icon={MessagesSquare} label="Interviews" value={counts.interview} sub={`${sentThisWeek} sent this week`} />
            <Stat icon={Trophy} label="Offers" value={counts.offer} sub={counts.offer ? "Nice work" : "Keep going"} highlight={counts.offer > 0} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Applications sent per week</CardTitle>
                <CardDescription>Last 10 weeks, by applied date</CardDescription>
              </CardHeader>
              <CardContent>
                <WeeklyChart data={weekly(apps)} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Pipeline</CardTitle>
                <CardDescription>{apps.length} applications in total</CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineBar counts={counts} />
                <Button asChild variant="secondary" size="sm" className="mt-5 w-full">
                  <Link href="/board">
                    Open board <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BellRing className="size-4 text-primary" /> Follow-ups
                </CardTitle>
                <CardDescription>Due this week, plus applications that have gone quiet</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {followUps.length === 0 && stale.length === 0 && (
                  <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-emerald-400" /> Nothing to chase right now.
                  </p>
                )}
                {followUps.map(({ app, days }) => (
                  <AppRow
                    key={app.id}
                    app={app}
                    right={
                      <span className={days < 0 ? "text-destructive" : days === 0 ? "text-primary" : "text-muted-foreground"}>
                        {days < 0 ? `${-days}d overdue` : days === 0 ? "Today" : `in ${days}d`}
                      </span>
                    }
                  />
                ))}
                {stale.map((app) => (
                  <AppRow
                    key={app.id}
                    app={app}
                    right={<span className="text-muted-foreground">No reply · {differenceInCalendarDays(today, new Date(app.applied_at!))}d</span>}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4 text-primary" /> Recent activity
                </CardTitle>
                <CardDescription>What changed lately</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {activities.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute top-1.5 -left-[25px] size-2 rounded-full bg-primary ring-4 ring-card" />
                      <Link href={`/applications/${a.application_id}`} className="group block">
                        <p className="text-sm">
                          <span className="font-medium group-hover:text-primary">{a.applications?.company}</span>
                          <span className="text-muted-foreground"> · {a.title}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(a.created_at), { addSuffix: true })}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
          <Icon className={highlight ? "size-4 text-primary" : "size-4"} />
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function AppRow({ app, right }: { app: Application; right: React.ReactNode }) {
  return (
    <Link
      href={`/applications/${app.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
    >
      <CompanyLogo company={app.company} url={app.job_url} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{app.company}</p>
        <p className="truncate text-xs text-muted-foreground">{app.role}</p>
      </div>
      <StatusBadge status={app.status} className="hidden sm:inline-flex" />
      <span className="w-24 text-right text-xs">{right}</span>
    </Link>
  );
}

function GettingStarted({
  hasResume,
  resumes,
}: {
  hasResume: boolean;
  resumes: { id: string; name: string; is_default: boolean }[];
}) {
  const steps = [
    {
      icon: FileText,
      title: "Upload your resumes",
      text: "Add each version you use (ATS, full-stack, …). AI picks the best one per job.",
      done: hasResume,
      action: (
        <Button asChild variant={hasResume ? "secondary" : "default"} size="sm">
          <Link href="/resumes">{hasResume ? "Manage resumes" : "Upload resume"}</Link>
        </Button>
      ),
    },
    {
      icon: Sparkles,
      title: "Start the AI helper",
      text: "One command on your PC connects the Antigravity CLI. Optional but worth it.",
      done: false,
      action: (
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings">How to</Link>
        </Button>
      ),
    },
    {
      icon: Briefcase,
      title: "Add your first application",
      text: "Paste a job link and let AI fill in the details.",
      done: false,
      action: <NewApplicationButton resumes={resumes} trigger={<Button size="sm">Add application</Button>} />,
    },
  ];
  return (
    <Card className="relative mt-8 overflow-hidden">
      <div className="glow-orange pointer-events-none absolute inset-x-0 top-0 h-48" />
      <CardHeader className="relative">
        <CardTitle className="text-xl">Let&apos;s set up your search</CardTitle>
        <CardDescription>Three quick steps and your dashboard comes alive.</CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, text, done, action }, i) => (
          <div key={title} className="flex flex-col rounded-xl border bg-background/60 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">
                {done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="text-xs text-muted-foreground">Step {i + 1}</span>
            </div>
            <p className="mt-3 font-medium">{title}</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{text}</p>
            <div className="mt-4">{action}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
