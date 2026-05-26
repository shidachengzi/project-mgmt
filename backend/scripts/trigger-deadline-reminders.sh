#!/usr/bin/env sh
# 调用 Next API 执行一次开始/截止 + 日历等提醒扫描（与生产 cron 相同入口）。
# 用法（在仓库任意目录）：
#   export INTERNAL_CRON_SECRET='与 backend/.env 中一致'
#   export PM_BACKEND_URL='http://localhost:3000'   # 可选，默认如此
#   sh backend/scripts/trigger-deadline-reminders.sh
#
# 若未设置 INTERNAL_CRON_SECRET，会尝试从 backend/.env 读取同名变量（仅本行，不 source 整文件）。

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

PM_BACKEND_URL="${PM_BACKEND_URL:-http://localhost:3000}"
# 去掉末尾 /
while [ "${PM_BACKEND_URL%/}" != "$PM_BACKEND_URL" ]; do PM_BACKEND_URL="${PM_BACKEND_URL%/}"; done

SECRET="${INTERNAL_CRON_SECRET:-${PM_CRON_SECRET:-}}"
if [ -z "$SECRET" ]; then
  ENV_FILE="$BACKEND_DIR/.env"
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?INTERNAL_CRON_SECRET=' "$ENV_FILE" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      SECRET="${line#*=}"
      SECRET="$(printf '%s' "$SECRET" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
    fi
  fi
fi

if [ -z "$SECRET" ]; then
  echo "错误: 未设置 INTERNAL_CRON_SECRET（或 PM_CRON_SECRET），且无法从 $BACKEND_DIR/.env 读取。" >&2
  echo "请在 backend/.env 中配置至少 8 位的 INTERNAL_CRON_SECRET，并 export 后再执行本脚本。" >&2
  exit 1
fi

# Windows 下 .env 常为 CRLF，去掉 CR 避免与 Next trim 后的值仍不一致
SECRET="$(printf '%s' "$SECRET" | tr -d '\015')"

URL="${PM_BACKEND_URL}/api/internal/deadline-reminders"
echo "POST $URL" >&2

if ! curl -sS -f -X POST "$URL" \
  -H "x-pm-cron-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'; then
  echo "请求失败（检查服务是否启动、密钥是否正确）。" >&2
  exit 1
fi
echo "" >&2
