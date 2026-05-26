-- No-op migration: fixes P3015 when this folder existed without migration.sql.
-- Calendar `memberAccess` column is added in `20260517100000_calendar_member_access`.
SELECT 1;
