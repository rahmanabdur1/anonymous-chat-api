import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('api/v1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or register with a username' })
  @ApiResponse({ status: 200, description: 'Returns session token and user info' })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto.username);
    return {
      success: true,
      data: {
        sessionToken: result.sessionToken,
        user: {
          id: result.user.id,
          username: result.user.username,
          createdAt: result.user.createdAt.toISOString(),
        },
      },
    };
  }
}
