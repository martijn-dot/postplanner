alter table public.projects add column if not exists planning_versions text[] not null default array['V1'];
alter table public.projects add column if not exists preferred_planning_version text not null default 'V1';
alter table public.categories add column if not exists planning_version text not null default 'V1';
alter table public.line_items add column if not exists planning_version text not null default 'V1';

update public.projects
set planning_versions = array['V1']
where planning_versions is null or cardinality(planning_versions) = 0;

update public.projects
set preferred_planning_version = coalesce(preferred_planning_version, 'V1');

update public.categories
set planning_version = 'V1'
where planning_version is null or btrim(planning_version) = '';

update public.line_items
set planning_version = 'V1'
where planning_version is null or btrim(planning_version) = '';
