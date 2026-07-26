drop policy if exists "Admins can update producers" on public.producers;

create policy "Admins can update producers"
on public.producers for update
using (public.is_admin())
with check (public.is_admin());

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
