'use client'

// Приложение «Настройки» — Android 17 / Material 3 Expressive, тёмная системная тема.
// Фон #0A0F0C, секции-карточки rounded-[24px] bg-white/[0.06] + ring-1 ring-white/[0.06],
// заголовки-капсы 11px text-white/45 НАД карточками, строка = чип-иконка 40px (тональная
// заливка emerald/amber/rose/zinc — без синего/индиго) + title 14.5px + sub 12px white/50.
// Главный герой — правильный M3Switch: track 52×32, thumb 24px с иконкой-галочкой
// (M3 Expressive), переход 200ms cubic-bezier(0.2,0,0,1). ВСЕ тогглы настроек — через него.
// Реальные настройки ОС: dnd, тема, яркость, обои, виджеты, вибро-отклик, зарядка, сеть.
// Устройство (с сохранением в prefs-сторе): Wi-Fi, мобильные данные, Bluetooth,
// автоповорот, уведомления приложений. Громкость медиа — глобальный стор volume.ts.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  Bell, Bluetooth, Check, ChevronRight, Eye, EyeOff, Fingerprint, LayoutGrid, LockKeyhole, Moon, MoonStar,
  Search, Signal, Smartphone, Sparkles, Sun, User, Vibrate, Volume2, Wifi, X, Zap,
} from 'lucide-react'
import { useOS, ALL_WIDGETS, WIDGET_LABEL, type AppKey, type NetKind, type WidgetKey } from '@/lib/store'
import { usePrefs } from '@/lib/prefs'
import { useVolume } from '@/lib/volume'
import { collectDeviceInfo, type DeviceInfo } from '@/lib/device-info'
import { WALLPAPERS, wallpaperPreviewStyle } from '@/lib/wallpapers'
import { APP_TILE } from '@/components/os/app-logos'
import { sound } from '@/lib/sound'
import { fuzzyMatch } from '@/lib/smart-search'

