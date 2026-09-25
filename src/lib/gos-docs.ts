// Госуслуги (Task 26-b): детерминированные виртуальные документы, штрафы и сервисы.
// Чистые функции без внешних зависимостей: API-роут генерирует данные из user,
// клиент импортирует типы и константы. Всё генерируется из seed = userId (FNV-1a
// + mulberry32), поэтому паспорт/ИНН/СНИЛС стабильны между перезагрузками.

export type GosDocKind = 'passport' | 'snils' | 'inn' | 'license' | 'oms' | 'international'

export interface GosDocField {
  label: string
  value: string
  /** занять обе колонки сетки */
  wide?: boolean
}

export type GosDocIcon = 'id' | 'hash' | 'filedigit' | 'car' | 'heart' | 'plane'

export interface GosDoc {
  id: GosDocKind
  title: string
  /** короткая строка для карточки-превью */
  subtitle: string
  /** главный номер в красивом формате */
  number: string
  accent: string
  icon: GosDocIcon
  fields: GosDocField[]
  issuedAt: string
  validUntil: string | null
  qr: string
  /** для паспорта/загранпаспорта — ФИО по полям */
  fio?: { last: string; first: string; patronymic: string }
  fioLatin?: { last: string; first: string }
}

export interface GosUserData {
  id: string
  username: string
  displayName: string
  photoUrl: string | null
  balance: number
  level: number
  city: string
  createdAt: string
}

export interface GosFineBase {
  id: string
  title: string
  article: string
  amount: number
  issuedAt: string
  dueAt: string
  /** скидка 50% действует до этой даты (как в жизни) */
  discountUntil: string | null
}

export interface GosFineDTO extends GosFineBase {
  status: 'unpaid' | 'paid'
  paidAt: string | null
}

export interface GosService {
  id: string
  title: string
  desc: string
  category: 'Документы' | 'Платежи' | 'Здоровье' | 'Семья'
  price: string
  duration: string
  steps: string[]
  requires: string[]
  /** нестандартное поведение кнопки: переход к штрафам / тост про приложение Налоги */
  special?: 'debts' | 'taxes'
  /** поля формы-заявления: choices — группы чипов */
  form?: { title: string; choices: string[] }[]
}

export interface GosData {
  user: GosUserData
  docs: GosDoc[]
  fines: GosFineDTO[]
  services: GosService[]
  paidTotal: number
}

// ---------------------------------------------------------------------------
// Детерминированный рандом
// ---------------------------------------------------------------------------

export function gosHash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function gosRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function digits(rng: () => number, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(rng() * 10)
  return s
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

// ---------------------------------------------------------------------------
// Дата-хелперы
// ---------------------------------------------------------------------------

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function fmtD(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// ФИО
// ---------------------------------------------------------------------------

const SURNAMES = ['Кузнецов', 'Соколов', 'Попов', 'Лебедев', 'Новиков', 'Морозов', 'Волков', 'Зайцев', 'Фёдоров', 'Макаров'] as const
const PATRONYMICS = ['Александрович', 'Сергеевич', 'Дмитриевич', 'Андреевич', 'Николаевич', 'Игоревич', 'Владимирович', 'Олегович'] as const

function splitName(displayName: string, seed: number): { last: string; first: string; patronymic: string } {
  const rng = gosRng(seed ^ 0x9e3779b9)
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? 'Игрок'
  const last = parts[1] ?? pick(rng, SURNAMES)
  const patronymic = parts[2] ?? pick(rng, PATRONYMICS)
  return { last, first, patronymic }
}

// Транслитерация для загранпаспорта
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function translit(s: string): string {
  const lower = s.toLowerCase()
  let out = ''
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) {
      out += TRANSLIT[ch]
    } else if (/[a-z0-9-]/.test(ch)) {
      out += ch
    }
  }
  return out.charAt(0).toUpperCase() + out.slice(1)
}

// ---------------------------------------------------------------------------
// Документы
// ---------------------------------------------------------------------------

const ISSUERS = [
  'ОВД района Хамовники г. Москвы',
  'Отдел по вопросам миграции ОМВД России по р-ну Тверской, г. Москва',
  'ОВД района Арбат г. Москвы',
  'УВД по ЦАО ГУ МВД России по г. Москве',
  'Отдел по вопросам миграции ОМВД р-на Басманный, г. Москва',
] as const

const OMS_COMPANIES = ['СОГАЗ', 'МАКС-М', 'ИНГОССТРАХ-М', 'РЕСО-МЕД', 'КАПИТАЛ МС'] as const

