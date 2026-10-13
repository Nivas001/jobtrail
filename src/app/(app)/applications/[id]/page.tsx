import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { format } from "date-fns";
import { getActivities, getApplication, getResumes, getUser } from "@/lib/data";
import { CompanyLogo } from "@/components/company-logo";
import { AiMatchPanel, CoverLetterPanel } from "@/components/application/ai-panels";
import {
  ApplicationMenu,
  DetailsCard,
  JobDescriptionCard,
  StatusSelect,
  TimelineCard,
} from "@/components/application/details";

export async function generateMetadata(props: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const app = await getApplication(id);
  return { title: app ? `${app.company} · ${app.role}` : "Application" };
}

export default async function ApplicationPage(props: PageProps<"/applications/[id]">) {
  const { id } = await props.params;
  const [user, app, resumes, activities] = await Promise.all([
    getUser(),
    getApplication(id),
    getResumes(),
    getActivities(id, 50),
  ]);
  if (!app) notFound();

  const resumeLite = resumes.map(({ id, name, content, is_default }) => ({ id, name, content, is_default }));
  const meta = [app.location, app.work_mode === "onsite" ? "On-site" : app.work_mode && app.work_mode[0].toUpperCase() + app.work_mode.slice(1), app.salary]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Board
      </Link>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <CompanyLogo company={app.company} url={app.job_url} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{app.role}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <span className="font-medium text-foreground/90">{app.company}</span>
            {meta && (
              <span className="inline-flex items-center gap-1 text-sm">
                <MapPin className="size-3.5" /> {meta}
              </span>
            )}
            {app.job_url && (
              <a href={app.job_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Posting <ExternalLink className="size-3" />
              </a>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Added {format(new Date(app.created_at), "d MMM yyyy")}
            {app.applied_at && ` · Applied ${format(new Date(app.applied_at), "d MMM yyyy")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect key={app.status} app={app} />
          <ApplicationMenu app={app} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <AiMatchPanel key={`m-${app.updated_at}`} app={app} resumes={resumeLite} />
          <CoverLetterPanel app={app} resumes={resumeLite} candidateName={user.name} />
          <JobDescriptionCard key={`jd-${app.updated_at}`} app={app} />
        </div>
        <div className="space-y-4">
          <DetailsCard key={`d-${app.updated_at}`} app={app} resumes={resumes} />
          <TimelineCard app={app} activities={activities} />
        </div>
      </div>
    </div>
  );
}
