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
      className="h-9 w-9"
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
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
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className="h-9 w-9">
      <path
        transform="translate(3.6 3.6) scale(1.7)"
        fill="#ffffff"
        d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
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
    background: 'linear-gradient(160deg, #FFFFFF 0%, #EDFAF3 55%, #D5F5E3 100%)',
    image: '/img/apps/avito.png',
    icon: <DealLogo />,
  },
  bank: {
    label: 'Банк',
    background: 'linear-gradient(145deg, #2FBE51 0%, #21A038 55%, #157F2A 100%)',
    image: '/img/apps/bank.png',
    icon: <BankLogo />,
  },
  taxes: {
    label: 'Налоги',
    background: 'linear-gradient(145deg, #4A5568 0%, #2D3748 55%, #1A202C 100%)',
    image: '/img/apps/taxes.png',
    icon: <TaxesLogo />,
  },
  browser: {
    label: 'Браузер',
    background: 'linear-gradient(145deg, #0EA5E9, #0284C7)',
    image: '/img/apps/browser.png',
    icon: <BrowserLogo />,
  },
  settings: {
    label: 'Настройки',
    background: 'linear-gradient(145deg, #6B7280, #4B5563)',
    image: '/img/apps/settings.png',
    icon: <SettingsLogo />,
  },
  repair: {
    label: 'Сервис',
    background: 'linear-gradient(145deg, #F59E0B, #D97706)',
    image: '/img/apps/repair.png',
    icon: <RepairLogo />,
  },
  auction: {
    label: 'Аукцион',
    background: 'linear-gradient(145deg, #D4A017, #B45309)',
    image: '/img/apps/auction.png',
    icon: <AuctionLogo />,
  },
  career: {
    label: 'Задания',
    background: 'linear-gradient(145deg, #15803D, #14532D)',
    image: '/img/apps/career.png',
    icon: <CareerLogo />,
  },
  delivery: {
    label: 'Доставки',
    background: 'linear-gradient(145deg, #065F46, #064E3B)',
    image: '/img/apps/delivery.png',
    icon: <DeliveryLogo />,
  },
  leaderboard: {
    label: 'Лидеры',
    background: 'linear-gradient(145deg, #F8FAFC 0%, #E2E8F0 45%, #CBD5E1 100%)',
    image: '/img/apps/leaderboard.png',
    icon: <LeaderboardLogo />,
  },
}

/** Иконка-картинка приложения: логотип из пака, заполняет плитку целиком. */
export function AppTileImage({ app, className }: { app: AppKey; className?: string }) {
  return <img src={APP_TILE[app].image} alt="" aria-hidden="true" draggable={false} className={`pointer-events-none select-none object-cover ${className ?? ''}`} />
}

// Порядок иконок на домашнем экране (сетка 4 колонки) и в доке.
export const HOME_GRID: AppKey[] = [
  'avito',
  'bank',
  'leaderboard',
  'taxes',
  'browser',
  'settings',
  'repair',
  'auction',
  'career',
  'delivery',
]

export const DOCK_APPS: AppKey[] = ['avito', 'bank', 'auction', 'career']
