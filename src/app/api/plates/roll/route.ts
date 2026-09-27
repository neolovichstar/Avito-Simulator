import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'
import { rateLimit } from '@/lib/ratelimit'
import { subjectByName, RF_SUBJECTS } from '@/lib/rf-regions'
import { makePlateOffer } from '@/lib/plate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/plates/roll { subject, mode, keep? } — бесплатная прокрутка знака.
 * mode: 'full' (всё) | 'letters' (только буквы) | 'digits' (только цифры).
 * При частичной прокрутке keep хранит неизменяемые части. Возвращает оффер
 * с редкостью и ценой выкупа; покупка — отдельным POST /api/plates.
 */
export async function POST(req: Request) {
  const user = await getSessionUser(req)
  if (!user) return unauthorized()

  if (!rateLimit(`plate-roll:${user.id}`, 30, 60_000)) {
    return Response.json({ error: 'Слишком часто. Подождите немного' }, { status: 429 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    subject?: string
    mode?: 'full' | 'letters' | 'digits'
    keep?: { digits?: string; letters?: string; first?: string }
  }
  const subject = subjectByName(body.subject ?? '')
  if (!subject) return Response.json({ error: 'Неизвестный регион' }, { status: 400 })

  const regionCode = subject.plateCodes[Math.floor(Math.random() * subject.plateCodes.length)]
  const mode = body.mode === 'letters' || body.mode === 'digits' ? body.mode : 'full'

  const keep =
    mode === 'letters'
      ? { digits: /^\d{3}$/.test(body.keep?.digits ?? '') ? body.keep?.digits : undefined }
      : mode === 'digits'
        ? {
            letters: /^[АВЕКМНОРСТУХ]{2}$/.test(body.keep?.letters ?? '') ? body.keep?.letters : undefined,
            first: /^[АВЕКМНОРСТУХ]$/.test(body.keep?.first ?? '') ? body.keep?.first : undefined,
          }
        : undefined

  const offer = makePlateOffer(regionCode, subject.name, subject.prestige, keep)
  return Response.json({ offer })
}

/** GET /api/plates/roll — каталог субъектов для пикера (лёгкий). */
export async function GET() {
  return Response.json({
    subjects: RF_SUBJECTS.map((s) => ({ name: s.name, district: s.district, prestige: s.prestige })),
  })
}
