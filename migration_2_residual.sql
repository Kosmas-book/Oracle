-- ============================================================
-- Turno — MIGRATION RESIDUAL FIXES
-- Τρέξε το ΜΕΤΑ το migration_hardening.sql. Μη καταστροφικό,
-- ασφαλές να ξανατρέξει.
-- ============================================================

-- 5. SOFT DELETE CONSISTENCY
-- Το deactivated_at γίνεται η ΜΟΝΑΔΙΚΗ πηγή αλήθειας.
-- Backfill: παλιές εγγραφές με active=false αλλά deactivated_at=null
-- θεωρούνταν "κρυμμένες". Τις αφήνουμε ΕΝΕΡΓΕΣ και απλώς
-- ευθυγραμμίζουμε το active, ώστε να μη χαθεί κανείς από τα νέα
-- προγράμματα χωρίς ρητή απενεργοποίηση από τον χρήστη.
update employees
   set active = true
 where deactivated_at is null
   and active = false;

-- Αντίστροφα: όσοι έχουν deactivated_at πρέπει να έχουν active=false.
update employees
   set active = false
 where deactivated_at is not null
   and active = true;

-- Ευρετήριο για τα ενεργά (αν δεν υπάρχει ήδη)
create index if not exists employees_active_idx
  on employees (station_id) where deactivated_at is null;
