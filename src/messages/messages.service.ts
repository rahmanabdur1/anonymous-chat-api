import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService, CHANNELS } from '../redis/redis.service';
import { messages, rooms, Message } from '../database/schema';
import { generateId } from '../common/utils/id.util';
import { eq, lt, and, desc } from 'drizzle-orm';

@Injectable()
export class MessagesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  private formatMessage(msg: Message) {
    return {
      id: msg.id,
      roomId: msg.roomId,
      username: msg.username,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  private async assertRoomExists(roomId: string): Promise<void> {
    const db = this.databaseService.db;
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: `Room with id ${roomId} does not exist`,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async getMessages(roomId: string, limit: number = 50, before?: string) {
    await this.assertRoomExists(roomId);

    const db = this.databaseService.db;
    const fetchLimit = limit + 1;

    let query = db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(fetchLimit);

    if (before) {
      // Find cursor message's createdAt
      const [cursorMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, before))
        .limit(1);

      if (cursorMsg) {
        query = db
          .select()
          .from(messages)
          .where(and(eq(messages.roomId, roomId), lt(messages.createdAt, cursorMsg.createdAt)))
          .orderBy(desc(messages.createdAt))
          .limit(fetchLimit);
      }
    }

    const results = await query;
    const hasMore = results.length > limit;
    const pageMessages = hasMore ? results.slice(0, limit) : results;

    return {
      messages: pageMessages.map(this.formatMessage.bind(this)),
      hasMore,
      nextCursor: hasMore ? pageMessages[pageMessages.length - 1].id : null,
    };
  }

  async createMessage(roomId: string, username: string, content: string) {
    await this.assertRoomExists(roomId);

    const trimmed = content.trim();
    if (!trimmed) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Message content cannot be empty',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (trimmed.length > 1000) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'MESSAGE_TOO_LONG',
            message: 'Message content must not exceed 1000 characters',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const db = this.databaseService.db;
    const id = generateId('msg');
    const [message] = await db
      .insert(messages)
      .values({ id, roomId, username, content: trimmed })
      .returning();

    const formatted = this.formatMessage(message);

    // Publish to Redis — gateway will broadcast to all connected clients
    await this.redisService.publish(CHANNELS.messages(roomId), formatted);

    return formatted;
  }
}
