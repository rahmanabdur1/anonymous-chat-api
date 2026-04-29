# 🏗️ Architecture Document — Anonymous Chat API

---

## 1. Architecture Overview

```
                         ┌──────────────────────────────────────────┐
                         │              Client (Browser / Bot)        │
                         └───────────┬──────────────────┬───────────┘
                                     │ HTTP REST         │ WebSocket
                                     ▼                   ▼
                         ┌───────────────────────────────────────────┐
                         │             NestJS Application             │
                         │  ┌──────────────┐  ┌───────────────────┐  │
                         │  │ REST API     │  │  Chat Gateway     │  │
                         │  │ /api/v1/*    │  │  namespace /chat  │  │
                         │  └──────┬───────┘  └────────┬──────────┘  │
                         │         │                    │             │
                         │  ┌──────▼───────────────────▼──────────┐  │
                         │  │          Service Layer               │  │
                         │  │  AuthService / RoomsService /        │  │
                         │  │  MessagesService                     │  │
                         │  └──────┬───────────────────┬──────────┘  │
                         └─────────┼───────────────────┼─────────────┘
                                   │                   │
                    ┌──────────────▼───┐    ┌──────────▼──────────────┐
                    │   PostgreSQL      │    │         Redis            │
                    │  (Drizzle ORM)    │    │  ┌────────────────────┐  │
                    │                  │    │  │ session:<token>    │  │
                    │  users           │    │  │ room:users:<id>    │  │
                    │  rooms           │    │  │ socket:<socketId>  │  │
                    │  messages        │    │  ├────────────────────┤  │
                    └──────────────────┘    │  │  Pub/Sub Channels  │  │
                                            │  │ chat:messages:<id> │  │
                                            │  │ chat:room:deleted  │  │
                                            │  ├────────────────────┤  │
                                            │  │  Socket.io Adapter │  │
                                            │  │  (cross-instance   │  │
                                            │  │   broadcasting)    │  │
                                            └──┴────────────────────┘──┘
```

### Component Roles

| Component | Responsibility |
|---|---|
| **AuthController** | Accepts `POST /login`, issues session tokens |
| **RoomsController** | CRUD for rooms; triggers `room:deleted` via Redis on delete |
| **MessagesController** | Persists messages to Postgres; publishes to Redis |
| **ChatGateway** | Manages Socket.io connections; subscribes to Redis channels; fan-outs events |
| **RedisService** | Provides three Redis clients: general (commands), publisher, subscriber |
| **DatabaseService** | Wraps Drizzle ORM with a Postgres connection pool |
| **RedisIoAdapter** | Custom `IoAdapter` that plugs `@socket.io/redis-adapter` into NestJS |

---

## 2. Session Strategy

### Token Generation
```
sessionToken = crypto.randomBytes(32).toString('hex')
// → 64-character cryptographically random hex string
```

### Storage
```
Redis key:  session:<token>
Value:      JSON { userId, username }
TTL:        86400 seconds (24 hours)
```

### Validation
- Every protected REST route uses `AuthGuard`, which reads the `Authorization: Bearer <token>` header.
- The guard calls `RedisService.getSession(token)`. On hit it attaches `{ userId, username }` to `req.user`. On miss it returns `401`.
- WebSocket connections validate the token from `query.token` inside `handleConnection`. Invalid/expired tokens trigger an immediate disconnect with error code `401`.

### Session Refresh
- Each `POST /login` with an existing username issues a **fresh token** and stores it with a reset TTL. Previous tokens are not explicitly invalidated (acceptable trade-off for simplicity; see Limitations).

---

## 3. Redis Pub/Sub — WebSocket Fan-out

The key insight: REST controllers must **not** emit Socket.io events directly. Instead they publish to Redis; the gateway subscribes and emits.

### Message Flow

```
Client A  →  POST /rooms/:id/messages
                │
                ▼
         MessagesService
          1. Insert into PostgreSQL
          2. redis.publisher.publish(
               "chat:messages:<roomId>",
               JSON.stringify(messagePayload)
             )
                │
                ▼ Redis Pub/Sub
         ChatGateway (on all instances)
          subscriber.on('message', handler)
          server.to(roomId).emit('message:new', payload)
                │
                ▼ Socket.io + Redis Adapter
         Client B (any instance) receives message:new
```

### Room Deletion Flow

```
Client A  →  DELETE /rooms/:id
                │
                ▼
         RoomsService
          1. redis.publisher.publish("chat:room:deleted", { roomId })
          2. redis.deleteRoomUsers(roomId)
          3. db.delete(rooms) — cascades to messages
                │
                ▼ Redis Pub/Sub
         ChatGateway
          server.to(roomId).emit('room:deleted', { roomId })
```

### Why Two Redis Pub/Sub Mechanisms?

