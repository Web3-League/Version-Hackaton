import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Server, ServerEntity } from './server.entity';
import { CreateServerDto } from 'src/dto/create-server.dto';
import { User } from 'src/user/user.entity';
import { Channel } from 'src/channel/channel.entity';
import { UserService } from 'src/user/user.service';

@Injectable()
export class ServerService {
  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
    private readonly userService: UserService,
  ) {}

  async create(createServerDto: CreateServerDto, owner: User): Promise<Server> {
    console.log('Creating server with data:', createServerDto);

    // Initialize members as an empty array if not provided
    const memberIds = createServerDto.members || [];
    const members = await Promise.all(
      memberIds.map(async (memberId) => {
        const member = await this.userService.findById(memberId);
        if (!member) {
          console.error(`Error: Member with ID ${memberId} not found`);
          throw new Error(`Member with ID ${memberId} not found`);
        }
        return member;
      }),
    );

    const server = this.serverRepository.create({ ...createServerDto, owner, members });
    return this.serverRepository.save(server);
  }

  async findByOwner(ownerId: number): Promise<Server[]> {
    return this.serverRepository.find({ where: { owner: { id: ownerId } }, relations: ['channels'] });
  }

  async findByUser(userId: number): Promise<Server[]> {
    const serversAsOwner = await this.serverRepository
      .createQueryBuilder('server')
      .leftJoinAndSelect('server.owner', 'owner')
      .where('owner.id = :userId', { userId })
      .getMany();
  
    const serversAsMember = await this.serverRepository
      .createQueryBuilder('server')
      .leftJoinAndSelect('server.members', 'member')
      .where('member.id = :userId', { userId })
      .getMany();
  
    const combinedServers = [...serversAsOwner, ...serversAsMember];
    const uniqueServers = Array.from(new Set(combinedServers.map(server => server.id)))
      .map(id => combinedServers.find(server => server.id === id));
  
    return uniqueServers;
  }
  
  async findByMember(serverId: number): Promise<Server> {
    return this.serverRepository.findOne({
      where: { id: serverId },
      relations: ['owner', 'members'],
    });
  }
  
  async findById(id: number): Promise<Server> {
    return this.serverRepository.findOne({ where: { id }, relations: ['channels', 'owner', 'members'] });
  }

  async addChannelToServer(serverId: number, channel: Channel): Promise<Server> {
    const server = await this.findById(serverId);
    if (server) {
      server.channels.push(channel);
      await this.serverRepository.save(server);
    }
    return server;
  }

  async searchServers(query: string): Promise<Server[]> {
    if (!query || query.trim() === '') {
      return [];
    }
    return this.serverRepository.find({
      where: [
        { name: Like(`%${query}%`) },
        { category: Like(`%${query}%`) },
      ],
    });
  }

  async remove(id: number): Promise<void> {
    await this.serverRepository.delete(id);
  }

  async getServersForUser(userId: number): Promise<Server[]> {
    const servers = await this.findByUser(userId);
    return servers.map(server => {
      return {
        ...server,
        members: [],
      };
    });
  }

}

