-- 在连接 `mysql` 系统库时执行，用于创建业务库（与 setup-local-db / db:create 脚本配合）
CREATE DATABASE IF NOT EXISTS project_mgmt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
