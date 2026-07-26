create or replace function public.rename_client(
  current_client_name text,
  next_client_name text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cleaned_name text := btrim(next_client_name);
begin
  if not public.is_admin() then
    raise exception 'Only administrators can rename clients.';
  end if;

  if cleaned_name = '' then
    raise exception 'Client name cannot be empty.';
  end if;

  update public.clients
  set name = cleaned_name
  where name = current_client_name;

  if not found then
    raise exception 'Client could not be found.';
  end if;

  update public.projects
  set client = cleaned_name
  where client = current_client_name;
end;
$$;

grant execute on function public.rename_client(text, text) to authenticated;

notify pgrst, 'reload schema';
