-- One collaborative briefing document per project.
create table if not exists public.project_briefs (
  project_id uuid primary key references public.projects(id) on delete cascade,
  title text not null default 'Project brief',
  content text not null default '',
  links jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_briefs enable row level security;

drop policy if exists "Users can read briefs for their projects" on public.project_briefs;
create policy "Users can read briefs for their projects"
on public.project_briefs for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = project_briefs.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can create briefs for their projects" on public.project_briefs;
create policy "Users can create briefs for their projects"
on public.project_briefs for insert
with check (
  auth.role() = 'authenticated'
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.projects
    where projects.id = project_briefs.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can update briefs for their projects" on public.project_briefs;
create policy "Users can update briefs for their projects"
on public.project_briefs for update
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = project_briefs.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
)
with check (
  auth.role() = 'authenticated'
  and updated_by = auth.uid()
  and exists (
    select 1
    from public.projects
    where projects.id = project_briefs.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

create index if not exists project_briefs_updated_at_idx
  on public.project_briefs (updated_at desc);
