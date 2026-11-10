-- The member chooses what their own screen shows. This does not grant a role.
alter table public.profiles
  add column if not exists show_name boolean not null default true,
  add column if not exists show_photo boolean not null default true;

comment on column public.profiles.show_name is
  'When false, this person''s screen does not show the display name.';
comment on column public.profiles.show_photo is
  'When false, this person''s screen does not show the LinkedIn photo.';
