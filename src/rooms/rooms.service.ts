import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService, CHANNELS } from '../redis/redis.service';
import { rooms, Room } from '../database/schema';
import { generateId } from '../common/utils/id.util';
import { eq } from 'drizzle-orm';

@Injectable()
export class RoomsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  private formatRoom(room: Room, activeUsers: number) {
    return {
      id: room.id,
      name: room.name,
      createdBy: room.createdBy,
      activeUsers,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async findAll() {
    const db = this.databaseService.db;
    const allRooms = await db.select().from(rooms).orderBy(rooms.createdAt);

    const roomsWithUsers = await Promise.all(
      allRooms.map(async (room) => {
        const activeUsers = await this.redisService.getRoomUserCount(room.id);
        return this.formatRoom(room, activeUsers);
      }),
    );

    return { rooms: roomsWithUsers };
  }

  async findOne(id: string) {
    const db = this.databaseService.db;
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);

    if (!room) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: `Room with id ${id} does not exist`,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const activeUsers = await this.redisService.getRoomUserCount(room.id);
    return this.formatRoom(room, activeUsers);
  }

  async create(name: string, createdBy: string) {
    const db = this.databaseService.db;

    // Check uniqueness
    const [existing] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.name, name))
      .limit(1);

    if (existing) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ROOM_NAME_TAKEN',
            message: 'A room with this name already exists',
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const id = generateId('room');
    const [room] = await db
      .insert(rooms)
      .values({ id, name, createdBy })
      .returning();

    return {
      id: room.id,
      name: room.name,
      createdBy: room.createdBy,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async remove(id: string, requestingUsername: string) {
    const db = this.databaseService.db;

    const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);

    if (!room) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: `Room with id ${id} does not exist`,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (room.createdBy !== requestingUsername) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only the room creator can delete this room',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Publish room:deleted event BEFORE deleting (gateway will broadcast to clients)
    await this.redisService.publish(CHANNELS.roomDeleted, { roomId: id });

    // Clean up Redis active users set
    await this.redisService.deleteRoomUsers(id);

    // Delete from DB (cascades to messages)
    await db.delete(rooms).where(eq(rooms.id, id));

    return { deleted: true };
  }
}
