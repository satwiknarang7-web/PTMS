import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { EventsModule } from './common/events/event-publisher.service';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ClientThrottlerGuard } from './common/rate-limit/client-throttler.guard';
import { DatabaseThrottlerStorage } from './common/rate-limit/database-throttler.storage';
import { AccountScopeGuard } from './common/guards/account-scope.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AppConfig, configuration } from './config/configuration';
import { ActivityModule } from './features/activity/activity.module';
import { AuthModule } from './features/auth/auth.module';
import { CommentsModule } from './features/comments/comments.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { HealthModule } from './features/health/health.module';
import { IssuesModule } from './features/issues/issues.module';
import { LookupsModule } from './features/lookups/lookups.module';
import { MeetingsModule } from './features/meetings/meetings.module';
import { MilestonesModule } from './features/milestones/milestones.module';
import { FeedbackModule } from './features/feedback/feedback.module';
import { MessagesModule } from './features/messages/messages.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { OrganizationsModule } from './features/organizations/organizations.module';
import { PlatformModule } from './features/platform/platform.module';
import { ProjectsModule } from './features/projects/projects.module';
import { ReportsModule } from './features/reports/reports.module';
import { AutomationsModule } from './features/automations/automations.module';
import { CustomFieldsModule } from './features/custom-fields/custom-fields.module';
import { TaskListsModule } from './features/task-lists/task-lists.module';
import { TasksModule } from './features/tasks/tasks.module';
import { TimesheetsModule } from './features/timesheets/timesheets.module';
import { UsersModule } from './features/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, load: [configuration] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, DatabaseThrottlerStorage],
      useFactory: (config: ConfigService<AppConfig, true>, storage: DatabaseThrottlerStorage) => {
        const throttle = config.get('throttle', { infer: true });
        // Counters live in the database so every serverless instance enforces the same limits.
        return { throttlers: [{ ttl: throttle.ttlMs, limit: throttle.limit }], storage };
      },
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CommonModule,
    EventsModule,
    // Features
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    LookupsModule,
    ProjectsModule,
    TaskListsModule,
    AutomationsModule,
    CustomFieldsModule,
    TasksModule,
    MilestonesModule,
    MeetingsModule,
    IssuesModule,
    CommentsModule,
    TimesheetsModule,
    ActivityModule,
    NotificationsModule,
    MessagesModule,
    FeedbackModule,
    DashboardModule,
    ReportsModule,
    // Platform (root account)
    PlatformModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ClientThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountScopeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
