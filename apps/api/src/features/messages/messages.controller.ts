import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { MessagesQueryDto, SendMessageDto, StartConversationDto } from './dto/message.dto';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@ViewerAllowed()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('contacts')
  contacts(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.contacts(user);
  }

  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.conversations(user);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.messages.unreadCount(user);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartConversationDto) {
    return this.messages.start(user, dto.userId);
  }

  @Get('conversations/:id/messages')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: MessagesQueryDto) {
    return this.messages.messages(user, id, query.before);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.messages.send(user, id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messages.markRead(user, id);
  }
}
