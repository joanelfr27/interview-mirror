-- Interview Mirror P4 hardening
-- 2026-09-06
-- Goals: prevent fallback persistence, stabilize focus identity, preserve evidence history,
-- and keep coaching status anchored to the original baseline score.

-- Stable focus identity: preserve the human-readable focus_area while using a normalized key
-- for uniqueness and progress lookup. Unicode letters/numbers are preserved for bilingual use.
alter table public.coaching_progress
  add column if not exists focus_key text;

update public.coaching_progress
set focus_key = lower(
  regexp_replace(
    regexp_replace(trim(focus_area), '[[:punct:]]', '', 'g'),
    '\\s+',
    ' ',
    'g'
  )
)
where focus_key is null;

alter table public.coaching_progress
  alter column focus_key set not null;

alter table public.coaching_progress
  drop constraint if exists coaching_progress_user_focus_unique;

create unique index if not exists coaching_progress_user_focus_key_unique
  on public.coaching_progress(user_id, focus_key);

-- Convert legacy single evidence objects into an explicit append-only history envelope.
update public.coaching_progress
set evidence = jsonb_build_object(
  'history', jsonb_build_array(evidence),
  'latest', evidence
)
where jsonb_typeof(evidence) = 'object'
  and not (evidence ? 'history');

-- Replace the old RPC so every new coaching result appends evidence rather than overwriting it.
drop function if exists public.upsert_coaching_progress(uuid, uuid, text, text, text, integer, jsonb, text);
drop function if exists public.upsert_coaching_progress(uuid, uuid, text, text, integer, jsonb, text);

create or replace function public.upsert_coaching_progress(
  p_user_id uuid,
  p_session_id uuid,
  p_focus_area text,
  p_focus_key text,
  p_status text default 'identified',
  p_score integer default null,
  p_evidence jsonb default '{}'::jsonb,
  p_coaching_action text default null
)
returns public.coaching_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.coaching_progress;
begin
  insert into public.coaching_progress (
    user_id,
    session_id,
    focus_area,
    focus_key,
    status,
    baseline_score,
    latest_score,
    evidence,
    coaching_action
  )
  values (
    p_user_id,
    p_session_id,
    p_focus_area,
    p_focus_key,
    p_status,
    p_score,
    p_score,
    jsonb_build_object(
      'history', jsonb_build_array(p_evidence),
      'latest', p_evidence
    ),
    p_coaching_action
  )
  on conflict (user_id, focus_key)
  do update set
    session_id = excluded.session_id,
    focus_area = excluded.focus_area,
    status = excluded.status,
    latest_score = excluded.latest_score,
    evidence = jsonb_build_object(
      'history',
      case
        when jsonb_typeof(public.coaching_progress.evidence -> 'history') = 'array'
          then public.coaching_progress.evidence -> 'history'
        else jsonb_build_array(public.coaching_progress.evidence)
      end || jsonb_build_array(p_evidence),
      'latest', p_evidence
    ),
    coaching_action = excluded.coaching_action
  returning * into result;

  return result;
end;
$$;
