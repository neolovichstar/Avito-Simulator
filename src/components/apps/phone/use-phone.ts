'use client'

// Хук-контроллер приложения «Телефон»: номера, прокрутки, бронь, журнал
// звонков. Все money-операции — на сервере, здесь только их вызов и стейт.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOS } from '@/lib/store'
import {
  phoneReq,
  type CallDTO,
  type ContactDTO,
  type PhoneDTO,
  type RollResponse,
} from './shared'

export type OpResult =
  | { ok: true; phone?: PhoneDTO; balance?: number; activated?: boolean; mainSet?: boolean }
  | { ok: false; error: string }

export interface PhoneApi {
  numbers: PhoneDTO[]
  owned: PhoneDTO[]
  reserves: PhoneDTO[]
  mainNumber: PhoneDTO | null
  balance: number
  loading: boolean
  calls: CallDTO[]
  contacts: ContactDTO[]
  refresh: () => Promise<void>
  roll: (regionCode: string) => Promise<RollResponse | { ok: false; error: string }>
  buy: (id: string) => Promise<OpResult>
  setMain: (id: string) => Promise<boolean>
  release: (id: string) => Promise<boolean>
  loadCalls: () => Promise<void>
  logCall: (input: {
    number: string
    peerName?: string | null
    peerUserId?: string | null
    durationSec: number
  }) => Promise<void>
  loadContacts: () => Promise<void>
}

export function usePhone(): PhoneApi {
  const refreshSession = useOS((s) => s.refreshSession)
  const [numbers, setNumbers] = useState<PhoneDTO[]>([])
  const [balance, setBalance] = useState(useOS.getState().session?.balance ?? 0)
  const [loading, setLoading] = useState(true)
  const [calls, setCalls] = useState<CallDTO[]>([])
  const [contacts, setContacts] = useState<ContactDTO[]>([])

  const applyBalance = useCallback(
    (b: number | undefined) => {
      if (typeof b !== 'number') return
      setBalance(b)
      refreshSession({ balance: b })
    },
    [refreshSession],
  )

  const refresh = useCallback(async () => {
    try {
      const data = await phoneReq<{ numbers: PhoneDTO[]; balance: number }>('/api/phones')
      setNumbers(data.numbers)
      applyBalance(data.balance)
    } catch {
      /* нет сети — покажем то, что есть */
    } finally {
      setLoading(false)
    }
  }, [applyBalance])

  const roll = useCallback(
    async (regionCode: string): Promise<RollResponse | { ok: false; error: string }> => {
      try {
        const data = await phoneReq<RollResponse>('/api/phones/roll', {
          method: 'POST',
          body: JSON.stringify({ regionCode }),
        })
        applyBalance(data.balance)
        await refresh()
        return data
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Прокрутка не удалась' }
      }
    },
    [applyBalance, refresh],
  )

  const buy = useCallback(
    async (id: string): Promise<OpResult> => {
      try {
        const data = await phoneReq<{
          ok: true
          balance: number
          phone: PhoneDTO
          mainSet?: boolean
        }>('/api/phones/buy', { method: 'POST', body: JSON.stringify({ id }) })
        applyBalance(data.balance)
        await refresh()
        return { ok: true, phone: data.phone, balance: data.balance, mainSet: data.mainSet }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Не удалось выкупить' }
      }
    },
    [applyBalance, refresh],
  )

  const setMain = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await phoneReq('/api/phones/set-main', { method: 'POST', body: JSON.stringify({ id }) })
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh],
  )

  const release = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await phoneReq('/api/phones/release', { method: 'POST', body: JSON.stringify({ id }) })
        await refresh()
        return true
      } catch {
        return false
      }
    },
    [refresh],
  )

  const loadCalls = useCallback(async () => {
    try {
      const data = await phoneReq<{ items: CallDTO[] }>('/api/phones/calls')
      setCalls(data.items)
    } catch {
      /* игнорируем */
    }
  }, [])

  const logCall = useCallback(
    async (input: {
      number: string
      peerName?: string | null
      peerUserId?: string | null
      durationSec: number
    }) => {
      try {
        await phoneReq('/api/phones/calls', { method: 'POST', body: JSON.stringify(input) })
        await loadCalls()
      } catch {
        /* журнал не критичен */
      }
    },
    [loadCalls],
  )

  const loadContacts = useCallback(async () => {
    try {
      const data = await phoneReq<{ items: ContactDTO[] }>('/api/phones/contacts')
      setContacts(data.items)
    } catch {
      /* без ботов — только локальные контакты */
    }
  }, [])

  // При отмене брони/покупке данные приходят из refresh; раз в 30с — страховка
  // на случай истечения брони при открытом экране.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  })
  useEffect(() => {
    void refreshRef.current()
    const id = setInterval(() => void refreshRef.current(), 30_000)
    return () => clearInterval(id)
  }, [])

  const owned = numbers.filter((n) => n.status === 'active')
  const reserves = numbers.filter((n) => n.status === 'reserved' && n.holdUntil)
  const mainNumber = owned.find((n) => n.isMain) ?? null

  return {
    numbers,
    owned,
    reserves,
    mainNumber,
    balance,
    loading,
    calls,
    contacts,
    refresh,
    roll,
    buy,
    setMain,
    release,
    loadCalls,
    logCall,
    loadContacts,
  }
}
