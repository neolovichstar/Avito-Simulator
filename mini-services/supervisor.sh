#!/bin/bash
# Супервизор мини-сервисов Resale: держит живыми realtime (:3003) и telegram-bot (:3004).
# Проверка раз в 20 с; если health не отвечает — рестартит процесс (setsid bun run dev).
# Запуск: setsid nohup bash mini-services/supervisor.sh > mini-services/supervisor.log 2>&1 &

ROOT="$(cd "$(dirname "$0")" && pwd)"

check() {
  curl -s --max-time 4 "$1" 2>/dev/null | grep -q '"ok":true'
}

start_service() {
  local dir="$1" log="$2" name="$3"
  echo "[$(date '+%F %T')] starting $name" >> "$log"
  (cd "$dir" && setsid nohup bun run dev >> "$log" 2>&1 < /dev/null &)
}

while true; do
  if ! check http://127.0.0.1:3003/health; then
    echo "[$(date '+%F %T')] realtime :3003 down — restarting" >> "$ROOT/supervisor.log"
    start_service "$ROOT/realtime" "$ROOT/realtime/realtime.log" "realtime"
  fi
  if ! check http://127.0.0.1:3004/health; then
    echo "[$(date '+%F %T')] telegram-bot :3004 down — restarting" >> "$ROOT/supervisor.log"
    start_service "$ROOT/telegram-bot" "$ROOT/telegram-bot/bot.log" "telegram-bot"
  fi
  sleep 20
done
