// Каталог запчастей мастерской + движок совместимости.
// Чистый TS (клиент + сервер), без обращений к БД.
// Совместимость РЕАЛИСТИЧНАЯ: модель телефона, сокет CPU, тип/форм-фактор памяти,
// форм-фактор SSD, мощность БП vs TDP видеокарты, платформы ноутбук/десктоп.

// ─────────────────────────── Типы ───────────────────────────

export type GameKey = 'seam' | 'solder' | 'bolt' | 'simon' | 'gauge'
export type PartGroup = 'phones' | 'pc' | 'home' | 'misc'
export type PartRarity = 'original' | 'analog'

export interface Part {
  key: string
  title: string
  group: PartGroup
  kind: string // battery | display | glass | camera | port | speaker | sim | cpu | gpu | ram | ssd | hdd | psu | motherboard | cooler | pasta | keyboard | cmos | …
  rarity: PartRarity
  price: number // закупка у поставщика (новая), ₽
  game: GameKey // мини-игра установки
  fits: string[] // itemKey из catalog-data
  tags: string[] // «OLED», «DDR4 SO-DIMM», «M.2 NVMe», «650 Вт», «LGA1200»
  valueAdd: number // вклад в цену вещи при установке, ₽
  brand?: string // Apple / Samsung / Intel / AMD … — для живых причин отказа
}

export interface PcSpec {
  platform: 'laptop' | 'desktop' | 'phone' | 'console' | 'other'
  socket?: string // LGA1200 | AM4
  ramType?: 'DDR3' | 'DDR4' | 'DDR5'
  ramForm?: 'SO-DIMM' | 'DIMM'
  storage?: ('m2' | 'sata' | 'hdd')[]
  gpuTdpMax?: number // сколько Вт тепла корпус/охлаждение тянут
}

export interface ItemLike {
  itemKey: string
  category: string
}

export interface FitContext {
  installedPartKeys?: string[] // что уже стоит в вещи (для связки БП↔GPU)
}

export interface FitResult {
  ok: boolean
  reason?: string
}

// Аппаратные спецификации устройств из каталога (для живых правил)
export const ITEM_SPECS: Record<string, PcSpec> = {
  // Ноутбуки
  'macbook-air-2020': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: [] }, // свой форм-фактор SSD
  'macbook-pro-2015': { platform: 'laptop', ramType: 'DDR3', ramForm: 'SO-DIMM', storage: ['sata', 'hdd'] },
  'thinkpad-t480': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'] },
  'thinkpad-x1': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2'] },
  'asus-tuf-f15': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'], gpuTdpMax: 120 },
  'acer-nitro-5': { platform: 'laptop', ramType: 'DDR5', ramForm: 'SO-DIMM', storage: ['m2', 'sata'], gpuTdpMax: 140 },
  'msi-gf63': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'], gpuTdpMax: 100 },
  'hp-pavilion-15': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'] },
  'lenovo-ideapad-3': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'] },
  'dell-latitude-7490': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'] },
  'huawei-matebook-d15': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2'] },
  'asus-vivobook-15': { platform: 'laptop', ramType: 'DDR4', ramForm: 'SO-DIMM', storage: ['m2', 'sata'] },
  'macbook-air-2017': { platform: 'laptop', ramType: 'DDR3', ramForm: 'SO-DIMM', storage: ['sata'] },
  // Системные блоки (стенд для десктоп-запчастей)
  'pc-i5-build': { platform: 'desktop', socket: 'LGA1200', ramType: 'DDR4', ramForm: 'DIMM', storage: ['m2', 'sata', 'hdd'], gpuTdpMax: 250 },
  'pc-r5-build': { platform: 'desktop', socket: 'AM4', ramType: 'DDR4', ramForm: 'DIMM', storage: ['m2', 'sata', 'hdd'], gpuTdpMax: 250 },
  // Консоли (перепайка/паста)
  ps5: { platform: 'console' },
  'ps4-slim': { platform: 'console' },
  'xbox-series-s': { platform: 'console' },
  'nintendo-switch': { platform: 'console' },
}

export const PHONE_BRANDS: Record<string, string> = {
  'iphone-12': 'Apple', 'iphone-11': 'Apple', 'iphone-13': 'Apple', 'iphone-xr': 'Apple', 'iphone-se-2020': 'Apple',
  'galaxy-s22': 'Samsung', 'galaxy-s21': 'Samsung', 'galaxy-a54': 'Samsung',
  'redmi-note-12': 'Xiaomi', 'poco-x5-pro': 'Xiaomi', 'realme-gt-neo-3': 'Realme',
  'pixel-6a': 'Google', 'huawei-p30-pro': 'Huawei',
}

// ─────────────────────────── Каталог запчастей ───────────────────────────

const P = (p: Part): Part => p

// Телефонные «расходники» по моделям — генерируем, чтобы не раздувать файл
interface PhoneModelDef {
  key: string
  name: string
  battOrig: number
  battAnalog: number
  dispOrig: number
  dispAnalog: number
  oled?: boolean
}

const PHONE_MODELS: PhoneModelDef[] = [
  { key: 'iphone-12', name: 'iPhone 12', battOrig: 2600, battAnalog: 1300, dispOrig: 6800, dispAnalog: 3100, oled: true },
  { key: 'iphone-13', name: 'iPhone 13', battOrig: 2900, battAnalog: 1400, dispOrig: 8200, dispAnalog: 3800, oled: true },
  { key: 'iphone-11', name: 'iPhone 11', battOrig: 2300, battAnalog: 1100, dispOrig: 5400, dispAnalog: 2500 },
  { key: 'iphone-xr', name: 'iPhone XR', battOrig: 2100, battAnalog: 1000, dispOrig: 4900, dispAnalog: 2200 },
  { key: 'iphone-se-2020', name: 'iPhone SE 2020', battOrig: 1800, battAnalog: 900, dispOrig: 3600, dispAnalog: 1700 },
  { key: 'galaxy-s22', name: 'Galaxy S22', battOrig: 2500, battAnalog: 1200, dispOrig: 7400, dispAnalog: 3400, oled: true },
  { key: 'galaxy-s21', name: 'Galaxy S21', battOrig: 2300, battAnalog: 1100, dispOrig: 6600, dispAnalog: 3000, oled: true },
  { key: 'galaxy-a54', name: 'Galaxy A54', battOrig: 1700, battAnalog: 800, dispOrig: 3900, dispAnalog: 1800 },
  { key: 'redmi-note-12', name: 'Redmi Note 12', battOrig: 1300, battAnalog: 650, dispOrig: 2800, dispAnalog: 1300 },
  { key: 'poco-x5-pro', name: 'Poco X5 Pro', battOrig: 1500, battAnalog: 700, dispOrig: 3200, dispAnalog: 1500 },
  { key: 'realme-gt-neo-3', name: 'Realme GT Neo 3', battOrig: 1600, battAnalog: 800, dispOrig: 3600, dispAnalog: 1700 },
  { key: 'pixel-6a', name: 'Pixel 6a', battOrig: 1900, battAnalog: 900, dispOrig: 4300, dispAnalog: 2000, oled: true },
  { key: 'huawei-p30-pro', name: 'Huawei P30 Pro', battOrig: 1800, battAnalog: 900, dispOrig: 5200, dispAnalog: 2400, oled: true },
]

