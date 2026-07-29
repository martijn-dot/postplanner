alter table public.labels
  add column if not exists text_color text not null default 'black';

alter table public.labels
  drop constraint if exists labels_text_color_check;

alter table public.labels
  add constraint labels_text_color_check
  check (text_color in ('black', 'white'));

notify pgrst, 'reload schema';
