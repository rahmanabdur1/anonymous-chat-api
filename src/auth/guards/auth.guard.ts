import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or expired session token',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.slice(7); // Remove 'Bearer '
    const session = await this.redisService.getSession(token);

    if (!session) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or expired session token',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Attach user to request
    request.user = {
      userId: session.userId,
      username: session.username,
    };

    return true;
  }
}
