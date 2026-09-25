'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ЭКРАН ЗВООНКА ОС «Resale» (production).
//
// Рендерится системным CallOverlay (src/components/os/CallOverlay.tsx) поверх
// всего, стейт — глобальный useCall (звонок переживает выход из приложения).
//
// Два режима:
//  • ИИ-продавец (personaId/peerUserId, НЕ live): настоящий голосовой разговор.
//    PTT «зажал — говоришь — отпустил»: MediaRecorder (webm/opus, кап 45с) →
//    POST /api/calls/turn (ASR → LLM → TTS) → ответ проигрывается как звонковая
//    аудиодорожка (volume=1, НЕ медиа-громкость). Диалог дублируется пузырьками.
//    Нет микрофона / отказ в доступе (песочница!) → авто-фолбэк «Текстовый
//    режим»: печать текстом, LLM-ответ всё равно озвучивается.
//  • LIVE P2P (peer.live, 27-e): настоящий разговор игрок↔игрок через WebRTC
//    (медиа живёт в lib/live-call.ts, сюда приходит только стейт). Статусы:
//    «Вызов…» / «Соединение…» / таймер / «Связь потеряна». mute глушит трек
//    микрофона через стор (applyMute в live-call).
//  • Фейковый контакт: как в 26-a — таймер, mute/speaker визуально, иногда
//    «не отвечает».
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  EyeOff, Keyboard, Loader2, Mic, MicOff, Phone, PhoneOff, Send, Volume2, VolumeX,
} from 'lucide-react'
import { useCall } from '@/lib/call'
import { usePrefs } from '@/lib/prefs'
import { getToken } from '@/lib/api'
import { initials, pad2, useTick } from './shared'

type Voice = 'idle' | 'recording' | 'thinking' | 'speaking'

interface Bubble {
  role: 'user' | 'assistant'
  text: string
}

/** webm/opus при наличии, иначе дефолт браузера. */
function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/webm']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ниже */
    }
  }
  return ''
}

function arrayBufferToBase64(buf: ArrayBuffer): string | null {
  try {
    const bytes = new Uint8Array(buf)
    let bin = ''
    const CH = 0x8000
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CH))
    }
    return btoa(bin)
  } catch {
    return null
  }
}

