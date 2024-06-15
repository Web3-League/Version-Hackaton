import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from './server.entity';

@Injectable()
export class ServerService {
  constructor(
    @InjectRepository(Server)
    private readonly serverRepository: Repository<Server>,
  ) {}

  async create(name: string): Promise<Server> {
    const server = this.serverRepository.create({ name });
    return this.serverRepository.save(server);
  }

  async findAll(): Promise<Server[]> {
    return this.serverRepository.find({ relations: ['channels'] });
  }

  async findOne(id: number): Promise<Server> {
    return this.serverRepository.findOne({ where: { id }, relations: ['channels'] });
  }

  async remove(id: number): Promise<void> {
    await this.serverRepository.delete(id);
  }
}
