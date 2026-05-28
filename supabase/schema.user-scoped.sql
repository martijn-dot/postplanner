create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now(),
  invited_by uuid references public.profiles(id),
  is_active boolean not null default true
);

alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text,
  name text not null,
  client text,
  post_producer text,
  producer text,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references public.profiles(id),
  last_edited_by uuid references public.profiles(id),
  last_edited_at timestamptz default now(),
  is_archived boolean default false,
  archived_by uuid references public.profiles(id),
  archived_at timestamptz,
  planning_versions text[] not null default array['V1'],
  preferred_planning_version text not null default 'V1'
);

alter table public.projects add column if not exists project_number text;
alter table public.projects add column if not exists post_producer text;
alter table public.projects add column if not exists producer text;
alter table public.projects add column if not exists created_by uuid references public.profiles(id);
alter table public.projects add column if not exists last_edited_by uuid references public.profiles(id);
alter table public.projects add column if not exists last_edited_at timestamptz default now();
alter table public.projects add column if not exists is_archived boolean default false;
alter table public.projects add column if not exists archived_by uuid references public.profiles(id);
alter table public.projects add column if not exists archived_at timestamptz;
alter table public.projects add column if not exists planning_versions text[] not null default array['V1'];
alter table public.projects add column if not exists preferred_planning_version text not null default 'V1';

do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'post_producer'
      and data_type = 'uuid'
  ) then
    alter table public.projects add column if not exists post_producer_text text;
    update public.projects p
    set post_producer_text = pr.display_name
    from public.profiles pr
    where p.post_producer = pr.id;
    update public.projects
    set post_producer_text = post_producer::text
    where post_producer is not null and post_producer_text is null;

    for constraint_name in
      select tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'projects'
        and kcu.column_name = 'post_producer'
    loop
      execute format('alter table public.projects drop constraint if exists %I', constraint_name);
    end loop;

    alter table public.projects drop column post_producer;
    alter table public.projects rename column post_producer_text to post_producer;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'producer'
      and data_type = 'uuid'
  ) then
    alter table public.projects add column if not exists producer_text text;
    update public.projects p
    set producer_text = pr.display_name
    from public.profiles pr
    where p.producer = pr.id;
    update public.projects
    set producer_text = producer::text
    where producer is not null and producer_text is null;

    for constraint_name in
      select tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'projects'
        and kcu.column_name = 'producer'
    loop
      execute format('alter table public.projects drop constraint if exists %I', constraint_name);
    end loop;

    alter table public.projects drop column producer;
    alter table public.projects rename column producer_text to producer;
  end if;
end $$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  planning_version text not null default 'V1',
  name text not null,
  sort_order int not null default 0
);

create table if not exists public.line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  planning_version text not null default 'V1',
  category_id uuid references public.categories(id) on delete set null,
  who text[] not null default '{}',
  asset text not null default '',
  what text not null default '',
  todo text not null default '',
  time text not null default '',
  notes text not null default '',
  row_color text not null default '',
  start_date date,
  end_date date,
  sort_order int not null default 0,
  constraint line_items_valid_range check (start_date is null or end_date is null or end_date >= start_date)
);

alter table public.categories add column if not exists planning_version text not null default 'V1';
alter table public.line_items add column if not exists planning_version text not null default 'V1';
alter table public.line_items add column if not exists time text not null default '';
alter table public.line_items add column if not exists notes text not null default '';
alter table public.line_items add column if not exists row_color text not null default '';

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  column_type text not null check (column_type in ('who', 'what', 'todo')),
  value text not null,
  color text not null default '#8bb9ff',
  is_default boolean not null default false,
  sort_order int not null default 0,
  is_divider boolean not null default false,
  scope text not null default 'global' check (scope in ('global', 'project')),
  unique(project_id, column_type, value)
);

alter table public.labels add column if not exists scope text not null default 'global' check (scope in ('global', 'project'));
alter table public.labels add column if not exists sort_order int not null default 0;
alter table public.labels add column if not exists is_divider boolean not null default false;

