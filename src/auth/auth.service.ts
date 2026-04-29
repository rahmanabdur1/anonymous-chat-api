import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { users, User } from '../database/schema';
import { generateId, generateToken } from '../common/utils/id.util';
import { eq } from 'drizzle-orm';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async login(username: string): Promise<{ sessionToken: string; user: Omit<User, never> }> {
    const db = this.databaseService.db;

    // Check if user exists
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    // Create user if not exists
    if (!user) {
      const id = generateId('usr');
      [user] = await db
        .insert(users)
        .values({ id, username })
        .returning();
    }

    // Generate and store session token
    const sessionToken = generateToken();
    await this.redisService.setSession(sessionToken, {
      userId: user.id,
      username: user.username,
    });

    return {
      sessionToken,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
      },
    };
  }
}
