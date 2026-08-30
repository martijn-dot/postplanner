-- Roval complete staging database setup

-- Run this entire file in a fresh Supabase project SQL Editor.

-- Safe to rerun. Generated from the current canonical schema and required feature layers.

begin;

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
  preferred_planning_version text not null default 'V1',
  production_planning_view text not null default 'gantt' check (production_planning_view in ('gantt', 'table'))
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
alter table public.projects add column if not exists production_planning_view text not null default 'gantt';

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
  planning_type text not null default 'post',
  planning_version text not null default 'V1',
  name text not null,
  sort_order int not null default 0
);

create table if not exists public.line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  planning_type text not null default 'post',
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

alter table public.categories add column if not exists planning_type text not null default 'post';
alter table public.categories add column if not exists planning_version text not null default 'V1';
alter table public.line_items add column if not exists planning_type text not null default 'post';
alter table public.line_items add column if not exists planning_version text not null default 'V1';
alter table public.line_items add column if not exists time text not null default '';
alter table public.line_items add column if not exists notes text not null default '';
alter table public.line_items add column if not exists row_color text not null default '';

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  column_type text not null check (column_type in ('who', 'what', 'todo', 'asset_type', 'asset_ratio', 'asset_unique_ratio', 'asset_platform', 'asset_static_type', 'asset_static_size')),
  value text not null,
  color text not null default '#8bb9ff',
  is_default boolean not null default false,
  sort_order int not null default 0,
  is_divider boolean not null default false,
  scope text not null default 'global' check (scope in ('global', 'project')),
  planning_type text not null default 'both' check (planning_type in ('post', 'production', 'both')),
  unique(project_id, column_type, value)
);

alter table public.labels add column if not exists scope text not null default 'global' check (scope in ('global', 'project'));
alter table public.labels add column if not exists sort_order int not null default 0;
alter table public.labels add column if not exists is_divider boolean not null default false;
alter table public.labels add column if not exists planning_type text not null default 'both' check (planning_type in ('post', 'production', 'both'));

alter table public.labels drop constraint if exists labels_column_type_check;
alter table public.labels add constraint labels_column_type_check
  check (column_type in ('who', 'what', 'todo', 'asset_type', 'asset_ratio', 'asset_unique_ratio', 'asset_platform', 'asset_static_type', 'asset_static_size'));

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
  planning_type text not null default 'post',
  planning_version text not null default 'V1',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.public_share_links add column if not exists planning_type text not null default 'post';
alter table public.public_share_links add column if not exists planning_version text not null default 'V1';

create table if not exists public.project_presence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  page_type text not null default 'timeline',
  planning_type text not null default 'post',
  planning_version text not null default 'V1',
  last_seen_at timestamptz default now(),
  unique(project_id, user_id)
);

alter table public.project_presence add column if not exists page_type text not null default 'timeline';
alter table public.project_presence add column if not exists planning_type text not null default 'post';
alter table public.project_presence add column if not exists planning_version text not null default 'V1';

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
  abbreviation text check (abbreviation is null or abbreviation ~ '^[A-Z]{2}$'),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.clients
  add column if not exists abbreviation text;

alter table public.clients
  drop constraint if exists clients_abbreviation_check;

alter table public.clients
  add constraint clients_abbreviation_check check (abbreviation is null or abbreviation ~ '^[A-Z]{2}$');

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
drop policy if exists "Admins can update clients" on public.clients;
drop policy if exists "Admins can delete clients" on public.clients;
drop policy if exists "Users can read producers" on public.producers;
drop policy if exists "Users can create producers" on public.producers;
drop policy if exists "Admins can update producers" on public.producers;
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

create policy "Admins can update clients"
on public.clients for update
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete clients"
on public.clients for delete
using (public.is_admin());

