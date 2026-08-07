-- ============================================================
-- Turno — MIGRATION ΦΑΣΗΣ 1 (reliability hardening)
-- Τρέξε το σε ΥΠΑΡΧΟΥΣΑ εγκατάσταση. Ασφαλές να ξανατρέξει.
-- Μη καταστροφικό: μόνο προσθήκες, με defaults που κρατούν
-- ακριβώς τη σημερινή συμπεριφορά.
-- ============================================================

-- Γ. Soft delete εργαζομένων
alter table employees add column if not exists deactivated_at timestamptz;
create index if not exists employees_active_idx
  on employees (station_id) where deactivated_at is null;

-- Backfill: όσοι είναι ήδη active=false ΔΕΝ απενεργοποιούνται αυτόματα,
-- γιατί το active χρησιμοποιούνταν ως προσωρινή απόκρυψη. Μένουν ως έχουν.

-- ΣΤ. Κανόνας άδειας Ο / εβδομαδιαίου Ρ (true = σημερινή συμπεριφορά)
alter table settings add column if not exists leave_replaces_rest boolean not null default true;

-- Ε. Ακριβής εβδομαδιαίος στόχος ημερών ανά εργαζόμενο
create table if not exists weekly_employee_targets (
  station_id uuid not null references stations(id) on delete cascade,
  week_start date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  exact_days int not null check (exact_days between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (station_id, week_start, employee_id)
);
create index if not exists wet_week_idx on weekly_employee_targets (station_id, week_start);
alter table weekly_employee_targets enable row level security;

-- Α. Έκτακτες αντικαταστάσεις νύχτας + καταγραφή παρακάμψεων
alter table schedules add column if not exists night_exceptions jsonb not null default '[]';
alter table schedules add column if not exists override_warnings jsonb not null default '[]';
create index if not exists schedules_week_idx on schedules (station_id, week_start desc);

-- Α. Πραγματικός κάτοχος νυχτερινού κύκλου (planned vs actual)
alter table schedules add column if not exists actual_night_person uuid references employees(id) on delete set null;
update schedules set actual_night_person = next_night_person where actual_night_person is null;

-- Ζ. Καύσιμα: εξαίρεση ημέρας από την πρόβλεψη + αποθηκευμένα presets κάλυψης
alter table fuel_entries add column if not exists excluded boolean not null default false;

create table if not exists fuel_presets (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  name text not null,
  weights jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists fuel_presets_station_idx on fuel_presets (station_id);
alter table fuel_presets enable row level security;
