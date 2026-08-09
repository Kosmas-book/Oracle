-- ============================================================
-- Turno — MIGRATION 3: integrity fixes
-- Τρέξε το ΜΕΤΑ τα migration_1 και migration_2.
-- Μη καταστροφικό, ασφαλές να ξανατρέξει.
-- ============================================================

-- 3. SOFT DELETE: το deactivated_at είναι η ΜΟΝΑΔΙΚΗ πηγή αλήθειας.
-- Legacy rows με active=false αλλά deactivated_at=null θεωρούνταν απλώς
-- "κρυμμένα". Τα ευθυγραμμίζουμε ως ΕΝΕΡΓΑ, ώστε κανείς να μη χαθεί από τα
-- νέα προγράμματα χωρίς ρητή απενεργοποίηση από τον χρήστη.
update employees
   set active = true
 where deactivated_at is null
   and active is distinct from true;

-- Και το αντίστροφο: όσοι έχουν deactivated_at πρέπει να έχουν active=false.
update employees
   set active = false
 where deactivated_at is not null
   and active is distinct from false;

-- Ευρετήριο ενεργών (idempotent)
create index if not exists employees_active_idx
  on employees (station_id) where deactivated_at is null;

-- 5. FUEL MERGE: καμία αλλαγή σχήματος. Το merge γίνεται στο API layer,
-- ώστε τα υπάρχοντα liters JSON να παραμένουν ανέπαφα.
