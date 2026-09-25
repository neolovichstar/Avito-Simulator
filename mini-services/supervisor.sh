#!/bin/bash
# Супервизор мини-сервисов Resale: держит живыми realtime (:3003), telegram-bot (:3004)
# и call-service (:3303, P2P-сигналинг звонков — Task 27-e).
# Проверка раз в 20 с; если health не отвечает — рестартит процесс (setsid bun run dev).
# Запуск: setsid nohup bash mini-services/supervisor.sh >> mini-services/supervisor.log 2>&1 &

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG="$ROOT/supervisor.log"
HB=0

check() {
  curl -s --max-time 4 "$1" 2>/dev/null | grep -q '"ok":true'
}

start_service() {
  local dir="$1" log="$2" name="$3"
  echo "[$(date '+%F %T')] starting $name" >> "$LOG"
  (cd "$dir" && setsid nohup bun run dev >> "$log" 2>&1 < /dev/null &)
}

echo "[$(date '+%F %T')] supervisor started (pid $$)" >> "$LOG"

while true; do
  if ! check http://127.0.0.1:3003/health; then
    echo "[$(date '+%F %T')] realtime :3003 down — restarting" >> "$LOG"
    start_service "$ROOT/realtime" "$ROOT/realtime/realtime.log" "realtime"
  fi
  if ! check http://127.0.0.1:3004/health; then
    echo "[$(date '+%F %T')] telegram-bot :3004 down — restarting" >> "$LOG"
    start_service "$ROOT/telegram-bot" "$ROOT/telegram-bot/bot.log" "telegram-bot"
  fi
  if ! check http://127.0.0.1:3303/health; then
    echo "[$(date '+%F %T')] call-service :3303 down — restarting" >> "$LOG"
    start_service "$ROOT/call-service" "$ROOT/call-service/call-service.log" "call-service"
  fi
  HB=$((HB+1))
  if [ $((HB % 30)) -eq 0 ]; then
    echo "[$(date '+%F %T')] heartbeat: cycles=$HB" >> "$LOG"
  fi
  sleep 20
done
