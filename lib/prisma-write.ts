// src/lib/prisma-write.ts

import { PrismaClient } from '@prisma/client'

const globalForPrismaWrite = global as unknown as { prismaWrite: PrismaClient }

export const prismaWrite =
  globalForPrismaWrite.prismaWrite ||
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_WRITE } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrismaWrite.prismaWrite = prismaWrite
