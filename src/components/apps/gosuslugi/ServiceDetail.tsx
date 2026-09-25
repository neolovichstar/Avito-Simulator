'use client'

// ServiceDetail (Task 26-b, чистка 27-b) — детальный экран сервиса Госуслуг.
// Три внутренних состояния (описание → заявление → отправлено), локальный стейт.
// Минимум текста: чипы цены/срока, 3 коротких шага, документы списком.
// Особые сервисы: «Штрафы ГИБДД» ведёт к штрафам, «Оплата налогов» — тост
// про приложение «Налоги».

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CalendarClock, Check, CheckCircle2, FileText, Loader2, Wallet } from 'lucide-react'
import type { GosService, GosUserData } from '@/lib/gos-docs'
import { CARD, serviceUi } from './ui'

type Stage = 'info' | 'form' | 'sent'

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[#F0F1F5] px-2.5 py-1 text-[11.5px] font-semibold text-[#5C616B]">{children}</span>
  )
}

export default function ServiceDetail({
  service,
  user,
  onBack,
  onGoDebts,
  toast,
}: {
  service: GosService
  user: GosUserData
  onBack: () => void
  onGoDebts: () => void
  toast: (title: string, body: string) => void
}) {
  const [stage, setStage] = useState<Stage>('info')
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [appNumber, setAppNumber] = useState('')
  const { icon: Icon, color } = serviceUi(service.id)

  const allChosen = (service.form ?? []).every((g) => choices[g.title])

  const submit = () => {
    if (!allChosen || sending) return
    setSending(true)
    // имитация отправки заявления
    window.setTimeout(() => {
      setAppNumber(`Г-${Math.floor(100000 + Math.random() * 900000)}`)
      setSending(false)
      setStage('sent')
      toast('Госуслуги', `Заявление отправлено: ${service.title}`)
    }, 900)
  }

  const reviewUntil = new Date(Date.now() + 5 * 864e5).toLocaleDateString('ru-RU')

  return (
    <div className="relative flex h-full flex-col">
      {/* шапка */}
      <header className="flex h-14 shrink-0 items-center gap-1 bg-[#F5F6F8] px-2">
        <button
          type="button"
          onClick={() => (stage === 'info' ? onBack() : setStage('info'))}
          aria-label="Назад"
          className="flex size-10 shrink-0 items-center justify-center rounded-full transition active:bg-black/[0.06]"
        >
          <ArrowLeft className="size-5 text-[#17181A]" strokeWidth={2.2} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-[#17181A]">{service.title}</h1>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-6">
        <AnimatePresence mode="wait" initial={false}>
          {stage === 'info' && (
            <motion.div
              key="info"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="space-y-3 px-4"
            >
              {/* герой */}
              <div className={CARD + ' p-5'}>
                <div className="flex items-start gap-3.5">
                  <span
                    className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${color}1A`, color }}
                    aria-hidden="true"
                  >
                    <Icon className="size-6" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-bold leading-snug text-[#17181A]">{service.title}</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#5C616B]">{service.desc}</p>
                  </div>
                </div>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <MetaChip>{service.price}</MetaChip>
                  <MetaChip>{service.duration}</MetaChip>
                </div>
              </div>

              {/* шаги */}
              <div className={CARD + ' p-5'}>
                <h3 className="text-[14.5px] font-bold text-[#17181A]">Как это работает</h3>
                <ol className="mt-3 space-y-3">
                  {service.steps.map((s, i) => (
                    <li key={s} className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0D4CD3] text-[12px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[13.5px] leading-relaxed text-[#17181A]">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* документы */}
              <div className={CARD + ' p-5'}>
                <h3 className="text-[14.5px] font-bold text-[#17181A]">Понадобятся документы</h3>
                <ul className="mt-3 space-y-2.5">
                  {service.requires.map((r) => (
                    <li key={r} className="flex items-center gap-2.5">
                      <Check className="size-[18px] shrink-0 text-[#067A47]" strokeWidth={2.4} />
                      <span className="text-[13.5px] text-[#17181A]">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {service.special === 'taxes' && (
                <div className="flex items-center gap-2.5 rounded-[18px] bg-[#F8A13A]/10 p-4">
                  <Wallet className="size-[18px] shrink-0 text-[#B25E09]" strokeWidth={2} />
                  <p className="text-[12.5px] font-medium text-[#B25E09]">Оплата проходит в приложении «Налоги»</p>
                </div>
              )}

              {/* CTA */}
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (service.special === 'debts') return onGoDebts()
                    if (service.special === 'taxes') {
                      toast('Госуслуги', 'Раздел доступен в приложении «Налоги»')
                      return
                    }
                    setStage('form')
                  }}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0D4CD3] text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(13,76,211,0.28)] transition active:scale-[0.985]"
                >
                  {service.special === 'debts' && 'Открыть штрафы'}
                  {service.special === 'taxes' && 'Перейти в «Налоги»'}
                  {!service.special && 'Начать оформление'}
                </button>
              </div>
            </motion.div>
          )}

          {stage === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="space-y-3 px-4"
            >
              <div className={CARD + ' p-5'}>
                <h3 className="text-[14.5px] font-bold text-[#17181A]">Заявление</h3>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F6F8] px-3.5 py-2.5">
                    <span className="text-[12px] text-[#9AA0A8]">Заявитель</span>
                    <span className="truncate text-[13.5px] font-semibold text-[#17181A]">{user.displayName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F6F8] px-3.5 py-2.5">
                    <span className="text-[12px] text-[#9AA0A8]">Город</span>
                    <span className="truncate text-[13.5px] font-semibold text-[#17181A]">{user.city}</span>
                  </div>
                </div>
              </div>

              {(service.form ?? []).map((group) => (
                <div key={group.title} className={CARD + ' p-5'}>
                  <h3 className="text-[13.5px] font-bold text-[#17181A]">{group.title}</h3>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {group.choices.map((c) => {
                      const active = choices[group.title] === c
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setChoices((prev) => ({ ...prev, [group.title]: c }))}
                          aria-pressed={active}
                          className={
                            'rounded-full px-3.5 py-2 text-[12.5px] font-medium transition active:scale-[0.97] ' +
                            (active
                              ? 'bg-[#0D4CD3] text-white'
                              : 'bg-[#F0F1F5] text-[#5C616B]')
                          }
                        >
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={submit}
                disabled={!allChosen || sending}
                className={
                  'flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold text-white transition ' +
                  (allChosen && !sending
                    ? 'bg-[#0D4CD3] shadow-[0_6px_16px_rgba(13,76,211,0.28)] active:scale-[0.985]'
                    : 'bg-[#0D4CD3]/40')
                }
              >
                {sending && <Loader2 className="size-[18px] animate-spin" strokeWidth={2.2} />}
                {sending ? 'Отправляем…' : 'Отправить заявление'}
              </button>
            </motion.div>
          )}

          {stage === 'sent' && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="space-y-3 px-4"
            >
              <div className={CARD + ' flex flex-col items-center p-6 text-center'}>
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.05 }}
                  className="flex size-16 items-center justify-center rounded-full bg-[#0AC760]/12"
                >
                  <CheckCircle2 className="size-9 text-[#067A47]" strokeWidth={2} />
                </motion.span>
                <h3 className="mt-3.5 text-[17px] font-bold text-[#17181A]">Заявление отправлено</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5C616B]">
                  {service.title} · номер {appNumber}
                </p>
                <div className="mt-4 w-full space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-[#F5F6F8] px-3.5 py-2.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-[#9AA0A8]">
                      <FileText className="size-4" strokeWidth={2} />
                      Статус
                    </span>
                    <span className="text-[13px] font-semibold text-[#17181A]">В обработке</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[#F5F6F8] px-3.5 py-2.5">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-[#9AA0A8]">
                      <CalendarClock className="size-4" strokeWidth={2} />
                      Срок рассмотрения
                    </span>
                    <span className="text-[13px] font-semibold text-[#17181A]">до {reviewUntil}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="flex h-12 w-full items-center justify-center rounded-[14px] bg-[#0D4CD3] text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(13,76,211,0.28)] transition active:scale-[0.985]"
              >
                Отлично
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
