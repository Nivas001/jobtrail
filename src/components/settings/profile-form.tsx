"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveProfile } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/types";

type Key = keyof Profile;
type FieldDef = { key: Key; label: string; placeholder?: string; type?: string; wide?: boolean };

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Contact",
    fields: [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", placeholder: "+91 98765 43210", type: "tel" },
      { key: "location", label: "Location", placeholder: "Chennai, India", wide: true },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/…", type: "url" },
      { key: "github", label: "GitHub", placeholder: "https://github.com/…", type: "url" },
      { key: "portfolio", label: "Portfolio / website", placeholder: "https://…", type: "url", wide: true },
    ],
  },
  {
    title: "Work",
    fields: [
      { key: "current_company", label: "Current company" },
      { key: "current_title", label: "Current title" },
      { key: "years_experience", label: "Years of experience", placeholder: "2" },
      { key: "notice_period", label: "Notice period", placeholder: "Immediate / 30 days" },
      { key: "salary_expectation", label: "Expected salary", placeholder: "₹12 LPA" },
      { key: "languages", label: "Languages", placeholder: "English (fluent), Tamil (native)" },
      { key: "work_authorization", label: "Work authorization", placeholder: "Indian citizen; can work in India", wide: true },
      { key: "heard_from", label: "Where you usually find jobs", placeholder: "LinkedIn", wide: true },
    ],
  },
];

const YES_NO = [
  { key: "needs_sponsorship" as const, label: "Need visa sponsorship?" },
  { key: "willing_to_relocate" as const, label: "Willing to relocate?" },
];

export function ProfileForm({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [saving, startSaving] = useTransition();
  const set = (key: Key, value: string) => setProfile((p) => ({ ...p, [key]: value }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    startSaving(async () => {
      const res = await saveProfile(profile);
      if (res.ok) toast.success("Profile saved");
      else toast.error("Couldn't save", { description: res.error });
    });
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {SECTIONS.map((section) => (
        <fieldset key={section.title} className="space-y-3">
          <legend className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {section.fields.map((f) => (
              <div key={f.key} className={f.wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Label htmlFor={`p-${f.key}`}>{f.label}</Label>
                <Input
                  id={`p-${f.key}`}
                  type={f.type ?? "text"}
                  value={profile[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
            {section.title === "Work" &&
              YES_NO.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`p-${f.key}`}>{f.label}</Label>
                  <Select value={profile[f.key] || "unset"} onValueChange={(v) => set(f.key, v === "unset" ? "" : v)}>
                    <SelectTrigger id={`p-${f.key}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not set</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
          </div>
        </fieldset>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="p-extra">Anything else forms should know</Label>
        <Textarea
          id="p-extra"
          rows={3}
          value={profile.extra}
          placeholder="Graduating in 2026; open to remote; pronouns he/him…"
          onChange={(e) => set("extra", e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Only used to fill application forms on your PC.</p>
        <Button type="submit" disabled={saving} className="gap-1.5">
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save profile
        </Button>
      </div>
    </form>
  );
}
