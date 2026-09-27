// ─────────────────────────────────────────────────────────────────────────────
// Все субъекты Российской Федерации (89) — для онбординга региона при первом
// входе и для автономеров (ГОСТ-коды регионов на знаке).
//
// plateCodes — официальные коды на автомобильных знаках (основные 1–4 шт.).
// prestige — престиж региона: влияет на цену крутки/выкупа автономеров.
// ─────────────────────────────────────────────────────────────────────────────

export interface RFSubject {
  name: string
  district: string
  plateCodes: string[]
  prestige: number
}

export const FEDERAL_DISTRICTS = [
  'Центральный',
  'Северо-Западный',
  'Южный',
  'Северо-Кавказский',
  'Приволжский',
  'Уральский',
  'Сибирский',
  'Дальневосточный',
] as const

export const RF_SUBJECTS: RFSubject[] = [
  // ── Центральный ──
  { name: 'Москва', district: 'Центральный', plateCodes: ['77', '97', '99', '777'], prestige: 1.35 },
  { name: 'Московская область', district: 'Центральный', plateCodes: ['50', '90', '150', '190'], prestige: 1.15 },
  { name: 'Белгородская область', district: 'Центральный', plateCodes: ['31'], prestige: 0.9 },
  { name: 'Брянская область', district: 'Центральный', plateCodes: ['32'], prestige: 0.88 },
  { name: 'Владимирская область', district: 'Центральный', plateCodes: ['33'], prestige: 0.9 },
  { name: 'Воронежская область', district: 'Центральный', plateCodes: ['36', '136'], prestige: 0.95 },
  { name: 'Ивановская область', district: 'Центральный', plateCodes: ['37'], prestige: 0.87 },
  { name: 'Калужская область', district: 'Центральный', plateCodes: ['40'], prestige: 0.92 },
  { name: 'Костромская область', district: 'Центральный', plateCodes: ['44'], prestige: 0.86 },
  { name: 'Курская область', district: 'Центральный', plateCodes: ['46'], prestige: 0.88 },
  { name: 'Липецкая область', district: 'Центральный', plateCodes: ['48'], prestige: 0.9 },
  { name: 'Орловская область', district: 'Центральный', plateCodes: ['57'], prestige: 0.86 },
  { name: 'Рязанская область', district: 'Центральный', plateCodes: ['62'], prestige: 0.9 },
  { name: 'Смоленская область', district: 'Центральный', plateCodes: ['67'], prestige: 0.87 },
  { name: 'Тамбовская область', district: 'Центральный', plateCodes: ['68'], prestige: 0.86 },
  { name: 'Тверская область', district: 'Центральный', plateCodes: ['69'], prestige: 0.9 },
  { name: 'Тульская область', district: 'Центральный', plateCodes: ['71'], prestige: 0.92 },
  { name: 'Ярославская область', district: 'Центральный', plateCodes: ['76'], prestige: 0.9 },

  // ── Северо-Западный ──
  { name: 'Санкт-Петербург', district: 'Северо-Западный', plateCodes: ['78', '98', '178'], prestige: 1.25 },
  { name: 'Ленинградская область', district: 'Северо-Западный', plateCodes: ['47'], prestige: 1.0 },
  { name: 'Архангельская область', district: 'Северо-Западный', plateCodes: ['29'], prestige: 0.84 },
  { name: 'Вологодская область', district: 'Северо-Западный', plateCodes: ['35'], prestige: 0.86 },
  { name: 'Калининградская область', district: 'Северо-Западный', plateCodes: ['39', '91'], prestige: 0.95 },
  { name: 'Республика Карелия', district: 'Северо-Западный', plateCodes: ['10'], prestige: 0.85 },
  { name: 'Республика Коми', district: 'Северо-Западный', plateCodes: ['11'], prestige: 0.84 },
  { name: 'Мурманская область', district: 'Северо-Западный', plateCodes: ['51'], prestige: 0.86 },
  { name: 'Ненецкий автономный округ', district: 'Северо-Западный', plateCodes: ['83'], prestige: 0.82 },
  { name: 'Новгородская область', district: 'Северо-Западный', plateCodes: ['53'], prestige: 0.85 },
  { name: 'Псковская область', district: 'Северо-Западный', plateCodes: ['60'], prestige: 0.83 },

  // ── Южный ──
  { name: 'Республика Адыгея', district: 'Южный', plateCodes: ['01'], prestige: 0.9 },
  { name: 'Республика Калмыкия', district: 'Южный', plateCodes: ['08'], prestige: 0.8 },
  { name: 'Республика Крым', district: 'Южный', plateCodes: ['82', '277'], prestige: 1.0 },
  { name: 'Севастополь', district: 'Южный', plateCodes: ['92'], prestige: 1.0 },
  { name: 'Краснодарский край', district: 'Южный', plateCodes: ['23', '93', '123'], prestige: 1.1 },
  { name: 'Астраханская область', district: 'Южный', plateCodes: ['30'], prestige: 0.84 },
  { name: 'Волгоградская область', district: 'Южный', plateCodes: ['34', '134'], prestige: 0.9 },
  { name: 'Ростовская область', district: 'Южный', plateCodes: ['61', '161'], prestige: 1.0 },
  { name: 'Донецкая Народная Республика', district: 'Южный', plateCodes: ['80'], prestige: 0.85 },
  { name: 'Луганская Народная Республика', district: 'Южный', plateCodes: ['81'], prestige: 0.85 },
  { name: 'Запорожская область', district: 'Южный', plateCodes: ['84'], prestige: 0.85 },
  { name: 'Херсонская область', district: 'Южный', plateCodes: ['85'], prestige: 0.85 },

  // ── Северо-Кавказский ──
  { name: 'Республика Дагестан', district: 'Северо-Кавказский', plateCodes: ['05'], prestige: 0.88 },
  { name: 'Республика Ингушетия', district: 'Северо-Кавказский', plateCodes: ['06'], prestige: 0.8 },
  { name: 'Кабардино-Балкарская Республика', district: 'Северо-Кавказский', plateCodes: ['07'], prestige: 0.85 },
  { name: 'Карачаево-Черкесская Республика', district: 'Северо-Кавказский', plateCodes: ['09'], prestige: 0.8 },
  { name: 'Республика Северная Осетия — Алания', district: 'Северо-Кавказский', plateCodes: ['15'], prestige: 0.82 },
  { name: 'Чеченская Республика', district: 'Северо-Кавказский', plateCodes: ['95'], prestige: 0.85 },
  { name: 'Ставропольский край', district: 'Северо-Кавказский', plateCodes: ['26', '126'], prestige: 0.9 },

  // ── Приволжский ──
  { name: 'Республика Башкортостан', district: 'Приволжский', plateCodes: ['02', '102'], prestige: 1.0 },
  { name: 'Республика Марий Эл', district: 'Приволжский', plateCodes: ['12'], prestige: 0.8 },
  { name: 'Республика Мордовия', district: 'Приволжский', plateCodes: ['13'], prestige: 0.8 },
  { name: 'Республика Татарстан', district: 'Приволжский', plateCodes: ['16', '116', '716'], prestige: 1.1 },
  { name: 'Удмуртская Республика', district: 'Приволжский', plateCodes: ['18'], prestige: 0.86 },
  { name: 'Чувашская Республика', district: 'Приволжский', plateCodes: ['21'], prestige: 0.82 },
  { name: 'Пермский край', district: 'Приволжский', plateCodes: ['59', '159'], prestige: 0.92 },
  { name: 'Кировская область', district: 'Приволжский', plateCodes: ['43'], prestige: 0.82 },
  { name: 'Нижегородская область', district: 'Приволжский', plateCodes: ['52', '152'], prestige: 1.0 },
  { name: 'Оренбургская область', district: 'Приволжский', plateCodes: ['56'], prestige: 0.85 },
  { name: 'Пензенская область', district: 'Приволжский', plateCodes: ['58'], prestige: 0.83 },
  { name: 'Самарская область', district: 'Приволжский', plateCodes: ['63', '163'], prestige: 1.0 },
  { name: 'Саратовская область', district: 'Приволжский', plateCodes: ['64', '164'], prestige: 0.88 },
  { name: 'Ульяновская область', district: 'Приволжский', plateCodes: ['73', '173'], prestige: 0.86 },

  // ── Уральский ──
  { name: 'Свердловская область', district: 'Уральский', plateCodes: ['66', '96', '196'], prestige: 1.05 },
  { name: 'Челябинская область', district: 'Уральский', plateCodes: ['74', '174'], prestige: 0.98 },
  { name: 'Тюменская область', district: 'Уральский', plateCodes: ['72'], prestige: 1.0 },
  { name: 'Курганская область', district: 'Уральский', plateCodes: ['45'], prestige: 0.8 },
  { name: 'Ханты-Мансийский автономный округ', district: 'Уральский', plateCodes: ['86'], prestige: 1.0 },
  { name: 'Ямало-Ненецкий автономный округ', district: 'Уральский', plateCodes: ['89'], prestige: 0.95 },

  // ── Сибирский ──
  { name: 'Республика Алтай', district: 'Сибирский', plateCodes: ['04'], prestige: 0.8 },
  { name: 'Республика Тыва', district: 'Сибирский', plateCodes: ['17'], prestige: 0.78 },
  { name: 'Республика Хакасия', district: 'Сибирский', plateCodes: ['19'], prestige: 0.8 },
  { name: 'Алтайский край', district: 'Сибирский', plateCodes: ['22'], prestige: 0.88 },
  { name: 'Красноярский край', district: 'Сибирский', plateCodes: ['24', '124'], prestige: 0.95 },
  { name: 'Иркутская область', district: 'Сибирский', plateCodes: ['38', '138'], prestige: 0.92 },
  { name: 'Кемеровская область — Кузбасс', district: 'Сибирский', plateCodes: ['42', '142'], prestige: 0.9 },
  { name: 'Новосибирская область', district: 'Сибирский', plateCodes: ['54', '154'], prestige: 1.0 },
  { name: 'Омская область', district: 'Сибирский', plateCodes: ['55'], prestige: 0.88 },
  { name: 'Томская область', district: 'Сибирский', plateCodes: ['70'], prestige: 0.86 },

  // ── Дальневосточный ──
  { name: 'Республика Бурятия', district: 'Дальневосточный', plateCodes: ['03'], prestige: 0.8 },
  { name: 'Республика Саха (Якутия)', district: 'Дальневосточный', plateCodes: ['14'], prestige: 0.85 },
  { name: 'Забайкальский край', district: 'Дальневосточный', plateCodes: ['75'], prestige: 0.8 },
  { name: 'Камчатский край', district: 'Дальневосточный', plateCodes: ['41'], prestige: 0.82 },
  { name: 'Приморский край', district: 'Дальневосточный', plateCodes: ['25', '125'], prestige: 1.0 },
  { name: 'Хабаровский край', district: 'Дальневосточный', plateCodes: ['27'], prestige: 0.9 },
  { name: 'Амурская область', district: 'Дальневосточный', plateCodes: ['28'], prestige: 0.85 },
  { name: 'Магаданская область', district: 'Дальневосточный', plateCodes: ['49'], prestige: 0.78 },
  { name: 'Сахалинская область', district: 'Дальневосточный', plateCodes: ['65', '165'], prestige: 0.9 },
  { name: 'Еврейская автономная область', district: 'Дальневосточный', plateCodes: ['79'], prestige: 0.78 },
  { name: 'Чукотский автономный округ', district: 'Дальневосточный', plateCodes: ['87'], prestige: 0.8 },
]

export function subjectByName(name: string): RFSubject | undefined {
  return RF_SUBJECTS.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())
}
