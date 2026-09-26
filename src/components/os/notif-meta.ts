'use client'

// Мета-информация типов уведомлений: иконка, подложка, приложение-цель.
// Общий источник для шторки (Shade), локскрина, списка уведомлений и тостов.
import {
  Crown, Gavel, Info, MessageSquare, Receipt, ShoppingBag, TrendingUp, Truck,
  Trophy, type LucideIcon,
} from 'lucide-react'
import type { AppKey } from '@/lib/store'

export interface NotifApp {
  app: string
  icon: LucideIcon
  bg: string
  openApp: AppKey
}

export const KIND_APP: Record<string, NotifApp> = {
  deal: { app: 'Resale', icon: ShoppingBag, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  message: { app: 'Resale', icon: MessageSquare, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  tax: { app: 'Налоги', icon: Receipt, bg: 'linear-gradient(145deg,#4a5568,#2d3748)', openApp: 'taxes' },
  market: { app: 'Resale', icon: TrendingUp, bg: 'linear-gradient(145deg,#4ADE80,#15803D)', openApp: 'avito' },
  career: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  quest: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  achievement: { app: 'Задания', icon: Trophy, bg: 'linear-gradient(145deg,#4ADE80,#065F46)', openApp: 'career' },
  auction: { app: 'Аукцион', icon: Gavel, bg: 'linear-gradient(145deg,#fbbf24,#b45309)', openApp: 'auction' },
  delivery: { app: 'Доставки', icon: Truck, bg: 'linear-gradient(145deg,#34d399,#047857)', openApp: 'delivery' },
  leader: { app: 'Лидеры', icon: Crown, bg: 'linear-gradient(145deg,#fcd34d,#92400e)', openApp: 'leaderboard' },
  system: { app: 'Система', icon: Info, bg: 'linear-gradient(145deg,#9ca3af,#4b5563)', openApp: 'settings' },
}

// Винительный падеж для кнопки «Открыть …»: Система → Систему
const APP_ACC: Record<string, string> = { Система: 'Систему' }
export const accName = (app: string) => APP_ACC[app] ?? app
