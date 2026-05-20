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
