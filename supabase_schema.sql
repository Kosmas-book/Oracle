-- ============================================================
-- Turno — ΠΛΗΡΕΣ SCHEMA. Τρέξε το ΜΙΑ φορά σε ΚΑΘΑΡΟ Supabase.
-- Στήνει ολόκληρη τη βάση από το μηδέν. Ασφαλές να ξανατρέξει.
-- ============================================================

-- 1. Καταστήματα (κάθε πρατήριο = μία γραμμή, PIN = κλειδί εισόδου)
create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null unique,
  email text,
  reset_token text,
  reset_expires timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stations_reset_token_idx on stations (reset_token);

-- 2. Προσωπικό
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  employment_type text not null default 'full',   -- 'full' | 'part'
  min_days int not null default 3,
  max_days int not null default 6,
  allowed_shifts text[] not null default '{"Π","Π4","Α","Α3"}',
  night_rotation boolean not null default false,
  fixed_days jsonb not null default '{}',          -- π.χ. {"6":"Ρ"} = πάντα ρεπό Κυριακή
  sort_order int not null default 100,
  deactivated_at timestamptz,                      -- ΜΟΝΑΔΙΚΗ πηγή soft delete: null = ενεργός
  created_at timestamptz not null default now()
);
create index if not exists employees_station_idx on employees (station_id);
create index if not exists employees_active_idx
  on employees (station_id) where deactivated_at is null;

-- 3. Ρυθμίσεις ανά κατάστημα
create table if not exists settings (
  station_id uuid primary key references stations(id) on delete cascade,
  weekday_req jsonb not null default '{"Π":3,"Α":3,"Π4":1,"Α3":1}',
  sunday_req  jsonb not null default '{"Π":2,"Π2":1,"Π4":1,"Α":2,"Α2":1}',
  work_days int not null default 6,                -- 6 = εξαήμερο, 5 = πενθήμερο
  max_per_shift int not null default 4,            -- μέγιστα άτομα ταυτόχρονα
  shifts jsonb not null default '{}',              -- βάρδιες/ωράρια· κενό = προεπιλογές
  leave_replaces_rest boolean not null default true, -- η άδεια Ο μετράει στη θέση του Ρ;
  updated_at timestamptz not null default now()
);

-- 4. Εβδομαδιαία προγράμματα
create table if not exists schedules (
  station_id uuid not null references stations(id) on delete cascade,
  week_start date not null,                        -- πάντα Δευτέρα
  grid jsonb not null default '{}',
  night_person uuid references employees(id) on delete set null,
  next_night_person uuid references employees(id) on delete set null,
  day_req jsonb not null default '[]',             -- απαιτήσεις ανά μέρα για ΤΗΝ εβδομάδα
  actual_night_person uuid references employees(id) on delete set null, -- ποιος ΠΡΑΓΜΑΤΙΚΑ ξεκίνησε τον κύκλο
  night_exceptions jsonb not null default '[]',    -- έκτακτες αντικαταστάσεις νύχτας
  override_warnings jsonb not null default '[]',   -- προειδοποιήσεις που παρακάμφθηκαν
  updated_at timestamptz not null default now(),
  primary key (station_id, week_start)
);
create index if not exists schedules_week_idx on schedules (station_id, week_start desc);

-- 4β. Ακριβής εβδομαδιαίος στόχος ημερών ανά εργαζόμενο (υπερισχύει του προφίλ)
create table if not exists weekly_employee_targets (
  station_id uuid not null references stations(id) on delete cascade,
  week_start date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  exact_days int not null check (exact_days between 0 and 7),
  created_at timestamptz not null default now(),
  primary key (station_id, week_start, employee_id)
);
create index if not exists wet_week_idx on weekly_employee_targets (station_id, week_start);

-- 5. Ημερήσιες πωλήσεις καυσίμων
create table if not exists fuel_entries (
  station_id uuid not null references stations(id) on delete cascade,
  entry_date date not null,
  liters jsonb not null default '{}',
  notes text,
  excluded boolean not null default false,          -- εξαίρεση από την πρόβλεψη
  created_at timestamptz not null default now(),
  primary key (station_id, entry_date)
);

-- 5β. Αποθηκευμένα presets ποσοστών κάλυψης παραγγελίας
create table if not exists fuel_presets (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  name text not null,
  weights jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists fuel_presets_station_idx on fuel_presets (station_id);

-- 6. RLS ενεργό ΧΩΡΙΣ policies: πρόσβαση μόνο μέσω service role (API routes).
alter table stations enable row level security;
alter table employees enable row level security;
alter table settings enable row level security;
alter table schedules enable row level security;
alter table fuel_entries enable row level security;
alter table weekly_employee_targets enable row level security;
alter table fuel_presets enable row level security;

-- ============================================================
-- ΠΡΩΤΟ ΚΑΤΑΣΤΗΜΑ — άλλαξε όνομα, PIN και email πριν τρέξεις:
-- ============================================================
-- insert into stations (name, pin, email)
--   values ('ΚΑΛΥΨΩ 024', '1234', 'to-email-sou@gmail.com')
--   on conflict (pin) do nothing;
