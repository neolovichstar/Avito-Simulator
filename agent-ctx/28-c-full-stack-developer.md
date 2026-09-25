# Task 28-c — Фронт ремонта (миниигры, склад запчастей, диагностика)

Дата: 2026 (сессия после падения предыдущего агента по таймауту)

## Что досталось от предыдущего агента (без записи в worklog)
- Бэкенд полностью: `prisma/schema.prisma` (PartStock, WorkshopTool, RepairJob, InstalledPart — db:push применён), `src/lib/parts.ts` (каталог ~150 запчастей, canFit с живыми причинами отказа, diagnose по сид-ГПСЧ, TOOLS, GAME_INFO, difficulty), `src/lib/repair-server.ts` (workCost/workshopItemDto/stockMapFor/toolsDto/validatePart/gameAndTool), `src/app/api/repair/{route,start,finish,cancel,diagnose,pickup,parts,tools}` — деньги только в $transaction серверно.
- Клиентский слой: методы `api.workshop/diagnose/jobStart/jobFinish/jobCancel/partBuy/partSell/toolBuy` в `src/lib/api.ts`, DTO `WorkshopDataDTO/JobConfigDTO/JobResultDTO/ActiveJobDTO/FaultDTO/ToolDTO/StockDTO` в `src/lib/types.ts`.
- Фронт: `src/components/apps/RepairApp.tsx` (~1157 строк) + `src/components/apps/repair/minigames.tsx` (668 строк, 5 игр) — компилировались, но UI-контур не был проверен живым флоу.

## Что доделано в этой сессии
1. **Проверка бэкенда**: прочитаны все 8 роутов api/repair/*, parts.ts, repair-server.ts, сверены формулы фронта (estWorkCost/estDiagFee/estSellRefund — зеркала серверных, только для подписей).
2. **Курсы исправлений во фронте**:
   - stale-state после НЕудачной мини-игры: `load(true)` теперь вызывается после любого `jobFinish` (активный наряд снимается, чип «Гарантия до HH:MM» появляется сразу; раньше обновление было только на success).
   - resume наряда: `hasTool` больше не хардкод `true` — добавлено поле `hasTool` в `ActiveJobDTO` (types.ts) с серверной проверкой живой прочности инструмента в `repair-server.activeJob()`.
   - синк уровня мастера в ОС-сессию (`refreshSession({ level })`) после загрузки мастерской.
   - копирайт вкладки «Инструмент» (убрано несуществующее «ускорение работы»).
3. **UI-QA в браузере** (agent-browser, 390×844, живой флоу с синтетическими PointerEvents в минииграх):
   - диагностика → чипы узлов с износом; вслепую «Ремонт · 2741₽» (Сложно) → seam отыгран → 100 «Идеально! С гарантийным чеком», Б/у→Хорошее, +580₽ (4% base), +38XP;
   - установка детали со склада → «Деталь встала идеально», valueAdd 1196₽ = 1495×(1−40/200), склад 2→1;
   - провал Simon (неверный тап) → 0 «Не вышло — работа по гарантии» +6XP → после фикса наряд снят, гарантия на карточке;
   - совместимость: батарея iPhone 12 на iPhone 11 — приглушена, тап → «Запчасть от другой модели (iPhone 11 не подходит)», «Поставить» скрыта; DDR/сокеты/БП↔GPU правила на месте;
   - вкладки Мастерская/Запчасти/Инструмент, пустые состояния, легаси-наёмный мастер — ок.

## Проверки
- `bunx tsc --noEmit` — 0 ошибок в src/ (легаси examples/mini-services/skills игнор).
- `bunx eslint` по RepairApp.tsx, minigames.tsx, parts.ts, repair-server.ts, api/repair — 0 проблем.
- `dev.log` — чистый (только ✓ Compiled и prisma-queries).
- curl-смоук реального аккаунта (HMAC-токен как в 26-a): workshop GET → diagnose → start → finish(92, perfect) → diagnose(велосипед) → start → cancel (возврат денег), parts buy/sell.

## Запрещённые зоны — не тронуты
NumbersApp, PhoneApp/phone/*, phone.ts, phone-server.ts, api/phones/*, GosuslugiApp/gosuslugi/*, call.ts, CallOverlay, ChatScreen, api/calls/*, api/mini-auth/*, mini-services/*, MusicApp, SettingsApp, api/music/*, player.ts, audius.ts, volume.ts, ai.ts, chat-engine.ts, deals.ts, DeliveryApp.tsx, prisma/schema.prisma (схема не менялась).
