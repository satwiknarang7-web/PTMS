import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { MessageImageQueryDto, MessagesQueryDto, SendMessageDto, StartConversationDto } from './dto/message.dto';
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
    return this.messages.send(user, id, dto.body, dto.attachmentIds);
  }

  /** Uploads one image (raw bytes, e.g. Content-Type: image/jpeg) for a message about to be sent. */
  @Post('images')
  uploadImage(@CurrentUser() user: AuthenticatedUser, @Query() query: MessageImageQueryDto, @Req() req: Request) {
    return this.messages.uploadImage(user, query.conversationId, req.body as Buffer | undefined);
  }

  @Get('images/:id')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const image = await this.messages.image(user, id);
    res.type(image.mimeType).setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(image.data));
  }

  @Delete('images/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePendingImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messages.removePendingImage(user, id);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.messages.markRead(user, id);
  }
}
