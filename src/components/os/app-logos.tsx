'use client'

import type { ReactNode } from 'react'
import type { AppKey } from '@/lib/store'

// ─────────────────────────────────────────────────────────────────────────────
// Кастомные SVG-логотипы приложений ОС (чистый SVG, без эмодзи, без lucide).
// Каждый логотип — белый/двухтоновый силуэт, который кладётся на градиентную
// плитку AppIcon (фон плитки передаётся через APP_TILE[app].background).
// Бренд площадки — «Resale»: бирка-ценник как центральный образ.
// ─────────────────────────────────────────────────────────────────────────────

// Resale: наклонная бирка-ценник с отверстием (фирменный образ площадки).
export function DealLogo() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="h-7 w-7"
    >
      <defs>
        <linearGradient id="dealGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4ADE80" />
          <stop offset="1" stopColor="#15803D" />
        </linearGradient>
      </defs>
      <path
        d="M21.5 6.5 H39 a2.5 2.5 0 0 1 2.5 2.5 V26.5 a3 3 0 0 1-.88 2.12 L27.5 41.74 a3 3 0 0 1-4.24 0 L6.62 25.1 a3 3 0 0 1 0-4.24 L19.38 7.38 a3 3 0 0 1 2.12-.88 Z"
        fill="url(#dealGrad)"
      />
      <circle cx="33" cy="15" r="3.2" fill="#ffffff" />
      <path
        d="M14.5 26.5 l5.5 5.5 L30 21.5"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
    </svg>
  )
}

// Лидеры: пьедестал-таблица с золотым лидером.
export function LeaderboardLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <rect x="9" y="26" width="10" height="14" rx="2" fill="#94A3B8" />
      <rect x="19" y="18" width="10" height="22" rx="2" fill="#D4A017" />
      <rect x="29" y="30" width="10" height="10" rx="2" fill="#C48A5A" />
      <path
        d="M24 6 l2.1 4.3 4.7 .7 -3.4 3.3 .8 4.7 -4.2 -2.2 -4.2 2.2 .8 -4.7 -3.4 -3.3 4.7 -.7 Z"
        fill="#F5B60A"
      />
    </svg>
  )
}

// Банк: монета с рублём — свой образ, без отсылок к реальным банкам.
export function BankLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <circle cx="24" cy="24" r="17" fill="#ffffff" opacity="0.95" />
      <circle cx="24" cy="24" r="13.2" stroke="#1B9A45" strokeWidth="2.2" opacity="0.55" />
      <path
        d="M19.5 33 V14.5 h6.2 a6.6 6.6 0 0 1 0 13.2 H16.8 M16.8 31 h11"
        stroke="#157F2A"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

// Налоги: квитанция с зубчатым краем и знаком процента.
export function TaxesLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        d="M13 6 h22 v33 l-3.7 -2.6 -3.6 2.6 -3.7 -2.6 -3.6 2.6 -3.7 -2.6 L13 39 Z"
        fill="#ffffff"
        opacity="0.95"
      />
      <path
        d="M17.5 14.5 h13 M17.5 19.5 h13 M17.5 24.5 h8"
        stroke="#2D3748"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="19.6" cy="30.8" r="2.5" stroke="#2D3748" strokeWidth="2" />
      <circle cx="28.4" cy="34.6" r="2.5" stroke="#2D3748" strokeWidth="2" />
      <path d="M29.5 28.5 l-11 8" stroke="#2D3748" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

// Браузер: глобус с меридианами и орбитой-спутником.
export function BrowserLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <circle cx="24" cy="24" r="15" stroke="#ffffff" strokeWidth="3" />
      <ellipse cx="24" cy="24" rx="7" ry="15" stroke="#ffffff" strokeWidth="2.2" opacity="0.75" />
      <path d="M9.5 19.5 h29 M9.5 28.5 h29" stroke="#ffffff" strokeWidth="2.2" opacity="0.75" />
      <circle cx="37.5" cy="11.5" r="3" fill="#ffffff" />
      <path
        d="M37.5 8.5 a15.5 15.5 0 0 0 -12 -4"
        stroke="#ffffff"
        strokeWidth="1.8"
        opacity="0.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Настройки: настоящая шестерёнка (8 зубьев + кольцо с отверстием).
