-- ============================================================
-- Turno — ΑΝΑΒΑΘΜΙΣΗ ΥΠΑΡΧΟΥΣΑΣ ΒΑΣΗΣ.
-- Μόνο για βάσεις που στήθηκαν με παλιότερη έκδοση.
-- Σε ΚΑΘΑΡΟ Supabase τρέξε το supabase_schema.sql αντί για αυτό.
-- Ασφαλές να ξανατρέξει.
-- ============================================================

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null unique,
  created_at timestamptz not null default now()
);
alter table stations add column if not exists email text;
alter table stations add column if not exists reset_token text;
alter table stations add column if not exists reset_expires timestamptz;
create index if not exists stations_reset_token_idx on stations (reset_token);
alter table stations enable row level security;

alter table employees   add column if not exists station_id uuid references stations(id) on delete cascade;
alter table settings    add column if not exists station_id uuid references stations(id) on delete cascade;
alter table schedules   add column if not exists station_id uuid references stations(id) on delete cascade;
alter table fuel_entries add column if not exists station_id uuid references stations(id) on delete cascade;

alter table employees add column if not exists fixed_days jsonb not null default '{}';
alter table settings  add column if not exists work_days int not null default 6;
alter table settings  add column if not exists max_per_shift int not null default 4;
alter table settings  add column if not exists shifts jsonb not null default '{}';
alter table schedules add column if not exists day_req jsonb not null default '[]';

-- Πρώτο κατάστημα (ΑΛΛΑΞΕ όνομα/PIN/email) και ανάθεση παλιών δεδομένων:
insert into stations (name, pin, email)
  select 'ΚΑΛΥΨΩ 024', '1234', null
  where not exists (select 1 from stations);

update employees    set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update settings     set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update schedules    set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update fuel_entries set station_id = (select id from stations order by created_at limit 1) where station_id is null;

-- Νέα πρωτεύοντα κλειδιά ανά κατάστημα:
alter table settings     drop constraint if exists settings_pkey;
alter table settings     drop column if exists id;
alter table settings     add primary key (station_id);
alter table schedules    drop constraint if exists schedules_pkey;
alter table schedules    add primary key (station_id, week_start);
alter table fuel_entries drop constraint if exists fuel_entries_pkey;
alter table fuel_entries add primary key (station_id, entry_date);
