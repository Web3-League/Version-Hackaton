import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelEntity } from './channel.entity';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepository: Repository<ChannelEntity>,
  ) {}

  async createChannel(name: string, serverId: number, ownerId: number): Promise<ChannelEntity> {
    const newChannel = this.channelRepository.create({
      name,
      server: { id: serverId } as any, // Use partial relation
      owner: { id: ownerId } as any,
    });
    return await this.channelRepository.save(newChannel);
  }

  async updateChannel(id: number, name: string, serverId: number, ownerId: number): Promise<ChannelEntity> {
    await this.channelRepository.update(id, {
      name,
      server: { id: serverId } as any, // Use partial relation
      owner: { id: ownerId } as any,
    });
    return this.channelRepository.findOne({ where: { id, server: { id: serverId } as any, owner: { id: ownerId } as any } });
  }

  async deleteChannel(id: number): Promise<void> {
    await this.channelRepository.delete(id);
  }

  async findChannelsByServer(serverId: number): Promise<ChannelEntity[]> {
    return this.channelRepository.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.server', 'server')
      .where('server.id = :serverId', { serverId })
      .getMany();
  }
  
  
  async findAll(): Promise<ChannelEntity[]> {
    return this.channelRepository.find();
  }
}


