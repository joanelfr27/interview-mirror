-- D10: minimal research instrumentation, deliberately free of raw CV/JD or answer text.
create table if not exists public.canonical_research_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_id text not null,
  event_name text not null,
  occurred_at timestamptz not null,
  requirement_id text,
  route_mode text,
  preparation_state text,
  probe_mode text,
  source_update_id text,
  validation_error_count integer,
  created_at timestamptz not null default now(),
  unique(session_id, event_id)
);

create index if not exists canonical_research_events_session_time_idx
  on public.canonical_research_events(session_id, occurred_at desc);

alter table public.canonical_research_events enable row level security;

create policy "canonical research events owner read"
  on public.canonical_research_events for select
  using (exists (
    select 1 from public.sessions s
    where s.id = canonical_research_events.session_id and s.user_id = auth.uid()
  ));

create policy "canonical research events owner insert"
  on public.canonical_research_events for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = canonical_research_events.session_id and s.user_id = auth.uid()
  ));

revoke update, delete on public.canonical_research_events from authenticated;
