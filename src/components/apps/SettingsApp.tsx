'use client'

// Приложение «Настройки» — Material 3 Expressive (Android 16), светлая тема.
// Фон #F5F6F8, белые карточки rounded-[24px], текст #17181A, вторичный #8B8F99,
// разделители #EBEDF0, акцент зелёный #21A038.
// Главный герой — правильный M3Switch: track 52×32, thumb 24px с иконкой-галочкой
// (M3 Expressive), переход 200ms cubic-bezier(0.2,0,0,1). ВСЕ тогглы настроек — через него.
// Реальные настройки ОС: dnd, тема, яркость, обои, виджеты, вибро-отклик, зарядка, сеть.
// Визуальные (локальный state): Wi-Fi, мобильные данные, Bluetooth, автоповорот,
// уведомления приложений, громкость.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bell, Bluetooth, Check, ChevronRight, Fingerprint, LayoutGrid, Moon, MoonStar, Palette,
  Search, Signal, Smartphone, Sparkles, Sun, User, Vibrate, Volume2, Wifi, X, Zap,
} from 'lucide-react'
import { useOS, ALL_WIDGETS, WIDGET_LABEL, type AppKey, type NetKind, type WidgetKey } from '@/lib/store'
import { WALLPAPERS, wallpaperPreviewStyle } from '@/lib/wallpapers'
import { APP_TILE } from '@/components/os/app-logos'
import { sound } from '@/lib/sound'

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
      className="group relative h-8 w-[52px] shrink-0 cursor-pointer rounded-full outline-none transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)] focus-visible:ring-2 focus-visible:ring-[#21A038]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      style={{ backgroundColor: checked ? '#21A038' : '#DADCE0' }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 flex size-6 items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3),0_3px_8px_rgba(0,0,0,0.15)] transition-[left,background-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-active:scale-90"
        style={{ left: checked ? 24 : 4, backgroundColor: checked ? '#FFFFFF' : '#F7F8FA' }}
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

  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = r.width > 0 ? (clientX - r.left) / r.width : 0
    onChange(Math.min(1, Math.max(0, v)))
  }

  return (
    <div className="flex items-center gap-3">
      {leftIcon && <span className="shrink-0 text-[#8B8F99]" aria-hidden="true">{leftIcon}</span>}
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
          e.currentTarget.setPointerCapture?.(e.pointerId)
          apply(e.clientX)
        }}
        onPointerMove={(e) => {
          if (dragging.current) apply(e.clientX)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
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
        className="relative h-12 flex-1 touch-none select-none rounded-full bg-[#E4E6EB] outline-none focus-visible:ring-2 focus-visible:ring-[#21A038]/50"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#21A038]" style={{ width: `${value * 100}%` }} />
        <div
          className="absolute top-1/2 size-7 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
          style={{ left: `calc(${value * 100}% - 14px)` }}
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
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8B8F99]">{title}</h2>
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(23,24,26,0.04),0_10px_30px_-18px_rgba(23,24,26,0.10)]">
        {children}
      </div>
    </section>
  )
}

