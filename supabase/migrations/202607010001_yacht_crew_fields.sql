-- Mandatory crew fields for yacht charter listings and booking requests.
-- Yachts 13 m and longer require minimum_crew >= 3.

alter table public.yachting_yachts
  add column if not exists length_m numeric check (length_m is null or length_m > 0),
  add column if not exists minimum_crew integer not null default 3
    check (minimum_crew is null or minimum_crew >= 1);

alter table public.yachting_yachts
  drop constraint if exists yachting_yachts_minimum_crew_length_check;

alter table public.yachting_yachts
  add constraint yachting_yachts_minimum_crew_length_check
  check (length_m is null or length_m < 13 or minimum_crew >= 3);

comment on column public.yachting_yachts.length_m is 'Overall length in meters; 13 m+ triggers mandatory 3-crew minimum.';
comment on column public.yachting_yachts.minimum_crew is 'Minimum mandatory crew count set by shipowner.';

alter table public.yachting_booking_requests
  add column if not exists crew_notes text,
  add column if not exists crew_acknowledged boolean not null default false;

comment on column public.yachting_booking_requests.crew_notes is 'Client notes about crew preferences or requirements.';
comment on column public.yachting_booking_requests.crew_acknowledged is 'Client acknowledged mandatory crew policy.';