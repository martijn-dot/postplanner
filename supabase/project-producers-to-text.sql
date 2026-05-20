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