interface RowItem {
  key: string
  color: string
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
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${r.color}1F`, color: r.color }}
          aria-hidden="true"
        >
          {r.icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-[#17181A]">{r.label}</span>
        {r.desc && <span className="mt-0.5 block truncate text-xs text-[#8B8F99]">{r.desc}</span>}
      </span>
      {r.right}
      {r.chevron && <ChevronRight className="size-4 shrink-0 text-[#C9CDD4]" aria-hidden="true" />}
    </>
  )
  if (r.right) {
    // Внутри уже есть интерактивный элемент (M3Switch/слайдер) — строка НЕ <button>:
    // вложенные кнопки = невалидный HTML и hydration-ошибка. Тап по строке — удобно.
    return (
      <div
        onClick={r.onClick}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 transition-colors duration-150 active:bg-[#F0F1F5]"
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
        className="flex min-h-[52px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors duration-150 active:bg-[#F0F1F5]"
      >
        {inner}
      </button>
    )
  }
  return <div className="flex min-h-[52px] items-center gap-3.5 px-4 py-2.5">{inner}</div>
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
  // вибро-отклик (единственный отклик ОС — звуки полностью убраны)
  const [vibro, setVibro] = useState(sound.isEnabled())
  useEffect(() => sound.subscribe(setVibro), [])

  // визуальные тогглы (локальный state, приятная анимация)
  const [wifiOn, setWifiOn] = useState(true)
  const [mobileData, setMobileData] = useState(true)
  const [btOn, setBtOn] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [notifOn, setNotifOn] = useState(true)
  const [volume, setVolume] = useState(0.65)

  // поиск по настройкам
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hit = (s: string) => q === '' || s.toLowerCase().includes(q)

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
      color: '#0A8A76',
      icon: <Wifi className="size-5" />,
      label: 'Wi-Fi',
      desc: wifiOn ? (netOnline ? NET_LABEL[netKind] : 'Сеть без доступа к интернету') : 'Выключено',
      right: <M3Switch checked={wifiOn} onChange={setWifiOn} label="Wi-Fi" />,
      onClick: () => setWifiOn((v) => !v),
    },
    {
      key: 'mobile',
      color: '#21A038',
      icon: <Signal className="size-5" />,
      label: 'Мобильные данные',
      desc: mobileData ? 'Фоновая передача данных включена' : 'Только Wi-Fi',
      right: <M3Switch checked={mobileData} onChange={setMobileData} label="Мобильные данные" />,
      onClick: () => setMobileData((v) => !v),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const btRows: RowItem[] = [
    {
      key: 'bt',
      color: '#D64570',
      icon: <Bluetooth className="size-5" />,
      label: 'Bluetooth',
      desc: btOn ? 'Доступен для устройств рядом' : 'Выключено',
      right: <M3Switch checked={btOn} onChange={setBtOn} label="Bluetooth" />,
      onClick: () => setBtOn((v) => !v),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const appRows: RowItem[] = APPS.map(({ key, role }) => ({
    key: `app-${key}`,
    color: '#21A038',
    noTile: true,
    icon: <img src={APP_TILE[key].image} alt="" aria-hidden="true" className="size-10 rounded-xl" />,
    label: APP_TILE[key].label,
    desc: `${role} · системное`,
    chevron: true,
    onClick: () => openApp(key),
  })).filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const notifRows: RowItem[] = [
    {
      key: 'dnd',
      color: '#44474F',
      icon: <MoonStar className="size-5" />,
      label: 'Не беспокоить',
      desc: dnd ? 'Тосты скрыты — всё копится в шторке' : 'Уведомления всплывают поверх экрана',
      right: <M3Switch checked={dnd} onChange={setDnd} label="Не беспокоить" />,
      onClick: () => setDnd(!dnd),
    },
    {
      key: 'notif',
      color: '#E8A020',
      icon: <Bell className="size-5" />,
      label: 'Уведомления приложений',
      desc: notifOn ? 'Всплывающие карточки на экране' : 'Только в шторке уведомлений',
      right: <M3Switch checked={notifOn} onChange={setNotifOn} label="Уведомления приложений" />,
      onClick: () => setNotifOn((v) => !v),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const soundRows: RowItem[] = [
    {
      key: 'vibro',
      color: '#21A038',
      icon: <Vibrate className="size-5" />,
      label: 'Вибро-отклик',
      desc: vibro ? 'Вибрация на действия и события включена' : 'Полная тишина: без вибрации',
      right: <M3Switch checked={vibro} onChange={(v) => sound.setEnabled(v)} label="Вибро-отклик" />,
      onClick: () => sound.setEnabled(!vibro),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const screenRows: RowItem[] = [
    {
      key: 'dark',
      color: '#44474F',
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
      color: '#D64570',
      icon: <Smartphone className="size-5" />,
      label: 'Автоповорот',
      desc: autoRotate ? 'Экран следует за рукой' : 'Только портретная ориентация',
      right: <M3Switch checked={autoRotate} onChange={setAutoRotate} label="Автоповорот" />,
      onClick: () => setAutoRotate((v) => !v),
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const batteryRows: RowItem[] = [
    {
      key: 'charge',
      color: '#21A038',
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
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const aboutRows: RowItem[] = [
    {
      key: 'model',
      color: '#44474F',
      icon: <Smartphone className="size-5" />,
      label: 'Модель',
      desc: 'Resale Phone 16 · 8 ГБ / 256 ГБ',
    },
    {
      key: 'version',
      color: '#0A8A76',
      icon: <Sparkles className="size-5" />,
      label: 'Версия ОС',
      desc: 'Android 16 · Material 3 Expressive',
    },
    {
      key: 'build',
      color: '#E8A020',
      icon: <LayoutGrid className="size-5" />,
      label: 'Сборка',
      desc: 'ResaleOS 2.5.0 (build 130)',
    },
    {
      key: 'deviceid',
      color: '#21A038',
      icon: <Fingerprint className="size-5" />,
      label: 'Идентификатор устройства',
      desc: 'Последние 8 знаков avito_sim_device_id',
      right: (
        <span className="shrink-0 rounded-lg bg-[#F0F1F5] px-2 py-1 font-mono text-[12px] font-semibold tracking-wider text-[#17181A]">
          {deviceId}
        </span>
      ),
    },
    {
      key: 'owner',
      color: '#D64570',
      icon: <User className="size-5" />,
      label: name,
      desc: session ? `@${session.username} · уровень ${session.level}` : 'Сессия не найдена',
    },
  ].filter((r) => hit(`${r.label} ${r.desc ?? ''}`))

  const wallpaperHit = hit('обои стиль виджеты домашний экран персонализация фон')
  const brightnessHit = hit('яркость экран подсветка')
  const volumeHit = hit('громкость звук мультимедиа')
  const batteryHit = hit('батарея зарядка аккумулятор питание')

  const sections: { key: string; visible: boolean; node: ReactNode }[] = [
    {
      key: 'net',
      visible: netRows.length > 0,
      node: (
        <Section title="Сеть и интернет">
          {netRows.map((r) => <RowLine key={r.key} r={r} />)}
        </Section>
      ),
    },
    {
      key: 'bt',
      visible: btRows.length > 0,
      node: (
        <Section title="Подключённые устройства">
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
            <div className="border-b border-[#EBEDF0] px-4 py-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[15px] font-medium text-[#17181A]">Громкость</span>
                <span className="text-[13px] font-semibold tabular-nums text-[#8B8F99]">{Math.round(volume * 100)}%</span>
              </div>
              <M3Slider
                value={volume}
                onChange={setVolume}
                ariaLabel="Громкость мультимедиа"
                leftIcon={<Volume2 className="size-5" />}
              />
              <p className="mt-2 text-[11px] text-[#8B8F99]">Мультимедиа · демо-ползунок системы</p>
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
            <div className="border-b border-[#EBEDF0] px-4 py-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[15px] font-medium text-[#17181A]">Яркость</span>
                <span className="text-[13px] font-semibold tabular-nums text-[#8B8F99]">{Math.round(brightness * 100)}%</span>
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
        <Section title="Обои и стиль">
          <div className="px-4 py-4">
            <div className="text-[15px] font-medium text-[#17181A]">Обои</div>
            <div className="mt-0.5 text-xs text-[#8B8F99]">Фон домашнего экрана и локскрина</div>
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
                      active ? 'border-[#21A038] ring-2 ring-[#21A038]/50' : 'border-[#EBEDF0]'
                    }`}
                    style={wallpaperPreviewStyle(w.id)}
                  />
                )
              })}
            </div>

            <div className="mt-5 text-[15px] font-medium text-[#17181A]">Виджеты домашнего экрана</div>
            <div className="mt-0.5 text-xs text-[#8B8F99]">Минимум один — экран не бывает пустым</div>
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
                    className={`h-9 rounded-full px-3.5 text-[13px] font-medium transition duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95 ${
                      on ? 'bg-[#21A038] text-white' : 'bg-[#F0F1F5] text-[#17181A]'
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
            <div className="border-b border-[#EBEDF0] px-4 py-4">
              <div className="flex items-center gap-4">
                <div className="tabular-nums leading-none">
                  <span className="text-[34px] font-bold text-[#17181A]">{battery}</span>
                  <span className="text-[18px] font-semibold text-[#8B8F99]">%</span>
                </div>
                <div className="relative flex-1 pr-2">
                  <div className="relative h-11 rounded-[14px] border-2 border-[#C9CDD4] p-[3px]">
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
                  <div className="absolute right-0 top-1/2 h-5 w-[5px] -translate-y-1/2 rounded-r-[3px] bg-[#C9CDD4]" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[13px] font-medium" style={{ color: charging ? '#21A038' : '#8B8F99' }}>
                <Zap className={`size-4 ${charging ? 'fill-[#21A038]/20' : ''}`} aria-hidden="true" />
                {charging ? 'Заряжается' : 'Разряжается'}
                <span className="font-normal text-[#8B8F99]">
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
    <div className="flex h-full flex-col bg-[#F5F6F8] text-[#17181A]">
      {/* шапка: крупный заголовок + поисковая пилюля */}
      <div className="shrink-0 px-4 pb-3 pt-5">
        <h1 className="px-1 text-[28px] font-bold leading-tight tracking-[-0.01em]">Настройки</h1>
        <div className="mt-4 flex h-12 items-center gap-2.5 rounded-full bg-[#F0F1F5] px-4">
          <Search className="size-4.5 shrink-0 text-[#8B8F99]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск настроек"
            aria-label="Поиск настроек"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8B8F99]"
          />
          {query !== '' && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery('')}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#8B8F99] transition active:bg-[#E4E6EB]"
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
            <Search className="size-10 text-[#C9CDD4]" aria-hidden="true" />
            <div className="mt-3 text-[15px] font-semibold text-[#17181A]">Ничего не найдено</div>
            <p className="mt-1 max-w-[240px] text-[13px] text-[#8B8F99]">
              Попробуйте другой запрос — например «яркость», «обои» или «Wi-Fi»
            </p>
          </div>
        ) : (
          visibleSections.map((s) => <div key={s.key}>{s.node}</div>)
        )}

        <p className="px-1 pb-2 pt-1 text-center text-[11px] text-[#8B8F99]">
          Resale Phone 16 · Android 16 · ResaleOS 2.5.0 (130)
        </p>
      </div>
    </div>
  )
}
