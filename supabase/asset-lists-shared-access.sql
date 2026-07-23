-- Allow every authenticated team member to collaborate on Asset Lists for
-- active projects. Admins retain access to archived projects.

alter table public.asset_lists enable row level security;

drop policy if exists "Users can read asset lists for their projects" on public.asset_lists;
create policy "Users can read asset lists for their projects"
on public.asset_lists for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = asset_lists.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can insert asset lists for their projects" on public.asset_lists;
create policy "Users can insert asset lists for their projects"
on public.asset_lists for insert
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = asset_lists.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can update asset lists for their projects" on public.asset_lists;
create policy "Users can update asset lists for their projects"
on public.asset_lists for update
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = asset_lists.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
)
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = asset_lists.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can delete asset lists for their projects" on public.asset_lists;
create policy "Users can delete asset lists for their projects"
on public.asset_lists for delete
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.projects
    where projects.id = asset_lists.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);
