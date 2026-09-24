// Детерминированные характеристики товара: из хеша itemKey+listingId.
// Одинаковое объявление всегда показывает одни и те же «железки».

export interface SpecItem {
  label: string
  value: string
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(seed: number, arr: T[], salt: number): T {
  return arr[(seed >>> salt) % arr.length]
}

const STORAGE = ['64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ']
const RAM = ['8 ГБ', '16 ГБ', '32 ГБ']
const BATTERY = ['82%', '87%', '91%', '95%', '97%']
const SCREEN = ['Без царапин', 'Микроцарапки', 'Полировка', 'Заменён, оригинал']
const CPU = ['Core i5-1035G1', 'Core i7-1165G7', 'Ryzen 5 5500U', 'Ryzen 7 5800H', 'M1', 'Xeon E-2186M']
const SSD = ['256 ГБ SSD', '512 ГБ SSD', '1 ТБ SSD', '512 ГБ NVMe']
const WEAR = ['M', 'L', 'XL', '48', '50', '52', '42-44']
const COLOR = ['Чёрный', 'Серый меланж', 'Тёмно-синий', 'Бежевый', 'Хаки', 'Бордо']
const MATERIAL = ['Массив сосны', 'ЛДСП', 'Металл/ткань', 'Дуб шпон', 'Ротанг']
const SIZE = ['140×200 см', '90×190 см', '60×120 см', '180×80×75 см', 'Компактный']
const POWER = ['800 Вт', '1200 Вт', '1600 Вт', '2000 Вт', '2200 Вт']
const AGE = ['1-2 года', '3 года', '4 года', '5 лет', 'до 1 года']
const WEIGHT = ['4 кг', '7 кг', '12 кг', '18 кг']
const SPORT_TYPE = ['Универсальный', 'Дом', 'Зал', 'Улица', 'Тур']
const MUSIC_TYPE = ['Акустика', 'Электро', 'Синтезатор', 'Бас', 'Укулеле']
const YEAR = ['2018', '2019', '2020', '2021', '2022']
const MILEAGE = ['48 000 км', '76 000 км', '92 000 км', '130 000 км', '165 000 км']
const ENGINE = ['1.6 MPI', '1.8 TSI', '2.0 CRDI', '1.5 CVT']
const KIDS_AGE = ['0-1 год', '1-3 года', '3-5 лет', '5-7 лет']
const PAGES = ['240 стр.', '320 стр.', '416 стр.', '512 стр.']
const COVER = ['Твёрдая', 'Мягкая']
const GENRE = ['Классика', 'Фантастика', 'Детектив', 'Нон-фикшн', 'Психология']
const KIT = ['Полный комплект', 'Без коробки', 'С документами', 'Чеков нет']
const TYPE = ['Портативное', 'Стационарное', 'Накопительное', 'Беспроводное']

// Авто-аксессуары (не легковая машина): у шин/дисков/регистраторов не бывает «двигателя»
const AUTO_ACCESSORY_PREFIX = [
  'nokian-8', 'advocam', 'pioneer-2din', 'domkrat-2t', 'poperechniny',
  'avtokompressor', 'diski-r16', 'hjc-shlem',
]
const AUTO_ACC_TYPE = ['Универсальный', 'Легковой', 'Кроссовер/внедорожник']
const AUTO_ACC_BRAND = ['Популярный бренд', 'Китай, рабочий', 'Оригинал', 'Европа']
const AUTO_ACC_KIT = ['Всё в комплекте', 'Крепления в наличии', 'Провода и ключи', 'Только сам предмет']
const TIRE_R14 = ['R14', 'R15', 'R16', 'R17']
const TIRE_SEASON = ['Лето', 'Зима (шипы)', 'Зима (липучка)', 'Всесезонка']

export function specsFor(itemKey: string, category: string, listingId: string): SpecItem[] {
  const seed = hash(itemKey + '|' + listingId)
  switch (category) {
    case 'phones':
      return [
        { label: 'Память', value: pick(seed, STORAGE, 2) },
        { label: 'Батарея', value: pick(seed, BATTERY, 7) },
        { label: 'Экран', value: pick(seed, SCREEN, 13) },
      ]
    case 'laptops':
      return [
        { label: 'Процессор', value: pick(seed, CPU, 3) },
        { label: 'RAM', value: pick(seed, RAM, 9) },
        { label: 'Накопитель', value: pick(seed, SSD, 17) },
      ]
    case 'electronics':
      return [
        { label: 'Тип', value: pick(seed, TYPE, 2) },
        { label: 'Комплект', value: pick(seed, KIT, 11) },
      ]
    case 'clothes':
      return [
        { label: 'Размер', value: pick(seed, WEAR, 5) },
        { label: 'Цвет', value: pick(seed, COLOR, 10) },
      ]
    case 'sneakers':
      return [
        { label: 'Размер', value: pick(seed, WEAR, 4) },
        { label: 'Цвет', value: pick(seed, COLOR, 12) },
      ]
    case 'furniture':
      return [
        { label: 'Материал', value: pick(seed, MATERIAL, 6) },
        { label: 'Габариты', value: pick(seed, SIZE, 14) },
      ]
    case 'appliances':
      return [
        { label: 'Мощность', value: pick(seed, POWER, 8) },
        { label: 'Возраст', value: pick(seed, AGE, 16) },
      ]
    case 'hobby':
      return [
        { label: 'Вес', value: pick(seed, WEIGHT, 5) },
        { label: 'Возраст', value: pick(seed, AGE, 13) },
      ]
    case 'sport':
      return [
        { label: 'Тип', value: pick(seed, SPORT_TYPE, 7) },
        { label: 'Вес', value: pick(seed, WEIGHT, 15) },
      ]
    case 'music':
      return [
        { label: 'Тип', value: pick(seed, MUSIC_TYPE, 3) },
        { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
      ]
    case 'auto':
      // Легковая машина — пробег/двигатель; аксессуары — свои «железки»
      if (AUTO_ACCESSORY_PREFIX.some((p) => itemKey === p)) {
        if (itemKey === 'nokian-8') {
          return [
            { label: 'Диаметр', value: pick(seed, TIRE_R14, 2) },
            { label: 'Сезон', value: pick(seed, TIRE_SEASON, 9) },
            { label: 'Остаток протектора', value: pick(seed, ['60%', '70%', '80%'], 15) },
          ]
        }
        if (itemKey === 'diski-r16') {
          return [
            { label: 'Диаметр', value: pick(seed, TIRE_R14, 3) },
            { label: 'Крепёж', value: pick(seed, AUTO_ACC_KIT, 11) },
            { label: 'Состояние', value: pick(seed, ['Без кривизны', 'Мелкие сколы', 'Требуют покраски'], 17) },
          ]
        }
        if (itemKey === 'hjc-shlem') {
          return [
            { label: 'Размер', value: pick(seed, ['S', 'M', 'L', 'XL'], 5) },
            { label: 'Состояние', value: pick(seed, ['Без падений', 'Мелкие царапины', 'После одного сезона'], 12) },
          ]
        }
        return [
          { label: 'Тип', value: pick(seed, AUTO_ACC_TYPE, 2) },
          { label: 'Происхождение', value: pick(seed, AUTO_ACC_BRAND, 10) },
          { label: 'Комплект', value: pick(seed, AUTO_ACC_KIT, 18) },
        ]
      }
      return [
        { label: 'Пробег', value: pick(seed, MILEAGE, 2) },
        { label: 'Двигатель', value: pick(seed, ENGINE, 10) },
        { label: 'Год', value: pick(seed, YEAR, 18) },
      ]
    case 'kids':
      return [
        { label: 'Возраст', value: pick(seed, KIDS_AGE, 6) },
        { label: 'Цвет', value: pick(seed, COLOR, 14) },
      ]
    case 'books':
      return [
        { label: 'Объём', value: pick(seed, PAGES, 4) },
        { label: 'Переплёт', value: pick(seed, COVER, 9) },
        { label: 'Жанр', value: pick(seed, GENRE, 15) },
      ]
    default:
      return [{ label: 'Состояние', value: 'Как на фото' }]
  }
}