const phoneParts: Part[] = []
for (const m of PHONE_MODELS) {
  phoneParts.push(
    P({
      key: `batt-${m.key}`, title: `Аккумулятор ${m.name} (оригинал)`, group: 'phones', kind: 'battery',
      rarity: 'original', price: m.battOrig, game: 'seam', fits: [m.key], tags: ['Оригинал'], valueAdd: Math.round(m.battOrig * 0.65), brand: PHONE_BRANDS[m.key],
    }),
    P({
      key: `batt-${m.key}-a`, title: `Аккумулятор ${m.name} (аналог)`, group: 'phones', kind: 'battery',
      rarity: 'analog', price: m.battAnalog, game: 'seam', fits: [m.key], tags: ['Аналог'], valueAdd: Math.round(m.battAnalog * 0.55), brand: PHONE_BRANDS[m.key],
    }),
    P({
      key: `disp-${m.key}`, title: `Дисплей ${m.name} — ${m.oled ? 'OLED' : 'LCD'} (оригинал)`, group: 'phones', kind: 'display',
      rarity: 'original', price: m.dispOrig, game: 'seam', fits: [m.key], tags: m.oled ? ['OLED', 'Оригинал'] : ['LCD', 'Оригинал'], valueAdd: Math.round(m.dispOrig * 0.62), brand: PHONE_BRANDS[m.key],
    }),
    P({
      key: `disp-${m.key}-a`, title: `Дисплей ${m.name} (копия)`, group: 'phones', kind: 'display',
      rarity: 'analog', price: m.dispAnalog, game: 'seam', fits: [m.key], tags: ['Копия'], valueAdd: Math.round(m.dispAnalog * 0.6), brand: PHONE_BRANDS[m.key],
    }),
  )
}

const phoneExtras: Part[] = [
  P({ key: 'glass-iphone-12', title: 'Заднее стекло iPhone 12', group: 'phones', kind: 'glass', rarity: 'analog', price: 900, game: 'seam', fits: ['iphone-12'], tags: ['Стекло'], valueAdd: 600, brand: 'Apple' }),
  P({ key: 'glass-iphone-xr', title: 'Заднее стекло iPhone XR', group: 'phones', kind: 'glass', rarity: 'analog', price: 800, game: 'seam', fits: ['iphone-xr'], tags: ['Стекло'], valueAdd: 500, brand: 'Apple' }),
  P({ key: 'port-iphone-12', title: 'Разъём Lightning iPhone 12', group: 'phones', kind: 'port', rarity: 'analog', price: 700, game: 'solder', fits: ['iphone-12', 'iphone-13'], tags: ['Шлейф'], valueAdd: 450, brand: 'Apple' }),
  P({ key: 'port-galaxy-a54', title: 'Разъём USB-C Galaxy A54', group: 'phones', kind: 'port', rarity: 'analog', price: 550, game: 'solder', fits: ['galaxy-a54', 'galaxy-s21'], tags: ['Шлейф'], valueAdd: 350, brand: 'Samsung' }),
  P({ key: 'port-redmi-note-12', title: 'Разъём USB-C Redmi Note 12', group: 'phones', kind: 'port', rarity: 'analog', price: 450, game: 'solder', fits: ['redmi-note-12', 'poco-x5-pro'], tags: ['Шлейф'], valueAdd: 300, brand: 'Xiaomi' }),
  P({ key: 'cam-iphone-12', title: 'Модуль камеры iPhone 12', group: 'phones', kind: 'camera', rarity: 'original', price: 4200, game: 'seam', fits: ['iphone-12'], tags: ['Оригинал'], valueAdd: 2600, brand: 'Apple' }),
  P({ key: 'cam-galaxy-s22', title: 'Модуль камеры Galaxy S22', group: 'phones', kind: 'camera', rarity: 'original', price: 4600, game: 'seam', fits: ['galaxy-s22'], tags: ['Оригинал'], valueAdd: 2900, brand: 'Samsung' }),
  P({ key: 'spk-redmi-note-12', title: 'Динамик Redmi Note 12', group: 'phones', kind: 'speaker', rarity: 'analog', price: 400, game: 'solder', fits: ['redmi-note-12', 'realme-gt-neo-3'], tags: ['Шлейф'], valueAdd: 250, brand: 'Xiaomi' }),
  P({ key: 'sim-iphone-12', title: 'SIM-лоток iPhone 12', group: 'phones', kind: 'sim', rarity: 'analog', price: 200, game: 'gauge', fits: ['iphone-12', 'iphone-xr'], tags: ['Лоток'], valueAdd: 100, brand: 'Apple' }),
  P({ key: 'sim-galaxy-s22', title: 'SIM-лоток Galaxy S22', group: 'phones', kind: 'sim', rarity: 'analog', price: 220, game: 'gauge', fits: ['galaxy-s22', 'galaxy-s21', 'galaxy-a54'], tags: ['Лоток'], valueAdd: 100, brand: 'Samsung' }),
  P({ key: 'glass-prot-iphone-12', title: 'Защитное стекло iPhone 12/11/XR', group: 'phones', kind: 'glass', rarity: 'analog', price: 250, game: 'gauge', fits: ['iphone-12', 'iphone-11', 'iphone-xr'], tags: ['Аксессуар'], valueAdd: 150, brand: 'Apple' }),
  P({ key: 'glass-prot-galaxy-s22', title: 'Защитное стекло Galaxy S22', group: 'phones', kind: 'glass', rarity: 'analog', price: 250, game: 'gauge', fits: ['galaxy-s22', 'galaxy-s21'], tags: ['Аксессуар'], valueAdd: 150, brand: 'Samsung' }),
  P({ key: 'glass-prot-redmi', title: 'Защитное стекло Redmi/Poco', group: 'phones', kind: 'glass', rarity: 'analog', price: 200, game: 'gauge', fits: ['redmi-note-12', 'poco-x5-pro'], tags: ['Аксессуар'], valueAdd: 120, brand: 'Xiaomi' }),
  // Чип Apple: живая причина отказа для Android
  P({ key: 'cpu-a14', title: 'Чип Apple A14 Bionic', group: 'phones', kind: 'cpu', rarity: 'original', price: 9500, game: 'solder', fits: ['iphone-12'], tags: ['Apple', 'A14'], valueAdd: 5200, brand: 'Apple' }),
]

