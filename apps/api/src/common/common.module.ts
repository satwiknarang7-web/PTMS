import { Global, Module } from '@nestjs/common';
import { PaginationService } from './pagination/pagination.service';
import { DatabaseThrottlerStorage } from './rate-limit/database-throttler.storage';
import { RateLimitStore } from './rate-limit/rate-limit.store';

@Global()
@Module({
  providers: [PaginationService, RateLimitStore, DatabaseThrottlerStorage],
  exports: [PaginationService, RateLimitStore, DatabaseThrottlerStorage],
})
export class CommonModule {}
