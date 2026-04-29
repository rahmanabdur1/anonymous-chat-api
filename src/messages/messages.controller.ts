import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/user.decorator';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/rooms/:id/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated message history for a room' })
  @ApiResponse({ status: 200, description: 'Paginated messages' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getMessages(@Param('id') id: string, @Query() query: GetMessagesDto) {
    const data = await this.messagesService.getMessages(id, query.limit, query.before);
    return { success: true, data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message to a room' })
  @ApiResponse({ status: 201, description: 'Message created and broadcasted' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 422, description: 'Content empty or exceeds limit' })
  async createMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.messagesService.createMessage(id, user.username, dto.content);
    return { success: true, data };
  }
}
