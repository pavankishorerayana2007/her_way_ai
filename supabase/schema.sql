-- HerWay AI schema. Run once in Supabase Dashboard > SQL Editor.
-- Supabase Auth owns user credentials; this schema stores app data only.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'user' check (role in ('user','guardian')),
  preferences jsonb not null default '{"location":false,"arrival_notifications":false,"incident_summaries":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254),
  display_name text not null check (char_length(display_name) between 1 and 80),
  relationship text not null check (char_length(relationship) between 1 and 60),
  status text not null default 'saved' check (status = 'saved'),
  created_at timestamptz not null default now(),
  unique(owner_id, contact_email)
);

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  origin text not null check (char_length(origin) between 1 and 180),
  destination text not null check (char_length(destination) between 1 and 180),
  travel_mode text not null check (travel_mode in ('walk','transit','drive')),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  expected_arrival timestamptz,
  started_at timestamptz not null default now(),
  arrived_at timestamptz
);

create table if not exists public.journey_guardians (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254),
  created_at timestamptz not null default now(),
  primary key(journey_id,guardian_id)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  description text not null check (char_length(description) between 5 and 10000),
  category text not null check (category in ('Suspicious Activity','Following / Stalking Concern','Harassment','Unsafe Environment','Campus Safety Concern','Workplace Safety Concern','Public Transport Safety Concern','Other')),
  location_shared boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','urgent')),
  created_at timestamptz not null default now()
);

create index if not exists guardians_owner_created_idx on public.guardians(owner_id,created_at desc);
create index if not exists journeys_owner_started_idx on public.journeys(owner_id,started_at desc);
create index if not exists incidents_owner_created_idx on public.incidents(owner_id,created_at desc);
create index if not exists journey_guardians_email_idx on public.journey_guardians(lower(contact_email),created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.guardians enable row level security;
alter table public.journeys enable row level security;
alter table public.journey_guardians enable row level security;
alter table public.incidents enable row level security;

drop policy if exists "profile owner access" on public.profiles;
create policy "profile owner access" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "guardian owner access" on public.guardians;
create policy "guardian owner access" on public.guardians for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "journey owner access" on public.journeys;
create policy "journey owner access" on public.journeys for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "journey guardian links owner access" on public.journey_guardians;
create policy "journey guardian links owner access" on public.journey_guardians for all to authenticated using (exists(select 1 from public.journeys j where j.id=journey_id and j.owner_id=auth.uid())) with check (exists(select 1 from public.journeys j where j.id=journey_id and j.owner_id=auth.uid()));
drop policy if exists "incident owner access" on public.incidents;
create policy "incident owner access" on public.incidents for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.guardians,public.journeys,public.journey_guardians,public.incidents to authenticated;
