-- ============================================================
-- Turno — MIGRATION 5: authentication security
-- Τρέξε το ΜΕΤΑ το migration_4_month.sql.
-- Μη καταστροφικό και ασφαλές να ξανατρέξει.
-- Τα παλιά PIN γίνονται hash αυτόματα στην επόμενη επιτυχημένη είσοδο.
-- ============================================================

alter table stations add column if not exists pin_hash text;
alter table stations add column if not exists session_version integer not null default 1;
alter table stations add column if not exists reset_token_hash text;
alter table stations alter column pin drop not null;

create index if not exists stations_reset_token_hash_idx
  on stations (reset_token_hash) where reset_token_hash is not null;

create table if not exists auth_rate_limits (
  key text primary key,
  attempts integer not null default 0,
  window_started timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table auth_rate_limits enable row level security;

-- Παλιές ληγμένες εγγραφές μπορούν να καθαρίζονται περιοδικά με:
-- delete from auth_rate_limits where updated_at < now() - interval '2 days';
