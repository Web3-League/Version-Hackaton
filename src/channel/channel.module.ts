import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelService } from './channel.service';
import { Channel } from './channel.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Channel])],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
