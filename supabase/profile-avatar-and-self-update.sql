alter table public.profiles add column if not exists avatar_url text;

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'Only admins can change roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_non_admin_role_update on public.profiles;
create trigger prevent_non_admin_role_update
before update on public.profiles
for each row execute procedure public.prevent_non_admin_role_change();

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);
