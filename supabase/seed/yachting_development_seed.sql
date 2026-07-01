-- Development-only seed data. Do not run against production unless these sample yachts are desired.
insert into public.yachting_yachts (name, slug, yacht_type, description, length_m, guest_capacity, cabins, minimum_crew, crew_included, base_location, price_week, price_month, price_season, currency, characteristics, active)
values
('AstranoV Serenity 78','astranov-serenity-78','Motor Yacht','Demo premium crewed motor yacht for local yachting QA.',24,10,4,3,true,'Rhodes',42000,150000,390000,'EUR','["crew","jacuzzi","water toys","rhodes"]',true),
('Aether Blue 62','aether-blue-62','Eco Yacht','Demo lower-emission yacht for local yachting QA.',11,8,4,2,true,'Kos',28500,102000,260000,'EUR','["eco","solar assist","quiet cruising","crew"]',true)
on conflict (slug) do nothing;

insert into public.yachting_availability (yacht_id, start_date, end_date, status, note)
select id, date '2026-06-20', date '2026-10-15', 'available', 'Development seed open season'
from public.yachting_yachts where slug in ('astranov-serenity-78','aether-blue-62')
on conflict do nothing;
