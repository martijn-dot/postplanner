alter table public.line_items
  add column if not exists row_color text not null default '';
