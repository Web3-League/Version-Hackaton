import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ChatGateway } from './chat/chat.gateway';
import { ConfigModule } from '@nestjs/config';
import { MessagesService } from './message/messages.service';
import { MessagesModule } from './message/messages.module';
import { Message } from './message/message.entity';
import { Channel } from './channel/channel.entity';
import { ChannelService } from './channel/channel.service';
import { ChannelModule } from './channel/channel.module';
import { ServerService } from './server/server.service';
import { ServerModule } from './server/server.module';
import { Server } from './server/server.entity';
import { User } from './user/user.entity';
import { AuthController } from './auth/auth.controller';
import { Reaction } from './message/reaction.entity';
import { WebSocketGuard } from './websocket.guard';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Rendre le module de configuration global
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'nest_app',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    UserModule,
    AuthModule,
    AuthModule,
    TypeOrmModule.forFeature([Message]),
    TypeOrmModule.forFeature([Channel]),
    TypeOrmModule.forFeature([Server]),
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([Reaction]),
    MessagesModule,
    ChannelModule,
    ServerModule,

    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} ${level}: ${message}`;
            })
          ),
        }),
        new winston.transports.File({
          filename: 'combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} ${level}: ${message}`;
            })
          ),
        }),
      ],
    }),
  ],
  controllers: [AppController, AuthController],
  providers: [AppService, ChatGateway, MessagesService, ChannelService, ServerService, ServerService, WebSocketGuard, ],
})
export class AppModule {

}
