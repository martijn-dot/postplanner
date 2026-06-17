alter table public.categories add column if not exists planning_type text not null default 'post';
alter table public.line_items add column if not exists planning_type text not null default 'post';
alter table public.public_share_links add column if not exists planning_type text not null default 'post';
alter table public.public_share_links add column if not exists planning_version text not null default 'V1';

update public.categories
set planning_type = 'post'
where planning_type is null or btrim(planning_type) = '';

update public.line_items
set planning_type = 'post'
where planning_type is null or btrim(planning_type) = '';

update public.public_share_links
set planning_type = 'post'
where planning_type is null or btrim(planning_type) = '';

update public.public_share_links
set planning_version = 'V1'
where planning_version is null or btrim(planning_version) = '';

insert into public.labels (project_id, column_type, value, color, is_default, scope) values
  (null, 'what', 'Prep', '#28b8ff', true, 'global'),
  (null, 'what', 'Pre-light', '#8d79ff', true, 'global'),
  (null, 'what', 'Strike', '#ff8f4f', true, 'global'),
  (null, 'what', 'Travel', '#10b981', true, 'global'),
  (null, 'todo', 'Schedule', '#46d39b', true, 'global'),
  (null, 'todo', 'Book crew', '#28b8ff', true, 'global'),
  (null, 'todo', 'Confirm talent', '#b793ff', true, 'global'),
  (null, 'todo', 'Location check', '#f59e0b', true, 'global'),
  (null, 'todo', 'Call sheet', '#ff8f4f', true, 'global')
on conflict do nothing;

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
    ), '[]'::jsonb),
    'clients', coalesce((
      select jsonb_agg(to_jsonb(cl) order by cl.name)
      from public.clients cl
    ), '[]'::jsonb)
  )
  from share;
$$;

grant execute on function public.get_public_client_planning(text) to anon, authenticated;
