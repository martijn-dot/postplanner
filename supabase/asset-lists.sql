create table if not exists public.asset_lists (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Asset list',
  sort_order integer not null default 0,
  global_separator text not null default '_',
  filename_options jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asset_lists
  add column if not exists categories jsonb not null default '[]'::jsonb;

alter table public.asset_lists enable row level security;

drop policy if exists "Users can read asset lists for their projects" on public.asset_lists;
create policy "Users can read asset lists for their projects"
on public.asset_lists for select
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and projects.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert asset lists for their projects" on public.asset_lists;
create policy "Users can insert asset lists for their projects"
on public.asset_lists for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and projects.user_id = auth.uid()
  )
);

drop policy if exists "Users can update asset lists for their projects" on public.asset_lists;
create policy "Users can update asset lists for their projects"
on public.asset_lists for update
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and projects.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and projects.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete asset lists for their projects" on public.asset_lists;
create policy "Users can delete asset lists for their projects"
on public.asset_lists for delete
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and projects.user_id = auth.uid()
  )
);
