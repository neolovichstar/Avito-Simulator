# Task 19-b — full-stack-developer — Светлый редизайн Заданий, Доставок и Лидеров

## Что сделано
- Изучил worklog.md (Task 18 обязательно): LIGHT_APPS-хром готов, координатор добавит 'career'/'delivery'/'leaderboard' в LIGHT_APPS сам.
- Редизайн 3 файлов под единую светлую систему (фон #F5F6FA, белые карточки r20, тень 0 2px 8px rgba(0,0,0,0.04), вторичный #9AA0A8, шапки 22 bold / 13 подзаголовок, CTA h-12 r12, active:scale-[0.98]):
  - **CareerApp.tsx** — акцент зелёный #21A03A: белые карточки заданий, иконка-круг 44 (цвет по типу квеста), прогресс h-1.5 зелёный + «3/5» tabular, награда справа bold, галочка-бейдж у выполненных, claim-пилюля, reroll-кнопка #F0F1F5, мега-квест — золотая рамка #D9A514 + бейдж ×2; достижения — светлые медали (золото/серебро/бронза), баннер серии #E7F5EA.
  - **DeliveryApp.tsx** — акцент изумруд #0AA06E, «в пути» янтарь #E8A020: белые карточки посылок с треком моно, ВЕРТИКАЛЬНЫЙ таймлайн (Заказан→Собран→В пути→Доставлен: пройденные — заполненные изумруд, активный — пульс с ping-кольцом, будущие — серые), курьер-карточка с ETA-баннером, светлая RouteMap, шапка-бар деталей border-b #E8EAED; дружелюбные пустые состояния.
  - **LeaderboardApp.tsx** — золото #D9A514 только на подиуме: топ-3 карточки 2-1-3 с медальонами 1/2/3 (золото/серебро #AEB4BC/бронза #C77B3B), корона и золотая рамка у первого; чистые ряды (ранг #9AA0A8, аватар, имя, значение bold tabular); «вы» — bg #E7F5EA + ring #21A03A/30; табы-чипы чёрные.

## Логика — 1:1 (не тронута)
- Career: api.career/claimQuest/rerollQuest/bonusState, sound.success, refreshSession, XP-формула xpForLevel, reroll-правила.
- Delivery: api.deliveries + тихий refetch 5с, useTick (useSyncExternalStore), stageProgress, isWorse/осмотр, copyTrack, mapOpen, поиск/фильтры/сортировка.
- Leaderboard: api.leaderboard, табы, порядок подиума 2-1-3.

## Проверки
- bunx tsc --noEmit: 0 ошибок в src/ (легаси examples/mini-services/skills — вне зоны).
- bunx eslint по 3 файлам: exit 0.
- grep: нет blue/indigo/violet/purple, нет хвостов тёмной темы.
- dev.log: HMR «✓ Compiled», GET / 200; сервер не перезапускался; page.tsx/lib/os/avito не тронуты.

## Риски / хвосты
1. **Для координатора:** добавить в src/app/page.tsx `LIGHT_APPS = { avito: true, bank: true, taxes: true, career: true, delivery: true, leaderboard: true }` — иначе статус-бар остаётся тёмным над светлыми приложениями.
2. Верт. таймлайн заменил горизонтальный степпер + EventTimeline (только презентация; stageProgress не менялся).
