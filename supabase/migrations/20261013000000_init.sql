-- Jobtrail schema: resumes, applications, activity timeline. Every row is owned
-- by one auth user and locked to them with RLS.

create type public.application_status as enum
  ('wishlist', 'applied', 'interview', 'offer', 'rejected');

create type public.work_mode as enum ('remote', 'hybrid', 'onsite');

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  file_path text,
  content text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null,
  role text not null,
  status public.application_status not null default 'wishlist',
  position double precision not null default 0,
  location text,
  work_mode public.work_mode,
  salary text,
  job_url text,
  source text,
  job_description text,
  resume_id uuid references public.resumes (id) on delete set null,
  applied_at date,
  follow_up_at date,
  notes text,
  ai_match jsonb,
  cover_letter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  kind text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index applications_user_status_idx on public.applications (user_id, status, position);
create index applications_resume_idx on public.applications (resume_id);
create index activities_application_idx on public.activities (application_id, created_at desc);
create index activities_user_idx on public.activities (user_id, created_at desc);
create index resumes_user_idx on public.resumes (user_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

alter table public.resumes enable row level security;
alter table public.applications enable row level security;
alter table public.activities enable row level security;

create policy "own resumes" on public.resumes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own applications" on public.applications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own activities" on public.activities for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Private bucket for resume PDFs, one folder per user: <uid>/<file>.pdf
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false);

create policy "own resume files read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own resume files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own resume files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
