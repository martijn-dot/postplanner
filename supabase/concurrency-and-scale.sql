-- Production hardening for collaborative editing.
-- Safe to run more than once. The legacy asset_lists.rows column is retained
-- during rollout so older deployed clients keep working.

alter table public.projects add column if not exists revision bigint not null default 1;
alter table public.categories add column if not exists revision bigint not null default 1;
alter table public.categories add column if not exists updated_at timestamptz not null default now();
alter table public.line_items add column if not exists revision bigint not null default 1;
alter table public.line_items add column if not exists updated_at timestamptz not null default now();
alter table public.asset_lists add column if not exists revision bigint not null default 1;
alter table public.project_presence add column if not exists page_type text not null default 'timeline';
alter table public.project_presence add column if not exists planning_type text not null default 'post';
alter table public.project_presence add column if not exists planning_version text not null default 'V1';

create table if not exists public.asset_list_rows (
  id uuid primary key,
  asset_list_id uuid not null references public.asset_lists(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  number text not null default '',
  group_id text,
  values jsonb not null default '{}'::jsonb,
  notes text not null default '',
  ratio_parent_id uuid,
  ratio_value text,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asset_list_rows enable row level security;

insert into public.asset_list_rows (
  id, asset_list_id, project_id, number, group_id, values, notes,
  ratio_parent_id, ratio_value, sort_order, data
)
select
  (row_data->>'id')::uuid,
  list.id,
  list.project_id,
  coalesce(row_data->>'number', ''),
  nullif(row_data->>'group_id', ''),
  coalesce(row_data->'values', '{}'::jsonb),
  coalesce(row_data->>'notes', ''),
  case when nullif(row_data->>'ratio_parent_id', '') is null then null else (row_data->>'ratio_parent_id')::uuid end,
  row_data->>'ratio_value',
  coalesce((row_data->>'sort_order')::integer, row_ordinality::integer - 1),
  row_data - array['id', 'number', 'group_id', 'values', 'notes', 'ratio_parent_id', 'ratio_value', 'sort_order']
from public.asset_lists list
cross join lateral jsonb_array_elements(coalesce(list.rows, '[]'::jsonb))
  with ordinality as legacy(row_data, row_ordinality)
on conflict (id) do nothing;

drop policy if exists "Users can read asset list rows" on public.asset_list_rows;
create policy "Users can read asset list rows"
on public.asset_list_rows for select
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_list_rows.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can create asset list rows" on public.asset_list_rows;
create policy "Users can create asset list rows"
on public.asset_list_rows for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = asset_list_rows.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can update asset list rows" on public.asset_list_rows;
create policy "Users can update asset list rows"
on public.asset_list_rows for update
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_list_rows.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
)
with check (
  exists (
    select 1 from public.projects
    where projects.id = asset_list_rows.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

drop policy if exists "Users can delete asset list rows" on public.asset_list_rows;
create policy "Users can delete asset list rows"
on public.asset_list_rows for delete
using (
  exists (
    select 1 from public.projects
    where projects.id = asset_list_rows.project_id
      and (public.is_admin() or coalesce(projects.is_archived, false) = false)
  )
);

create index if not exists projects_active_last_edited_idx
  on public.projects (is_archived, last_edited_at desc, id);
create index if not exists categories_project_type_version_order_idx
  on public.categories (project_id, planning_type, planning_version, sort_order, id);
create index if not exists line_items_project_type_version_order_idx
  on public.line_items (project_id, planning_type, planning_version, sort_order, id);
create index if not exists line_items_category_order_idx
  on public.line_items (category_id, sort_order, id);
create index if not exists labels_project_type_order_idx
  on public.labels (project_id, column_type, sort_order, id);
create index if not exists presence_project_seen_idx
  on public.project_presence (project_id, last_seen_at desc);
create index if not exists presence_project_page_planning_seen_idx
  on public.project_presence (project_id, page_type, planning_type, planning_version, last_seen_at desc);
create index if not exists share_links_project_type_version_active_idx
  on public.public_share_links (project_id, planning_type, planning_version)
  where revoked_at is null;
create index if not exists asset_lists_project_order_idx
  on public.asset_lists (project_id, sort_order, id);
create index if not exists asset_list_rows_list_order_idx
  on public.asset_list_rows (asset_list_id, sort_order, id);
create index if not exists asset_list_rows_project_idx
  on public.asset_list_rows (project_id, asset_list_id);

create or replace function public.bump_collaboration_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.revision := old.revision + 1;
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists categories_bump_revision on public.categories;
create trigger categories_bump_revision before update on public.categories
for each row execute procedure public.bump_collaboration_revision();
drop trigger if exists line_items_bump_revision on public.line_items;
create trigger line_items_bump_revision before update on public.line_items
for each row execute procedure public.bump_collaboration_revision();
drop trigger if exists asset_lists_bump_revision on public.asset_lists;
create trigger asset_lists_bump_revision before update on public.asset_lists
for each row execute procedure public.bump_collaboration_revision();
drop trigger if exists asset_list_rows_bump_revision on public.asset_list_rows;
create trigger asset_list_rows_bump_revision before update on public.asset_list_rows
for each row execute procedure public.bump_collaboration_revision();

create or replace function public.reorder_categories(
  target_project_id uuid,
  target_planning_type text,
  target_planning_version text,
  ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.categories category
  set sort_order = ordering.ordinality - 1
  from unnest(ordered_ids) with ordinality as ordering(id, ordinality)
  where category.id = ordering.id
    and category.project_id = target_project_id
    and category.planning_type = target_planning_type
    and category.planning_version = target_planning_version;
end;
$$;

create or replace function public.reorder_line_items(
  target_project_id uuid,
  target_planning_type text,
  target_planning_version text,
  ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.line_items item
  set sort_order = ordering.ordinality - 1
  from unnest(ordered_ids) with ordinality as ordering(id, ordinality)
  where item.id = ordering.id
    and item.project_id = target_project_id
    and item.planning_type = target_planning_type
    and item.planning_version = target_planning_version;
end;
$$;

create or replace function public.reorder_asset_list_rows(
  target_asset_list_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.asset_list_rows row_item
  set sort_order = ordering.ordinality - 1
  from unnest(ordered_ids) with ordinality as ordering(id, ordinality)
  where row_item.id = ordering.id
    and row_item.asset_list_id = target_asset_list_id;
end;
$$;

grant execute on function public.reorder_categories(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.reorder_line_items(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.reorder_asset_list_rows(uuid, uuid[]) to authenticated;

alter table public.projects replica identity full;
alter table public.categories replica identity full;
alter table public.line_items replica identity full;
alter table public.labels replica identity full;
alter table public.asset_lists replica identity full;
alter table public.asset_list_rows replica identity full;
alter table public.project_presence replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.line_items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.asset_lists;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.asset_list_rows;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.project_presence;
exception when duplicate_object then null;
end $$;

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
    'share', (select to_jsonb(s) from share s),
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
      select jsonb_agg(
        to_jsonb(al) || jsonb_build_object(
          'rows',
          coalesce((
            select jsonb_agg(
              coalesce(alr.data, '{}'::jsonb)
              || jsonb_build_object(
                'id', alr.id,
                'number', alr.number,
                'group_id', alr.group_id,
                'values', alr.values,
                'notes', alr.notes,
                'ratio_parent_id', alr.ratio_parent_id,
                'ratio_value', alr.ratio_value,
                'sort_order', alr.sort_order,
                'revision', alr.revision,
                'updated_at', alr.updated_at
              )
              order by alr.sort_order, alr.id
            )
            from public.asset_list_rows alr
            where alr.asset_list_id = al.id
          ), '[]'::jsonb)
        )
        order by al.sort_order
      )
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
