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

// --- Точечные «железки» для товаров, которым не подходит общий шаблон категории ---
const STRINGS = ['6 струн', '7 струн', '4 струны (бас)']
const FRETBOARD = ['Клён', 'Палисандр', 'Палисандр, потемнел']
const RECORDS = ['1960-1980-х', '1970-х', '1980-х', '90-х, поп']
const TURNTABLE_SPEED = ['33/45 об/мин', '33/45/78 об/мин']
const COMBO_WATT = ['20 Вт', '30 Вт', '15 Вт']
const CONSOLE_STORAGE = ['825 ГБ SSD', '500 ГБ HDD + 500 ГБ SSD', '512 ГБ SSD']
const FIRMWARE = ['Прошита на любой регион', 'Региональная', 'Слежу за обновлениями']
const WATCH_BATT = ['До 2 дней', 'Около суток', '1.5 дня']
const HEADPHONE_BATT = ['28-30 часов', '20 часов', '24 часа']
const SCREEN_SIZE = ['43" (109 см)', '24" (61 см)']
const TV_YEAR = ['2019', '2020', '2021', '2022']
const SAMOKAT_RANGE = ['25 км', '18 км', '30 км']
const SAMOKAT_MILEAGE = ['Пробег до 300 км', 'Пробег около 500 км', 'Почти не катался']
const BIKE_SPEEDS = ['7 скоростей', '21 скорость', '8 скоростей', '18 скоростей']
const FRAME = ['Сталь', 'Алюминий', 'Алюминий, небольшой скол']
const BOARD_GAMES = ['Все компоненты на месте', '1 фишка заменена пуговицей', 'Коробка потрёпана, всё целое']
const TENT_SEATS = ['3 места', '2 места', '4 места, тамбур']
const AQUA_VOLUME = ['60 л', '60 л с тумбой', 'Объём 54 л реальный']
const GAMEPAD_COMPAT = ['PS4/ПК', 'PS4/PS5/ПК', 'Только PS4']
const GPS_BATT = ['2 дня похода', 'До 16 ч', 'Около суток']
const TELESCOPE_ZOOM = ['Увеличение до 165x', 'Увеличение 105x', 'Линзы Barlow в комплекте']
const DETECTOR_DEPTH = ['Ловит на 20-30 см', 'Глубина до 40 см на крупняк', 'Монета на 25 см']
const FRIDGE_CLASS = ['Класс A+', 'Класс A', 'Класс B, старичок']
const FRIDGE_SIZE = ['163×60×62 см', '180×60×65 см', 'Высокий, 195 см']
const WASHER_RPM = ['800 об/мин', '1000 об/мин', '1200 об/мин']
const WASHER_LOAD = ['Загрузка 6 кг', 'Загрузка 5 кг', 'Загрузка 7 кг']
const ROBOT_BATT = ['От 1.5 до 2 часов', 'Около часа', 'До 2.5 часов']
const MICROWAVE_POWER = ['800 Вт', '700 Вт', '900 Вт']
const MULTICOOK_PROGRAMS = ['18 программ', '24 программы', '12 программ']
const DYSON_BATT = ['40 мин в обычном', 'От 7 до 40 мин по режимам', 'Турборежим 8 мин']
const COFFEE_PRESSURE = ['15 бар', '19 бар', '15 бар, капучинатор']
const OVEN_TYPE = ['Электрическая', 'Электрическая с конвекцией']
const STROLLER_WEIGHT = ['Вес шасси 9 кг', 'Вес 12 кг с блоком', 'Лёгкая, 8 кг']
const CARSEAT_GROUP = ['Группа 0+/1 (0-18 кг)', 'Группа 1/2/3 (9-36 кг)', 'Группа 0+ (0-13 кг)']
const CARSEAT_MOUNT = ['Isofix + якорный', 'Isofix', 'Штатный ремень']
const CRIB_SIZE = ['Спальное 120×60 см', 'Спальное 140×70 см']
const KID_BIKE_WHEEL = ['Колёса 16"', 'Колёса 14" + боковые', 'Колёса 12"']
const LEGO_PARTS = ['Около 1200 деталей', '2 кг на развес, ~800 деталей', 'Мешок ~2 кг']
const SLEIGH = ['Длина 95 см', 'Металл-дерево', 'До 40 кг']

