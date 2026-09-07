-- Interview Mirror schema
-- Run this in the Supabase SQL editor

create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Interview sessions
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled session',
  cv_text text not null default '',
  job_description text not null default '',
  cv_analysis jsonb,
  interview_strategy jsonb,
  language text not null default 'en'
    check (language in ('en', 'fr')),
  status text not null default 'draft'
    check (status in ('draft', 'analyzed', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Users manage own sessions"
  on public.sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Interview questions
create table if not exists public.questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question text not null,
  category text not null default 'general',
  order_index int not null default 0
);

alter table public.questions enable row level security;

create policy "Users manage own questions"
  on public.questions for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = questions.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = questions.session_id and s.user_id = auth.uid()
    )
  );

-- Answers
create table if not exists public.answers (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now()
);

alter table public.answers enable row level security;

create policy "Users manage own answers"
  on public.answers for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = answers.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = answers.session_id and s.user_id = auth.uid()
    )
  );

-- Feedback
create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  feedback jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users manage own feedback"
  on public.feedback for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = feedback.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = feedback.session_id and s.user_id = auth.uid()
    )
  );

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.set_updated_at();
