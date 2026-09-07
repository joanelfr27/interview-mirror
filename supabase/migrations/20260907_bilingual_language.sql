alter table public.sessions
  add column if not exists language text not null default 'en';

alter table public.sessions
  drop constraint if exists sessions_language_check;

alter table public.sessions
  add constraint sessions_language_check check (language in ('en', 'fr'));