export function buildGosDocs(userId: string, displayName: string, createdAt: Date, city: string): GosDoc[] {
  const seed = gosHash(`gos-docs:${userId}`)
  const rng = gosRng(seed)
  const fio = splitName(displayName, seed)
  const place = `г. ${city}`
  const birth = new Date(1970 + Math.floor(rng() * 34), Math.floor(rng() * 12), 1 + Math.floor(rng() * 28))
  // дата выдачи всегда В ПРОШЛОМ относительно createdAt (иначе у нового игрока паспорт «из будущего»)
  const passportIssued = addDays(createdAt, -Math.floor(rng() * 120))
  const regCode = `770-0${10 + Math.floor(rng() * 80)}`

  const passportSeries = `45${10 + Math.floor(rng() * 3)}`
  const passportNumber = digits(rng, 6)
  const snilsDigits = digits(rng, 11)
  const innDigits = `77${digits(rng, 10)}`
  const licenseSeries = `99 ${String(10 + Math.floor(rng() * 80))}`
  const licenseNumber = digits(rng, 6)
  const licenseIssued = addDays(createdAt, -(5 + Math.floor(rng() * 30)))
  const licenseExpiry = addDays(licenseIssued, 3652)
  const omsNumber = `7${digits(rng, 15)}`
  const intlSeries = rng() < 0.5 ? '75' : '76'
  const intlNumber = digits(rng, 7)
  const intlIssued = addDays(createdAt, -(2 + Math.floor(rng() * 40)))
  const intlExpiry = addDays(intlIssued, 3652)

  const docs: GosDoc[] = [
    {
      id: 'passport',
      title: 'Паспорт РФ',
      subtitle: `${passportSeries} ${passportNumber}`,
      number: `${passportSeries} ${passportNumber}`,
      accent: '#0D4CD3',
      icon: 'id',
      fio,
      fields: [
        { label: 'Дата рождения', value: fmtD(birth) },
        { label: 'Место рождения', value: place },
        { label: 'Дата выдачи', value: fmtD(passportIssued) },
        { label: 'Код подразделения', value: regCode },
        { label: 'Кем выдан', value: pick(rng, ISSUERS), wide: true },
      ],
      issuedAt: passportIssued.toISOString(),
      validUntil: null,
      qr: `gosdoc://passport/${passportSeries}${passportNumber}`,
    },
    {
      id: 'snils',
      title: 'СНИЛС',
      subtitle: 'Страховой номер ПФР',
      number: `${snilsDigits.slice(0, 3)}-${snilsDigits.slice(3, 6)}-${snilsDigits.slice(6, 9)} ${snilsDigits.slice(9)}`,
      accent: '#0A7EA4',
      icon: 'hash',
      fields: [
        { label: 'Страховой номер', value: 'Пенсионное страхование' },
        { label: 'Статус', value: 'Действующий' },
        { label: 'Зарегистрирован', value: fmtD(createdAt) },
      ],
      issuedAt: createdAt.toISOString(),
      validUntil: null,
      qr: `gosdoc://snils/${snilsDigits}`,
    },
    {
      id: 'inn',
      title: 'ИНН',
      subtitle: 'Постановка на налоговый учёт',
      number: innDigits.replace(/(\d{4})(?=\d)/g, '$1 '),
      accent: '#5B21B6',
      icon: 'filedigit',
      fields: [
        { label: 'Тип', value: 'Физическое лицо' },
        { label: 'Налоговый орган', value: 'МИФНС № 77-01, г. Москва' },
        { label: 'Дата постановки', value: fmtD(createdAt) },
      ],
      issuedAt: createdAt.toISOString(),
      validUntil: null,
      qr: `gosdoc://inn/${innDigits}`,
    },
    {
      id: 'license',
      title: 'Водительское удостоверение',
      subtitle: `Категория B · ${licenseNumber.slice(0, 2)} ${licenseNumber.slice(2)}`,
      number: `${licenseSeries} ${licenseNumber}`,
      accent: '#0F766E',
      icon: 'car',
      fields: [
        { label: 'Категории', value: 'B' },
        { label: 'Дата рождения', value: fmtD(birth) },
        { label: 'Дата выдачи', value: fmtD(licenseIssued) },
        { label: 'Действительно до', value: fmtD(licenseExpiry) },
        { label: 'Кем выдан', value: 'ГИБДД г. Москвы', wide: true },
      ],
      issuedAt: licenseIssued.toISOString(),
      validUntil: licenseExpiry.toISOString(),
      qr: `gosdoc://license/${licenseSeries.replace(/\s/g, '')}${licenseNumber}`,
    },
    {
      id: 'oms',
      title: 'Полис ОМС',
      subtitle: pick(rng, OMS_COMPANIES),
      number: omsNumber.replace(/(\d{4})(?=\d)/g, '$1 '),
      accent: '#0E7490',
      icon: 'heart',
      fields: [
        { label: 'Страховая компания', value: pick(rng, OMS_COMPANIES) },
        { label: 'Формат', value: 'Единый полис' },
        { label: 'Срок действия', value: 'Бессрочный' },
      ],
      issuedAt: createdAt.toISOString(),
      validUntil: null,
      qr: `gosdoc://oms/${omsNumber}`,
    },
    {
      id: 'international',
      title: 'Загранпаспорт',
      subtitle: `${intlSeries} ${intlNumber}`,
      number: `${intlSeries} ${intlNumber}`,
      accent: '#155E75',
      icon: 'plane',
      fio,
      fioLatin: { last: translit(fio.last), first: translit(fio.first) },
      fields: [
        { label: 'Тип', value: 'Общегражданский' },
        { label: 'Дата выдачи', value: fmtD(intlIssued) },
        { label: 'Действителен до', value: fmtD(intlExpiry) },
        { label: 'Кем выдан', value: 'Консульский департамент МИД России', wide: true },
      ],
      issuedAt: intlIssued.toISOString(),
      validUntil: intlExpiry.toISOString(),
      qr: `gosdoc://passport-int/${intlSeries}${intlNumber}`,
    },
  ]
  return docs
}

