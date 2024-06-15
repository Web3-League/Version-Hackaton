import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '992bc147e24cc0c7abf860a53b73c8e00c931cab81e6521ffebbab67bcad8f405bf37d9ecc7c205224f35ac5e805393280fb760c7b580c8e97fec7c9561ad08a';

export class JwtIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    server.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error('Authentication error: Invalid token'));
        }
        socket.data.user = decoded;
        next();
      });
    });

    return server;
  }
}
