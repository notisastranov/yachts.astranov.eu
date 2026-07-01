-- Crew profiles: CV, rank, availability for yacht charter matching.

create table if not exists public.yachting_crew_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  display_name text not null,
  role text not null check (role in ('captain','vice_captain','cadet','chef','hostess','engineer')),
  rank text,
  cv_text text,
  cv_url text,
  languages text[] not null default '{}',
  certifications jsonb not null default '[]'::jsonb,
  rate_per_day_eur numeric check (rate_per_day_eur is null or rate_per_day_eur >= 0),
  available_from date,
  available_to date,
  yacht_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_yachting_crew_profiles on public.yachting_crew_profiles;
create trigger touch_yachting_crew_profiles before update on public.yachting_crew_profiles
  for each row execute function public.touch_updated_at();

alter table public.yachting_crew_profiles enable row level security;

drop policy if exists "Public read active crew profiles" on public.yachting_crew_profiles;
create policy "Public read active crew profiles" on public.yachting_crew_profiles
  for select using (active = true);

drop policy if exists "Users manage own crew profile" on public.yachting_crew_profiles;
create policy "Users manage own crew profile" on public.yachting_crew_profiles
  for all using (user_id = auth.uid() or public.astranov_has_role(array['employee','admin','owner']))
  with check (user_id = auth.uid() or public.astranov_has_role(array['employee','admin','owner']));

create index if not exists yachting_crew_profiles_role_idx on public.yachting_crew_profiles(role, active);
create index if not exists yachting_crew_profiles_user_idx on public.yachting_crew_profiles(user_id);