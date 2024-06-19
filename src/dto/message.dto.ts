import { ReactionDTO } from './reaction.dto';
import { Message } from '../message/message.entity';

export class MessageDTO {
  id: number;
  text: string;
  fileUrl?: string;
  createdAt: Date;
  user: number;
  channel: number;
  reactions: ReactionDTO[];

  constructor(message: Message) {
    this.id = message.id;
    this.text = message.text;
    this.fileUrl = message.fileUrl;
    this.createdAt = message.createdAt;
    this.user = message.user.id; // Assuming user is a User entity with an ID
    this.channel = message.channel.id; // Assuming channel is a Channel entity with an ID
    this.reactions = message.reactions ? message.reactions.map(reaction => new ReactionDTO(reaction)) : [];
  }
}

