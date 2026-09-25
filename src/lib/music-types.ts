/**
 * Типы музыки (v2, Audius — полные треки). Реэкспорт типов из серверного
 * клиента: type-only, поэтому серверный код не попадает в бандл клиента.
 */
export type { Track, MusicSection, HomeData } from '@/lib/audius'
