-- Keep the public client portal on the normalized asset_list_rows data.
-- Safe to run repeatedly.

create or replace function public.get_public_client_planning(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with share as (
    select project_id, planning_type, planning_version, created_at
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
