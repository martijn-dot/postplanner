alter table public.labels add column if not exists sort_order int not null default 0;
alter table public.labels add column if not exists is_divider boolean not null default false;

with ordered as (
  select
    id,
    row_number() over (
      partition by coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), column_type
      order by is_default desc, value, id
    ) - 1 as next_sort_order
  from public.labels
  where sort_order = 0
)
update public.labels l
set sort_order = ordered.next_sort_order
from ordered
where l.id = ordered.id;
