# yachts.astranov.eu · Astranov Sites

Mobile-first AstranoV Yachting on the **Astranov Sites** engine — central AstranoV Supabase (`lkoatrkhuigdolnjsbie`).

## Stack

This repository deploys a static `index.html` page. It loads Supabase JS from the browser and uses only the public anon key. Never place a Supabase service-role key in this repo or in browser configuration.

## Central database configuration

Configure the page before the main script runs, for example in the deployed HTML shell or an injected snippet:

```html
<script>
window.ASTRANOV_BOOKER_CONFIG = {
  siteId: "yachts",
  domain: "yachts.astranov.eu",
  businessType: "yacht_charter",
  mode: "range",
  youtubeVideoId: "vZWYrWF-0v8",
  supabaseUrl: "https://YOUR-CENTRAL-ASTRANOV-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_EXISTING_PUBLIC_ANON_KEY",
  currency: "EUR",
  contact: {
    phone: "+30...",
    vhf: "AstranoV Yachting",
    email: "charter@astranov.eu",
    whatsapp: "30...",
    address: "Mediterranean · AstranoV Group"
  }
};
</script>
```

`window.ASTRANOV_YACHTING_CONFIG` remains supported for backward compatibility.

If these values are missing, production does not pretend to be connected and shows a clear configuration warning. `developmentDemo: true` may be used locally only for labeled demo data.

## Database migrations

Run the migration against the same central AstranoV Group Supabase project used by the main operating system:

```bash
supabase db push
```

The migration creates these yachting tables:

- `yachting_yachts`
- `yachting_availability`
- `yachting_booking_requests`
- `yachting_booking_status_events`

It also enables RLS and uses `astranov_profiles.role` for employee/admin/owner access checks.

Optional local/demo seed data:

```bash
supabase db execute --file supabase/seed/yachting_development_seed.sql
```

## Security notes

- Browser code uses only the existing public anon key.
- Service-role keys must remain server-side or in Supabase tooling only.
- Guests can insert booking requests but cannot read private requests.
- Clients can read their own authenticated requests and cancel unfinished requests.
- Employees/admins/owners can manage bookings, yacht records, and availability when `astranov_profiles.role` allows it.
- Yacht availability blocks use the overlap rule: `requested_start <= existing_end AND requested_end >= existing_start`.

## Manual test flow

1. Configure the central Supabase URL and anon key.
2. Run migrations.
3. Open `index.html` on a phone-sized viewport.
4. Confirm the YouTube container appears before booking details.
5. Search by dates, guests, cabins, yacht type, characteristics, and budget.
6. Submit a guest request and verify it is inserted into `yachting_booking_requests`.
7. Log in as a client and verify only that user's requests appear.
8. Log in as an employee/admin/owner and verify all bookings can be filtered by status.
9. Update booking status, internal notes, and client-visible replies.
10. Add an availability row or blocked date and verify search results respect overlaps.

## Deploy

Deploy `index.html` with the AstranoV static hosting pipeline and inject `window.ASTRANOV_YACHTING_CONFIG` using the same environment/project values as the central AstranoV application.