create or replace function public.rename_client(
  current_client_name text,
  next_client_name text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cleaned_name text := btrim(next_client_name);
begin
  if not public.is_admin() then
    raise exception 'Only administrators can rename clients.';
  end if;

  if cleaned_name = '' then
    raise exception 'Client name cannot be empty.';
  end if;

  update public.clients
  set name = cleaned_name
  where name = current_client_name;

  if not found then
    raise exception 'Client could not be found.';
  end if;

  update public.projects
  set client = cleaned_name
  where client = current_client_name;
end;
$$;

grant execute on function public.rename_client(text, text) to authenticated;

create policy "Users can read producers"
on public.producers for select
using (auth.role() = 'authenticated');

create policy "Users can create producers"
on public.producers for insert
with check (auth.role() = 'authenticated');

create policy "Admins can update producers"
on public.producers for update
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete producers"
on public.producers for delete
using (public.is_admin());

create or replace function public.rename_producer(
  current_producer_name text,
  next_producer_name text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cleaned_name text := btrim(next_producer_name);
begin
  if not public.is_admin() then
    raise exception 'Only administrators can rename producers.';
  end if;

  if cleaned_name = '' then
    raise exception 'Producer name cannot be empty.';
  end if;

  update public.producers
  set name = cleaned_name
  where name = current_producer_name;

  if not found then
    raise exception 'Producer could not be found.';
  end if;

  update public.projects
  set post_producer = cleaned_name
  where post_producer = current_producer_name;

  update public.projects
  set producer = cleaned_name
  where producer = current_producer_name;
end;
$$;

grant execute on function public.rename_producer(text, text) to authenticated;

notify pgrst, 'reload schema';

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
  (null, 'what', 'Prep', '#28b8ff', true, 'global'),
  (null, 'what', 'Pre-light', '#8d79ff', true, 'global'),
  (null, 'what', 'Strike', '#ff8f4f', true, 'global'),
  (null, 'what', 'Travel', '#10b981', true, 'global'),
  (null, 'todo', 'Share', '#46d39b', true, 'global'),
  (null, 'todo', 'Viewing at Wenneker', '#46d39b', true, 'global'),
  (null, 'todo', 'Session at Wenneker', '#46d39b', true, 'global'),
  (null, 'todo', 'Viewing online', '#46d39b', true, 'global'),
  (null, 'todo', 'Share Feedback', '#54c7ff', true, 'global'),
  (null, 'todo', 'Approval', '#b793ff', true, 'global'),
  (null, 'todo', 'Internal', '#8b8f9a', true, 'global'),
  (null, 'todo', 'Upload PAL & EG+', '#ff5e84', true, 'global'),
  (null, 'todo', 'Upload DAM', '#ff5e84', true, 'global'),
  (null, 'todo', 'Upload SAL', '#ff5e84', true, 'global'),
  (null, 'todo', 'Schedule', '#46d39b', true, 'global'),
  (null, 'todo', 'Book crew', '#28b8ff', true, 'global'),
  (null, 'todo', 'Confirm talent', '#b793ff', true, 'global'),
  (null, 'todo', 'Location check', '#f59e0b', true, 'global'),
  (null, 'todo', 'Call sheet', '#ff8f4f', true, 'global')
on conflict do nothing;


-- Asset lists
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


-- Shared asset-list access
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


-- Application settings
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

drop policy if exists "Authenticated users can read app settings" on app_settings;
create policy "Authenticated users can read app settings"
  on app_settings for select
  to authenticated
  using (true);

drop policy if exists "Admins can manage app settings" on app_settings;
create policy "Admins can manage app settings"
  on app_settings for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );


-- Project briefs
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


-- Collaborative editing, normalized asset rows, indexes, and reorder functions
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


-- Current label planning availability
alter table public.labels
  add column if not exists planning_type text not null default 'both'
  check (planning_type in ('post', 'production', 'both'));

update public.labels
set planning_type = 'production'
where column_type in ('what', 'todo')
  and lower(btrim(value)) in (
    'prep', 'pre-light', 'shoot', 'strike', 'travel',
    'schedule', 'book crew', 'confirm talent', 'location check', 'call sheet'
  );

update public.labels
set planning_type = 'post'
where column_type in ('what', 'todo')
  and planning_type = 'both'
  and lower(btrim(value)) not in (
    'prep', 'pre-light', 'shoot', 'strike', 'travel',
    'schedule', 'book crew', 'confirm talent', 'location check', 'call sheet'
  );


-- Final public Client Portal payload
-- Keep the public client portal on the normalized asset_list_rows data.
-- Safe to run repeatedly.

create or replace function public.get_public_client_planning(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with portal_share as (
    select project_id, planning_type, planning_version, created_at
    from public.public_share_links
    where token = share_token
      and page_type = 'client_planning'
      and revoked_at is null
    limit 1
  ),
  published_plannings as (
    select link.project_id, link.planning_type, link.planning_version, link.created_at
    from public.public_share_links link
    join portal_share portal on portal.project_id = link.project_id
    where link.page_type = 'client_planning'
      and link.revoked_at is null
  )
  select jsonb_build_object(
    'project', (
      select to_jsonb(p)
      from public.projects p
      join portal_share s on s.project_id = p.id
    ),
    'share', (
      select jsonb_build_object(
        'project_id', s.project_id,
        'planning_type', s.planning_type,
        'planning_version', s.planning_version,
        'created_at', coalesce((select min(created_at) from published_plannings), s.created_at)
      )
      from portal_share s
    ),
    'publishedPlannings', coalesce((
      select jsonb_agg(to_jsonb(published) order by published.planning_type, published.planning_version)
      from published_plannings published
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order)
      from public.categories c
      join portal_share s on s.project_id = c.project_id
      where exists (
        select 1
        from published_plannings published
        where published.project_id = c.project_id
          and published.planning_type = c.planning_type
          and published.planning_version = c.planning_version
      )
    ), '[]'::jsonb),
    'lineItems', coalesce((
      select jsonb_agg(to_jsonb(li) order by li.sort_order)
      from public.line_items li
      join portal_share s on s.project_id = li.project_id
      where exists (
        select 1
        from published_plannings published
        where published.project_id = li.project_id
          and published.planning_type = li.planning_type
          and published.planning_version = li.planning_version
      )
    ), '[]'::jsonb),
    'labels', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.column_type, l.value)
      from public.labels l
      join portal_share s on l.project_id is null or l.project_id = s.project_id
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
                'asset_status', coalesce(alr.data->>'asset_status', ''),
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
      join portal_share s on s.project_id = al.project_id
    ), '[]'::jsonb),
    'clients', coalesce((
      select jsonb_agg(to_jsonb(cl) order by cl.name)
      from public.clients cl
    ), '[]'::jsonb)
  )
  from portal_share;
$$;

grant execute on function public.get_public_client_planning(text) to anon, authenticated;


notify pgrst, 'reload schema';

commit;
