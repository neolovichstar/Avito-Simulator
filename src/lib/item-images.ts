// Фото конкретных товаров (сгенерированы в public/img/p/).
// Если для itemKey есть фото — оно перекрывает картинку категории.
import { CATEGORY_IMAGE } from '@/lib/catalog-types'

const PRODUCT_IMAGES: Record<string, string> = {
  'iphone-12': '/img/p/iphone-12.jpg',
  'iphone-11': '/img/p/iphone-11.jpg',
  'iphone-13': '/img/p/iphone-13.jpg',
  'iphone-xr': '/img/p/iphone-xr.jpg',
  'redmi-note-12': '/img/p/redmi-note-12.jpg',
  'galaxy-s22': '/img/p/galaxy-s22.jpg',
  'galaxy-a54': '/img/p/galaxy-a54.jpg',
  'galaxy-s21': '/img/p/galaxy-s21.jpg',
  'poco-x5-pro': '/img/p/poco-x5-pro.jpg',
  'ps5': '/img/p/ps5.jpg',
  'ps4-slim': '/img/p/ps4-slim.jpg',
  'nintendo-switch': '/img/p/nintendo-switch.jpg',
  'airpods-pro-2': '/img/p/airpods-pro-2.jpg',
  'apple-watch-7': '/img/p/apple-watch-7.jpg',
  'yandex-station-mini': '/img/p/yandex-station-mini.jpg',
  'macbook-air-2020': '/img/p/macbook-air-2020.jpg',
  'thinkpad-t480': '/img/p/thinkpad-t480.jpg',
  'lenovo-ideapad-3': '/img/p/lenovo-ideapad-3.jpg',
  'acer-nitro-5': '/img/p/acer-nitro-5.jpg',
  'asus-tuf-f15': '/img/p/asus-tuf-f15.jpg',
  'hp-pavilion-15': '/img/p/hp-pavilion-15.jpg',
  'asus-vivobook-15': '/img/p/asus-vivobook-15.jpg',
  'levis-501': '/img/p/levis-501.jpg',
  'zara-hoodie': '/img/p/zara-hoodie.jpg',
  'puhovik-uniqlo': '/img/p/puhovik-uniqlo.jpg',
  'mango-dress': '/img/p/mango-dress.jpg',
  'tommy-tishka': '/img/p/tommy-tishka.jpg',
  'adidas-sportcost': '/img/p/adidas-sportcost.jpg',
  'nike-af1': '/img/p/nike-af1.jpg',
  'adidas-samba': '/img/p/adidas-samba.jpg',
  'nb-574': '/img/p/nb-574.jpg',
  'aj1-mid': '/img/p/aj1-mid.jpg',
  'asics-kayano-14': '/img/p/asics-kayano-14.jpg',
  'vans-old-skool': '/img/p/vans-old-skool.jpg',
  'robot-xiaomi': '/img/p/robot-xiaomi.jpg',
  'lg-stiralka': '/img/p/lg-stiralka.jpg',
  'svch-samsung': '/img/p/svch-samsung.jpg',
  'multivarka-redmond': '/img/p/multivarka-redmond.jpg',
  'tv-samsung-43': '/img/p/tv-samsung-43.jpg',
  'monitor-lg-24': '/img/p/monitor-lg-24.jpg',
  'divan-knizhka': '/img/p/divan-knizhka.jpg',
  'friheten': '/img/p/friheten.jpg',
  'komp-stol': '/img/p/komp-stol.jpg',
  'billy': '/img/p/billy.jpg',
  'ganteli-16': '/img/p/ganteli-16.jpg',
  'xiaomi-m365': '/img/p/xiaomi-m365.jpg',
}

/** Фото для itemKey: продукт-фото, иначе фото категории. */
export function itemImage(itemKey?: string | null, category?: string | null): string {
  if (itemKey && PRODUCT_IMAGES[itemKey]) return PRODUCT_IMAGES[itemKey]
  if (category && CATEGORY_IMAGE[category]) return CATEGORY_IMAGE[category]
  return '/img/cat-electronics.jpg'
}

/** Есть ли у товара собственное фото. */
export function hasProductImage(itemKey: string): boolean {
  return itemKey in PRODUCT_IMAGES
}