// --- Спорт: каждому свой «паспорт» ---
const DUMBBELL_PLATES = ['Блины чугунные', 'Блины в резине', 'Обрезиненные, сталь']
const BARBELL_BAR = ['Гриф стальной прямой', 'Гриф хромированный', 'Гриф 180 см']
const TREAD_SPEED = ['До 14 км/ч', 'До 16 км/ч', 'До 12 км/ч']
const TREAD_POWER = ['2.0 л.с.', '1.75 л.с.', '2.5 л.с.']
const BIKE_LOAD = ['8 уровней нагрузки', 'Магнитная, 8 уровней', 'Нагрузка до 120 кг']
const SNOWBOARD_FLEX = ['Жёсткость 5/10', 'Средняя', 'Средняя, ближе к жёсткой']
const SKATE_SIZE = ['Размер 42', 'Размер 43-44', 'Размер 41']
const ROLLER_SIZE = ['Размер 40-41', 'Размер 42', 'Размер 39-40']
const ROLLER_WHEELS = ['Колёса 80 мм', 'Колёса 84 мм', 'Колёса 90 мм']
const RACKET_TENSION = ['Натяжение 23 кг', 'Натяжение 25 кг', 'Сыграли сезон, струны живые']
const RACKET_WEIGHT = ['Вес 300 г', 'Вес 310 г', 'Ручка G3']
const PULLUP_MOUNT = ['Крепление в проём (распорное)', 'На стену, 4 анкера', 'Наддверное']
const PULLUP_LOAD = ['Выдерживает до 130 кг', 'До 200 кг', 'До 150 кг']

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
    case 'electronics': {
      const ELEC_SPEC: Record<string, SpecItem[]> = {
        'ps5': [
          { label: 'Накопитель', value: pick(seed, CONSOLE_STORAGE, 2) },
          { label: 'Прошивка', value: pick(seed, FIRMWARE, 8) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'ps4-slim': [
          { label: 'Накопитель', value: pick(seed, ['500 ГБ HDD', '1 ТБ HDD'], 3) },
          { label: 'Прошивка', value: pick(seed, FIRMWARE, 9) },
          { label: 'Комплект', value: pick(seed, ['Пад с проводом', '2 пада, hdmi'], 12) },
        ],
        'xbox-series-s': [
          { label: 'Накопитель', value: pick(seed, ['512 ГБ SSD'], 2) },
          { label: 'Прошивка', value: pick(seed, FIRMWARE, 10) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'nintendo-switch': [
          { label: 'Версия', value: pick(seed, ['V2 (батарея дольше)', 'OLED', 'Lite, без док-станции'], 4) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'airpods-pro-2': [
          { label: 'Автономность', value: pick(seed, HEADPHONE_BATT, 3) },
          { label: 'Кейс', value: pick(seed, ['Зарядку держит', 'Кейс живой', 'Кейс с царапками'], 9) },
        ],
        'apple-watch-7': [
          { label: 'Размер корпуса', value: pick(seed, ['45 мм'], 2) },
          { label: 'Батарея', value: pick(seed, WATCH_BATT, 8) },
          { label: 'Ремешок', value: pick(seed, ['Спортивный, оригинал', 'Плюс запасной'], 13) },
        ],
        'galaxy-watch-4': [
          { label: 'Размер корпуса', value: pick(seed, ['44 мм'], 2) },
          { label: 'Батарея', value: pick(seed, WATCH_BATT, 9) },
        ],
        'yandex-station-mini': [
          { label: 'Тип', value: pick(seed, ['Стационарное'], 2) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'tv-samsung-43': [
          { label: 'Диагональ', value: pick(seed, SCREEN_SIZE, 2) },
          { label: 'Разрешение', value: pick(seed, ['4K UHD'], 5) },
          { label: 'Год выпуска', value: pick(seed, TV_YEAR, 12) },
        ],
        'monitor-lg-24': [
          { label: 'Диагональ', value: pick(seed, ['24" (61 см)'], 2) },
          { label: 'Разрешение', value: pick(seed, ['Full HD IPS'], 6) },
          { label: 'Частота', value: pick(seed, ['75 Гц'], 3) },
        ],
        'sony-wh-1000xm4': [
          { label: 'Автономность', value: pick(seed, HEADPHONE_BATT, 4) },
          { label: 'Шумодав', value: pick(seed, ['Работает', 'Работает, амбушюры целые'], 9) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'keychron-k2': [
          { label: 'Свитчи', value: pick(seed, ['Brown', 'Red', 'Blue, кликают'], 5) },
          { label: 'Подсветка', value: pick(seed, ['Белая', 'RGB'], 10) },
        ],
      }
      if (ELEC_SPEC[itemKey]) return ELEC_SPEC[itemKey]
      return [
        { label: 'Тип', value: pick(seed, TYPE, 2) },
        { label: 'Комплект', value: pick(seed, KIT, 11) },
      ]
    }
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
    case 'appliances': {
      const APPL_SPEC: Record<string, SpecItem[]> = {
        'robot-xiaomi': [
          { label: 'Автономность', value: pick(seed, ROBOT_BATT, 4) },
          { label: 'Комплект', value: pick(seed, ['База и щётки', 'База, без щёток'], 9) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'atlant-holodilnik': [
          { label: 'Энергокласс', value: pick(seed, FRIDGE_CLASS, 5) },
          { label: 'Габариты', value: pick(seed, FRIDGE_SIZE, 10) },
          { label: 'Разморозка', value: pick(seed, ['No Frost', 'Капельная'], 14) },
        ],
        'lg-stiralka': [
          { label: 'Загрузка', value: pick(seed, WASHER_LOAD, 4) },
          { label: 'Отжим', value: pick(seed, WASHER_RPM, 9) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'svch-samsung': [
          { label: 'Мощность', value: pick(seed, MICROWAVE_POWER, 6) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'multivarka-redmond': [
          { label: 'Программы', value: pick(seed, MULTICOOK_PROGRAMS, 5) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'dyson-v8': [
          { label: 'Автономность', value: pick(seed, DYSON_BATT, 3) },
          { label: 'Насадки', value: pick(seed, ['4 насадки', 'Турбощётка + щель'], 8) },
        ],
        'delonghi-kofemashina': [
          { label: 'Давление', value: pick(seed, COFFEE_PRESSURE, 5) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'bosch-duhovka': [
          { label: 'Тип', value: pick(seed, OVEN_TYPE, 3) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
        'noirot-konvektor': [
          { label: 'Мощность', value: pick(seed, ['1000 Вт'], 2) },
          { label: 'Возраст', value: pick(seed, AGE, 16) },
        ],
      }
      if (APPL_SPEC[itemKey]) return APPL_SPEC[itemKey]
      return [
        { label: 'Мощность', value: pick(seed, POWER, 8) },
        { label: 'Возраст', value: pick(seed, AGE, 16) },
      ]
    }
    case 'hobby': {
      const HOBBY_SPEC: Record<string, SpecItem[]> = {
        'xiaomi-m365': [
          { label: 'Пробег', value: pick(seed, SAMOKAT_MILEAGE, 2) },
          { label: 'Запас хода', value: pick(seed, SAMOKAT_RANGE, 9) },
          { label: 'Возраст', value: pick(seed, AGE, 13) },
        ],
        'stels-navigator': [
          { label: 'Скоростей', value: pick(seed, BIKE_SPEEDS, 4) },
          { label: 'Рама', value: pick(seed, FRAME, 10) },
          { label: 'Возраст', value: pick(seed, AGE, 13) },
        ],
        'karkasson': [
          { label: 'Комплект', value: pick(seed, BOARD_GAMES, 6) },
          { label: 'Игроков', value: pick(seed, ['2-5', '2-4', '2-6'], 11) },
        ],
        'palatka-3': [
          { label: 'Вместимость', value: pick(seed, TENT_SEATS, 3) },
          { label: 'Состояние', value: pick(seed, ['Без проколов', 'Один шов подлатан', 'Дождь держит'], 12) },
        ],
        'aquarium-60': [
          { label: 'Объём', value: pick(seed, AQUA_VOLUME, 5) },
          { label: 'Комплект', value: pick(seed, ['Фильтр и свет в подарок', 'Тумба в хорошем виде', 'Без внутренностей'], 10) },
        ],
        'dualshock-4': [
          { label: 'Совместимость', value: pick(seed, GAMEPAD_COMPAT, 2) },
          { label: 'Состояние', value: pick(seed, ['Стики без люфта', 'Стик левый дрейфует слегка', 'Крестовина чёткая'], 9) },
        ],
        'garmin-etrex': [
          { label: 'Автономность', value: pick(seed, GPS_BATT, 4) },
          { label: 'Экран', value: pick(seed, ['Читаемо на солнце', 'Микроцарапки'], 8) },
        ],
        'teleskop-skywatcher': [
          { label: 'Оптика', value: pick(seed, TELESCOPE_ZOOM, 3) },
          { label: 'Тренога', value: pick(seed, ['Устойчивая', 'Люфтит чуть по азимуту'], 7) },
        ],
        'metalloiskatel-xterra': [
          { label: 'Глубина', value: pick(seed, DETECTOR_DEPTH, 5) },
          { label: 'Катушка', value: pick(seed, ['Штатная 9"', '11" в комплекте'], 11) },
        ],
      }
      if (HOBBY_SPEC[itemKey]) return HOBBY_SPEC[itemKey]
      return [
        { label: 'Вес', value: pick(seed, WEIGHT, 5) },
        { label: 'Возраст', value: pick(seed, AGE, 13) },
      ]
    }
    case 'sport': {
      const SPORT_SPEC: Record<string, SpecItem[]> = {
        'ganteli-16': [
          { label: 'Тип', value: pick(seed, ['Разборные'], 2) },
          { label: 'Общий вес', value: pick(seed, ['32 кг', '32 кг (2х16)'], 6) },
          { label: 'Блины', value: pick(seed, DUMBBELL_PLATES, 10) },
        ],
        'shtanga-50': [
          { label: 'Общий вес', value: pick(seed, ['50 кг', 'Около 50 кг'], 3) },
          { label: 'Гриф', value: pick(seed, BARBELL_BAR, 9) },
          { label: 'Замки', value: pick(seed, ['Защёлки', 'Гайки-«барашки»'], 13) },
        ],
        'begovaya-dorozhka': [
          { label: 'Мощность', value: pick(seed, TREAD_POWER, 4) },
          { label: 'Макс. скорость', value: pick(seed, TREAD_SPEED, 8) },
          { label: 'Складная', value: pick(seed, ['Да', 'Нет, стационарная'], 12) },
        ],
        'velotrenazher': [
          { label: 'Нагрузка', value: pick(seed, BIKE_LOAD, 5) },
          { label: 'Макс. вес', value: pick(seed, ['До 120 кг', 'До 150 кг'], 11) },
        ],
        'burton-custom': [
          { label: 'Длина', value: pick(seed, ['158 см'], 2) },
          { label: 'Прогиб', value: pick(seed, ['Кэмбер', 'Рокер', 'Флэт'], 7) },
          { label: 'Жёсткость', value: pick(seed, SNOWBOARD_FLEX, 13) },
        ],
        'bauer-konki': [
          { label: 'Размер', value: pick(seed, SKATE_SIZE, 4) },
          { label: 'Термоформовка', value: pick(seed, ['Да', 'Нет'], 9) },
          { label: 'Лезвия', value: pick(seed, ['Точены в сезоне', 'Просят заточки'], 14) },
        ],
        'rollerblade': [
          { label: 'Размер', value: pick(seed, ROLLER_SIZE, 5) },
          { label: 'Колёса', value: pick(seed, ROLLER_WHEELS, 10) },
          { label: 'Подшипники', value: pick(seed, ['ABEC 7', 'ABEC 5'], 15) },
        ],
        'wilson-raketki': [
          { label: 'Комплект', value: pick(seed, ['2 шт', '2 ракетки + чехол'], 3) },
          { label: 'Струны', value: pick(seed, RACKET_TENSION, 8) },
          { label: 'Вес', value: pick(seed, RACKET_WEIGHT, 12) },
        ],
        'turnik': [
          { label: 'Крепление', value: pick(seed, PULLUP_MOUNT, 4) },
          { label: 'Нагрузка', value: pick(seed, PULLUP_LOAD, 9) },
          { label: 'Хваты', value: pick(seed, ['Обычный/узкий/широкий', '3 хвата + нейтральный'], 13) },
        ],
      }
      if (SPORT_SPEC[itemKey]) return SPORT_SPEC[itemKey]
      return [
        { label: 'Тип', value: pick(seed, SPORT_TYPE, 7) },
        { label: 'Вес', value: pick(seed, WEIGHT, 15) },
      ]
    }
    case 'music': {
      const MUSIC_SPEC: Record<string, SpecItem[]> = {
        'fender-strat-mex': [
          { label: 'Струны', value: pick(seed, STRINGS, 2) },
          { label: 'Гриф', value: pick(seed, FRETBOARD, 8) },
          { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
        ],
        'yamaha-f310': [
          { label: 'Тип', value: pick(seed, ['Акустика'], 2) },
          { label: 'Струны', value: pick(seed, ['Металл', 'Нейлон поставил сам'], 7) },
          { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
        ],
        'yamaha-psr-e373': [
          { label: 'Тип', value: pick(seed, ['Синтезатор'], 3) },
          { label: 'Клавиши', value: pick(seed, ['61, чувствительные', '61'], 9) },
          { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
        ],
        'at-lp60x': [
          { label: 'Скорости', value: pick(seed, TURNTABLE_SPEED, 4) },
          { label: 'Комплект', value: pick(seed, KIT, 11) },
        ],
        'vinil-20': [
          { label: 'Кол-во', value: pick(seed, ['20 шт', '20 пластинок'], 2) },
          { label: 'Года', value: pick(seed, RECORDS, 8) },
          { label: 'Состояние', value: pick(seed, ['Без глубоких царапин', 'Пара с шорохом'], 13) },
        ],
        'squier-strat': [
          { label: 'Струны', value: pick(seed, STRINGS, 4) },
          { label: 'Гриф', value: pick(seed, FRETBOARD, 9) },
          { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
        ],
        'fender-champion-20': [
          { label: 'Мощность', value: pick(seed, COMBO_WATT, 5) },
          { label: 'Эффекты', value: pick(seed, ['Тремоло/дилей', 'Реверб и хорус'], 10) },
        ],
        'ukulele': [
          { label: 'Размер', value: pick(seed, ['Концертная'], 2) },
          { label: 'Струны', value: pick(seed, ['Нейлон 4 шт'], 6) },
        ],
      }
      if (MUSIC_SPEC[itemKey]) return MUSIC_SPEC[itemKey]
      return [
        { label: 'Тип', value: pick(seed, MUSIC_TYPE, 3) },
        { label: 'Год выпуска', value: pick(seed, YEAR, 12) },
      ]
    }
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
    case 'kids': {
      const KIDS_SPEC: Record<string, SpecItem[]> = {
        'anex-kolyaska': [
          { label: 'Тип', value: pick(seed, ['2 в 1 (блок + люлька)'], 2) },
          { label: 'Вес', value: pick(seed, STROLLER_WEIGHT, 7) },
          { label: 'Возраст', value: pick(seed, KIDS_AGE, 6) },
        ],
        'britax-kreslo': [
          { label: 'Группа', value: pick(seed, CARSEAT_GROUP, 4) },
          { label: 'Крепление', value: pick(seed, CARSEAT_MOUNT, 9) },
        ],
        'det-krovatka': [
          { label: 'Спальное место', value: pick(seed, CRIB_SIZE, 5) },
          { label: 'Матрас', value: pick(seed, ['В комплекте, чистый', 'Без пятен'], 10) },
        ],
        'vel-16': [
          { label: 'Колёса', value: pick(seed, KID_BIKE_WHEEL, 3) },
          { label: 'Возраст', value: pick(seed, ['3-5 лет', '4-6 лет'], 8) },
        ],
        'fisher-price': [
          { label: 'Возраст', value: pick(seed, ['0-1 год', '6 мес - 3 года'], 4) },
          { label: 'Музыка', value: pick(seed, ['Работает', 'Не пищит, кнопки целые'], 9) },
        ],
        'lego-razves': [
          { label: 'Детали', value: pick(seed, LEGO_PARTS, 5) },
          { label: 'Возраст', value: pick(seed, ['4+', '6+', 'смешанный'], 10) },
        ],
        'sanki-kanadka': [
          { label: 'Размер', value: pick(seed, SLEIGH, 3) },
          { label: 'Возраст', value: pick(seed, ['1-4 года'], 7) },
        ],
      }
      if (KIDS_SPEC[itemKey]) return KIDS_SPEC[itemKey]
      return [
        { label: 'Возраст', value: pick(seed, KIDS_AGE, 6) },
        { label: 'Цвет', value: pick(seed, COLOR, 14) },
      ]
    }
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
