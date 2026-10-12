import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { raw } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);
  const appConfig = config.get('app', { infer: true });

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  // Comment images are uploaded as raw bytes (the JSON body limit stays small everywhere else).
  app.use(`/${appConfig.apiPrefix}/comments/images`, raw({ type: 'image/*', limit: '3mb' }));
  app.use(`/${appConfig.apiPrefix}/users/me/photo`, raw({ type: 'image/*', limit: '1mb' }));
  app.setGlobalPrefix(appConfig.apiPrefix);
  app.enableCors({ origin: appConfig.corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (appConfig.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(`${appConfig.name} API`)
        .setDescription('REST API for projects, tasks, milestones, issues, timesheets and reporting')
        .setVersion('1.0')
        .addCookieAuth(config.get('auth', { infer: true }).cookies.accessName)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${appConfig.apiPrefix}/docs`, app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : appConfig.port;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`${appConfig.name} API listening on port ${port} (${appConfig.apiPrefix})`);
  if (appConfig.swaggerEnabled) {
    logger.log(`API docs available at http://localhost:${appConfig.port}/${appConfig.apiPrefix}/docs`);
  }
}

void bootstrap();
