import { Injectable } from '@nestjs/common';
import { Message, MessageEntity } from './message.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { MessageDTO } from 'src/dto/message.dto';
import { User } from 'src/user/user.entity';
import { ReactionEntity } from '../message/reaction.entity';
import { ReactionDTO } from 'src/dto/reaction.dto';

@Injectable()
export class MessagesService {
  channelsRepository: any;
  usersRepository: any;
  constructor(
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(MessageEntity)
    private messageRepository: Repository<MessageEntity>,
    @InjectRepository(ReactionEntity)
    private readonly reactionsRepository: Repository<ReactionEntity>,
    @InjectRepository(MessageEntity)
    private channelRepository: Repository<MessageEntity>,
  ) { }


  async findByChannelId(channelId: number): Promise<MessageEntity[]> {
    if (!channelId) {
      console.log('Invalid channelId : ', channelId);
      throw new Error('Invalid channelId');
    }
    return this.messageRepository.find({ where: { channel: { id: channelId } }, relations: ['user', 'channel'] });
  }

  async delete(id: number): Promise<void> {
    await this.messagesRepository.delete(id);
  }

  async create(userId: number, text: string, channelId: number, fileUrl?: string): Promise<MessageDTO> {
    // Correct the method call to fetch the user and channel
    const user = { id: userId };
    const channel = { id: channelId };

    if (!user) {
      throw new Error('User must be provided');
    }

    if (!channel) {
      throw new Error('Channel must be provided');
    }

    const message = this.messagesRepository.create({
      user, // Pass the user entity
      text,
      channel, // Pass the channel entity
      fileUrl,
      createdAt: new Date(),
    });

    const savedMessage = await this.messagesRepository.save(message);

    return new MessageDTO(savedMessage);
  }

  async findAll(channelId: number): Promise<MessageDTO[]> {
    const channel = await this.channelRepository.findOne({ where: { id: channelId } });

    if (!channel) {
      throw new Error('Channel must be provided');
    }

    let messages = await this.messageRepository.find({
      where: { channel },
      relations: ['user', 'reactions'],
      order: { createdAt: 'DESC' },
      take: 50,
    });

    messages = messages.map(message => {
      if (!message.createdAt) {
        message.createdAt = new Date();
      }
      return message;
    });

    messages.reverse();

    return messages.map(message => new MessageDTO(message));
  }

  async addReaction(messageId: number, emoji: string): Promise<ReactionDTO> {
    const message = await this.messagesRepository.findOne({ where: { id: messageId }, relations: ['reactions', 'user'] });
    if (!message) {
      throw new Error('Message not found');
    }
    const reaction = this.reactionsRepository.create({ message, emoji });
    const savedReaction = await this.reactionsRepository.save(reaction);
    return new ReactionDTO(savedReaction);
  }

  async findMessageById(id: number): Promise<Message> {
    return this.messageRepository.findOne({ where: { id } });
  }

  async deleteMessage(id: number): Promise<void> {
    await this.messageRepository.delete(id);
  }


}