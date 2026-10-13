"use client";

import { useRef, useState, useTransition } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Eye, FileText, Loader2, MoreHorizontal, Star, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { deleteResume, setDefaultResume, uploadResume } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Resume } from "@/lib/types";
import { cn } from "@/lib/utils";

type ResumeRow = Resume & { used: number };

export function ResumeList({ resumes }: { resumes: ResumeRow[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, start] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadResume(fd);
      if (res.ok) toast.success(`${file.name} uploaded`);
      else toast.error(`${file.name}: ${res.error}`);
    }
    setUploading(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/40 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-card/70",
          dragOver && "border-primary bg-primary/5",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary">
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
        </span>
        <p className="font-medium">{uploading ? "Uploading…" : "Drop PDF resumes here, or click to choose"}</p>
        <p className="text-sm text-muted-foreground">Each version you use. The text is read so AI can compare them to jobs.</p>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
      </button>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resumes.map((r) => (
          <Card key={r.id} className={cn("gap-0 py-0 transition-colors", r.is_default && "border-primary/40")}>
            <CardContent className="flex h-full flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium leading-snug">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })} · {r.content.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Resume actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => window.open(`/api/resumes/${r.id}`, "_blank")}>
                      <Eye className="size-4" /> Open PDF
                    </DropdownMenuItem>
                    {!r.is_default && (
                      <DropdownMenuItem onSelect={() => start(async () => void (await setDefaultResume(r.id)))}>
                        <Star className="size-4" /> Make default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        start(async () => {
                          const res = await deleteResume(r.id);
                          if (res.ok) toast.success("Resume deleted");
                          else toast.error(res.error);
                        })
                      }
                    >
                      <Trash2 className="size-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="mt-3 line-clamp-4 flex-1 text-xs leading-relaxed text-muted-foreground">{r.content.slice(0, 400)}</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                {r.is_default && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/12 px-1.5 py-0.5 font-medium text-primary">
                    <Star className="size-3 fill-current" /> Default
                  </span>
                )}
                <span className="text-muted-foreground">
                  Sent with {r.used} application{r.used === 1 ? "" : "s"}
                </span>
                {pending && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
