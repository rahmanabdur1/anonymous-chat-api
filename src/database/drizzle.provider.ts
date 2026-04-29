import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

export const drizzleProvider = {
  provide: DRIZZLE,
  useFactory: async (configService: ConfigService) => {
    const pool = new Pool({
      connectionString: configService.get<string>('database.url'),
      max: 10,
    });
    return drizzle(pool, { schema });
  },
  inject: [ConfigService],
};
