import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username (2-24 chars, alphanumeric and underscores only)',
    example: 'ali_123',
  })
  @IsString()
  @Length(2, 24, { message: 'username must be between 2 and 24 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username can only contain alphanumeric characters and underscores',
  })
  username: string;
}
