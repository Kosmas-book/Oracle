-- ============================================================
-- Turno — MIGRATION 4: monthly scheduling
-- Τρέξε το ΜΕΤΑ τα migration_1/2/3. Μη καταστροφικό, idempotent.
-- ============================================================

-- 6: σειρά rotation βραδινών ανά κατάστημα (λίστα employee ids).
-- Κενή λίστα = fallback στο sort_order των εργαζομένων.
alter table settings
  add column if not exists night_rotation_order jsonb not null default '[]';

-- Τα μηνιαία προγράμματα ΔΕΝ αποθηκεύονται σε ξεχωριστό πίνακα:
-- το Month mode είναι orchestration πάνω στα υπάρχοντα weekly schedules
-- (ένα row ανά station_id + week_start).
