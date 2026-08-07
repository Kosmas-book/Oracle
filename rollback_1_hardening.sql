-- ============================================================
-- Turno — ROLLBACK ΦΑΣΗΣ 1
-- Επαναφέρει τη βάση στην κατάσταση πριν το migration_phase1.sql.
-- ΠΡΟΣΟΧΗ: χάνονται οι εβδομαδιαίοι στόχοι και το ιστορικό εξαιρέσεων
-- νύχτας. Τα προγράμματα, το προσωπικό και τα καύσιμα ΔΕΝ επηρεάζονται.
-- ============================================================

drop index if exists wet_week_idx;
drop table if exists weekly_employee_targets;

alter table schedules drop column if exists night_exceptions;
alter table schedules drop column if exists override_warnings;
drop index if exists schedules_week_idx;

alter table settings drop column if exists leave_replaces_rest;

drop index if exists employees_active_idx;
alter table employees drop column if exists deactivated_at;
alter table schedules drop column if exists actual_night_person;
drop index if exists fuel_presets_station_idx;
drop table if exists fuel_presets;
alter table fuel_entries drop column if exists excluded;
