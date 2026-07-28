alter table public.projects
add column if not exists production_planning_view text not null default 'gantt';

alter table public.projects
drop constraint if exists projects_production_planning_view_check;

alter table public.projects
add constraint projects_production_planning_view_check
check (production_planning_view in ('gantt', 'table'));