with ranked_labels as (
  select
    id,
    row_number() over (
      partition by coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), column_type, lower(btrim(value))
      order by is_default desc, id
    ) as duplicate_rank
  from public.labels
)
delete from public.labels
where id in (select id from ranked_labels where duplicate_rank > 1);

create unique index if not exists labels_unique_scope_type_value
on public.labels (
  (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  column_type,
  (lower(btrim(value)))
);

create table if not exists public.public_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token text not null unique,
  page_type text not null default 'client_planning' check (page_type in ('client_planning')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.project_presence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_seen_at timestamptz default now(),
  unique(project_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references public.profiles(id),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  accepted boolean default false,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.producers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.categories enable row level security;
alter table public.line_items enable row level security;
alter table public.labels enable row level security;
alter table public.public_share_links enable row level security;
alter table public.project_presence enable row level security;
alter table public.invitations enable row level security;
alter table public.clients enable row level security;
alter table public.producers enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'User'), '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.is_active = true and not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'admin' and is_active = true
    ) then
      raise exception 'At least one admin should remain.';
    end if;
    return old;
  end if;

  if old.role = 'admin'
    and old.is_active = true
    and (new.role <> 'admin' or new.is_active = false)
    and not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'admin' and is_active = true
    )
  then
    raise exception 'At least one admin should remain.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_last_admin_update on public.profiles;
create trigger prevent_last_admin_update
before update or delete on public.profiles
for each row execute procedure public.prevent_last_admin_removal();

drop trigger if exists prevent_non_admin_role_update on public.profiles;
create trigger prevent_non_admin_role_update
before update on public.profiles
for each row execute procedure public.prevent_non_admin_role_change();

drop policy if exists "Users can read their projects" on public.projects;
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Users can create their projects" on public.projects;
drop policy if exists "Users can update their projects" on public.projects;
drop policy if exists "Users can delete their projects" on public.projects;
drop policy if exists "Users can read categories in their projects" on public.categories;
drop policy if exists "Users can create categories in their projects" on public.categories;
drop policy if exists "Users can update categories in their projects" on public.categories;
drop policy if exists "Users can delete categories in their projects" on public.categories;
drop policy if exists "Users can read line items in their projects" on public.line_items;
drop policy if exists "Users can create line items in their projects" on public.line_items;
drop policy if exists "Users can update line items in their projects" on public.line_items;
drop policy if exists "Users can delete line items in their projects" on public.line_items;
drop policy if exists "Users can read default and project labels" on public.labels;
drop policy if exists "Users can create labels in their projects" on public.labels;
drop policy if exists "Users can update labels in their projects" on public.labels;
drop policy if exists "Users can delete labels in their projects" on public.labels;
drop policy if exists "Users can read share links in their projects" on public.public_share_links;
drop policy if exists "Users can create share links in their projects" on public.public_share_links;
drop policy if exists "Users can update share links in their projects" on public.public_share_links;
drop policy if exists "Users can delete share links in their projects" on public.public_share_links;
drop policy if exists "Presence is readable by authenticated users" on public.project_presence;
drop policy if exists "Users manage their own presence" on public.project_presence;
drop policy if exists "Users update their own presence" on public.project_presence;
drop policy if exists "Users delete their own presence" on public.project_presence;
drop policy if exists "Admins read invitations" on public.invitations;
drop policy if exists "Admins create invitations" on public.invitations;
drop policy if exists "Users can read clients" on public.clients;
drop policy if exists "Users can create clients" on public.clients;
drop policy if exists "Admins can delete clients" on public.clients;
drop policy if exists "Users can read producers" on public.producers;
drop policy if exists "Users can create producers" on public.producers;
drop policy if exists "Admins can delete producers" on public.producers;

create policy "Users can read their projects"
on public.projects for select
using (public.is_admin() or coalesce(is_archived, false) = false);

create policy "Users can create their projects"
on public.projects for insert
with check (auth.uid() = user_id and coalesce(is_archived, false) = false);

create policy "Users can update their projects"
on public.projects for update
using (public.is_admin() or coalesce(is_archived, false) = false)
with check (public.is_admin() or auth.uid() = user_id);

