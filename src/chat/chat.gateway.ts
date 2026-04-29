import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService, CHANNELS } from '../redis/redis.service';
import { DatabaseService } from '../database/database.service';
import { rooms } from '../database/schema';
import { eq } from 'drizzle-orm';

@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  afterInit(server: Server) {
    this.logger.log('✅ ChatGateway initialized');
  }

  /**
   * Subscribe to Redis pub/sub channels after module is ready.
   * This handles message:new and room:deleted events published from REST controllers.
   */
  async onModuleInit() {
    const sub = this.redisService.subscriber;

    // Subscribe to room-deleted events
    await sub.subscribe(CHANNELS.roomDeleted);
    this.logger.log(`Subscribed to channel: ${CHANNELS.roomDeleted}`);

    // Listen to incoming messages
    sub.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message);

        if (channel === CHANNELS.roomDeleted) {
          // Broadcast room:deleted to all clients in the room
          this.server.to(payload.roomId).emit('room:deleted', { roomId: payload.roomId });
          return;
        }

        // Channel format: chat:messages:<roomId>
        if (channel.startsWith('chat:messages:')) {
          const roomId = channel.replace('chat:messages:', '');
          this.server.to(roomId).emit('message:new', {
            id: payload.id,
            username: payload.username,
            content: payload.content,
            createdAt: payload.createdAt,
          });
        }
      } catch (err) {
        this.logger.error('Failed to process Redis pub/sub message', err);
      }
    });
  }

  // ─── Connection ───────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    const token = client.handshake.query['token'] as string;
    const roomId = client.handshake.query['roomId'] as string;

    try {
      // Validate token
      if (!token) {
        client.emit('error', { code: 401, message: 'Missing session token' });
        client.disconnect();
        return;
      }

      const session = await this.redisService.getSession(token);
      if (!session) {
        client.emit('error', { code: 401, message: 'Missing or expired session token' });
        client.disconnect();
        return;
      }

      // Validate room
      if (!roomId) {
        client.emit('error', { code: 404, message: 'Missing roomId' });
        client.disconnect();
        return;
      }

      const db = this.databaseService.db;
      const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);

      if (!room) {
        client.emit('error', { code: 404, message: `Room ${roomId} does not exist` });
        client.disconnect();
        return;
      }

      const { username } = session;

      // Subscribe to this room's message channel
      await this.redisService.subscriber.subscribe(CHANNELS.messages(roomId));

      // Join socket.io room
      await client.join(roomId);

      // Store socket state in Redis
      await this.redisService.setSocketState(client.id, { username, roomId });

      // Add user to active set
      await this.redisService.addUserToRoom(roomId, username);

      // Get updated active users list
      const activeUsers = await this.redisService.getRoomUsers(roomId);

      // Emit room:joined to connecting client only
      client.emit('room:joined', { activeUsers });

      // Broadcast room:user_joined to others in the room
      client.to(roomId).emit('room:user_joined', { username, activeUsers });

      this.logger.log(`${username} joined room ${roomId} (socket: ${client.id})`);
    } catch (err) {
      this.logger.error('Error during connection handling', err);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    await this.cleanupClient(client);
  }

  // ─── Client Events ────────────────────────────────────────────────────────────

  @SubscribeMessage('room:leave')
  async handleLeave(@ConnectedSocket() client: Socket) {
    await this.cleanupClient(client);
    client.disconnect();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async cleanupClient(client: Socket) {
    try {
      const state = await this.redisService.getSocketState(client.id);
      if (!state) return;

      const { username, roomId } = state;

      // Remove from active users
      await this.redisService.removeUserFromRoom(roomId, username);

      // Delete socket state
      await this.redisService.deleteSocketState(client.id);

      // Get updated active users
      const activeUsers = await this.redisService.getRoomUsers(roomId);

      // Leave socket.io room and broadcast
      client.to(roomId).emit('room:user_left', { username, activeUsers });
      await client.leave(roomId);

      this.logger.log(`${username} left room ${roomId} (socket: ${client.id})`);
    } catch (err) {
      this.logger.error(`Error during client cleanup for socket ${client.id}`, err);
    }
  }
}
