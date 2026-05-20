delete from public.labels
where project_id is null
  and scope = 'global'
  and column_type = 'todo';

insert into public.labels (project_id, column_type, value, color, is_default, scope, sort_order, is_divider) values
  (null, 'todo', 'Share', '#46d39b', true, 'global', 0, false),
  (null, 'todo', 'Viewing at Wenneker', '#46d39b', true, 'global', 1, false),
  (null, 'todo', 'Session at Wenneker', '#46d39b', true, 'global', 2, false),
  (null, 'todo', 'Viewing online', '#46d39b', true, 'global', 3, false),
  (null, 'todo', 'Share Feedback', '#54c7ff', true, 'global', 4, false),
  (null, 'todo', 'Approval', '#b793ff', true, 'global', 5, false),
  (null, 'todo', 'Internal', '#8b8f9a', true, 'global', 6, false),
  (null, 'todo', 'Upload PAL & EG+', '#ff5e84', true, 'global', 7, false),
  (null, 'todo', 'Upload DAM', '#ff5e84', true, 'global', 8, false),
  (null, 'todo', 'Upload SAL', '#ff5e84', true, 'global', 9, false)
on conflict do nothing;