// PC-запчасти: сокеты, память, накопители, БП, платформы
const pcParts: Part[] = [
  // CPU
  P({ key: 'cpu-i3-10100f', title: 'Intel Core i3-10100F', group: 'pc', kind: 'cpu', rarity: 'analog', price: 4300, game: 'solder', fits: ['pc-i5-build'], tags: ['LGA1200', '4 ядра'], valueAdd: 2800, brand: 'Intel' }),
  P({ key: 'cpu-i5-10400', title: 'Intel Core i5-10400', group: 'pc', kind: 'cpu', rarity: 'analog', price: 8400, game: 'solder', fits: ['pc-i5-build'], tags: ['LGA1200', '6 ядер'], valueAdd: 5200, brand: 'Intel' }),
  P({ key: 'cpu-r5-5600', title: 'AMD Ryzen 5 5600', group: 'pc', kind: 'cpu', rarity: 'analog', price: 9200, game: 'solder', fits: ['pc-r5-build'], tags: ['AM4', '6 ядер'], valueAdd: 5800, brand: 'AMD' }),
  P({ key: 'cpu-i7-10700', title: 'Intel Core i7-10700', group: 'pc', kind: 'cpu', rarity: 'original', price: 14800, game: 'solder', fits: ['pc-i5-build'], tags: ['LGA1200', '8 ядер'], valueAdd: 9200, brand: 'Intel' }),
  P({ key: 'cpu-r7-5800x', title: 'AMD Ryzen 7 5800X', group: 'pc', kind: 'cpu', rarity: 'original', price: 18900, game: 'solder', fits: ['pc-r5-build'], tags: ['AM4', '8 ядер'], valueAdd: 11800, brand: 'AMD' }),
  // GPU (PCIe, десктоп)
  P({ key: 'gpu-gtx1650', title: 'Видеокарта GTX 1650', group: 'pc', kind: 'gpu', rarity: 'analog', price: 7400, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['PCIe', '75 Вт'], valueAdd: 4900, brand: 'NVIDIA' }),
  P({ key: 'gpu-rtx3060', title: 'Видеокарта RTX 3060', group: 'pc', kind: 'gpu', rarity: 'analog', price: 20800, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['PCIe', '170 Вт'], valueAdd: 13600, brand: 'NVIDIA' }),
  P({ key: 'gpu-rtx4080', title: 'Видеокарта RTX 4080', group: 'pc', kind: 'gpu', rarity: 'original', price: 76000, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['PCIe', '320 Вт'], valueAdd: 48000, brand: 'NVIDIA' }),
  // RAM: SO-DIMM для ноутов, DIMM для стендов
  P({ key: 'ram-ddr3-sodimm', title: 'Оперативка DDR3 SO-DIMM 4ГБ', group: 'pc', kind: 'ram', rarity: 'analog', price: 600, game: 'bolt', fits: ['macbook-pro-2015', 'macbook-air-2017'], tags: ['DDR3', 'SO-DIMM'], valueAdd: 380 }),
  P({ key: 'ram-ddr4-sodimm', title: 'Оперативка DDR4 SO-DIMM 8ГБ', group: 'pc', kind: 'ram', rarity: 'analog', price: 1600, game: 'bolt', fits: ['thinkpad-t480', 'thinkpad-x1', 'asus-tuf-f15', 'msi-gf63', 'hp-pavilion-15', 'lenovo-ideapad-3', 'dell-latitude-7490', 'huawei-matebook-d15', 'asus-vivobook-15'], tags: ['DDR4', 'SO-DIMM'], valueAdd: 1000 }),
  P({ key: 'ram-ddr5-sodimm', title: 'Оперативка DDR5 SO-DIMM 16ГБ', group: 'pc', kind: 'ram', rarity: 'original', price: 4100, game: 'bolt', fits: ['acer-nitro-5'], tags: ['DDR5', 'SO-DIMM'], valueAdd: 2600 }),
  P({ key: 'ram-ddr4-dimm', title: 'Оперативка DDR4 DIMM 8ГБ', group: 'pc', kind: 'ram', rarity: 'analog', price: 1500, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['DDR4', 'DIMM'], valueAdd: 950 }),
  P({ key: 'ram-ddr4-dimm-16', title: 'Оперативка DDR4 DIMM 16ГБ', group: 'pc', kind: 'ram', rarity: 'original', price: 3400, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['DDR4', 'DIMM'], valueAdd: 2200 }),
  // Накопители
  P({ key: 'ssd-m2-512', title: 'SSD M.2 NVMe 512ГБ', group: 'pc', kind: 'ssd', rarity: 'analog', price: 3100, game: 'bolt', fits: ['thinkpad-t480', 'thinkpad-x1', 'asus-tuf-f15', 'acer-nitro-5', 'msi-gf63', 'hp-pavilion-15', 'lenovo-ideapad-3', 'dell-latitude-7490', 'huawei-matebook-d15', 'asus-vivobook-15', 'pc-i5-build', 'pc-r5-build'], tags: ['M.2', 'NVMe'], valueAdd: 2000 }),
  P({ key: 'ssd-sata-512', title: 'SSD 2.5" SATA 512ГБ', group: 'pc', kind: 'ssd', rarity: 'analog', price: 1900, game: 'bolt', fits: ['macbook-pro-2015', 'macbook-air-2017', 'thinkpad-t480', 'asus-tuf-f15', 'acer-nitro-5', 'msi-gf63', 'hp-pavilion-15', 'lenovo-ideapad-3', 'dell-latitude-7490', 'asus-vivobook-15', 'pc-i5-build', 'pc-r5-build'], tags: ['SATA', '2.5"'], valueAdd: 1200 }),
  P({ key: 'hdd-1tb', title: 'Жёсткий диск HDD 1ТБ', group: 'pc', kind: 'hdd', rarity: 'analog', price: 2100, game: 'bolt', fits: ['macbook-pro-2015', 'pc-i5-build', 'pc-r5-build'], tags: ['SATA', '5400'], valueAdd: 900 }),
  // БП: мощность против TDP видеокарты
  P({ key: 'psu-450w', title: 'Блок питания 450 Вт', group: 'pc', kind: 'psu', rarity: 'analog', price: 2200, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['450 Вт'], valueAdd: 800 }),
  P({ key: 'psu-650w', title: 'Блок питания 650 Вт (бронза)', group: 'pc', kind: 'psu', rarity: 'analog', price: 3900, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['650 Вт', '80+ Bronze'], valueAdd: 1500 }),
  P({ key: 'psu-850w', title: 'Блок питания 850 Вт (золото)', group: 'pc', kind: 'psu', rarity: 'original', price: 6300, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['850 Вт', '80+ Gold'], valueAdd: 2400 }),
  // Материнки (стенд)
  P({ key: 'mb-lga1200', title: 'Материнка LGA1200 (ATX)', group: 'pc', kind: 'motherboard', rarity: 'analog', price: 5600, game: 'solder', fits: ['pc-i5-build'], tags: ['LGA1200', 'ATX'], valueAdd: 3400 }),
  P({ key: 'mb-am4', title: 'Материнка AM4 (ATX)', group: 'pc', kind: 'motherboard', rarity: 'analog', price: 5900, game: 'solder', fits: ['pc-r5-build'], tags: ['AM4', 'ATX'], valueAdd: 3600 }),
  // Охлаждение и расходники
  P({ key: 'cooler-tower', title: 'Кулер башенный', group: 'pc', kind: 'cooler', rarity: 'analog', price: 1800, game: 'bolt', fits: ['pc-i5-build', 'pc-r5-build'], tags: ['4-pin'], valueAdd: 800 }),
  P({ key: 'pasta-mx4', title: 'Термопаста (шприц)', group: 'pc', kind: 'pasta', rarity: 'analog', price: 450, game: 'gauge', fits: ['macbook-air-2020', 'macbook-pro-2015', 'thinkpad-t480', 'thinkpad-x1', 'asus-tuf-f15', 'acer-nitro-5', 'msi-gf63', 'hp-pavilion-15', 'lenovo-ideapad-3', 'dell-latitude-7490', 'huawei-matebook-d15', 'asus-vivobook-15', 'macbook-air-2017', 'pc-i5-build', 'pc-r5-build', 'ps5', 'ps4-slim', 'xbox-series-s', 'nintendo-switch'], tags: ['4 г'], valueAdd: 300 }),
  P({ key: 'liquid-metal-ps5', title: 'Жидкий металл для PS5', group: 'pc', kind: 'pasta', rarity: 'original', price: 1200, game: 'solder', fits: ['ps5'], tags: ['Ga-In'], valueAdd: 800 }),
  P({ key: 'cmos-cr2032', title: 'Батарейка CMOS CR2032', group: 'pc', kind: 'cmos', rarity: 'analog', price: 150, game: 'gauge', fits: ['pc-i5-build', 'pc-r5-build', 'macbook-pro-2015', 'dell-latitude-7490', 'thinkpad-t480'], tags: ['CR2032'], valueAdd: 80 }),
  // Клавиатуры и батареи ноутбуков — по моделям
  P({ key: 'kb-macbook-air-2020', title: 'Клавиатура MacBook Air 2020', group: 'pc', kind: 'keyboard', rarity: 'original', price: 5400, game: 'seam', fits: ['macbook-air-2020'], tags: ['Оригинал'], valueAdd: 3200, brand: 'Apple' }),
  P({ key: 'kb-thinkpad-t480', title: 'Клавиатура ThinkPad T480', group: 'pc', kind: 'keyboard', rarity: 'analog', price: 2300, game: 'seam', fits: ['thinkpad-t480'], tags: ['С подсветкой'], valueAdd: 1400 }),
  P({ key: 'kb-ideapad-3', title: 'Клавиатура IdeaPad 3', group: 'pc', kind: 'keyboard', rarity: 'analog', price: 1500, game: 'seam', fits: ['lenovo-ideapad-3'], tags: ['RU'], valueAdd: 900 }),
  P({ key: 'batt-laptop-t480', title: 'Батарея ThinkPad T480', group: 'pc', kind: 'battery', rarity: 'analog', price: 2600, game: 'bolt', fits: ['thinkpad-t480'], tags: ['48 Вт·ч'], valueAdd: 1500 }),
  P({ key: 'batt-laptop-mba', title: 'Батарея MacBook Air 2020', group: 'pc', kind: 'battery', rarity: 'original', price: 4900, game: 'bolt', fits: ['macbook-air-2020'], tags: ['Оригинал'], valueAdd: 2900, brand: 'Apple' }),
  P({ key: 'batt-laptop-ideapad', title: 'Батарея IdeaPad 3', group: 'pc', kind: 'battery', rarity: 'analog', price: 2200, game: 'bolt', fits: ['lenovo-ideapad-3'], tags: ['38 Вт·ч'], valueAdd: 1300 }),
  P({ key: 'batt-laptop-nitro', title: 'Батарея Acer Nitro 5', group: 'pc', kind: 'battery', rarity: 'analog', price: 2900, game: 'bolt', fits: ['acer-nitro-5'], tags: ['57 Вт·ч'], valueAdd: 1700 }),
]

