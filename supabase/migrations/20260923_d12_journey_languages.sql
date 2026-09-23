-- D12: independent experience and interview language semantics.
alter table public.sessions
  add column if not exists experience_language text;

alter table public.sessions
  add column if not exists interview_language text;

update public.sessions
set experience_language = coalesce(experience_language, preparation_language, language, 'en')
where experience_language is null;

update public.sessions
set interview_language = coalesce(interview_language, preparation_language, language, 'en')
where interview_language is null;

alter table public.sessions
  alter column experience_language set default 'en',
  alter column interview_language set default 'en';

alter table public.sessions
  alter column experience_language set not null,
  alter column interview_language set not null;

alter table public.sessions
  drop constraint if exists sessions_experience_language_check;

alter table public.sessions
  add constraint sessions_experience_language_check
  check (experience_language in ('en', 'fr'));

alter table public.sessions
  drop constraint if exists sessions_interview_language_check;

alter table public.sessions
  add constraint sessions_interview_language_check
  check (interview_language in ('en', 'fr'));
