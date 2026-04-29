import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/user.decorator';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List all rooms' })
  @ApiResponse({ status: 200, description: 'Returns all rooms with active user counts' })
  async findAll() {
    const data = await this.roomsService.findAll();
    return { success: true, data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new room' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  @ApiResponse({ status: 409, description: 'Room name already taken' })
  async create(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthUser) {
    const data = await this.roomsService.create(dto.name, user.username);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiResponse({ status: 200, description: 'Room details' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async findOne(@Param('id') id: string) {
    const data = await this.roomsService.findOne(id);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a room (creator only)' })
  @ApiResponse({ status: 200, description: 'Room deleted' })
  @ApiResponse({ status: 403, description: 'Not the room creator' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const data = await this.roomsService.remove(id, user.username);
    return { success: true, data };
  }
}