export default function CallScreen() {
  const phase = useCall((s) => s.phase)
  const peer = useCall((s) => s.peer)
  const startedAt = useCall((s) => s.startedAt)
  const endedAt = useCall((s) => s.endedAt)
  const endReason = useCall((s) => s.endReason)
  const muted = useCall((s) => s.muted)
  const speaker = useCall((s) => s.speaker)
  const peerLost = useCall((s) => s.peerLost)
  const toggleMute = useCall((s) => s.toggleMute)
  const toggleSpeaker = useCall((s) => s.toggleSpeaker)
  const endCall = useCall((s) => s.endCall)
  const minimize = useCall((s) => s.minimize)
  const hideMine = usePrefs((s) => s.hideNumber)

  const tick = useTick()
  // live P2P-звонок (27-e) — НЕ ИИ: пузырьки/PTT продавца к нему не относятся
  const isLive = !!peer?.live
  const isAi = !isLive && !!(peer?.personaId || peer?.peerUserId)

  // ── голосовой движок (только для ИИ-звонков) ──
  const [voice, setVoice] = useState<Voice>('idle')
  const [textMode, setTextMode] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [bubbles, setBubbles] = useState<Bubble[]>([])

  const historyRef = useRef<Bubble[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const mimeRef = useRef('audio/webm')
  const chunksRef = useRef<Blob[]>([])
  const recStartRef = useRef(0)
  const discardRef = useRef(false)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playbackRef = useRef<HTMLAudioElement | null>(null)
  const busyRef = useRef(false) // идёт отправка/проигрывание хода
  const greetedRef = useRef(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // ── проигрывание ответа продавца (звонковая громкость, не медиа) ──
  const playReply = useCallback((b64: string, mime: string) => {
    setVoice('speaking')
    const finish = () => {
      if (playbackRef.current) {
        try {
          playbackRef.current.pause()
        } catch {
          /* уже остановлено */
        }
      }
      playbackRef.current = null
      setVoice('idle')
      busyRef.current = false
    }
    try {
      const a = new Audio(`data:${mime};base64,${b64}`)
      a.volume = 1 // это ЗВОНОК — системная громкость, useVolume медиа не трогает
      playbackRef.current = a
      a.onended = finish
      a.onerror = finish
      void a.play().catch(finish)
    } catch {
      finish()
    }
  }, [])

  // ── один ход диалога: история + реплика → сервер (ASR→LLM→TTS) ──
  const sendTurn = useCallback(
    async (payload: { audio?: string; text?: string }) => {
      const st = useCall.getState()
      const p = st.peer
      if (!p || busyRef.current || st.phase !== 'active') return
      busyRef.current = true
      setVoice('thinking')
      setHint(null)
      try {
        const res = await fetch('/api/calls/turn', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            callId: st.callId,
            personaId: p.personaId ?? undefined,
            peerUserId: p.peerUserId ?? undefined,
            listingTitle: p.listingTitle ?? undefined,
            listingPrice: p.listingPrice ?? undefined,
            history: historyRef.current.slice(-10),
            ...payload,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          userText?: string
          replyText?: string
          audioBase64?: string | null
          mimeType?: string | null
          error?: string
        }
        if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`)
        if (data.userText) {
          historyRef.current.push({ role: 'user', text: data.userText })
          setBubbles([...historyRef.current])
        }
        const reply = (data.replyText ?? '').trim()
        if (reply) {
          historyRef.current.push({ role: 'assistant', text: reply })
          setBubbles([...historyRef.current])
        }
        if (data.audioBase64) playReply(data.audioBase64, data.mimeType || 'audio/mpeg')
        else {
          setVoice('idle')
          busyRef.current = false
        }
      } catch (e) {
        setHint(e instanceof Error && e.message ? e.message : 'Плохо слышно — повторите ещё раз')
        setVoice('idle')
        busyRef.current = false
      }
    },
    [playReply],
  )

  // ── PTT: зажал — говоришь — отпустил = отправил ──
  const stopPtt = useCallback((discard = false) => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    const rec = recorderRef.current
    if (!rec) {
      setVoice((v) => (v === 'recording' ? 'idle' : v))
      return
    }
    discardRef.current = discard
    recorderRef.current = null
    try {
      rec.stop()
    } catch {
      setVoice('idle')
    }
  }, [])

  const onRecStop = useCallback(async () => {
    setVoice('thinking')
    const chunks = chunksRef.current
    chunksRef.current = []
    const dur = Date.now() - recStartRef.current
    if (discardRef.current || dur < 600 || chunks.length === 0) {
      setVoice('idle')
      if (!discardRef.current && dur < 600) setHint('Слишком коротко — зажмите и говорите')
      return
    }
    try {
      const blob = new Blob(chunks, { type: mimeRef.current })
      const b64 = arrayBufferToBase64(await blob.arrayBuffer())
      if (!b64) {
        setVoice('idle')
        setHint('Не удалось записать — попробуйте ещё раз')
        return
      }
      await sendTurn({ audio: b64 })
    } catch {
      setVoice('idle')
      setHint('Плохо слышно — повторите ещё раз')
    }
  }, [sendTurn])

  const startPtt = useCallback(async () => {
    const st = useCall.getState()
    if (st.phase !== 'active' || st.muted || busyRef.current || recorderRef.current) return
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setTextMode(true)
      setHint('Микрофон недоступен — печатайте текстом, продавец всё равно ответит голосом')
      return
    }
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      streamRef.current.getAudioTracks().forEach((tr) => {
        tr.enabled = !useCall.getState().muted
      })
      const mime = pickMime()
      mimeRef.current = mime || 'audio/webm'
      // Без явного mimeType — браузер возьмёт свой дефолт (Safari: audio/mp4).
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      discardRef.current = false
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => void onRecStop()
      recStartRef.current = Date.now()
      rec.start()
      recorderRef.current = rec
      setHint(null)
      setVoice('recording')
      maxTimerRef.current = setTimeout(() => stopPtt(), 45_000)
    } catch {
      setTextMode(true)
      setHint('Нет доступа к микрофону — печатайте текстом, продавец всё равно ответит голосом')
    }
  }, [onRecStop, stopPtt])

  // mute: глушим трек микрофона и выбрасываем текущую запись
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted
    })
    if (muted && recorderRef.current) stopPtt(true)
  }, [muted, stopPtt])

  // продавец снимает трубку и говорит первым
  useEffect(() => {
    if (phase !== 'active' || !isAi || greetedRef.current) return
    greetedRef.current = true
    void sendTurn({ text: '' })
  }, [phase, isAi, sendTurn])

  // завершение: стоп воспроизведение/запись, отпускаем микрофон
  useEffect(() => {
    if (phase !== 'ended') return
    if (playbackRef.current) {
      try {
        playbackRef.current.pause()
      } catch {
        /* не критично */
      }
      playbackRef.current = null
    }
    if (recorderRef.current) stopPtt(true)
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
  }, [phase, stopPtt])

  // размонтирование (звонок полностью ушёл в idle) — полная зачистка
  useEffect(
    () => () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
      try {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      } catch {
        /* не критично */
      }
      try {
        playbackRef.current?.pause()
      } catch {
        /* не критично */
      }
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    },
    [],
  )

  // автоскролл пузырьков вниз
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, voice])

  const secs =
    startedAt !== null
      ? Math.max(0, Math.floor(((phase === 'ended' ? (endedAt ?? tick) : tick) - startedAt) / 1000))
      : 0

  if (!peer) return null

  const inCall =
    phase === 'dialing' || phase === 'ringing-out' || phase === 'ringing' || phase === 'active' || phase === 'active-live'
  const pttDisabled = phase !== 'active' || muted

  const statusLine = (() => {
    if (phase === 'dialing') return 'Вызов…'
    if (phase === 'ringing-out') return 'Вызов…'
    if (phase === 'ringing') return 'Соединение…'
    if (phase === 'active') {
      if (!isAi) return `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`
      if (voice === 'recording') return 'Слушаю…'
      if (voice === 'thinking') return 'Думаю…'
      if (voice === 'speaking') return 'Собеседник говорит…'
      return hint ?? (textMode ? 'Текстовый режим' : 'Зажмите микрофон и говорите')
    }
    if (phase === 'active-live') {
      if (peerLost) return 'Связь потеряна…'
      return `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`
    }
    return ''
  })()

  const endedLabel =
    endReason === 'no_answer'
      ? 'Абонент не отвечает'
      : endReason === 'failed'
        ? 'Сбой связи'
        : endReason === 'rejected'
          ? 'Абонент отклонил вызов'
          : endReason === 'busy'
            ? 'Абонент занят'
            : endReason === 'offline'
              ? 'Абонент не в сети'
              : endReason === 'missed'
                ? 'Пропущенный звонок'
                : 'Звонок завершён'

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#07130D,#050D09)] text-white">
      {/* ── шапка: аватар, имя, статус ── */}
      <div className="flex flex-col items-center gap-1.5 pt-10">
        <div className="relative flex items-center justify-center">
          {(phase === 'dialing' || phase === 'ringing') && (
            <>
              <motion.span
                className="absolute size-20 rounded-full bg-emerald-500/20"
                animate={{ scale: [1, 1.7], opacity: [0.55, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
                aria-hidden="true"
              />
              <motion.span
                className="absolute size-20 rounded-full bg-emerald-500/15"
                animate={{ scale: [1, 1.7], opacity: [0.4, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut', delay: 0.55 }}
                aria-hidden="true"
              />
            </>
          )}
          <motion.div
            className={
              'flex size-20 items-center justify-center rounded-full text-[24px] font-semibold ' +
              (isAi ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-500/20 text-emerald-300')
            }
            animate={phase === 'dialing' || phase === 'ringing' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ repeat: phase === 'dialing' || phase === 'ringing' ? Infinity : 0, duration: 1.4 }}
          >
            {peer.name ? initials(peer.name) : <Phone className="size-8" aria-hidden="true" />}
          </motion.div>
        </div>

        <div className="mt-1 max-w-[85%] truncate text-[26px] font-semibold">{peer.name || peer.number}</div>
        {peer.name && peer.number && (
          <div className="text-[14px] tabular-nums text-white/60">{peer.number}</div>
        )}
        {peer.listingTitle && (
          <div className="mt-0.5 max-w-[85%] truncate rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/55">
            Разговор по объявлению: {peer.listingTitle}
          </div>
        )}
        {hideMine && (
          <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
            <EyeOff className="size-3" aria-hidden="true" />
            Ваш номер скрыт
          </div>
        )}
        <div className="mt-1 h-5 text-[13px] tabular-nums text-white/50" suppressHydrationWarning>
          {phase === 'ended' ? (
            <span>
              {endedLabel}
              {endReason === 'hangup' && secs > 0 ? ` · ${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}` : ''}
            </span>
          ) : (
            statusLine
          )}
        </div>
      </div>

      {/* ── диалог (ИИ-звонок): пузырьки поверх звонка ── */}
      {isAi && inCall ? (
        <div
          ref={transcriptRef}
          className="mt-3 min-h-16 flex-1 space-y-2 overflow-y-auto px-6 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar]:w-1"
          aria-live="polite"
          aria-label="Диалог разговора"
        >
          {bubbles.map((b, i) => (
            <div key={i} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={
                  'max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ' +
                  (b.role === 'user'
                    ? 'rounded-br-md bg-emerald-500/25 text-emerald-50'
                    : 'rounded-bl-md bg-white/[0.08] text-white/90')
                }
              >
                {b.text}
              </div>
            </div>
          ))}
          {voice === 'thinking' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white/[0.08] px-3.5 py-2.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-white/40"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* ── управление ── */}
      {inCall && (
        <>
          {/* индикатор записи */}
          {isAi && voice === 'recording' && (
            <div className="mb-1 flex items-center justify-center gap-2 text-[12px] text-red-300">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-red-400" />
              </span>
              Идёт запись · отпустите, чтобы отправить
            </div>
          )}

          <div className={'flex shrink-0 items-center justify-center gap-4 ' + (isAi && textMode ? 'px-4' : '')}>
            {/* mute */}
            <button
              type="button"
              onClick={() => {
                toggleMute()
              }}
              disabled={isLive ? phase !== 'active-live' : phase !== 'active'}
              aria-pressed={muted}
              aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}
              className={
                'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 ' +
                (muted ? 'bg-white text-[#052E16]' : 'bg-white/[0.08] text-white/80')
              }
            >
              {muted ? <MicOff className="size-5" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
            </button>

            {/* центр: PTT-микрофон / текстовый ввод / пусто для фейков */}
            {isAi && textMode ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = typed.trim()
                  if (!t || voice === 'thinking' || voice === 'speaking') return
                  setTyped('')
                  void sendTurn({ text: t })
                }}
              >
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Напечатайте сообщение…"
                  aria-label="Сообщение продавцу"
                  enterKeyHint="send"
                  className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.08] px-4 text-[14px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-white/25"
                />
                <button
                  type="submit"
                  disabled={!typed.trim() || voice === 'thinking' || voice === 'speaking'}
                  aria-label="Отправить"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[#052E16] transition-transform active:scale-90 disabled:opacity-40"
                >
                  {voice === 'thinking' ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                </button>
              </form>
            ) : isAi ? (
              <button
                type="button"
                disabled={pttDisabled}
                onPointerDown={(e) => {
                  e.preventDefault()
                  void startPtt()
                }}
                onPointerUp={() => stopPtt()}
                onPointerLeave={() => {
                  if (recorderRef.current) stopPtt()
                }}
                onPointerCancel={() => stopPtt(true)}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    e.preventDefault()
                    void startPtt()
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') stopPtt()
                }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={voice === 'recording' ? 'Отпустите, чтобы отправить' : 'Зажмите и говорите'}
                aria-disabled={pttDisabled}
                className={
                  'relative flex size-[76px] touch-none select-none items-center justify-center rounded-full transition-transform disabled:opacity-40 ' +
                  (voice === 'recording'
                    ? 'scale-105 bg-red-500 text-white'
                    : 'bg-emerald-500 text-[#052E16] active:scale-95')
                }
              >
                {voice === 'recording' && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-red-500/40"
                    animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: 'easeOut' }}
                    aria-hidden="true"
                  />
                )}
                <Mic className="relative size-8" aria-hidden="true" />
              </button>
            ) : (
              <div className="size-[76px]" aria-hidden="true" />
            )}

            {/* speaker (визуально, как в 26-a) */}
            <button
              type="button"
              onClick={() => {
                toggleSpeaker()
              }}
              disabled={isLive ? phase !== 'active-live' : phase !== 'active'}
              aria-pressed={speaker}
              aria-label={speaker ? 'Выключить громкую связь' : 'Включить громкую связь'}
              className={
                'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30 ' +
                (speaker ? 'bg-white text-[#052E16]' : 'bg-white/[0.08] text-white/80')
              }
            >
              {speaker ? (
                <Volume2 className="size-5" aria-hidden="true" />
              ) : (
                <VolumeX className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* нижний ряд: свернуть/текст-режим + сброс */}
          <div className="mt-4 flex shrink-0 flex-col items-center gap-3 pb-12">
            {(phase === 'active' || phase === 'active-live') && (
              <div className="flex items-center gap-2">
                {isAi && (
                  <button
                    type="button"
                    onClick={() => {
                      setTextMode((v) => !v)
                      setHint(null)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[11.5px] text-white/60 transition-colors active:bg-white/[0.12]"
                  >
                    {textMode ? (
                      <>
                        <Mic className="size-3.5" aria-hidden="true" /> Голосовой режим
                      </>
                    ) : (
                      <>
                        <Keyboard className="size-3.5" aria-hidden="true" /> Текстовый режим
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={minimize}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[11.5px] text-white/60 transition-colors active:bg-white/[0.12]"
                >
                  Свернуть — звонок продолжится
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => endCall('hangup')}
              aria-label="Завершить вызов"
              className="flex size-16 items-center justify-center rounded-full bg-red-500 text-white transition-transform active:scale-95"
            >
              <PhoneOff className="size-7" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {/* ── завершение: только статус, без управления ── */}
      {phase === 'ended' && (
        <div className="pb-16" />
      )}
    </div>
  )
}
