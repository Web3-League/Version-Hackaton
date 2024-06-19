import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { Message } from './message.entity';
import { ReactionEntity } from './reaction.entity';
import { User } from '../user/user.entity';
import { PrivateMessage } from './private-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message, ReactionEntity, User, PrivateMessage])],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
