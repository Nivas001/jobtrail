import { getApplications, getResumes } from "@/lib/data";
import { ResumeList } from "@/components/resumes/resume-list";

export const metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const [resumes, apps] = await Promise.all([getResumes(), getApplications()]);
  const rows = resumes.map((r) => ({ ...r, used: apps.filter((a) => a.resume_id === r.id).length }));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Resumes</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Keep every version here. AI compares all of them against a job and tells you which one to send.
      </p>
      <ResumeList resumes={rows} />
    </div>
  );
}
