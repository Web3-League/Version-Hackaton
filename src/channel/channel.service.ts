import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from './channel.entity';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async create(name: string): Promise<Channel> {
    const channel = this.channelRepository.create({ name });
    return this.channelRepository.save(channel);
  }

  async findAll(): Promise<Channel[]> {
    return this.channelRepository.find();
  }

  async findOne(id: number): Promise<Channel> {
    return this.channelRepository.findOne({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    await this.channelRepository.delete(id);
  }
}
