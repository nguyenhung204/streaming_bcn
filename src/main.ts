import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  
  // Enable cookie parser
  app.use(cookieParser());
  
  // Serve static files
  app.useStaticAssets(join(__dirname, '..', 'public'));
  
  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: [
      'http://127.0.0.1:5500',
      'http://localhost:5500', 
      'http://localhost:3000',
      'http://localhost:3001',
      'https://stream.bancongnghe.tech',
      configService.get('CORS_ORIGIN')
    ].filter(Boolean),
    credentials: true, // Important for cookies
  });

  const port = configService.get('PORT', 3000);
  const host = configService.get('HOST', '0.0.0.0');

  await app.listen(port, host);
  
  logger.log(`LiveStream Chat Server started on http://${host}:${port}`);
  logger.log(`WebSocket endpoint: ws://${host}:${port}/socket.io/`);
  logger.log(`Demo page: http://${host}:${port}`);
  logger.log(`Database: ${configService.get('MONGODB_URI', 'mongodb://localhost:27017/livestream_chat')}`);
}

bootstrap().catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
