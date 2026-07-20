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
