import { Injectable } from '@nestjs/common';
import { Message } from './message.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
  ) {}

  async create(content: string, userId: number, username: string, channelId: number): Promise<Message> {
    // Ensure that we create a partial message entity and assign it the required properties.
    const message = this.messagesRepository.create({
      content,
      userId,
      username,
      channelId,
    } as Partial<Message>);

    return this.messagesRepository.save(message);
  }

  async findAll(): Promise<Message[]> {
    return this.messagesRepository.find();
  }

  async delete(id: number): Promise<void> {
    await this.messagesRepository.delete(id);
  }
}


