#  Anonymous Chat API

A real-time group chat backend built with **NestJS**, **PostgreSQL** (Drizzle ORM), **Redis**, and **Socket.io**.

> No passwords. No registration. Just a username, a room, and real-time messages.

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 |
| Database | PostgreSQL 16 + Drizzle ORM |
| Cache / Pub-Sub | Redis 7 (ioredis) |
| Real-time | Socket.io 4 + @socket.io/redis-adapter |
| API Docs | Swagger|
| Runtime | Node.js 20+ |

---

##  Quick Start (Local — Docker)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+

### 1. Clone & install

```bash
git clone 
cd anonymous-chat-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed — defaults work with docker-compose
```

### 3. Start infrastructure

```bash
docker-compose up -d postgres redis
```

### 4. Push database schema

```bash
npm run db:push
```

### 5. Start the API

```bash
npm run start:dev
```

The server starts at `http://localhost:3000`.  
Swagger docs are at `http://localhost:3000/api/docs`.

---

##  Full Docker (API + DB + Redis)

```bash
docker-compose up --build
```

All services start together. The API waits for healthy Postgres and Redis before starting.

---

##  Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Redis password (optional) |

---

##  API Reference

### Base path: `/api/v1`

All endpoints (except `/login`) require:
```
Authorization: Bearer <sessionToken>
```

All responses follow this envelope:
```json
{ "success": true, "data": { } }
// or
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/login` | ❌ | Get or create user, return session token |
| `GET` | `/rooms` | ✅ | List all rooms with live user counts |
| `POST` | `/rooms` | ✅ | Create a room |
| `GET` | `/rooms/:id` | ✅ | Get room details |
| `DELETE` | `/rooms/:id` | ✅ | Delete room (creator only) |
| `GET` | `/rooms/:id/messages` | ✅ | Paginated message history |
| `POST` | `/rooms/:id/messages` | ✅ | Send a message |

Interactive docs: `GET /api/docs`

---

## 🔌 WebSocket

Connect to `/chat` namespace:

```
ws://host/chat?token=<sessionToken>&roomId=<roomId>
```

### Server → Client Events

| Event | Recipient | Payload |
|---|---|---|
| `room:joined` | Connecting client | `{ activeUsers: string[] }` |
| `room:user_joined` | All others in room | `{ username, activeUsers }` |
| `message:new` | All clients in room | `{ id, username, content, createdAt }` |
| `room:user_left` | All others in room | `{ username, activeUsers }` |
| `room:deleted` | All clients in room | `{ roomId }` |

### Client → Server Events

| Event | Description |
|---|---|
| `room:leave` | Gracefully leave the room |

---

## 🗄️ Database Schema

```sql
users      (id, username UNIQUE, created_at)
rooms      (id, name UNIQUE, created_by, created_at)
messages   (id, room_id FK→rooms, username, content, created_at)
```

---

##  Development Scripts

```bash
npm run start:dev    # Hot-reload dev server
npm run build        # Compile TypeScript
npm run start:prod   # Run compiled output
npm run db:push      # Push schema to DB (dev)
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio
```

---

##  Project Structure

```
src/
├── auth/            # Login, session token, AuthGuard
├── rooms/           # Room CRUD endpoints
├── messages/        # Message persistence + publish to Redis
├── chat/            # WebSocket gateway + Redis IO adapter
├── database/        # Drizzle ORM setup + schema
├── redis/           # Redis clients (general, pub, sub)
└── common/          # Filters, interceptors, decorators, utils
```
