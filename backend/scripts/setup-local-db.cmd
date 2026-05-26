@echo off
setlocal
cd /d "%~dp0.."

echo [setup-local-db] Creating database from DATABASE_URL in .env ^(mysql2, no Prisma on system mysql^)...
call node scripts\create-database.mjs
if errorlevel 1 (
  echo [setup-local-db] ERROR: create-database failed. Check MySQL is running and backend\.env DATABASE_URL is correct.
  exit /b 1
)
echo [setup-local-db] prisma generate...
call npx prisma generate
if errorlevel 1 exit /b 1

echo [setup-local-db] prisma migrate deploy...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo [setup-local-db] seed...
call node prisma/seed.js
if errorlevel 1 exit /b 1

echo [setup-local-db] Done.
endlocal
