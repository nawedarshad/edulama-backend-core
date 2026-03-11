import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limits
  app.use(json({ limit: '500mb' }));
  app.use(urlencoded({ extended: true, limit: '500mb' }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.setGlobalPrefix('core');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    origin: true, // Allow all origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Edulama API')
    .setDescription('The Edulama School Management API description')
    .setVersion('1.0')
    .addTag('Class')
    .addTag('Section')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, { useGlobalPrefix: true });

  // BigInt Serialization Fix
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  await app.listen(process.env.PORT ?? 3005);
}
bootstrap();



