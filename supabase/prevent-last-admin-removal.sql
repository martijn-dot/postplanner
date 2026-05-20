create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.is_active = true and not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'admin' and is_active = true
    ) then
      raise exception 'At least one admin should remain.';
    end if;
    return old;
  end if;

  if old.role = 'admin'
    and old.is_active = true
    and (new.role <> 'admin' or new.is_active = false)
    and not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'admin' and is_active = true
    )
  then
    raise exception 'At least one admin should remain.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_last_admin_update on public.profiles;
create trigger prevent_last_admin_update
before update or delete on public.profiles
for each row execute procedure public.prevent_last_admin_removal();
