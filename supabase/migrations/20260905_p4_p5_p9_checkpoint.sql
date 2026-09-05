-- Interview Mirror
-- P4/P5/P9 Supabase checkpoint
-- 2026-09-05

-- P4: Coaching Progress
create table if not exists public.coaching_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  focus_area text not null,
  status text not null default 'identified',
  baseline_score integer,
  latest_score integer,
  evidence jsonb not null default '{}'::jsonb,
  coaching_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coaching_progress_status_check
    check (status in ('identified', 'in_progress', 'improved')),
  constraint coaching_progress_baseline_score_check
    check (baseline_score between 0 and 100),
  constraint coaching_progress_latest_score_check
    check (latest_score between 0 and 100),
  constraint coaching_progress_user_focus_unique
    unique (user_id, focus_area)
);

create index if not exists coaching_progress_user_id_idx
  on public.coaching_progress(user_id);

create index if not exists coaching_progress_session_id_idx
  on public.coaching_progress(session_id);

create index if not exists coaching_progress_status_idx
  on public.coaching_progress(user_id, status);

alter table public.coaching_progress enable row level security;

create policy "Users can view own coaching progress"
  on public.coaching_progress
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own coaching progress"
  on public.coaching_progress
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own coaching progress"
  on public.coaching_progress
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own coaching progress"
  on public.coaching_progress
  for delete
  to authenticated
  using (user_id = auth.uid());

create trigger coaching_progress_updated_at
before update on public.coaching_progress
for each row
execute function public.set_updated_at();

create or replace function public.upsert_coaching_progress(
  p_user_id uuid,
  p_session_id uuid,
  p_focus_area text,
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
    p_status,
    p_score,
    p_score,
    p_evidence,
    p_coaching_action
  )
  on conflict (user_id, focus_area)
  do update set
    session_id = excluded.session_id,
    status = excluded.status,
    latest_score = excluded.latest_score,
    evidence = excluded.evidence,
    coaching_action = excluded.coaching_action
  returning * into result;

  return result;
end;
$$;

-- P5: Returning User Context
create or replace function public.get_candidate_preparation_context(
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'sessions',
    coalesce(
      (
        select jsonb_agg(to_jsonb(s) order by s.created_at desc)
        from public.sessions s
        where s.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'coaching_progress',
    coalesce(
      (
        select jsonb_agg(to_jsonb(cp) order by cp.updated_at desc)
        from public.coaching_progress cp
        where cp.user_id = p_user_id
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

-- P9: Remove duplicate indexes
drop index if exists public.idx_answers_session_id;
drop index if exists public.idx_feedback_session_id;
drop index if exists public.idx_sessions_user_id;

-- P9: Harden CV Storage upload policy
drop policy if exists "Users can upload own CV" on storage.objects;

create policy "Users can upload own CV"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cvs'
  and owner_id = auth.uid()::text
);
