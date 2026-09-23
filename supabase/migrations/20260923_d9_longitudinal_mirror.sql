-- D9: longitudinal canonical Mirror persistence boundary.
-- Append-only snapshots; no production caller is wired by this migration.
create table if not exists public.canonical_mirror_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  schema_version text not null,
  source_update_ids text[] not null,
  mirror_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists canonical_mirror_snapshots_session_created_idx
  on public.canonical_mirror_snapshots(session_id, created_at desc);

alter table public.canonical_mirror_snapshots enable row level security;

create policy "canonical mirror snapshots owner read"
  on public.canonical_mirror_snapshots
  for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = canonical_mirror_snapshots.session_id
      and s.user_id = auth.uid()
    )
  );

create policy "canonical mirror snapshots owner insert"
  on public.canonical_mirror_snapshots
  for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = canonical_mirror_snapshots.session_id
      and s.user_id = auth.uid()
    )
  );

revoke update, delete on public.canonical_mirror_snapshots from authenticated;


alter table public.canonical_mirror_snapshots
  add constraint canonical_mirror_snapshots_source_update_ids_nonempty
  check (cardinality(source_update_ids) > 0);

create or replace function public.prevent_canonical_mirror_snapshot_mutation()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception 'canonical_mirror_snapshots is append-only';
end;
$$;

create trigger canonical_mirror_snapshots_append_only
before update or delete on public.canonical_mirror_snapshots
for each row execute function public.prevent_canonical_mirror_snapshot_mutation();