// Бытовое, спорт, хобби, мебель — по catalog-data
const homeParts: Part[] = [
  P({ key: 'filter-robot-xiaomi', title: 'Фильтр для робота-пылесоса', group: 'home', kind: 'filter', rarity: 'analog', price: 600, game: 'gauge', fits: ['robot-xiaomi'], tags: ['HEPA'], valueAdd: 300 }),
  P({ key: 'brush-robot-xiaomi', title: 'Боковая щётка (комплект)', group: 'home', kind: 'brush', rarity: 'analog', price: 350, game: 'bolt', fits: ['robot-xiaomi'], tags: ['6 шт'], valueAdd: 180 }),
  P({ key: 'batt-robot-xiaomi', title: 'Батарея робота-пылесоса', group: 'home', kind: 'battery', rarity: 'analog', price: 2200, game: 'bolt', fits: ['robot-xiaomi'], tags: ['14.4В'], valueAdd: 1200 }),
  P({ key: 'filter-dyson-v8', title: 'Фильтр Dyson V8', group: 'home', kind: 'filter', rarity: 'analog', price: 900, game: 'gauge', fits: ['dyson-v8'], tags: ['Циклон'], valueAdd: 450 }),
  P({ key: 'batt-dyson-v8', title: 'Батарея Dyson V8', group: 'home', kind: 'battery', rarity: 'analog', price: 3900, game: 'bolt', fits: ['dyson-v8'], tags: ['21.6В'], valueAdd: 2000 }),
  P({ key: 'bearing-lg-stiralka', title: 'Подшипник бака (комплект)', group: 'home', kind: 'bearing', rarity: 'analog', price: 1300, game: 'bolt', fits: ['lg-stiralka'], tags: ['6205'], valueAdd: 700 }),
  P({ key: 'ten-lg-stiralka', title: 'ТЭН для стиральной машины', group: 'home', kind: 'heater', rarity: 'analog', price: 1100, game: 'bolt', fits: ['lg-stiralka'], tags: ['1900Вт'], valueAdd: 600 }),
  P({ key: 'magnetron-svch', title: 'Магнетрон для СВЧ', group: 'home', kind: 'magnetron', rarity: 'analog', price: 1600, game: 'solder', fits: ['svch-samsung'], tags: ['2.45ГГц'], valueAdd: 800 }),
  P({ key: 'ten-bosch', title: 'ТЭН духовки', group: 'home', kind: 'heater', rarity: 'analog', price: 1200, game: 'bolt', fits: ['bosch-duhovka'], tags: ['2000Вт'], valueAdd: 600 }),
  P({ key: 'brew-delonghi', title: 'Заварочный блок Delonghi', group: 'home', kind: 'brew', rarity: 'analog', price: 1900, game: 'bolt', fits: ['delonghi-kofemashina'], tags: ['Керамика'], valueAdd: 900 }),
  P({ key: 'gasket-atlant', title: 'Уплотнитель двери холодильника', group: 'home', kind: 'gasket', rarity: 'analog', price: 700, game: 'gauge', fits: ['atlant-holodilnik'], tags: ['Магнит'], valueAdd: 350 }),
  P({ key: 'backlight-tv-samsung', title: 'Комплект подсветки TV 43"', group: 'home', kind: 'backlight', rarity: 'analog', price: 2400, game: 'solder', fits: ['tv-samsung-43'], tags: ['LED-планки'], valueAdd: 1400 }),
  P({ key: 'psu-board-monitor', title: 'Плата питания монитора', group: 'home', kind: 'board', rarity: 'analog', price: 1100, game: 'solder', fits: ['monitor-lg-24'], tags: ['Замен.'], valueAdd: 600 }),
  P({ key: 'belt-treadmill', title: 'Беговое полотно', group: 'home', kind: 'belt', rarity: 'analog', price: 2900, game: 'bolt', fits: ['begovaya-dorozhka'], tags: ['ПВХ'], valueAdd: 1400 }),
  P({ key: 'pedal-set', title: 'Педали для тренажёра', group: 'home', kind: 'pedal', rarity: 'analog', price: 700, game: 'bolt', fits: ['velotrenazher'], tags: ['Пара'], valueAdd: 350 }),
  P({ key: 'tire-85', title: 'Камера 8.5" для самоката', group: 'home', kind: 'tire', rarity: 'analog', price: 500, game: 'bolt', fits: ['xiaomi-m365'], tags: ['8.5"'], valueAdd: 250 }),
  P({ key: 'brake-m365', title: 'Тормозной диск M365', group: 'home', kind: 'brake', rarity: 'analog', price: 600, game: 'bolt', fits: ['xiaomi-m365'], tags: ['120мм'], valueAdd: 300 }),
  P({ key: 'batt-m365', title: 'Батарея самоката M365', group: 'home', kind: 'battery', rarity: 'analog', price: 5900, game: 'bolt', fits: ['xiaomi-m365'], tags: ['7.8А·ч'], valueAdd: 3000 }),
  P({ key: 'chain-velo', title: 'Велосипедная цепь', group: 'home', kind: 'chain', rarity: 'analog', price: 600, game: 'bolt', fits: ['stels-navigator', 'vel-16'], tags: ['108 зв.'], valueAdd: 300 }),
  P({ key: 'tube-26', title: 'Камера 26"', group: 'home', kind: 'tire', rarity: 'analog', price: 350, game: 'bolt', fits: ['stels-navigator'], tags: ['26"'], valueAdd: 160 }),
  P({ key: 'tube-16', title: 'Камера 16"', group: 'home', kind: 'tire', rarity: 'analog', price: 300, game: 'bolt', fits: ['vel-16'], tags: ['16"'], valueAdd: 140 }),
  P({ key: 'mount-advocam', title: 'Крепление видеорегистратора', group: 'home', kind: 'mount', rarity: 'analog', price: 250, game: 'gauge', fits: ['advocam'], tags: ['Присоска'], valueAdd: 120 }),
  P({ key: 'harness-pioneer', title: 'Переходник-шлейф 2DIN', group: 'home', kind: 'harness', rarity: 'analog', price: 400, game: 'gauge', fits: ['pioneer-2din'], tags: ['ISO'], valueAdd: 200 }),
  P({ key: 'blades-hockey', title: 'Лезвия для коньков', group: 'home', kind: 'blade', rarity: 'analog', price: 1200, game: 'bolt', fits: ['bauer-konki'], tags: ['Сталь'], valueAdd: 600 }),
  P({ key: 'wheels-rollerblade', title: 'Колёса 80мм (комплект)', group: 'home', kind: 'wheel', rarity: 'analog', price: 900, game: 'bolt', fits: ['rollerblade'], tags: ['8 шт'], valueAdd: 450 }),
  P({ key: 'bearings-608', title: 'Подшипники 608zz', group: 'home', kind: 'bearing', rarity: 'analog', price: 400, game: 'bolt', fits: ['rollerblade', 'vel-16', 'stels-navigator'], tags: ['16 шт'], valueAdd: 200 }),
  P({ key: 'wax-snowboard', title: 'Воск и кант для сноуборда', group: 'home', kind: 'wax', rarity: 'analog', price: 500, game: 'gauge', fits: ['burton-custom'], tags: ['Скользяк'], valueAdd: 250 }),
  P({ key: 'strings-tennis', title: 'Струны для тенниса', group: 'home', kind: 'strings', rarity: 'analog', price: 700, game: 'bolt', fits: ['wilson-raketki'], tags: ['1.25мм'], valueAdd: 350 }),
  P({ key: 'strings-guitar', title: 'Струны для гитары (комплект)', group: 'home', kind: 'strings', rarity: 'analog', price: 450, game: 'bolt', fits: ['fender-strat-mex', 'yamaha-f310', 'squier-strat'], tags: ['Нейлон/сталь'], valueAdd: 220 }),
  P({ key: 'needle-vinyl', title: 'Игла для винилового проигрывателя', group: 'home', kind: 'needle', rarity: 'original', price: 800, game: 'gauge', fits: ['at-lp60x'], tags: ['Сапфир'], valueAdd: 400 }),
  P({ key: 'belt-lp60', title: 'Ремень привода проигрывателя', group: 'home', kind: 'belt', rarity: 'analog', price: 350, game: 'bolt', fits: ['at-lp60x'], tags: ['Резина'], valueAdd: 160 }),
  P({ key: 'eyepiece-skywatcher', title: 'Окуляр 10мм для телескопа', group: 'home', kind: 'eyepiece', rarity: 'analog', price: 900, game: 'gauge', fits: ['teleskop-skywatcher'], tags: ['1.25"'], valueAdd: 450 }),
  P({ key: 'coil-xterra', title: 'Поисковая катушка', group: 'home', kind: 'coil', rarity: 'analog', price: 3500, game: 'bolt', fits: ['metalloiskatel-xterra'], tags: ['9"'], valueAdd: 1700 }),
  P({ key: 'filter-aquarium', title: 'Фильтр для аквариума', group: 'home', kind: 'filter', rarity: 'analog', price: 600, game: 'gauge', fits: ['aquarium-60'], tags: ['Внешний'], valueAdd: 300 }),
  P({ key: 'lamp-aquarium', title: 'Лампа для аквариума', group: 'home', kind: 'lamp', rarity: 'analog', price: 400, game: 'gauge', fits: ['aquarium-60'], tags: ['T5'], valueAdd: 180 }),
  P({ key: 'stick-ds4', title: 'Аналоговые стики DualShock 4', group: 'home', kind: 'stick', rarity: 'analog', price: 450, game: 'bolt', fits: ['dualshock-4'], tags: ['2 шт'], valueAdd: 250 }),
  P({ key: 'joycon-sticks', title: 'Стики Joy-Con (дрейф-fix)', group: 'home', kind: 'stick', rarity: 'analog', price: 600, game: 'solder', fits: ['nintendo-switch'], tags: ['Hall'], valueAdd: 350 }),
  P({ key: 'hdmi-ps4', title: 'HDMI-порт (платa)', group: 'home', kind: 'port', rarity: 'analog', price: 700, game: 'solder', fits: ['ps4-slim', 'xbox-series-s'], tags: ['Перепайка'], valueAdd: 400 }),
  P({ key: 'fan-ps4', title: 'Кулер охлаждения PS4', group: 'home', kind: 'cooler', rarity: 'analog', price: 900, game: 'bolt', fits: ['ps4-slim'], tags: ['KSB0912'], valueAdd: 450 }),
  P({ key: 'strap-apple-watch', title: 'Ремешок Apple Watch 42-45мм', group: 'home', kind: 'strap', rarity: 'analog', price: 900, game: 'gauge', fits: ['apple-watch-7'], tags: ['Спорт'], valueAdd: 400 }),
  P({ key: 'batt-apple-watch', title: 'Батарея Apple Watch', group: 'home', kind: 'battery', rarity: 'original', price: 1400, game: 'bolt', fits: ['apple-watch-7'], tags: ['Оригинал'], valueAdd: 700, brand: 'Apple' }),
  P({ key: 'strap-standard-20', title: 'Ремешок 20мм универсальный', group: 'home', kind: 'strap', rarity: 'analog', price: 500, game: 'gauge', fits: ['galaxy-watch-4'], tags: ['Быстросъём'], valueAdd: 220 }),
  P({ key: 'pads-xm4', title: 'Амбушюры для наушников', group: 'home', kind: 'pads', rarity: 'analog', price: 600, game: 'gauge', fits: ['sony-wh-1000xm4'], tags: ['Кожзам'], valueAdd: 300 }),
  P({ key: 'switches-keychron', title: 'Свичи Gateron (комплект)', group: 'home', kind: 'switch', rarity: 'analog', price: 700, game: 'solder', fits: ['keychron-k2'], tags: ['Hot-swap совмест.'], valueAdd: 380 }),
  // Мебель и детские
  P({ key: 'mech-sofa', title: 'Механизм раскладывания дивана', group: 'home', kind: 'mechanism', rarity: 'analog', price: 1400, game: 'bolt', fits: ['divan-knizhka', 'friheten'], tags: ['Сталь'], valueAdd: 700 }),
  P({ key: 'cover-friheten', title: 'Чехол на диван', group: 'home', kind: 'cover', rarity: 'analog', price: 1900, game: 'gauge', fits: ['friheten', 'divan-knizhka', 'eames-kreslo'], tags: ['Ткань'], valueAdd: 800 }),
  P({ key: 'slides-drawer', title: 'Направляющие ящиков (комплект)', group: 'home', kind: 'slides', rarity: 'analog', price: 500, game: 'bolt', fits: ['komod-sosna', 'komp-stol'], tags: ['Шариковые'], valueAdd: 250 }),
  P({ key: 'rollers-kupe', title: 'Ролики двери-купе', group: 'home', kind: 'rollers', rarity: 'analog', price: 350, game: 'bolt', fits: ['shkaf-kupe'], tags: ['4 шт'], valueAdd: 160 }),
  P({ key: 'casters-eames', title: 'Колёсики для кресла (5 шт)', group: 'home', kind: 'casters', rarity: 'analog', price: 300, game: 'bolt', fits: ['eames-kreslo'], tags: ['Стандарт'], valueAdd: 140 }),
  P({ key: 'pegs-billy', title: 'Полкодержатели', group: 'home', kind: 'pegs', rarity: 'analog', price: 150, game: 'gauge', fits: ['billy', 'shkaf-kupe', 'komod-sosna'], tags: ['20 шт'], valueAdd: 60 }),
  P({ key: 'slats-krovat', title: 'Ламели основания (комплект)', group: 'home', kind: 'slats', rarity: 'analog', price: 700, game: 'bolt', fits: ['krovat-160'], tags: ['Бук'], valueAdd: 320 }),
  P({ key: 'wheels-stroller', title: 'Колёса для коляски (пара)', group: 'home', kind: 'wheel', rarity: 'analog', price: 900, game: 'bolt', fits: ['anex-kolyaska', 'britax-kreslo'], tags: ['Надувные'], valueAdd: 420 }),
  P({ key: 'guard-bed', title: 'Защитный бортик кроватки', group: 'home', kind: 'guard', rarity: 'analog', price: 600, game: 'gauge', fits: ['det-krovatka'], tags: ['Ткань'], valueAdd: 280 }),
  P({ key: 'rope-sanki', title: 'Верёвка-шнур для санок', group: 'home', kind: 'rope', rarity: 'analog', price: 150, game: 'bolt', fits: ['sanki-kanadka'], tags: ['2 м'], valueAdd: 60 }),
  // Одежда и обувь
  P({ key: 'zipper-kit', title: 'Молния + пуговицы (набор)', group: 'misc', kind: 'zipper', rarity: 'analog', price: 200, game: 'gauge', fits: ['levis-501', 'zara-hoodie', 'tommy-tishka', 'mango-dress', 'puhovik-uniqlo', 'tnf-kurtka', 'carhartt-detroit', 'massimo-palto', 'henderson-kostyum', 'adidas-sportcost', 'polushubok'], tags: ['Швейное'], valueAdd: 100 }),
  P({ key: 'insoles-pair', title: 'Стельки (пара)', group: 'misc', kind: 'insoles', rarity: 'analog', price: 250, game: 'gauge', fits: ['nike-af1', 'adidas-samba', 'nb-574', 'aj1-mid', 'asics-kayano-14', 'puma-suede', 'reebok-classic', 'salomon-xt6', 'vans-old-skool'], tags: ['Гель'], valueAdd: 120 }),
  P({ key: 'laces-pair', title: 'Шнурки (пара)', group: 'misc', kind: 'laces', rarity: 'analog', price: 150, game: 'gauge', fits: ['nike-af1', 'adidas-samba', 'nb-574', 'aj1-mid', 'asics-kayano-14', 'puma-suede', 'reebok-classic', 'salomon-xt6', 'vans-old-skool'], tags: ['Вощёные'], valueAdd: 60 }),
]