create policy "Users can delete their projects"
on public.projects for delete
using (public.is_admin());

create policy "Profiles are readable by authenticated users"
on public.profiles for select
using (auth.role() = 'authenticated');

create policy "Admins can update profiles"
on public.profiles for update
using (public.is_admin())
with check (public.is_admin());

create policy "Users can update their own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read categories in their projects"
on public.categories for select
using (exists (select 1 from public.projects where projects.id = categories.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can create categories in their projects"
on public.categories for insert
with check (exists (select 1 from public.projects where projects.id = categories.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can update categories in their projects"
on public.categories for update
using (exists (select 1 from public.projects where projects.id = categories.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)))
with check (exists (select 1 from public.projects where projects.id = categories.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can delete categories in their projects"
on public.categories for delete
using (exists (select 1 from public.projects where projects.id = categories.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can read line items in their projects"
on public.line_items for select
using (exists (select 1 from public.projects where projects.id = line_items.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can create line items in their projects"
on public.line_items for insert
with check (exists (select 1 from public.projects where projects.id = line_items.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can update line items in their projects"
on public.line_items for update
using (exists (select 1 from public.projects where projects.id = line_items.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)))
with check (exists (select 1 from public.projects where projects.id = line_items.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can delete line items in their projects"
on public.line_items for delete
using (exists (select 1 from public.projects where projects.id = line_items.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can read default and project labels"
on public.labels for select
using (
  scope = 'global'
  or project_id is null
  or exists (select 1 from public.projects where projects.id = labels.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false))
);

create policy "Users can create labels in their projects"
on public.labels for insert
with check (
  (public.is_admin() and scope = 'global' and project_id is null)
  or (scope = 'project' and project_id is not null and exists (select 1 from public.projects where projects.id = labels.project_id and coalesce(projects.is_archived, false) = false))
);

create policy "Users can update labels in their projects"
on public.labels for update
using ((public.is_admin() and scope = 'global') or exists (select 1 from public.projects where projects.id = labels.project_id and coalesce(projects.is_archived, false) = false))
with check ((public.is_admin() and scope = 'global') or (scope = 'project' and exists (select 1 from public.projects where projects.id = labels.project_id and coalesce(projects.is_archived, false) = false)));

create policy "Users can delete labels in their projects"
on public.labels for delete
using ((public.is_admin() and scope = 'global') or exists (select 1 from public.projects where projects.id = labels.project_id and coalesce(projects.is_archived, false) = false));

create policy "Users can read share links in their projects"
on public.public_share_links for select
using (exists (select 1 from public.projects where projects.id = public_share_links.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can create share links in their projects"
on public.public_share_links for insert
with check (exists (select 1 from public.projects where projects.id = public_share_links.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can update share links in their projects"
on public.public_share_links for update
using (exists (select 1 from public.projects where projects.id = public_share_links.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)))
with check (exists (select 1 from public.projects where projects.id = public_share_links.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Users can delete share links in their projects"
on public.public_share_links for delete
using (exists (select 1 from public.projects where projects.id = public_share_links.project_id and (public.is_admin() or coalesce(projects.is_archived, false) = false)));

create policy "Presence is readable by authenticated users"
on public.project_presence for select
using (auth.role() = 'authenticated');

create policy "Users manage their own presence"
on public.project_presence for insert
with check (auth.uid() = user_id);

create policy "Users update their own presence"
on public.project_presence for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete their own presence"
on public.project_presence for delete
using (auth.uid() = user_id);

create policy "Admins read invitations"
on public.invitations for select
using (public.is_admin());

create policy "Admins create invitations"
on public.invitations for insert
with check (public.is_admin() and auth.uid() = invited_by);

create policy "Users can read clients"
on public.clients for select
using (auth.role() = 'authenticated');

create policy "Users can create clients"
on public.clients for insert
with check (auth.role() = 'authenticated');

create policy "Admins can delete clients"
on public.clients for delete
using (public.is_admin());

create policy "Users can read producers"
on public.producers for select
using (auth.role() = 'authenticated');

create policy "Users can create producers"
on public.producers for insert
with check (auth.role() = 'authenticated');

create policy "Admins can delete producers"
on public.producers for delete
using (public.is_admin());

create or replace function public.get_public_client_planning(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with share as (
    select project_id
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
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order)
      from public.categories c
      join share s on s.project_id = c.project_id
    ), '[]'::jsonb),
    'lineItems', coalesce((
      select jsonb_agg(to_jsonb(li) order by li.sort_order)
      from public.line_items li
      join share s on s.project_id = li.project_id
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

insert into public.labels (project_id, column_type, value, color, is_default, scope) values
  (null, 'who', 'Wenneker', '#8bb9ff', true, 'global'),
  (null, 'who', 'Client', '#ffd166', true, 'global'),
  (null, 'who', 'Agency', '#caa8ff', true, 'global'),
  (null, 'what', 'Offline V1', '#ffd166', true, 'global'),
  (null, 'what', 'Offline V2', '#ffd166', true, 'global'),
  (null, 'what', 'Offline V3', '#ffd166', true, 'global'),
  (null, 'what', 'Offline Final', '#ffd166', true, 'global'),
  (null, 'what', 'Offline Lock', '#b793ff', true, 'global'),
  (null, 'what', 'PreFinal', '#54c7ff', true, 'global'),
  (null, 'what', 'PreFinal V1', '#54c7ff', true, 'global'),
  (null, 'what', 'PreFinal V2', '#54c7ff', true, 'global'),
  (null, 'what', 'Final', '#ff5e84', true, 'global'),
  (null, 'what', 'Final Delivery', '#46d39b', true, 'global'),
  (null, 'what', 'Grading', '#8b8f9a', true, 'global'),
  (null, 'what', 'Audio', '#8b8f9a', true, 'global'),
  (null, 'what', '360 V1', '#9a6a43', true, 'global'),
  (null, 'what', '360 V2', '#9a6a43', true, 'global'),
  (null, 'what', 'CGI WIP V1', '#ff8f4f', true, 'global'),
  (null, 'what', 'CGI WIP V2', '#ff8f4f', true, 'global'),
  (null, 'what', 'CGI WIP V3', '#ff8f4f', true, 'global'),
  (null, 'what', 'CGI Lock', '#b793ff', true, 'global'),
  (null, 'what', 'DesignV1', '#f45fd2', true, 'global'),
  (null, 'what', 'Design V2', '#f45fd2', true, 'global'),
  (null, 'what', 'Design V3', '#f45fd2', true, 'global'),
  (null, 'what', 'Photography V1', '#ffd166', true, 'global'),
  (null, 'what', 'Photography V2', '#ffd166', true, 'global'),
  (null, 'what', 'Creative V1', '#b793ff', true, 'global'),
  (null, 'what', 'Creative V2', '#b793ff', true, 'global'),
  (null, 'what', 'CAD/MUS/PGD', '#8b8f9a', true, 'global'),
  (null, 'what', 'CIMA', '#8b8f9a', true, 'global'),
  (null, 'what', 'Shoot', '#8b8f9a', true, 'global'),
  (null, 'todo', 'Share', '#46d39b', true, 'global'),
  (null, 'todo', 'Viewing at Wenneker', '#46d39b', true, 'global'),
  (null, 'todo', 'Session at Wenneker', '#46d39b', true, 'global'),
  (null, 'todo', 'Viewing online', '#46d39b', true, 'global'),
  (null, 'todo', 'Share Feedback', '#54c7ff', true, 'global'),
  (null, 'todo', 'Approval', '#b793ff', true, 'global'),
  (null, 'todo', 'Internal', '#8b8f9a', true, 'global'),
  (null, 'todo', 'Upload PAL & EG+', '#ff5e84', true, 'global'),
  (null, 'todo', 'Upload DAM', '#ff5e84', true, 'global'),
  (null, 'todo', 'Upload SAL', '#ff5e84', true, 'global')
on conflict do nothing;
