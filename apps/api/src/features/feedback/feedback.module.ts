import { Module } from '@nestjs/common';
import { FeedbackController, PlatformFeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [FeedbackController, PlatformFeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
