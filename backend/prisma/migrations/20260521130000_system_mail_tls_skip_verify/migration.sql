-- 可选：跳过 SMTP TLS 证书校验（自签/内网 CA；nodemailer tls.rejectUnauthorized=false）
ALTER TABLE `system_mail_config`
ADD COLUMN `smtp_tls_skip_verify` BOOLEAN NOT NULL DEFAULT false AFTER `smtp_secure`;
