// Выбор Prisma-схемы на этапе сборки:
//  - на Vercel (VERCEL=1) — postgres (SQLite в serverless невозможен: read-only FS)
//  - локально/в песочнице — sqlite (db/custom.db)
// Запускается в postinstall (до prisma generate) и в build. IDEMPOTENTEN.
import { copyFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const prismaDir = join(here, '..', 'prisma')
const mainSchema = join(prismaDir, 'schema.prisma')
const postgresSchema = join(prismaDir, 'schema.postgres.prisma')

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true'
const hasPostgresUrl = Boolean(process.env.POSTGRES_URL || process.env.POSTGRESPRISMA_POSTGRES_URL)

if (isVercel && hasPostgresUrl && existsSync(postgresSchema)) {
  copyFileSync(postgresSchema, mainSchema)
  console.log('[pick-schema] VERCEL + Postgres URL detected → prisma/schema.prisma = postgresql')
} else {
  console.log(`[pick-schema] using sqlite schema (VERCEL=${process.env.VERCEL ?? 'unset'}, pgUrl=${hasPostgresUrl ? 'set' : 'unset'})`)
}
