import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { JwtIoAdapter } from './socket-io-jwt.adapter';
import * as os from 'os';

async function bootstrap() {


  const app = await NestFactory.create(AppModule, {
  });

  // Configuration globale de CORS avec une fonction pour définir l'origine
  app.enableCors({
    origin: (origin, callback) => {
      
      // Autoriser toutes les origines si l'origine n'est pas définie
      callback(null, true);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  app.useWebSocketAdapter(new JwtIoAdapter(app));
  const port = process.env.PORT || 3000; // Utilisez la variable d'environnement PORT si définie, sinon utilisez le port 3000
  const host = '0.0.0.0';
  const interfaces = os.networkInterfaces();

  Object.keys(interfaces).forEach((iface) => {
    interfaces[iface].forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        Logger.log(`Server is running on http://${details.address}:${port}`, 'Bootstrap');
      }
    });
  });


  await app.listen(port, host);
  Logger.log(`Server is running on http://192.168.1.16:${port}`, 'Bootstrap'); // Log le port
}
bootstrap();