export const PARTS: Part[] = [...phoneParts, ...phoneExtras, ...pcParts, ...homeParts]

const PART_BY_KEY = new Map(PARTS.map((p) => [p.key, p]))

export function partById(key: string): Part | undefined {
  return PART_BY_KEY.get(key)
}

export function findParts(itemKey: string): Part[] {
  return PARTS.filter((p) => p.fits.includes(itemKey))
}

// GPU: TDP из тегов («170 Вт»)
export function gpuTdp(part: Part): number {
  if (part.kind !== 'gpu') return 0
  const m = part.tags.find((t) => /Вт/.test(t))?.match(/(\d+)/)
  return m ? Number(m[1]) : 0
}

export function psuWatts(part: Part): number {
  if (part.kind !== 'psu') return 0
  const m = part.tags.find((t) => /Вт/.test(t))?.match(/(\d+)/)
  return m ? Number(m[1]) : 0
}

// ─────────────────────── Совместимость (главное правило игры) ───────────────────────

export function canFit(part: Part, item: ItemLike, ctx?: FitContext): FitResult {
  const fitsModel = part.fits.includes(item.itemKey)

  // Связка БП ↔ видеокарта: проверяем даже совместимую по модели пару
  if (fitsModel && part.kind === 'gpu') {
    const spec = ITEM_SPECS[item.itemKey]
    const tdp = gpuTdp(part)
    if (spec?.gpuTdpMax && tdp > spec.gpuTdpMax) {
      return { ok: false, reason: `Корпус и охлаждение не вытянут ${part.title}` }
    }
    const installed = ctx?.installedPartKeys ?? []
    const psu = installed.map(partById).find((p) => p?.kind === 'psu')
    if (psu) {
      const w = psuWatts(psu)
      if (w && w < tdp + 150) {
        return { ok: false, reason: `БП ${w} Вт не потянет ${part.title} — сначала замените блок питания` }
      }
    }
  }
  if (fitsModel && part.kind === 'psu') {
    const installed = ctx?.installedPartKeys ?? []
    const gpu = installed.map(partById).find((p) => p?.kind === 'gpu')
    if (gpu) {
      const tdp = gpuTdp(gpu)
      const w = psuWatts(part)
      if (tdp && w && w < tdp + 150) {
        return { ok: false, reason: `БП ${w} Вт не потянет ${gpu.title}` }
      }
    }
  }
  if (fitsModel) return { ok: true }

  // Живые причины отказа
  const spec = ITEM_SPECS[item.itemKey]
  const phoneBrand = PHONE_BRANDS[item.itemKey]

  if (part.kind === 'cpu') {
    if (phoneBrand) {
      return part.brand === 'Apple' && phoneBrand !== 'Apple'
        ? { ok: false, reason: `Чип Apple не ставится в ${phoneBrand}` }
        : { ok: false, reason: `Чип не подходит к ${mShort(item.itemKey)}` }
    }
    if (spec?.platform === 'laptop') return { ok: false, reason: 'Процессор ноутбука распаян' }
    if (spec?.socket && part.tags.some((t) => spec.socket && t !== spec.socket && /^(LGA|AM)/.test(t))) {
      return { ok: false, reason: `Сокет не совпадает: нужен ${spec.socket}` }
    }
    return { ok: false, reason: 'Сокет процессора не совпадает с платой' }
  }
  if (part.kind === 'gpu') {
    if (phoneBrand) return { ok: false, reason: 'В телефоне графика встроена в чип' }
    if (spec?.platform === 'laptop') return { ok: false, reason: 'В ноутбуке видеокарта распаяна' }
    if (spec?.platform !== 'desktop') return { ok: false, reason: 'Нужен системный блок со слотом PCIe' }
    return { ok: false, reason: 'Плата не рассчитана на эту видеокарту' }
  }
  if (part.kind === 'ram') {
    if (spec?.ramType || spec?.ramForm) {
      if (spec.ramType && !part.tags.includes(spec.ramType)) {
        return { ok: false, reason: `${part.tags[0]} не встанет в ${spec.ramType}-слот` }
      }
      if (spec.ramForm && !part.tags.includes(spec.ramForm)) {
        return { ok: false, reason: `${spec.ramForm === 'DIMM' ? 'SO-DIMM не влезет в настольный DIMM-слот' : 'DIMM не влезет в ноутбук — нужен SO-DIMM'}` }
      }
    }
    return { ok: false, reason: 'Тип памяти не совпадает со слотами' }
  }
  if (part.kind === 'ssd') {
    if (spec?.storage) {
      const isM2 = part.tags.includes('M.2')
      if (isM2 && !spec.storage.includes('m2')) {
        return { ok: false, reason: 'Только SATA: слота M.2 здесь нет' }
      }
      if (!isM2 && spec.storage.includes('sata')) return { ok: true } // SATA-диск шире совместим
    }
    return { ok: false, reason: 'Форм-фактор накопителя не подходит' }
  }
  if (part.kind === 'psu') return { ok: false, reason: 'Блок питания ставится только в системный блок' }
  if (part.kind === 'motherboard') return { ok: false, reason: 'Плата должна совпадать по сокету и форм-фактору' }
  if (part.group === 'phones') {
    if (phoneBrand) return { ok: false, reason: `Запчасть от другой модели (${mShort(item.itemKey)} не подходит)` }
    return { ok: false, reason: 'У этого устройства нет такого узла' }
  }
  if (part.kind === 'battery' && spec?.platform === 'console') return { ok: false, reason: 'У консоли своя батарея на плате' }
  return { ok: false, reason: 'Не совместимо с этим устройством' }
}

