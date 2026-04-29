import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RedisIoAdapter } from './chat/redis-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // ─── CORS ─────────────────────────────────────────────────────────────────────
  app.enableCors({ origin: '*' });

  // ─── Redis Socket.io Adapter ───────────────────────────────────────────────────
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(configService);
  app.useWebSocketAdapter(redisIoAdapter);

  // ─── Global Pipes ──────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Global Filters ────────────────────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ─── Global Interceptors ───────────────────────────────────────────────────────
  // Note: ResponseInterceptor is NOT applied globally because our controllers
  // already return the correct { success, data } envelope manually.
  // This ensures exact contract compliance.

  // ─── Swagger ────────────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Anonymous Chat API')
    .setDescription(
      `Real-time anonymous group chat API.
      
**WebSocket:** Connect to \`/chat?token=<sessionToken>&roomId=<roomId>\`

**Auth:** Include \`Authorization: Bearer <sessionToken>\` on all endpoints except \`/login\`.`,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Login and session management')
    .addTag('Rooms', 'Room CRUD operations')
    .addTag('Messages', 'Message persistence and history')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ─── Start ──────────────────────────────────────────────────────────────────────
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
  logger.log(`🔌 WebSocket at ws://localhost:${port}/chat`);
}

bootstrap();
