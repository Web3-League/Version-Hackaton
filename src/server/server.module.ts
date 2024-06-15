import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServerService } from './server.service';
import { Server } from './server.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Server])],
  providers: [ServerService],
  exports: [ServerService],
})
export class ServerModule {}
