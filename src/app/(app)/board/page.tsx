import { getApplications, getResumes } from "@/lib/data";
import { Board } from "@/components/board/board";
import { NewApplicationButton } from "@/components/new-application";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const [apps, resumes] = await Promise.all([getApplications(), getResumes()]);
  const resumeOptions = resumes.map(({ id, name, is_default }) => ({ id, name, is_default }));
  return (
    <div className="flex h-[calc(100vh-57px)] flex-col md:h-screen">
      <div className="flex items-center justify-between gap-4 px-4 pt-6 pb-4 sm:px-6 lg:px-8 lg:pt-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="text-sm text-muted-foreground">Every application, by stage</p>
        </div>
        <NewApplicationButton resumes={resumeOptions} />
      </div>
      <Board apps={apps} resumes={resumeOptions} />
    </div>
  );
}