export function SettingsLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect
          key={a}
          x="21"
          y="4.5"
          width="6"
          height="10.5"
          rx="2.2"
          fill="#ffffff"
          transform={`rotate(${a} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="10.6" stroke="#ffffff" strokeWidth="6.4" />
    </svg>
  )
}

// Сервис: гаечный ключ + молоток крестом (классический силуэт «build»).
export function RepairLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
      />
    </svg>
  )
}

// Аукцион: молоток судьи (гавел) с подставкой.
export function AuctionLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M1 21h12v2H1zM5.245 8.07l2.83-2.83 14.14 14.14-2.83 2.83zM12.317 1l5.657 5.656-2.83 2.83-5.654-5.66zM3.825 9.485l5.657 5.657-2.828 2.828-5.657-5.657z"
      />
    </svg>
  )
}

// Задания: кубок/трофей за квесты и достижения.
export function CareerLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"
      />
    </svg>
  )
}

// Доставки: фургон курьера.
export function DeliveryLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
      />
    </svg>
  )
}

// ─── Системные приложения Resale OS ────────────────────────────────────────

// Калькулятор: сетка кнопок.
export function CalcLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <rect x="11" y="8" width="26" height="9" rx="2" fill="#ffffff" opacity="0.95" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={11 + c * 9.5} y={21 + r * 7} width="7" height="5.4" rx="1.4" fill="#ffffff" opacity={0.55} />
        )),
      )}
      <rect x="30" y="21" width="7" height="12.4" rx="1.4" fill="#ffffff" />
    </svg>
  )
}

// Часы: циферблат со стрелками.
export function ClockLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <circle cx="24" cy="24" r="16.5" fill="#ffffff" opacity="0.95" />
      <circle cx="24" cy="24" r="16.5" stroke="#0f172a" strokeOpacity="0.18" strokeWidth="1.4" />
      <path d="M24 14.5 V24 l6.5 4.5" stroke="#0f172a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="1.9" fill="#ef4444" />
    </svg>
  )
}

// Календарь: листок с красной шапкой и числом.
export function CalendarLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <rect x="9" y="10" width="30" height="29" rx="4" fill="#ffffff" />
      <path d="M9 14 a4 4 0 0 1 4-4 h22 a4 4 0 0 1 4 4 v5 H9 Z" fill="#ef4444" />
      <text x="24" y="33.5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1f2937" fontFamily="system-ui, sans-serif">25</text>
    </svg>
  )
}

// Заметки: жёлтый лист с строками.
export function NotesLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <rect x="10" y="8" width="28" height="32" rx="4" fill="#fef3c7" />
      <path d="M10 12 a4 4 0 0 1 4-4 h20 a4 4 0 0 1 4 4 v3 H10 Z" fill="#f59e0b" />
      <path d="M16 22 h16 M16 27.5 h16 M16 33 h10" stroke="#92400e" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

// Погода: солнце за облаком.
export function WeatherLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <circle cx="19" cy="18" r="7.5" fill="#fde047" />
      <path d="M15 34 a7 7 0 0 1 1.2-13.9 9 9 0 0 1 17.3 2.4 A6 6 0 0 1 33 34 Z" fill="#ffffff" />
    </svg>
  )
}

// Галерея: разноцветный «цветок» из лепестков.
export function GalleryLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <circle cx="24" cy="16.5" r="6" fill="#ef4444" opacity="0.9" />
      <circle cx="31.5" cy="24" r="6" fill="#f59e0b" opacity="0.9" />
      <circle cx="24" cy="31.5" r="6" fill="#22c55e" opacity="0.9" />
      <circle cx="16.5" cy="24" r="6" fill="#0ea5e9" opacity="0.9" />
      <circle cx="24" cy="24" r="3.4" fill="#ffffff" />
    </svg>
  )
}

// Музыка: нота.
export function MusicLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path d="M19 34.5 V13.5 l16-3.5 v19" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ellipse cx="14.5" cy="34.8" rx="5" ry="4" fill="#ffffff" />
      <ellipse cx="30.5" cy="29.3" rx="5" ry="4" fill="#ffffff" />
    </svg>
  )
}

// Телефон: классическая трубка.
export function PhoneLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      />
    </svg>
  )
}

// Госуслуги: флаг-ромб бренда (стилизованный).
export function GosLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path d="M24 6 L42 24 L24 42 L6 24 Z" fill="#ffffff" />
      <path d="M24 13 L35 24 L24 35 L13 24 Z" fill="#0D4CD3" />
      <circle cx="24" cy="24" r="4" fill="#ffffff" />
    </svg>
  )
}

// Номера: три барабана с цифрами (прокрутка красивых номеров).
export function NumbersLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      {[7, 24, 41].map((x, i) => (
        <g key={x}>
          <rect x={x - 7} y={12} width={14} height={24} rx={3.5} fill="#ffffff" opacity={i === 1 ? 0.95 : 0.75} />
          <text
            x={x}
            y={29.5}
            textAnchor="middle"
            fontSize={15}
            fontWeight="700"
            fontFamily="Arial, sans-serif"
            fill={i === 1 ? '#FFB800' : '#17181A'}
          >
            7
          </text>
        </g>
      ))}
    </svg>
  )
}

export function PlatesLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <rect x={4} y={13} width={40} height={22} rx={4} fill="#ffffff" opacity={0.96} />
      <rect x={6.2} y={15.2} width={35.6} height={17.6} rx={2.4} stroke="#17181A" strokeOpacity={0.85} strokeWidth={1.6} />
      <text x={13.5} y={30} textAnchor="middle" fontSize={12} fontWeight={800} fontFamily="Arial, sans-serif" fill="#17181A">
        {'А'}
      </text>
      <text x={24} y={30} textAnchor="middle" fontSize={12} fontWeight={800} fontFamily="Arial, sans-serif" fill="#17181A">
        {'777'}
      </text>
      <text x={34.5} y={30} textAnchor="middle" fontSize={11} fontWeight={800} fontFamily="Arial, sans-serif" fill="#17181A">
        {'ВС'}
      </text>
    </svg>
  )
}

// Поддержка: гарнитура оператора (наушники с микрофоном).
export function SupportLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-7 w-7">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Реестр плиток: градиент фона + логотип + подпись для каждого AppKey.
// image — вырезанный логотип из фирменного пака (public/img/apps/*.png):
// прозрачные скруглённые углы, своя подсветка — выглядит как настоящая иконка ОС.
// SVG-иконки ниже остаются fallback'ом (пока PNG грузится / для консистентности).
// ─────────────────────────────────────────────────────────────────────────────
export const APP_TILE: Record<AppKey, { label: string; background: string; image: string; icon: ReactNode }> = {
  avito: {
    label: 'Resale',
    background: 'linear-gradient(150deg, #8C1F2A 0%, #5A121A 60%, #400C12 100%)',
    image: '/img/apps/avito.png?v=4',
    icon: <DealLogo />,
  },
  bank: {
    label: 'Банк',
    background: 'linear-gradient(145deg, #14498A 0%, #0C2F5C 60%, #081F3E 100%)',
    image: '/img/apps/bank.png?v=4',
    icon: <BankLogo />,
  },
  taxes: {
    label: 'Налоги',
    background: 'linear-gradient(145deg, #55408F 0%, #392B66 60%, #281D4A 100%)',
    image: '/img/apps/taxes.png?v=4',
    icon: <TaxesLogo />,
  },
  browser: {
    label: 'Браузер',
    background: 'linear-gradient(145deg, #0F55C8, #05307A)',
    image: '/img/apps/browser.png?v=4',
    icon: <BrowserLogo />,
  },
  settings: {
    label: 'Настройки',
    background: 'linear-gradient(145deg, #3E434B, #23262C)',
    image: '/img/apps/settings.png?v=4',
    icon: <SettingsLogo />,
  },
  repair: {
    label: 'Сервис',
    background: 'linear-gradient(145deg, #1E7A50, #0F4A2F)',
    image: '/img/apps/repair.png?v=4',
    icon: <RepairLogo />,
  },
  auction: {
    label: 'Аукцион',
    background: 'linear-gradient(145deg, #7C4A1C, #4A2A0E)',
    image: '/img/apps/auction.png?v=4',
    icon: <AuctionLogo />,
  },
  career: {
    label: 'Задания',
    background: 'linear-gradient(145deg, #6C4BC8, #422C80)',
    image: '/img/apps/career.png?v=4',
    icon: <CareerLogo />,
  },
  delivery: {
    label: 'Доставки',
    background: 'linear-gradient(145deg, #C25E12, #7A3A08)',
    image: '/img/apps/delivery.png?v=4',
    icon: <DeliveryLogo />,
  },
  leaderboard: {
    label: 'Лидеры',
    background: 'linear-gradient(145deg, #A87E12 0%, #6E5009 60%, #4E3705 100%)',
    image: '/img/apps/leaderboard.png?v=4',
    icon: <LeaderboardLogo />,
  },
  calc: {
    label: 'Калькулятор',
    background: 'linear-gradient(145deg, #2C3038, #17191E)',
    image: '/img/apps/calc.png?v=4',
    icon: <CalcLogo />,
  },
  clock: {
    label: 'Часы',
    background: 'linear-gradient(145deg, #2C2B2E, #171618)',
    image: '/img/apps/clock.png?v=4',
    icon: <ClockLogo />,
  },
  calendar: {
    label: 'Календарь',
    background: 'linear-gradient(145deg, #D2CBCC, #ABA4A6)',
    image: '/img/apps/calendar.png?v=4',
    icon: <CalendarLogo />,
  },
  notes: {
    label: 'Заметки',
    background: 'linear-gradient(145deg, #D6A51C, #8F6A0C)',
    image: '/img/apps/notes.png?v=4',
    icon: <NotesLogo />,
  },
  weather: {
    label: 'Погода',
    background: 'linear-gradient(145deg, #1E86D4, #0C5590)',
    image: '/img/apps/weather.png?v=4',
    icon: <WeatherLogo />,
  },
  gallery: {
    label: 'Галерея',
    background: 'linear-gradient(145deg, #CDD0D8, #A9ACB6)',
    image: '/img/apps/gallery.png?v=4',
    icon: <GalleryLogo />,
  },
  music: {
    label: 'Музыка',
    background: 'linear-gradient(145deg, #B02040, #6E1226)',
    image: '/img/apps/music.png?v=4',
    icon: <MusicLogo />,
  },
  phone: {
    label: 'Телефон',
    background: 'linear-gradient(145deg, #23803A, #134C22)',
    image: '/img/apps/phone.png?v=4',
    icon: <PhoneLogo />,
  },
  gosuslugi: {
    label: 'Госуслуги',
    background: 'linear-gradient(145deg, #1560C4, #0A3A78)',
    image: '/img/apps/gosuslugi.png?v=4',
    icon: <GosLogo />,
  },
  numbers: {
    label: 'Номера',
    background: 'linear-gradient(145deg, #5B3AA6, #341F66)',
    image: '/img/apps/numbers.png?v=4',
    icon: <NumbersLogo />,
  },
  plates: {
    label: 'Автономера',
    background: 'linear-gradient(145deg, #3F4753, #171B21)',
    image: '/img/apps/plates.png?v=4',
    icon: <PlatesLogo />,
  },
  support: {
    label: 'Поддержка',
    background: 'linear-gradient(145deg, #12777C, #0A4B4E)',
    image: '/img/apps/support.png?v=4',
    icon: <SupportLogo />,
  },
}

/** Иконка-картинка приложения: логотип из пака, заполняет плитку целиком. */
export function AppTileImage({ app, className }: { app: AppKey; className?: string }) {
  const src = APP_TILE[app].image
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="eager"
      decoding="sync"
      className={`pointer-events-none select-none object-cover ${className ?? ''}`}
    />
  )
}

// Порядок иконок на домашнем экране (сетка 4 колонки) и в доке — как в макете:
// док: Перепродажа · Банк · Телефон · Браузер; страница 1: Лидеры, Налоги,
// Сервис, Аукцион, Задания, Доставка, Поддержка, Погода, Музыка, Галерея,
// Калькулятор, Часы, Календарь, Заметки, Настройки…
export const HOME_GRID: AppKey[] = [
  'avito',
  'bank',
  'phone',
  'browser',
  'leaderboard',
  'taxes',
  'repair',
  'auction',
  'career',
  'delivery',
  'support',
  'weather',
  'music',
  'gallery',
  'calc',
  'clock',
  'calendar',
  'notes',
  'settings',
  'numbers',
  'plates',
  'gosuslugi',
]

export const DOCK_APPS: AppKey[] = ['avito', 'bank', 'auction', 'career']

/** Приложения-«функции» для страницы 2 и системные. */
export const PAGE1_APPS = HOME_GRID.slice(0, 8)
export const PAGE2_APPS = HOME_GRID.slice(8)

// ─────────────────────────────────────────────────────────────────────────────
// «О приложении»: карточка по долгому тапу на иконке (как в настоящей ОС).
// ─────────────────────────────────────────────────────────────────────────────
export interface AppInfo {
  desc: string
  category: string
  size: string
  age: string
}

export const APP_INFO: Record<AppKey, AppInfo> = {
  avito: { desc: 'Площадка перепродажи: покупай, продавай и торгуйся с живыми продавцами.', category: 'Платформа', size: '84,2 МБ', age: '12+' },
  bank: { desc: 'Столичный Банк: карты, кредиты, копилка и вся история операций.', category: 'Финансы', size: '61,7 МБ', age: '12+' },
  taxes: { desc: 'Налоговая служба: начисления, пени и оплата в пару тапов.', category: 'Финансы', size: '28,4 МБ', age: '12+' },
  leaderboard: { desc: 'Топ игроков площадки по балансу, сделкам и уровню.', category: 'Платформа', size: '12,9 МБ', age: '12+' },
  calc: { desc: 'Обычный калькулятор: проценты и смена знака, ничего лишнего.', category: 'Утилиты', size: '4,1 МБ', age: '4+' },
  clock: { desc: 'Часы городов мира и таймер обратного отсчёта.', category: 'Утилиты', size: '9,3 МБ', age: '4+' },
  calendar: { desc: 'Календарь месяца: планы и важные даты под рукой.', category: 'Утилиты', size: '7,8 МБ', age: '4+' },
  notes: { desc: 'Быстрые заметки: список дел сохраняется на устройстве.', category: 'Утилиты', size: '5,5 МБ', age: '4+' },
  weather: { desc: 'Прогноз по городам: температура, ветер, влажность и давление.', category: 'Погода', size: '18,6 МБ', age: '4+' },
  gallery: { desc: 'Фотографии товаров и сделок в одном месте.', category: 'Медиа', size: '33,0 МБ', age: '4+' },
  music: { desc: 'Музыка с глобальным плеером ОС: трек не прерывается.', category: 'Медиа', size: '47,2 МБ', age: '12+' },
  repair: { desc: 'Сервисные работы: ремонт и обслуживание ваших товаров.', category: 'Платформа', size: '21,4 МБ', age: '12+' },
  auction: { desc: 'Аукцион в реальном времени: ставки, автоставка, антиснайпинг.', category: 'Платформа', size: '26,8 МБ', age: '12+' },
  career: { desc: 'Задания и достижения: выполняй и получай награды.', category: 'Платформа', size: '14,7 МБ', age: '12+' },
  delivery: { desc: 'Доставка покупок: трек посылки от склада до двери.', category: 'Платформа', size: '19,5 МБ', age: '12+' },
  settings: { desc: 'Настройки Resale OS: сеть, звук, приватность и оформление.', category: 'Система', size: '3,6 МБ', age: '4+' },
  browser: { desc: 'Браузер с поиском и быстрыми ссылками на сайты.', category: 'Интернет', size: '39,9 МБ', age: '12+' },
  phone: { desc: 'Звонки: контакты, журнал вызовов и набор номера.', category: 'Связь', size: '11,2 МБ', age: '4+' },
  gosuslugi: { desc: 'Госуслуги: документы и справки без очередей.', category: 'Сервисы', size: '55,3 МБ', age: '12+' },
  numbers: { desc: 'Красивые телефонные номера: крутки, редкости и выкуп.', category: 'Платформа', size: '23,1 МБ', age: '12+' },
  plates: { desc: 'Автономера по ГОСТ: крутка знаков и коллекция.', category: 'Платформа', size: '24,0 МБ', age: '12+' },
  support: { desc: 'Поддержка Resale: ответим на любой вопрос о приложении.', category: 'Сервисы', size: '6,4 МБ', age: '4+' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Библиотека приложений: разделы как в макете Resale OS.
// ─────────────────────────────────────────────────────────────────────────────
export type LibChip = 'all' | 'work' | 'util' | 'media' | 'other'
export const LIB_CHIPS: { key: LibChip; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'work', label: 'Работа' },
  { key: 'util', label: 'Утилиты' },
  { key: 'media', label: 'Медиа' },
  { key: 'other', label: 'Другое' },
]

export const LIB_SECTIONS: { key: string; title: string; chip: Exclude<LibChip, 'all'>; apps: AppKey[] }[] = [
  { key: 'docs', title: 'Документы', chip: 'other', apps: ['gosuslugi', 'plates', 'numbers'] },
  { key: 'work', title: 'Работа', chip: 'work', apps: ['career', 'delivery', 'leaderboard', 'support'] },
  { key: 'util', title: 'Утилиты', chip: 'util', apps: ['clock', 'calendar', 'notes', 'calc', 'settings', 'phone'] },
  { key: 'media', title: 'Медиа', chip: 'media', apps: ['weather', 'music', 'gallery', 'browser'] },
  { key: 'fin', title: 'Финансы и торговля', chip: 'other', apps: ['avito', 'bank', 'taxes', 'auction', 'repair'] },
]

// Раскладка «Домашнего экрана» по умолчанию: док + сетка (как в макете).
export const DEFAULT_DOCK: AppKey[] = ['avito', 'bank', 'phone', 'browser']
export const DEFAULT_GRID: AppKey[] = HOME_GRID.filter((a) => !DEFAULT_DOCK.includes(a))
