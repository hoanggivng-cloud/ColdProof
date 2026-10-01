import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = new DocumentBuilder().setTitle('ColdProof foundation API').setVersion('0.1.0')
    .setDescription('APEX • semi-synthetic benchmark. Business services are scaffold contracts.').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}
void bootstrap();
