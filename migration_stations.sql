-- ΜΕΤΑΒΑΣΗ ΣΕ ΠΟΛΛΑ ΚΑΤΑΣΤΗΜΑΤΑ — τρέξε το ΜΙΑ φορά στο Supabase SQL Editor.
-- ΠΡΙΝ το τρέξεις: άλλαξε το '1234' παρακάτω στο ΤΩΡΙΝΟ σου PIN.

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null unique,
  created_at timestamptz not null default now()
);
alter table stations enable row level security;

alter table employees add column if not exists station_id uuid references stations(id) on delete cascade;
alter table settings add column if not exists station_id uuid references stations(id) on delete cascade;
alter table schedules add column if not exists station_id uuid references stations(id) on delete cascade;
alter table fuel_entries add column if not exists station_id uuid references stations(id) on delete cascade;

-- Το πρώτο κατάστημα (το δικό σου) με το υπάρχον PIN:
insert into stations (name, pin)
  select 'ΚΑΛΥΨΩ', '1234'
  where not exists (select 1 from stations where pin = '1234');

-- Όλα τα υπάρχοντα δεδομένα ανήκουν στο πρώτο κατάστημα:
update employees set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update settings set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update schedules set station_id = (select id from stations order by created_at limit 1) where station_id is null;
update fuel_entries set station_id = (select id from stations order by created_at limit 1) where station_id is null;

-- Νέα κλειδιά: κάθε κατάστημα έχει τα δικά του settings/εβδομάδες/ημέρες.
alter table settings drop constraint if exists settings_pkey;
alter table settings drop column if exists id;
alter table settings add primary key (station_id);

alter table schedules drop constraint if exists schedules_pkey;
alter table schedules add primary key (station_id, week_start);

alter table fuel_entries drop constraint if exists fuel_entries_pkey;
alter table fuel_entries add primary key (station_id, entry_date);

-- ΝΕΟ ΚΑΤΑΣΤΗΜΑ στο μέλλον = μία γραμμή:
-- insert into stations (name, pin) values ('ΟΝΟΜΑ ΜΑΓΑΖΙΟΥ', 'ΝΕΟ_PIN');
