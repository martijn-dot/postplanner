create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

drop policy if exists "Authenticated users can read app settings" on app_settings;
create policy "Authenticated users can read app settings"
  on app_settings for select
  to authenticated
  using (true);

drop policy if exists "Admins can manage app settings" on app_settings;
create policy "Admins can manage app settings"
  on app_settings for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