// ---------------------------------------------------------------------------
// Штрафы (0–2 в день, детерминированно по userId + день)
// ---------------------------------------------------------------------------

const FINE_POOL = [
  { title: 'Оплата парковки с превышением времени', article: 'АМПП 8.25 ч.4', amount: 2500 },
  { title: 'Нарушение правил платной городской парковки', article: 'АМПП 8.25 ч.2', amount: 1500 },
  { title: 'Превышение скорости на 20–40 км/ч', article: 'ст. 12.9 ч.2 КоАП', amount: 500 },
  { title: 'Остановка в зоне действия знака', article: 'ст. 12.16 ч.4 КоАП', amount: 1500 },
  { title: 'Проезд на запрещающий сигнал светофора', article: 'ст. 12.12 ч.1 КоАП', amount: 1000 },
  { title: 'Использование телефона за рулём', article: 'ст. 12.36.1 КоАП', amount: 1500 },
  { title: 'Ремень безопасности не пристёгнут', article: 'ст. 12.6 КоАП', amount: 1000 },
  { title: 'Отсутствие полиса ОСАГО', article: 'ст. 12.37 ч.2 КоАП', amount: 800 },
  { title: 'Парковка на тротуаре', article: 'ст. 12.19 ч.3 КоАП', amount: 1000 },
] as const

// Сколько нужно заплатить с учётом «скидки 50% в первые 20 дней» (как в жизни).
export function fineAmountDue(f: GosFineBase, now: Date = new Date()): number {
  if (f.discountUntil && now.getTime() < new Date(f.discountUntil).getTime()) {
    return Math.round(f.amount / 2)
  }
  return f.amount
}

export function buildGosFines(userId: string, now: Date): GosFineBase[] {
  const dk = dayKey(now)
  const rng = gosRng(gosHash(`gos-fines:${userId}:${dk}`))
  const r = rng()
  const count = r < 0.35 ? 0 : r < 0.75 ? 1 : 2
  const used = new Set<number>()
  const fines: GosFineBase[] = []
  for (let i = 0; i < count; i++) {
    let idx = Math.floor(rng() * FINE_POOL.length)
    let guard = 0
    while (used.has(idx) && guard++ < 10) idx = Math.floor(rng() * FINE_POOL.length)
    used.add(idx)
    const tpl = FINE_POOL[idx]
    const issuedAt = new Date(now.getTime() - Math.floor(2 + rng() * 70) * 3600_000)
    fines.push({
      id: `gosf-${dk}-${i}`,
      title: tpl.title,
      article: tpl.article,
      amount: tpl.amount,
      issuedAt: issuedAt.toISOString(),
      dueAt: addDays(issuedAt, 70).toISOString(),
      discountUntil: addDays(issuedAt, 20).toISOString(),
    })
  }
  return fines
}

// ---------------------------------------------------------------------------
// Оплаченные штрафы хранятся в User.stats (JSON) рядом с PlayerStats:
// { ..., gosFinesPaid: { [fineId]: { a: amount, t: paidAt } }, gosFinesPaidTotal: n }
// parseStats из quests.ts сохраняет лишние ключи (spread), так что это безопасно.
// ---------------------------------------------------------------------------

export interface GosStats {
  gosFinesPaid?: Record<string, { a: number; t: string }>
  gosFinesPaidTotal?: number
  [k: string]: unknown
}