// ─────────────────────────────────────────────────────────────────────────────
// M3 Switch (Expressive): track 52×32, thumb 24, галочка в thumb, 200ms M3-easing
// ─────────────────────────────────────────────────────────────────────────────
function M3Switch({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Включено' : 'Выключено')}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className="group relative h-8 w-[52px] shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-[#21A038]/60"
      style={{ backgroundColor: checked ? '#21A038' : 'rgba(255,255,255,0.16)' }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 flex size-6 items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3),0_3px_8px_rgba(0,0,0,0.15)] transition-[left,background-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-active:scale-90"
        style={{ left: checked ? 24 : 4, backgroundColor: checked ? '#FFFFFF' : '#C9CDD4' }}
      >
        <Check
          className="size-3.5 transition-opacity duration-150"
          style={{ color: '#21A038', opacity: checked ? 1 : 0 }}
          strokeWidth={3.5}
          aria-hidden="true"
        />
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// M3 Slider: капсула h-12 rounded-full, активная часть залита, круглый handle
// ─────────────────────────────────────────────────────────────────────────────
function M3Slider({ value, onChange, ariaLabel, leftIcon, badge }: {
  value: number // 0..1
  onChange: (v: number) => void
  ariaLabel: string
  leftIcon?: ReactNode
  badge?: ReactNode
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [drag, setDrag] = useState(false)

  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = r.width > 0 ? (clientX - r.left) / r.width : 0
    onChange(Math.min(1, Math.max(0, v)))
  }

  return (
    <div className="flex items-center gap-3">
      {leftIcon && <span className="shrink-0 text-white/50" aria-hidden="true">{leftIcon}</span>}
      <div
        ref={trackRef}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true
          setDrag(true)
          apply(e.clientX)
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId)
          } catch {
            // синтетический/неактивный указатель — не критично
          }
        }}
        onPointerMove={(e) => {
          if (dragging.current) apply(e.clientX)
        }}
        onPointerUp={() => {
          dragging.current = false
          setDrag(false)
        }}
        onPointerCancel={() => {
          dragging.current = false
          setDrag(false)
        }}
        onLostPointerCapture={() => {
          dragging.current = false
          setDrag(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(0, value - 0.05))
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(1, value + 0.05))
          }
        }}
        className="relative h-12 flex-1 touch-none select-none rounded-full bg-white/[0.12] outline-none focus-visible:ring-2 focus-visible:ring-[#21A038]/50"
      >
        {/* активная заливка — до центра ручки (на 0% скрыта) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#21A038] transition-opacity duration-150"
          style={{ width: `calc(18px + (100% - 36px) * ${value})`, opacity: value < 0.01 ? 0 : 1 }}
        />
        {/* ручка 28px — всегда внутри капсулы (отступ 4px от краёв) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-transform duration-150 ${drag ? 'scale-125' : ''}`}
          style={{ left: `calc(4px + (100% - 36px) * ${value})`, width: 28, height: 28, backgroundColor: '#FFFFFF' }}
        />
      </div>
      {badge}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Секция и строка настроек
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">{title}</h2>
      <div className="overflow-hidden rounded-[24px] bg-white/[0.06] ring-1 ring-white/[0.06]">
        {children}
      </div>
    </section>
  )
}

// Тональные чипы иконок (M3 Expressive): заливка 15% + светлый тон иконки. Без синего/индиго.
// tone — строка (массивы строк проходят через .filter, литеральные типы там расширяются).
const TONE: Record<string, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  rose: 'bg-rose-500/15 text-rose-300',
  zinc: 'bg-zinc-500/15 text-zinc-300',
}

interface RowItem {
  key: string
  tone: string
  icon: ReactNode
  label: string
  desc?: string
  right?: ReactNode
  chevron?: boolean
  onClick?: () => void
  noTile?: boolean // иконка уже «плитка» (PNG логотип приложения)
}

function RowLine({ r }: { r: RowItem }) {
  const inner = (
    <>
      {r.noTile ? (
        <span className="shrink-0" aria-hidden="true">{r.icon}</span>
      ) : (
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONE[r.tone]}`}
          aria-hidden="true"
        >
          {r.icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-white">{r.label}</span>
        {r.desc && <span className="mt-0.5 block truncate text-[12px] text-white/50">{r.desc}</span>}
      </span>
      {r.right}
      {r.chevron && <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />}
    </>
  )
  if (r.right) {
    // Внутри уже есть интерактивный элемент (M3Switch/слайдер) — строка НЕ <button>:
    // вложенные кнопки = невалидный HTML и hydration-ошибка. Тап по строке — удобно.
    return (
      <div
        onClick={r.onClick}
        className="relative flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] before:absolute before:left-14 before:right-0 before:top-0 before:border-t before:border-white/[0.05] first:before:hidden active:bg-white/[0.04]"
      >
        {inner}
      </div>
    )
  }
  if (r.onClick) {
    return (
      <button
        type="button"
        onClick={r.onClick}
        className="relative flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition duration-200 ease-[cubic-bezier(0.2,0,0,1)] before:absolute before:left-14 before:right-0 before:top-0 before:border-t before:border-white/[0.05] first:before:hidden active:scale-[0.97] active:bg-white/[0.04]"
      >
        {inner}
      </button>
    )
  }
  return <div className="relative flex min-h-[52px] items-center gap-3.5 px-4 py-2.5 before:absolute before:left-14 before:right-0 before:top-0 before:border-t before:border-white/[0.05] first:before:hidden">{inner}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// Данные
// ─────────────────────────────────────────────────────────────────────────────
const NET_LABEL: Record<NetKind, string> = {
  offline: 'Нет подключения',
  slow: 'Медленное соединение',
  '3g': 'Мобильная сеть · 3G',
  '4g': 'Мобильная сеть · 4G',
  wifi: 'Wi-Fi · отличное соединение',
}

const APPS: { key: AppKey; role: string }[] = [
  { key: 'avito', role: 'Маркетплейс' },
  { key: 'bank', role: 'Банк и вклады' },
  { key: 'browser', role: 'Веб-браузер' },
  { key: 'music', role: 'Музыка и подкасты' },
  { key: 'auction', role: 'Аукционы' },
  { key: 'delivery', role: 'Отслеживание посылок' },
  { key: 'career', role: 'Задания и награды' },
  { key: 'taxes', role: 'Налоги и платежи' },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsApp() {
  // реальные настройки ОС
  const session = useOS((s) => s.session)
  const battery = useOS((s) => s.battery)
  const batteryReal = useOS((s) => s.batteryReal)
  const charging = useOS((s) => s.charging)
  const setCharging = useOS((s) => s.setCharging)
  const netKind = useOS((s) => s.netKind)
  const netOnline = useOS((s) => s.netOnline)
  const dnd = useOS((s) => s.dnd)
  const setDnd = useOS((s) => s.setDnd)
  const theme = useOS((s) => s.theme)
  const setTheme = useOS((s) => s.setTheme)
  const brightness = useOS((s) => s.brightness)
  const setBrightness = useOS((s) => s.setBrightness)
  const wallpaper = useOS((s) => s.wallpaper)
  const setWallpaper = useOS((s) => s.setWallpaper)
  const widgets = useOS((s) => s.widgets)
  const setWidgets = useOS((s) => s.setWidgets)
  const openApp = useOS((s) => s.openApp)
  // вибро-отклик (единственный отклик ОС — звуки полностью убраны).
  // useSyncExternalStore — живой источник истины (общий с центром управления).
  const vibro = useSyncExternalStore(
    (cb) => sound.subscribe(cb),
    () => sound.isEnabled(),
    () => true,
  )

  // Свитчи устройства — ГЛОБАЛЬНЫЙ prefs-стор: состояние сохраняется между
  // открытиями приложения и перезагрузками (раньше слетало — «свитчи сломаны»).
  const wifiOn = usePrefs((s) => s.wifi)
  const mobileData = usePrefs((s) => s.mobileData)
  const btOn = usePrefs((s) => s.bt)
  const autoRotate = usePrefs((s) => s.rotate)
  const notifOn = usePrefs((s) => s.appNotif)
  const allowCalls = usePrefs((s) => s.allowCalls)
  const hideNumber = usePrefs((s) => s.hideNumber)
  const hideOnline = usePrefs((s) => s.hideOnline)
  const hideBalance = usePrefs((s) => s.hideBalance)
  const setPref = usePrefs((s) => s.setPref)

  // Громкость медиа — ГЛОБАЛЬНАЯ (store volume.ts): реально управляет музыкой,
  // дефолт 50%, синхронизирована с плашкой громкости и центром управления.
  const volume = useVolume((s) => s.volume)
  const setVolume = useVolume((s) => s.setVolume)

  // Реальные данные устройства (для «О телефоне»)
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  useEffect(() => {
    let alive = true
    collectDeviceInfo().then((d) => {
      if (alive) setDevice(d)
    })
    return () => {
      alive = false
    }
  }, [])

  // поиск по настройкам — умный fuzzy: «вайфай» найдёт Wi-Fi (ключевые слова
  // в строках ниже), «звак» найдёт зарядку (подпоследовательность),
  // «обуфь»-подобные опечатки ловит Левенштейн ≤2.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hit = (s: string) => q === '' || fuzzyMatch(query, s)

  // deviceId из localStorage (авито-симулятор) — последние 8 знаков
  const [deviceId] = useState(() => {
    if (typeof window === 'undefined') return '——'
    try {
      const id = localStorage.getItem('avito_sim_device_id')
      return id ? id.slice(-8).toUpperCase() : '——'
    } catch {
      return '——'
    }
  })

  const name = session?.displayName ?? 'Игрок'
  const batteryColor = charging ? '#21A038' : battery > 45 ? '#21A038' : battery > 20 ? '#E8A020' : '#D14343'

  // ── строки секций (с фильтром поиска) ────────────────────────────────────
  const netRows: RowItem[] = [
    {
      key: 'wifi',
      tone: 'emerald',
      icon: <Wifi className="size-5" />,
      label: 'Wi-Fi',
      desc: wifiOn ? (netOnline ? NET_LABEL[netKind] : 'Сеть без доступа к интернету') : 'Выключено',
      right: <M3Switch checked={wifiOn} onChange={(v) => setPref('wifi', v)} label="Wi-Fi" />,
      onClick: () => setPref('wifi', !wifiOn),
    },
    {
      key: 'mobile',
      tone: 'emerald',
      icon: <Signal className="size-5" />,
      label: 'Мобильные данные',
      desc: mobileData ? 'Фоновая передача данных включена' : 'Только Wi-Fi',
      right: <M3Switch checked={mobileData} onChange={(v) => setPref('mobileData', v)} label="Мобильные данные" />,
      onClick: () => setPref('mobileData', !mobileData),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} wifi вайфай вай-фай беспроводная сеть интернет подключение роутер нет`))

  const btRows: RowItem[] = [
    {
      key: 'bt',
      tone: 'emerald',
      icon: <Bluetooth className="size-5" />,
      label: 'Bluetooth',
      desc: btOn ? 'Доступен для устройств рядом' : 'Выключено',
      right: <M3Switch checked={btOn} onChange={(v) => setPref('bt', v)} label="Bluetooth" />,
      onClick: () => setPref('bt', !btOn),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} блютус бт гарнитура наушники подключение сопряжение`))

  const appRows: RowItem[] = APPS.map(({ key, role }) => ({
    key: `app-${key}`,
    tone: 'emerald',
    noTile: true,
    icon: (
      <img loading="lazy" decoding="async" src={APP_TILE[key].image}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-10 select-none rounded-[13px] shadow-[0_3px_10px_-3px_rgba(23,24,26,0.35)]"/>
    ),
    label: APP_TILE[key].label,
    desc: `${role} · системное`,
    chevron: true,
    onClick: () => openApp(key),
  })).filter((r) => hit(`${r.label} ${r.desc ?? ''} маркетплейс банк браузер музыка аукционы посылки задания налоги приложение`))

  const notifRows: RowItem[] = [
    {
      key: 'dnd',
      tone: 'amber',
      icon: <MoonStar className="size-5" />,
      label: 'Не беспокоить',
      desc: dnd ? 'Тосты скрыты — всё копится в шторке' : 'Уведомления всплывают поверх экрана',
      right: <M3Switch checked={dnd} onChange={setDnd} label="Не беспокоить" />,
      onClick: () => setDnd(!dnd),
    },
    {
      key: 'notif',
      tone: 'amber',
      icon: <Bell className="size-5" />,
      label: 'Уведомления приложений',
      desc: notifOn ? 'Всплывающие карточки на экране' : 'Только в шторке уведомлений',
      right: <M3Switch checked={notifOn} onChange={(v) => setPref('appNotif', v)} label="Уведомления приложений" />,
      onClick: () => setPref('appNotif', !notifOn),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} уведомления пуши оповещения шторка всплывающие тишина`))

  const soundRows: RowItem[] = [
    {
      key: 'vibro',
      tone: 'emerald',
      icon: <Vibrate className="size-5" />,
      label: 'Вибро-отклик',
      desc: vibro ? 'Вибрация на действия и события включена' : 'Полная тишина: без вибрации',
      right: <M3Switch checked={vibro} onChange={(v) => sound.setEnabled(v)} label="Вибро-отклик" />,
      onClick: () => sound.setEnabled(!vibro),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} вибро вибрация отклик тактильный гудок`))

  const screenRows: RowItem[] = [
    {
      key: 'dark',
      tone: 'zinc',
      icon: <Moon className="size-5" />,
      label: 'Тёмная тема',
      desc: theme === 'dark' ? 'Включена: тёмный интерфейс ОС' : 'Выключена: светлый интерфейс',
      right: (
        <M3Switch
          checked={theme === 'dark'}
          onChange={(v) => setTheme(v ? 'dark' : 'light')}
          label="Тёмная тема"
        />
      ),
      onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      key: 'rotate',
      tone: 'zinc',
      icon: <Smartphone className="size-5" />,
      label: 'Автоповорот',
      desc: autoRotate ? 'Экран следует за рукой' : 'Только портретная ориентация',
      right: <M3Switch checked={autoRotate} onChange={(v) => setPref('rotate', v)} label="Автоповорот" />,
      onClick: () => setPref('rotate', !autoRotate),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} тёмная тема ночь оформление автоповорот ориентация экран поворот ландшафт`))

  const batteryRows: RowItem[] = [
    {
      key: 'charge',
      tone: 'emerald',
      icon: <Zap className="size-5" />,
      label: 'Зарядка подключена',
      desc: batteryReal ? 'Управляется системой устройства' : charging ? 'Кабель в розетке — батарея растёт' : 'Кабель отключён',
      right: (
        <span onClick={(e) => e.stopPropagation()}>
          <M3Switch
            checked={charging}
            onChange={batteryReal ? () => undefined : setCharging}
            label="Зарядка подключена"
          />
        </span>
      ),
      onClick: () => {
        if (!batteryReal) setCharging(!charging)
      },
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} зарядка заряд аккумулятор батарея питание кабель розетка нет`))

  const privacyRows: RowItem[] = [
    {
      key: 'allowCalls',
      tone: 'rose',
      icon: <LockKeyhole className="size-5" />,
      label: 'Принимать звонки',
      desc: allowCalls ? 'Входящие вызовы проходят' : 'Все входящие отклоняются автоматически',
      right: <M3Switch checked={allowCalls} onChange={(v) => setPref('allowCalls', v)} label="Принимать звонки" />,
      onClick: () => setPref('allowCalls', !allowCalls),
    },
    {
      key: 'hideNumber',
      tone: 'rose',
      icon: <EyeOff className="size-5" />,
      label: 'Скрывать номер',
      desc: hideNumber ? 'Собеседник видит «Скрытый номер»' : 'Номер виден собеседникам и продавцам',
      right: <M3Switch checked={hideNumber} onChange={(v) => setPref('hideNumber', v)} label="Скрывать номер" />,
      onClick: () => setPref('hideNumber', !hideNumber),
    },
    {
      key: 'hideOnline',
      tone: 'rose',
      icon: <Eye className="size-5" />,
      label: 'Статус онлайн',
      desc: hideOnline ? 'Скрыт — вы «невидимка»' : 'Виден всем в чатах и объявлениях',
      right: <M3Switch checked={hideOnline} onChange={(v) => setPref('hideOnline', v)} label="Статус онлайн" />,
      onClick: () => setPref('hideOnline', !hideOnline),
    },
    {
      key: 'hideBalance',
      tone: 'rose',
      icon: <EyeOff className="size-5" />,
      label: 'Скрывать баланс',
      desc: hideBalance ? 'Баланс виден только вам' : 'Баланс виден в профиле',
      right: <M3Switch checked={hideBalance} onChange={(v) => setPref('hideBalance', v)} label="Скрывать баланс" />,
      onClick: () => setPref('hideBalance', !hideBalance),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} приватность безопасность конфиденциальность звонки номер онлайн баланс скрыть инкогнито невидимка`))

  const aboutRows: RowItem[] = [
    {
      key: 'model',
      tone: 'zinc',
      icon: <Smartphone className="size-5" />,
      label: 'Модель',
      desc: device
        ? `${device.model} · ${device.deviceBrand} · ${device.ramGb ? `${device.ramGb} ГБ ОЗУ` : `${device.cores ?? '?'} ядер`}`
        : 'Определение устройства…',
    },
    {
      key: 'version',
      tone: 'zinc',
      icon: <Sparkles className="size-5" />,
      label: 'Версия ОС',
      desc: device?.osVersion ? `Android 17 · реальная ОС: ${device.osName} ${device.osVersion}` : 'Android 17 · Material 3 Expressive',
    },
    {
      key: 'screen',
      tone: 'zinc',
      icon: <LayoutGrid className="size-5" />,
      label: 'Экран',
      desc: device?.screenPhysical
        ? `${device.screenPhysical} px (${device.screen})`
        : device?.screen ?? '—',
    },
    {
      key: 'cpu',
      tone: 'zinc',
      icon: <Zap className="size-5" />,
      label: 'Процессор',
      desc: device?.cores
        ? `${device.cores} ядер · ${device.ramGb ? `${(device.ramGb * 1024).toFixed(0)} МБ ОЗУ доступно системе` : 'реальные ядра устройства'}`
        : 'Определение…',
    },
    {
      key: 'storage',
      tone: 'zinc',
      icon: <Fingerprint className="size-5" />,
      label: 'Хранилище',
      desc:
        device?.storageUsed
          ? `Занято ${device.storageUsed} · свободно ${device.storageFree ?? '—'}`
          : 'Нет доступа к StorageManager',
    },
    {
      key: 'net',
      tone: 'zinc',
      icon: <Signal className="size-5" />,
      label: 'Сеть',
      desc: NET_LABEL[netKind],
    },
    {
      key: 'locale',
      tone: 'zinc',
      icon: <User className="size-5" />,
      label: 'Язык и регион',
      desc: device ? `${device.language} · ${device.timezone}` : '—',
    },
    {
      key: 'build',
      tone: 'zinc',
      icon: <LayoutGrid className="size-5" />,
      label: 'Сборка',
      desc: `ResaleOS 2.6.0 (build 140) · ${device?.browser ?? 'WebView'}`,
    },
    {
      key: 'deviceid',
      tone: 'zinc',
      icon: <Fingerprint className="size-5" />,
      label: 'Идентификатор устройства',
      desc: 'Последние 8 знаков avito_sim_device_id',
      right: (
        <span className="shrink-0 rounded-lg bg-white/[0.08] px-2 py-1 font-mono text-[12px] font-semibold tracking-wider text-white/85">
          {deviceId}
        </span>
      ),
    },
    {
      key: 'owner',
      tone: 'zinc',
      icon: <User className="size-5" />,
      label: name,
      desc: session ? `@${session.username} · уровень ${session.level}` : 'Сессия не найдена',
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''} о телефоне модель версия ос экран процессор хранилище память язык сборка устройство`))

  const wallpaperHit = hit('обои стиль виджеты домашний экран персонализация фон картинка')
  const brightnessHit = hit('яркость экран подсветка светло тьма')
  const volumeHit = hit('громкость звук мультимедиа медиа музыка тише')
  const privacyHit = hit('приватность безопасность конфиденциальность звонки номер онлайн баланс скрыть')
  const batteryHit = hit('батарея зарядка аккумулятор питание энергия заряд проценты')

  const sections: { key: string; visible: boolean; node: ReactNode }[] = [
    {
      key: 'net',
      visible: netRows.length > 0 || btRows.length > 0,
      node: (
        <Section title="Сеть и интернет">
          {netRows.map((r) => <RowLine key={r.key} r={r} />)}
          {btRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'apps',
      visible: appRows.length > 0,
      node: (
        <Section title="Приложения">
          {appRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'notif',
      visible: notifRows.length > 0,
      node: (
        <Section title="Уведомления">
          {notifRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'sound',
      visible: soundRows.length > 0 || volumeHit,
      node: (
        <Section title="Звук и вибрация">
          {volumeHit && (
            <div className="px-4 py-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[14.5px] font-semibold text-white">Громкость медиа</span>
                <span className="text-[12px] font-semibold tabular-nums text-white/45">{Math.round(volume * 100)}%</span>
              </div>
              <M3Slider
                value={volume}
                onChange={setVolume}
                ariaLabel="Громкость медиа"
                leftIcon={<Volume2 className="size-5" />}
              />
              <p className="mt-2 text-[11px] text-white/40">Управляет музыкой ОС · синхронизировано с плашкой громкости</p>
            </div>
          )}
          {soundRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'screen',
      visible: screenRows.length > 0 || brightnessHit,
      node: (
        <Section title="Экран">
          {brightnessHit && (
            <div className="px-4 py-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[14.5px] font-semibold text-white">Яркость</span>
                <span className="text-[12px] font-semibold tabular-nums text-white/45">{Math.round(brightness * 100)}%</span>
              </div>
              <M3Slider
                value={(brightness - 0.4) / 0.6}
                onChange={(v) => setBrightness(0.4 + v * 0.6)}
                ariaLabel="Яркость экрана"
                leftIcon={<Sun className="size-5" />}
              />
            </div>
          )}
          {screenRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'wall',
      visible: wallpaperHit,
      node: (
        <Section title="Персонализация">
          <div className="px-4 py-4">
            <div className="text-[14.5px] font-semibold text-white">Обои</div>
            <div className="mt-0.5 text-[12px] text-white/45">Фон домашнего экрана и локскрина</div>
            <div className="mt-3 grid grid-cols-4 gap-2.5">
              {WALLPAPERS.map((w) => {
                const active = wallpaper === w.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    aria-label={`Обои: ${w.name}`}
                    aria-pressed={active}
                    onClick={() => setWallpaper(w.id)}
                    className={`h-16 overflow-hidden rounded-xl border transition duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97] ${
                      active ? 'border-[#21A038] ring-2 ring-[#21A038]/50' : 'border-white/10'
                    }`}
                    style={wallpaperPreviewStyle(w.id)}
                  />
                )
              })}
            </div>

            <div className="mt-5 text-[14.5px] font-semibold text-white">Виджеты домашнего экрана</div>
            <div className="mt-0.5 text-[12px] text-white/45">Минимум один — экран не бывает пустым</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_WIDGETS.map((w: WidgetKey) => {
                const on = widgets.includes(w)
                return (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (on && widgets.length === 1) {
                        useOS.getState().pushToast('Обои и стиль', 'Минимум один виджет остаётся на экране')
                        return
                      }
                      setWidgets(on ? widgets.filter((x) => x !== w) : [...widgets, w])
                    }}
                    className={`h-11 rounded-full px-4 text-[13px] font-medium transition duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95 ${
                      on ? 'bg-[#21A038] text-white' : 'bg-white/[0.08] text-white/80'
                    }`}
                  >
                    {WIDGET_LABEL[w]}
                  </button>
                )
              })}
            </div>
          </div>
        </Section>
      ),
    },
    {
      key: 'battery',
      visible: batteryRows.length > 0 || batteryHit,
      node: (
        <Section title="Батарея">
          {batteryHit && (
            <div className="px-4 py-4">
              <div className="flex items-center gap-4">
                <div className="tabular-nums leading-none">
                  <span className="text-[34px] font-bold text-white">{battery}</span>
                  <span className="text-[18px] font-semibold text-white/45">%</span>
                </div>
                <div className="relative flex-1 pr-2">
                  <div className="relative h-11 rounded-[14px] border-2 border-white/25 p-[3px]">
                    <div
                      className="h-full rounded-[9px] transition-[width,background-color] duration-500"
                      style={{ width: `${Math.max(4, battery)}%`, backgroundColor: batteryColor }}
                    />
                    {charging && (
                      <Zap
                        className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="absolute right-0 top-1/2 h-5 w-[5px] -translate-y-1/2 rounded-r-[3px] bg-white/[0.25]" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: charging ? '#3ED598' : 'rgba(255,255,255,0.5)' }}>
                <Zap className={`size-4 ${charging ? 'fill-[#21A038]/20' : ''}`} aria-hidden="true" />
                {charging ? 'Заряжается' : 'Разряжается'}
                <span className="font-normal text-white/40">
                  · {batteryReal ? 'реальная батарея устройства' : 'симуляция питания'}
                </span>
              </div>
            </div>
          )}
          {batteryRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'privacy',
      visible: privacyRows.length > 0 || privacyHit,
      node: (
        <Section title="Приватность и безопасность">
          {privacyRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'about',
      visible: aboutRows.length > 0,
      node: (
        <Section title="О телефоне">
          {aboutRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
  ]

  const visibleSections = sections.filter((s) => s.visible)

  return (
    <div className="flex h-full flex-col bg-[#0A0F0C] text-white">
      {/* шапка: large title M3 + поисковая пилюля */}
      <div className="shrink-0 px-4 pb-3 pt-5">
        <h1 className="px-1 text-[26px] font-bold leading-tight tracking-[-0.02em]">Настройки</h1>
        <div className="mt-4 flex h-12 items-center gap-2.5 rounded-full bg-white/[0.08] px-4">
          <Search className="size-4.5 shrink-0 text-white/40" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск настроек"
            aria-label="Поиск настроек"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/35"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/45 transition active:bg-white/[0.08]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* секции */}
      <div className="flex-1 touch-pan-y space-y-5 overflow-y-auto px-4 pb-10 pt-1">
        {q !== '' && visibleSections.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-16 text-center">
            <Search className="size-10 text-white/25" aria-hidden="true" />
            <div className="mt-3 text-[15px] font-semibold text-white">Ничего не найдено</div>
            <p className="mt-1 max-w-[240px] text-[13px] text-white/45">
              Попробуйте другой запрос — например «яркость», «обои» или «Wi-Fi»
            </p>
          </div>
        ) : (
          visibleSections.map((s, i) => (
            <div key={s.key} className="m3-rise" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              {s.node}
            </div>
          ))
        )}

        <p className="px-1 pb-2 pt-1 text-center text-[11px] text-white/30">
          Resale Phone 17 · Android 17 · ResaleOS 2.6.0 (140)
        </p>
      </div>
    </div>
  )
}