function mShort(itemKey: string): string {
  const m = PHONE_MODELS.find((x) => x.key === itemKey)
  return m ? m.name : 'эту модель'
}

// ─────────────────────────── Неисправности (диагностика) ───────────────────────────

export interface FaultDef {
  code: string
  label: string
  kind?: string // kind запчасти, которую предлагает ремонт
}

export interface Fault extends FaultDef {
  wear: number // износ узла 0..100 (косметика для UI)
  partKey?: string // рекомендованная запчасть
}

const FAULT_POOL: Record<string, FaultDef[]> = {
  phones: [
    { code: 'batt', label: 'Аккумулятор изношен', kind: 'battery' },
    { code: 'disp', label: 'Экран: полосы и пиксели', kind: 'display' },
    { code: 'port', label: 'Разъём зарядки', kind: 'port' },
    { code: 'cam', label: 'Камера: пятно в кадре', kind: 'camera' },
    { code: 'spk', label: 'Динамик хрипит', kind: 'speaker' },
    { code: 'gl', label: 'Скол на стекле', kind: 'glass' },
  ],
  laptops: [
    { code: 'batt', label: 'Батарея держит 20 минут', kind: 'battery' },
    { code: 'kb', label: 'Залитая клавиатура', kind: 'keyboard' },
    { code: 'ssd', label: 'Медленный накопитель', kind: 'ssd' },
    { code: 'pasta', label: 'Термопаста высохла, греется', kind: 'pasta' },
    { code: 'ram', label: 'Мало памяти', kind: 'ram' },
  ],
  electronics: [
    { code: 'board', label: 'Плата: холодная пайка', kind: 'board' },
    { code: 'psu', label: 'Плата питания', kind: 'board' },
    { code: 'backlight', label: 'Подсветка/изображение', kind: 'backlight' },
    { code: 'port', label: 'Разъём HDMI/зарядки', kind: 'port' },
    { code: 'stick', label: 'Дрейф стиков', kind: 'stick' },
    { code: 'pasta', label: 'Перегрев, нужна паста', kind: 'pasta' },
  ],
  appliances: [
    { code: 'filter', label: 'Фильтр забит', kind: 'filter' },
    { code: 'brush', label: 'Щётки изношены', kind: 'brush' },
    { code: 'bearing', label: 'Подшипник гудит', kind: 'bearing' },
    { code: 'heater', label: 'Нагреватель (ТЭН)', kind: 'heater' },
    { code: 'belt', label: 'Ремень/полотно растянуто', kind: 'belt' },
    { code: 'batt', label: 'Батарея не держит', kind: 'battery' },
  ],
  mechanics: [
    { code: 'mech', label: 'Механика изношена' },
    { code: 'fast', label: 'Крепления ослабли' },
    { code: 'wear', label: 'Люфт и потёртости' },
  ],
  soft: [
    { code: 'soft', label: 'Софт: ошибки и сбои' },
    { code: 'cmos', label: 'Слетают настройки BIOS', kind: 'cmos' },
    { code: 'pasta', label: 'Перегрев', kind: 'pasta' },
  ],
}