export function parseGosStats(raw: string | null | undefined): GosStats {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Partial<GosStats>
    return typeof obj === 'object' && obj !== null ? (obj as GosStats) : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Сервисы («Популярное»)
// ---------------------------------------------------------------------------

export const GOS_SERVICES: GosService[] = [
  {
    id: 'doctor',
    title: 'Запись к врачу',
    desc: 'Приём терапевта и узких специалистов в поликлиниках города. Талон придёт в личный кабинет.',
    category: 'Здоровье',
    price: 'Бесплатно',
    duration: '2 минуты',
    steps: [
      'Выберите специальность и врача',
      'Подберите удобную дату и время приёма',
      'Подтвердите запись — электронный талон появится в документах',
    ],
    requires: ['Полис ОМС', 'Паспорт РФ'],
    form: [
      { title: 'Специальность', choices: ['Терапевт', 'Хирург', 'Офтальмолог', 'Стоматолог'] },
      { title: 'Время приёма', choices: ['Утро 9:00–12:00', 'День 12:00–15:00', 'Вечер 15:00–19:00'] },
    ],
  },
  {
    id: 'debts',
    title: 'Проверить задолженности',
    desc: 'Штрафы ГИБДД, начисления за парковку и другие задолженности — в одном списке с оплатой в два тапа.',
    category: 'Платежи',
    price: 'Бесплатно',
    duration: 'мгновенно',
    steps: [
      'Откройте список начислений за сегодня',
      'Проверьте сумму и срок скидки 50%',
      'Оплатите — квитанция сохранится в разделе «Штрафы»',
    ],
    requires: ['Паспорт РФ'],
    special: 'debts',
  },
  {
    id: 'taxes',
    title: 'Оплата налогов',
    desc: 'Начисления по самозанятости и имущественные налоги. Оплата с банковского счёта без комиссии.',
    category: 'Платежи',
    price: 'Без комиссии',
    duration: '1 минута',
    steps: [
      'Проверьте начисления налоговой',
      'Оплатите задолженность одной операцией',
      'Следите за статусом в приложении «Налоги»',
    ],
    requires: ['ИНН'],
    special: 'taxes',
  },
  {
    id: 'kindergarten',
    title: 'Запись ребёнка в детский сад',
    desc: 'Постановка в очередь и зачисление в дошкольные группы. Можно выбрать до трёх садиков.',
    category: 'Семья',
    price: 'Бесплатно',
    duration: '5 минут',
    steps: [
      'Заполните заявление и приложите документы ребёнка',
      'Выберите до трёх детских садов по району',
      'Отслеживайте место в очереди в личном кабинете',
    ],
    requires: ['Свидетельство о рождении ребёнка', 'Паспорт родителя', 'СНИЛС ребёнка'],
    form: [
      { title: 'Возрастная группа', choices: ['Ясельная (1–3 года)', 'Младшая (3–4 года)', 'Средняя (4–5 лет)', 'Старшая (5–7 лет)'] },
      { title: 'Район', choices: ['Хамовники', 'Тверской', 'Басманный', 'Пресненский'] },
    ],
  },
  {
    id: 'passport-replace',
    title: 'Замена паспорта РФ',
    desc: 'Замена паспорта по возрасту, при смене фамилии или при порче. Госпошлина оплачивается онлайн.',
    category: 'Документы',
    price: 'Госпошлина 300 ₽',
    duration: '3 минуты',
    steps: [
      'Подайте заявление и загрузите фотографию',
      'Оплатите госпошлину со счёта',
      'Заберите готовый паспорт в подразделении МВД',
    ],
    requires: ['Действующий паспорт', 'Фотография 3×4', 'Свидетельство о рождении'],
    form: [
      { title: 'Причина замены', choices: ['По возрасту', 'Смена фамилии', 'Порча документа'] },
      { title: 'Подразделение', choices: ['ОМВД Хамовники', 'ОМВД Тверской', 'ОМВД Басманный'] },
    ],
  },
  {
    id: 'registration',
    title: 'Регистрация по месту жительства',
    desc: 'Постоянная регистрация в жилом помещении. Свидетельство придёт в электронном виде.',
    category: 'Документы',
    price: 'Бесплатно',
    duration: '4 минуты',
    steps: [
      'Заполните заявление — нужны данные собственника жилья',
      'Приложите документ о праве на помещение',
      'Получите свидетельство о регистрации в личный кабинет',
    ],
    requires: ['Паспорт РФ', 'Документ о праве собственности'],
    form: [
      { title: 'Тип регистрации', choices: ['Постоянная', 'Временная (до 1 года)', 'Временная (до 90 дней)'] },
      { title: 'Основание', choices: ['Собственность', 'Аренда', 'Проживание у родственников'] },
    ],
  },
]
