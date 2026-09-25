import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Если схема обновилась (bun run db:push) при живом dev-сервере, глобальный
// синглтон останется со старым клиентом без новых моделей/полей — пересоздаём его.
function clientIsStale(client: PrismaClient): boolean {
  try {
    return (
      !('savedSearch' in client) ||
      !('pricePoint' in client) ||
      !('complaint' in client) ||
      !('favorite' in client) ||
      !('blockedSeller' in client) ||
      !('autoBid' in client)
    )
  } catch {
    return false
  }
}

if (globalForPrisma.prisma && clientIsStale(globalForPrisma.prisma)) {
  void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    // На Vercel DATABASE_URL может отсутствовать — используем hosted Prisma Postgres.
    // Локально это undefined → работает обычный datasource из schema.prisma (sqlite).
    datasourceUrl:
      process.env.DATABASE_URL ?? process.env.POSTGRESPRISMA_POSTGRES_URL ?? undefined,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
