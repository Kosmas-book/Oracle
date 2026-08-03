-- ΚΑΛΥΨΩ · Βάρδιες — Τρέξε το ΜΙΑ φορά στο Supabase SQL Editor.

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  employment_type text not null default 'full', -- 'full' | 'part'
  min_days int not null default 3,
  max_days int not null default 6,
  allowed_shifts text[] not null default '{"Π","Π4","Α","Α3"}',
  night_rotation boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key,
  weekday_req jsonb not null default '{"Π4":1,"Α3":1,"Π":3,"Α":3}',
  sunday_req jsonb not null default '{"Π":2,"Π2":1,"Π4":1,"Α":2,"Α2":1}',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists schedules (
  week_start date primary key, -- πάντα Δευτέρα
  grid jsonb not null default '{}',
  night_person uuid references employees(id) on delete set null,
  next_night_person uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists fuel_entries (
  entry_date date primary key,
  liters jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- RLS ενεργό, ΧΩΡΙΣ policies: πρόσβαση μόνο μέσω service role (API routes).
alter table employees enable row level security;
alter table settings enable row level security;
alter table schedules enable row level security;
alter table fuel_entries enable row level security;

-- Νέες στήλες ρυθμίσεων (ασφαλές να ξανατρέξει και σε υπάρχουσα βάση):
alter table settings add column if not exists work_days int not null default 6;
alter table settings add column if not exists max_per_shift int not null default 4;
