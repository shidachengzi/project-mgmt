@echo off
setlocal EnableDelayedExpansion

REM 调用 Next API 执行一次提醒扫描（与生产 cron 相同入口）。
REM 用法：在资源管理器中双击，或在 cmd 中执行：
REM   set INTERNAL_CRON_SECRET=与 backend\.env 中一致
REM   set PM_BACKEND_URL=http://localhost:3000
REM   backend\scripts\trigger-deadline-reminders.bat
REM
REM 若未设置 INTERNAL_CRON_SECRET，会尝试从 backend\.env 读取 INTERNAL_CRON_SECRET= 行（需已保存为 UTF-8 或 ANSI，且值中勿含未转义的特殊字符）。

pushd "%~dp0.."
set "BACKEND_DIR=!CD!"
popd

if not defined PM_BACKEND_URL set "PM_BACKEND_URL=http://localhost:3000"

set "SECRET=!INTERNAL_CRON_SECRET!"
if not defined SECRET set "SECRET=!PM_CRON_SECRET!"

if not defined SECRET if exist "!BACKEND_DIR!\.env" (
  REM 用 PowerShell 解析 .env，避免 CRLF/引号导致与 Next 读到的 INTERNAL_CRON_SECRET 不一致（否则会 401）
  for /f "usebackq delims=" %%s in (`powershell -NoProfile -ExecutionPolicy Bypass -File "!BACKEND_DIR!\scripts\get-internal-cron-secret-from-env.ps1" "!BACKEND_DIR!\.env"`) do set "SECRET=%%s"
)

if not defined SECRET (
  echo ERROR: INTERNAL_CRON_SECRET 未设置，且无法从 !BACKEND_DIR!\.env 读取。
  echo 请在 backend\.env 中配置至少 8 位的 INTERNAL_CRON_SECRET。
  exit /b 1
)

REM 去掉末尾 \ 或 /
set "BASE=!PM_BACKEND_URL!"
if "!BASE:~-1!"=="\" set "BASE=!BASE:~0,-1!"
if "!BASE:~-1!"=="/" set "BASE=!BASE:~0,-1!"
set "URL=!BASE!/api/internal/deadline-reminders"

echo POST !URL!
curl -sS -f -X POST "!URL!" -H "x-pm-cron-secret: !SECRET!" -H "Content-Type: application/json" -d "{}"
if errorlevel 1 (
  echo.
  echo 请求失败（检查服务是否启动、curl 是否可用、密钥是否正确）。
  exit /b 1
)
echo.
exit /b 0
