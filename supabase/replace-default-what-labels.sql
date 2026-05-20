delete from public.labels
where project_id is null
  and scope = 'global'
  and column_type = 'what';

insert into public.labels (project_id, column_type, value, color, is_default, scope, sort_order, is_divider) values
  (null, 'what', 'Offline V1', '#ffd166', true, 'global', 0, false),
  (null, 'what', 'Offline V2', '#ffd166', true, 'global', 1, false),
  (null, 'what', 'Offline V3', '#ffd166', true, 'global', 2, false),
  (null, 'what', 'Offline Final', '#ffd166', true, 'global', 3, false),
  (null, 'what', 'Offline Lock', '#b793ff', true, 'global', 4, false),
  (null, 'what', 'PreFinal', '#54c7ff', true, 'global', 5, false),
  (null, 'what', 'PreFinal V1', '#54c7ff', true, 'global', 6, false),
  (null, 'what', 'PreFinal V2', '#54c7ff', true, 'global', 7, false),
  (null, 'what', 'Final', '#ff5e84', true, 'global', 8, false),
  (null, 'what', 'Final Delivery', '#46d39b', true, 'global', 9, false),
  (null, 'what', 'Grading', '#8b8f9a', true, 'global', 10, false),
  (null, 'what', 'Audio', '#8b8f9a', true, 'global', 11, false),
  (null, 'what', '360 V1', '#9a6a43', true, 'global', 12, false),
  (null, 'what', '360 V2', '#9a6a43', true, 'global', 13, false),
  (null, 'what', 'CGI WIP V1', '#ff8f4f', true, 'global', 14, false),
  (null, 'what', 'CGI WIP V2', '#ff8f4f', true, 'global', 15, false),
  (null, 'what', 'CGI WIP V3', '#ff8f4f', true, 'global', 16, false),
  (null, 'what', 'CGI Lock', '#b793ff', true, 'global', 17, false),
  (null, 'what', 'DesignV1', '#f45fd2', true, 'global', 18, false),
  (null, 'what', 'Design V2', '#f45fd2', true, 'global', 19, false),
  (null, 'what', 'Design V3', '#f45fd2', true, 'global', 20, false),
  (null, 'what', 'Photography V1', '#ffd166', true, 'global', 21, false),
  (null, 'what', 'Photography V2', '#ffd166', true, 'global', 22, false),
  (null, 'what', 'Creative V1', '#b793ff', true, 'global', 23, false),
  (null, 'what', 'Creative V2', '#b793ff', true, 'global', 24, false),
  (null, 'what', 'CAD/MUS/PGD', '#8b8f9a', true, 'global', 25, false),
  (null, 'what', 'CIMA', '#8b8f9a', true, 'global', 26, false),
  (null, 'what', 'Shoot', '#8b8f9a', true, 'global', 27, false)
on conflict do nothing;
