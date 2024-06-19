import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerService } from './server.service';
import { Server } from './server.entity';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';
import { User } from 'src/user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Server, User],),
    UserModule
  ],
  providers: [ServerService, UserService],
  exports: [ServerService],
})
export class ServerModule { }