| Mechanism | Purpose |
|---|---|
| `@socket.io/redis-adapter` | Synchronises Socket.io room membership and `server.to(room).emit()` calls across multiple Node.js instances |
| Custom `chat:messages:*` / `chat:room:deleted` channels | Bridges the REST layer (no socket reference) to the WebSocket layer — decouples HTTP from WebSocket cleanly |

Both are needed: the adapter alone cannot be triggered from a plain HTTP controller.

---

## 4. Active User Tracking

```
Redis Set key:  room:users:<roomId>
Members:        Set of username strings
```

- **Join:** `SADD room:users:<roomId> <username>` in `handleConnection`
- **Leave:** `SREM room:users:<roomId> <username>` in `cleanupClient`
- **Count (GET /rooms):** `SCARD room:users:<roomId>` — O(1), no DB query
- **List (room:joined):** `SMEMBERS room:users:<roomId>`

Socket connection state is stored separately:
```
Redis String key:  socket:<socketId>
Value:             JSON { username, roomId }
TTL:               24 hours
```
This allows `handleDisconnect` to know which room and user to clean up, without any in-memory JS Maps.

---

## 5. Estimated Concurrent User Capacity (Single Instance)

### Assumptions
- Node.js 20, 2 vCPU, 4 GB RAM (typical cloud VM)
- Each active Socket.io connection: ~30–50 KB heap overhead
- Redis round-trip: ~1–2 ms (same datacenter)
- Postgres pool: 10 connections, avg query ~5 ms

### Calculations

| Resource | Ceiling | Reasoning |
|---|---|---|
| Memory | ~2,000 sockets | 2 GB usable ÷ ~1 MB per connection (conservative) |
| CPU (event loop) | ~3,000–5,000 | Node.js single-threaded; I/O-bound workload scales well |
| Redis ops | >50,000/s | ioredis pipeline; Redis handles 100k ops/s easily |
| Postgres | ~500 concurrent active queries | Pool of 10, short queries; bursts queue |

**Conservative estimate: ~1,000–2,000 concurrent users per instance** before latency degrades.

For a chat workload (sparse message sends, mostly idle WebSocket connections), Socket.io with the Redis adapter can realistically handle **3,000–5,000 idle connections** per instance.

---

## 6. Scaling to 10× the Load

| Strategy | Details |
|---|---|
| **Horizontal scaling** | Run 3–5 API instances behind a load balancer (Nginx, AWS ALB). The Redis adapter ensures WebSocket events reach clients on any instance. Sticky sessions are **not required** thanks to the adapter. |
| **Redis Cluster** | Shard Redis across multiple nodes. Use `ioredis.Cluster` client. The socket.io adapter supports Redis Cluster natively. |
| **Postgres read replicas** | Route `SELECT` queries (`GET /messages`, `GET /rooms`) to read replicas. `MessagesService` and `RoomsService` can accept a read-only db instance. |
| **Connection pooling** | Replace `pg.Pool` with **PgBouncer** in transaction-pooling mode to multiplex thousands of app connections onto a small Postgres connection count. |
| **Message queue** | Replace direct Redis pub/sub with **BullMQ** (backed by Redis) for durable, at-least-once message delivery. |
| **CDN / Edge caching** | Cache `GET /rooms` responses for 1–2 seconds at the edge; room lists don't need sub-second freshness. |
| **Database indexing** | Ensure `(room_id, created_at DESC)` composite index exists — already included in `seed.sql`. |

---

## 7. Known Limitations & Trade-offs

| Limitation | Impact | Mitigation |
|---|---|---|
| **Single Redis subscriber per instance** | All message channels share one subscriber connection. With thousands of rooms, the single `on('message')` handler dispatches all events. | Use separate subscriber pools or switch to Redis Streams. |
| **No token invalidation on logout** | Old tokens remain valid for up to 24 h after a new login. | Add a token blocklist set in Redis, or use short-lived tokens with refresh tokens. |
| **Username collisions on concurrent login** | Two concurrent `POST /login` requests with the same new username might create duplicate users. | Add a DB-level unique constraint (already present) + retry logic on `23505` Postgres error. |
| **Cursor pagination by `createdAt`** | If two messages share the exact same timestamp, the cursor may skip or duplicate messages. | Use `(created_at, id)` composite cursor for tiebreaking. |
| **No message delivery guarantees** | If the Redis pub/sub subscriber is restarting during a publish, messages are dropped. | Use Redis Streams with consumer groups for at-least-once delivery. |
| **Active user count is approximate** | If a server instance crashes without triggering `handleDisconnect`, users remain in the Redis set. | Add a TTL to socket state keys and run a periodic cleanup job. |
| **No rate limiting** | Clients can flood messages. | Add a `ThrottlerModule` guard on `POST /rooms/:id/messages`. |