// Универсальный пул для категорий без специфики
const GENERIC_FAULTS = FAULT_POOL.mechanics

// Категория-пул неисправностей для itemKey
export function faultPoolFor(item: ItemLike): FaultDef[] {
  if (item.itemKey === 'pc-i5-build' || item.itemKey === 'pc-r5-build') return [...FAULT_POOL.soft, ...FAULT_POOL.mechanics, { code: 'ssd', label: 'Медленный накопитель', kind: 'ssd' }, { code: 'ram', label: 'Мало памяти', kind: 'ram' }, { code: 'psu2', label: 'Питание проседает', kind: 'psu' }]
  if (item.category === 'phones') return FAULT_POOL.phones
  if (item.category === 'laptops') return [...FAULT_POOL.laptops, ...FAULT_POOL.soft]
  if (['ps5', 'ps4-slim', 'xbox-series-s', 'nintendo-switch', 'tv-samsung-43', 'monitor-lg-24', 'keychron-k2', 'sony-wh-1000xm4', 'dualshock-4'].includes(item.itemKey)) return FAULT_POOL.electronics
  if (item.category === 'appliances') return FAULT_POOL.appliances
  return GENERIC_FAULTS
}

// Детерминированный ГПСЧ на сиде (диагностика стабильна для пары item+condition)
export function seededRand(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

// Диагностика: 1-3 узла, у каждого — рекомендованная запчасть (если есть)
export function diagnose(item: ItemLike, condition: string): Fault[] {
  const pool = faultPoolFor(item)
  const rnd = seededRand(`${item.itemKey}|${condition}`)
  const count = condition === 'parts' ? 3 : condition === 'used' || condition === 'good' ? 2 : 1
  const shuffled = [...pool].sort(() => rnd() - 0.5)
  const picked: FaultDef[] = []
  for (const f of shuffled) {
    if (picked.length >= count) break
    if (!picked.some((p) => p.code === f.code)) picked.push(f)
  }
  return picked.map((f) => {
    const wear = Math.round(35 + rnd() * 60)
    let partKey: string | undefined
    if (f.kind) {
      const fitting = PARTS.filter((p) => p.kind === f.kind && p.fits.includes(item.itemKey)).sort((a, b) => a.price - b.price)
      partKey = fitting[0]?.key
    }
    return { ...f, wear, partKey }
  })
}

// ─────────────────────────── Инструменты ───────────────────────────

export interface ToolDef {
  key: string
  title: string
  price: number
  uses: number
  game: GameKey
  hint: string
}

export const TOOLS: ToolDef[] = [
  { key: 'heatgun', title: 'Фен-станция', price: 2600, uses: 30, game: 'seam', hint: 'Отклеивать швы и стёкла' },
  { key: 'solderiron', title: 'Паяльная станция', price: 3400, uses: 30, game: 'solder', hint: 'Контакты и платы' },
  { key: 'wrenchset', title: 'Набор ключей', price: 1500, uses: 30, game: 'bolt', hint: 'Гайки и крепления' },
  { key: 'probe', title: 'Сервисный сканер', price: 4200, uses: 30, game: 'simon', hint: 'Диагностика узлов' },
  { key: 'screwkit', title: 'Набор отвёрток', price: 1800, uses: 30, game: 'gauge', hint: 'Мелкий ремонт' },
]

export function toolForGame(game: GameKey): ToolDef | undefined {
  return TOOLS.find((t) => t.game === game)
}

// ─────────────────────────── Мини-игры ───────────────────────────

export const GAME_INFO: Record<GameKey, { title: string; hint: string }> = {
  seam: { title: 'Отклей шов', hint: 'Веди палец по шву, не сходя с линии' },
  solder: { title: 'Перепайка', hint: 'Жми только подсвеченный контакт' },
  bolt: { title: 'Гайка', hint: 'Крути палец по кругу до упора' },
  simon: { title: 'Диагностика', hint: 'Повтори последовательность кодов' },
  gauge: { title: 'Точная работа', hint: 'Удерживай стрелку в зелёной зоне' },
}

// Мини-игра по категории вещи (если у запчасти нет своей)
export function gameForItem(item: ItemLike): GameKey {
  if (item.category === 'phones') return 'seam'
  if (item.category === 'laptops') return 'simon'
  if (['ps5', 'ps4-slim', 'xbox-series-s', 'nintendo-switch', 'tv-samsung-43', 'monitor-lg-24', 'keychron-k2', 'sony-wh-1000xm4', 'dualshock-4', 'yandex-station-mini', 'airpods-pro-2', 'apple-watch-7', 'galaxy-watch-4', 'svch-samsung'].includes(item.itemKey)) return 'solder'
  if (item.category === 'appliances' && ['robot-xiaomi', 'dyson-v8', 'aquarium-60'].includes(item.itemKey)) return 'gauge'
  if (item.category === 'electronics') return 'solder'
  if (['clothes', 'sneakers', 'books', 'kids'].includes(item.category)) return 'gauge'
  return 'bolt' // мебель, спорт, хобби, авто
}

export function gameForJob(item: ItemLike, part?: Part | null): GameKey {
  return part?.game ?? gameForItem(item)
}

export type Difficulty = 'easy' | 'normal' | 'hard'

export function shiftDifficulty(d: Difficulty, delta: number): Difficulty {
  const order: Difficulty[] = ['easy', 'normal', 'hard']
  const i = Math.max(0, Math.min(2, order.indexOf(d) + delta))
  return order[i]
}

export const PART_GROUPS: { key: PartGroup; label: string }[] = [
  { key: 'phones', label: 'Телефоны' },
  { key: 'pc', label: 'Компьютеры' },
  { key: 'home', label: 'Дом и техника' },
  { key: 'misc', label: 'Мелочи' },
]
