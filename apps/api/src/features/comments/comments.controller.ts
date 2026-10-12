import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CommentsService } from './comments.service';
import { CommentQueryDto, CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: CommentQueryDto) {
    return this.comments.findAll(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCommentDto) {
    return this.comments.create(user, dto);
  }

  /** Uploads one image (the raw bytes, e.g. Content-Type: image/jpeg) for a comment about to be posted. */
  @Post('images')
  uploadImage(@CurrentUser() user: AuthenticatedUser, @Query() query: CommentQueryDto, @Req() req: Request) {
    return this.comments.uploadImage(user, query, req.body as Buffer | undefined);
  }

  @Get('images/:id')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const image = await this.comments.image(user, id);
    res.type(image.mimeType).setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(image.data));
  }

  @Delete('images/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePendingImage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.comments.removePendingImage(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(user, id, dto.body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.comments.remove(user, id);
  }
}
