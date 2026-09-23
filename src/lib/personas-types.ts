// Типы ИИ-личностей. Данные — в personas-data.ts

export interface Persona {
  id: string
  name: string // Имя Фамилия
  age: number
  city: string
  job: string
  character: string // черты характера по-русски
  style: string // описание манеры речи и жаргона
  greed: number // 0..1 жадность (наценка / жёсткость торга)
  patience: number // 1..6 сколько раундов торга выдерживает
  trust: number // 0..1 насколько легко верит продавцу/покупателю
  knowledge: number // 0..1 знание рынка (точность оценки цены)
  typoRate: number // 0..0.35 вероятность опечаток в сообщениях
  greetings: string[] // приветственные сообщения при первом контакте
  phrases: string[] // характерные фразы
  hue: number // оттенок аватара 0..360
}
