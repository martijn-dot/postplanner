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
  auth.role() = 'authenticated'
  and
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can insert asset lists for their projects" on public.asset_lists;
create policy "Users can insert asset lists for their projects"
on public.asset_lists for insert
with check (
  auth.role() = 'authenticated'
  and
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can update asset lists for their projects" on public.asset_lists;
create policy "Users can update asset lists for their projects"
on public.asset_lists for update
using (
  auth.role() = 'authenticated'
  and
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
)
with check (
  auth.role() = 'authenticated'
  and
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can delete asset lists for their projects" on public.asset_lists;
create policy "Users can delete asset lists for their projects"
on public.asset_lists for delete
using (
  auth.role() = 'authenticated'
  and
  exists (
    select 1 from public.projects
    where projects.id = asset_lists.project_id
    and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

create or replace function public.get_public_client_planning(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with share as (
    select project_id, planning_type, planning_version
    from public.public_share_links
    where token = share_token
      and page_type = 'client_planning'
      and revoked_at is null
    limit 1
  )
  select jsonb_build_object(
    'project', (
      select to_jsonb(p)
      from public.projects p
      join share s on s.project_id = p.id
    ),
    'share', (
      select to_jsonb(s)
      from share s
    ),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order)
      from public.categories c
      join share s on s.project_id = c.project_id
      where c.planning_type = s.planning_type
        and c.planning_version = s.planning_version
    ), '[]'::jsonb),
    'lineItems', coalesce((
      select jsonb_agg(to_jsonb(li) order by li.sort_order)
      from public.line_items li
      join share s on s.project_id = li.project_id
      where li.planning_type = s.planning_type
        and li.planning_version = s.planning_version
    ), '[]'::jsonb),
    'labels', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.column_type, l.value)
      from public.labels l
      join share s on l.project_id is null or l.project_id = s.project_id
    ), '[]'::jsonb),
    'assetLists', coalesce((
      select jsonb_agg(to_jsonb(al) order by al.sort_order)
      from public.asset_lists al
      join share s on s.project_id = al.project_id
    ), '[]'::jsonb)
  )
  from share;
$$;

grant execute on function public.get_public_client_planning(text) to anon, authenticated;
