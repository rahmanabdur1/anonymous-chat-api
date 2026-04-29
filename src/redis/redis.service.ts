import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// Redis Key Helpers
export const KEYS = {
  session: (token: string) => `session:${token}`,
  roomUsers: (roomId: string) => `room:users:${roomId}`,
  socket: (socketId: string) => `socket:${socketId}`,
};

// Redis Pub/Sub Channels
export const CHANNELS = {
  messages: (roomId: string) => `chat:messages:${roomId}`,
  roomDeleted: 'chat:room:deleted',
};

export const SESSION_TTL = 60 * 60 * 24; // 24 hours

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  // General-purpose client
  public client: Redis;
  // Publisher client
  public publisher: Redis;
  // Subscriber client (for custom pub/sub in gateway)
  public subscriber: Redis;

  constructor(private configService: ConfigService) {}

  private createClient(): Redis {
    return new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: false,
    });
  }

  async onModuleInit() {
    this.client = this.createClient();
    this.publisher = this.createClient();
    this.subscriber = this.createClient();
    this.logger.log('✅ Redis clients initialized');
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.publisher.quit();
    await this.subscriber.quit();
    this.logger.log('Redis clients closed');
  }

  // ─── Session ────────────────────────────────────────────────────────────────

  async setSession(token: string, payload: { userId: string; username: string }): Promise<void> {
    await this.client.set(KEYS.session(token), JSON.stringify(payload), 'EX', SESSION_TTL);
  }

  async getSession(token: string): Promise<{ userId: string; username: string } | null> {
    const data = await this.client.get(KEYS.session(token));
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.client.del(KEYS.session(token));
  }

  // ─── Active Users ────────────────────────────────────────────────────────────

  async addUserToRoom(roomId: string, username: string): Promise<void> {
    await this.client.sadd(KEYS.roomUsers(roomId), username);
  }

  async removeUserFromRoom(roomId: string, username: string): Promise<void> {
    await this.client.srem(KEYS.roomUsers(roomId), username);
  }

  async getRoomUsers(roomId: string): Promise<string[]> {
    return this.client.smembers(KEYS.roomUsers(roomId));
  }

  async getRoomUserCount(roomId: string): Promise<number> {
    return this.client.scard(KEYS.roomUsers(roomId));
  }

  async deleteRoomUsers(roomId: string): Promise<void> {
    await this.client.del(KEYS.roomUsers(roomId));
  }

  // ─── Socket State ─────────────────────────────────────────────────────────────

  async setSocketState(
    socketId: string,
    state: { username: string; roomId: string },
  ): Promise<void> {
    await this.client.set(KEYS.socket(socketId), JSON.stringify(state), 'EX', SESSION_TTL);
  }

  async getSocketState(socketId: string): Promise<{ username: string; roomId: string } | null> {
    const data = await this.client.get(KEYS.socket(socketId));
    return data ? JSON.parse(data) : null;
  }

  async deleteSocketState(socketId: string): Promise<void> {
    await this.client.del(KEYS.socket(socketId));
  }

  // ─── Pub/Sub ─────────────────────────────────────────────────────────────────

  async publish(channel: string, message: object): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message));
  }
}
