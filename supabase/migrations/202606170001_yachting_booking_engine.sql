-- AstranoV Yachting booking engine tables for the existing central Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.yachting_yachts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  yacht_type text,
  description text,
  guest_capacity integer check (guest_capacity is null or guest_capacity > 0),
  cabins integer check (cabins is null or cabins > 0),
  crew_included boolean not null default false,
  base_location text,
  price_week numeric check (price_week is null or price_week >= 0),
  price_month numeric check (price_month is null or price_month >= 0),
  price_season numeric check (price_season is null or price_season >= 0),
  currency text not null default 'EUR',
  characteristics jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  video_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yachting_availability (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachting_yachts(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null check (status in ('available','blocked','booked','maintenance','request_only')),
  note text,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date)
);

create table if not exists public.yachting_booking_requests (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid null references public.yachting_yachts(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  start_date date not null,
  end_date date not null,
  guests integer check (guests is null or guests > 0),
  cabins integer check (cabins is null or cabins > 0),
  yacht_type text,
  budget numeric check (budget is null or budget >= 0),
  currency text not null default 'EUR',
  desired_characteristics jsonb not null default '[]'::jsonb,
  message text,
  status text not null default 'waiting_for_answer' check (status in ('waiting_for_answer','offered','booked','confirmed','declined','completed','cancelled')),
  employee_note text,
  client_visible_reply text,
  assigned_employee_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date <= end_date)
);

create table if not exists public.yachting_booking_status_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.yachting_booking_requests(id) on delete cascade,
  old_status text,
  new_status text,
  note text,
  changed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.astranov_has_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.astranov_profiles p
    where p.id = auth.uid() and p.role = any(allowed_roles)
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists touch_yachting_yachts on public.yachting_yachts;
create trigger touch_yachting_yachts before update on public.yachting_yachts for each row execute function public.touch_updated_at();
drop trigger if exists touch_yachting_availability on public.yachting_availability;
create trigger touch_yachting_availability before update on public.yachting_availability for each row execute function public.touch_updated_at();
drop trigger if exists touch_yachting_booking_requests on public.yachting_booking_requests;
create trigger touch_yachting_booking_requests before update on public.yachting_booking_requests for each row execute function public.touch_updated_at();

alter table public.yachting_yachts enable row level security;
alter table public.yachting_availability enable row level security;
alter table public.yachting_booking_requests enable row level security;
alter table public.yachting_booking_status_events enable row level security;

drop policy if exists "Public can read active yachts" on public.yachting_yachts;
create policy "Public can read active yachts" on public.yachting_yachts for select using (active = true);
drop policy if exists "Employees manage yachts" on public.yachting_yachts;
create policy "Employees manage yachts" on public.yachting_yachts for all using (public.astranov_has_role(array['employee','admin','owner'])) with check (public.astranov_has_role(array['employee','admin','owner']));

drop policy if exists "Public can read non-private availability" on public.yachting_availability;
create policy "Public can read non-private availability" on public.yachting_availability for select using (true);
drop policy if exists "Employees manage availability" on public.yachting_availability;
create policy "Employees manage availability" on public.yachting_availability for all using (public.astranov_has_role(array['employee','admin','owner'])) with check (public.astranov_has_role(array['employee','admin','owner']));

drop policy if exists "Guests and clients can insert booking requests" on public.yachting_booking_requests;
create policy "Guests and clients can insert booking requests" on public.yachting_booking_requests for insert with check (user_id is null or user_id = auth.uid());
drop policy if exists "Clients read own booking requests" on public.yachting_booking_requests;
create policy "Clients read own booking requests" on public.yachting_booking_requests for select using (user_id = auth.uid() or public.astranov_has_role(array['employee','admin','owner']));
drop policy if exists "Clients cancel own unfinished requests" on public.yachting_booking_requests;
create policy "Clients cancel own unfinished requests" on public.yachting_booking_requests for update using (user_id = auth.uid() and status not in ('completed')) with check (user_id = auth.uid() and status = 'cancelled');
drop policy if exists "Employees manage booking requests" on public.yachting_booking_requests;
create policy "Employees manage booking requests" on public.yachting_booking_requests for all using (public.astranov_has_role(array['employee','admin','owner'])) with check (public.astranov_has_role(array['employee','admin','owner']));

drop policy if exists "Employees read status events" on public.yachting_booking_status_events;
create policy "Employees read status events" on public.yachting_booking_status_events for select using (public.astranov_has_role(array['employee','admin','owner']));
drop policy if exists "Employees insert status events" on public.yachting_booking_status_events;
create policy "Employees insert status events" on public.yachting_booking_status_events for insert with check (public.astranov_has_role(array['employee','admin','owner']));

create index if not exists yachting_availability_yacht_dates_idx on public.yachting_availability(yacht_id,start_date,end_date,status);
create index if not exists yachting_booking_user_idx on public.yachting_booking_requests(user_id,created_at desc);
create index if not exists yachting_booking_status_idx on public.yachting_booking_requests(status,created_at desc);
