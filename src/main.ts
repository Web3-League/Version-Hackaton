import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { JwtIoAdapter } from './socket-io-jwt.adapter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {


  const app = await NestFactory.create(AppModule, {
  });

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get('FRONTEND_URL', 'http://localhost:3001');

  app.enableCors({
    origin: frontendUrl, // Remplacez par l'URL de votre front-end
    methods: ['GET,HEAD,PUT,PATCH,POST,DELETE'],
    credentials: true,

  });
  app.useWebSocketAdapter(new JwtIoAdapter(app));
  const port = process.env.PORT || 3000; // Utilisez la variable d'environnement PORT si définie, sinon utilisez le port 3000
  await app.listen(port);
  Logger.log(`Server is running on http://localhost:${port}`, 'Bootstrap'); // Log le port
}
bootstrap();
