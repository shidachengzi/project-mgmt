-- No-op migration: fixes P3015 when this folder existed without migration.sql.
-- SMTP `smtp_tls_skip_verify` column is added in `20260521130000_system_mail_tls_skip_verify`.
SELECT 1;
