-- ============================================================
-- Turno — ROLLBACK MIGRATION 4
-- ============================================================
alter table settings drop column if exists night_rotation_order;
