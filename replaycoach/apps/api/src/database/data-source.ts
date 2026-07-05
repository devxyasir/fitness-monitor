import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

// Explicitly load .env file for the CLI compiler context
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { Organization } from '../organizations/organization.entity';
import { OrgInvite } from '../organizations/org-invite.entity';
import { User } from '../users/user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';

/**
 * TypeORM DataSource used by the CLI for migrations.
 * The NestJS module creates its own DataSource internally via TypeOrmModule.forRootAsync().
 *
 * Run migrations with:
 *   pnpm --filter @replaycoach/api migration:run
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'] ?? 'postgresql://replaycoach:replaycoach_dev@localhost:5432/replaycoach',
  entities: [Organization, OrgInvite, User, RefreshToken],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development',
});
