import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const UNAUTHORIZED = {
  success: false,
  error: {
    code: 'UNAUTHORIZED',
    message: 'Missing or expired session token',
  },
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new HttpException(UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.slice(7).trim();
    const session = await this.redisService.getSession(token);

    if (!session) {
      throw new HttpException(UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }

    request.user = session;
    return true;
  }
}
