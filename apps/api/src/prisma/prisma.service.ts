import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

function resolveDatabaseUrl(logger: Logger): string {
  const envUrl = process.env.DATABASE_URL;

  // External databases (PostgreSQL, Supabase, Neon, etc.) take precedence
  if (envUrl && !envUrl.startsWith('file:')) {
    return envUrl;
  }

  // On Vercel / AWS Lambda, root directory is read-only.
  // SQLite must operate in /tmp which is writable.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = '/tmp/dev.db';
    if (!fs.existsSync(tmpDbPath)) {
      const candidates = [
        path.join(__dirname, 'seed.db'),
        path.join(__dirname, 'prisma/seed.db'),
        path.join(__dirname, '../prisma/seed.db'),
        path.join(__dirname, '../../prisma/seed.db'),
        path.resolve(process.cwd(), 'dist/prisma/seed.db'),
        path.resolve(process.cwd(), 'prisma/seed.db'),
        path.resolve(process.cwd(), 'apps/api/dist/prisma/seed.db'),
        path.resolve(process.cwd(), 'apps/api/prisma/seed.db'),
      ];

      let initialized = false;
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            fs.copyFileSync(candidate, tmpDbPath);
            logger.log(`Copied seed database from ${candidate} to ${tmpDbPath}`);
            initialized = true;
            break;
          } catch (err) {
            logger.warn(`Could not copy seed database from ${candidate}: ${err}`);
          }
        }
      }

      if (!initialized) {
        logger.warn(`No seed template found for SQLite in /tmp. Candidates checked: ${candidates.join(', ')}`);
      }
    }
    return `file:${tmpDbPath}`;
  }

  return envUrl || 'file:./dev.db';
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const logger = new Logger(PrismaService.name);
    const resolvedUrl = resolveDatabaseUrl(logger);
    super({
      datasources: {
        db: {
          url: resolvedUrl,
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error(`Database connection failed: ${error}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
