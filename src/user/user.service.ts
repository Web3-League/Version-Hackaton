import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, Like } from 'typeorm';
import { User } from './user.entity';
import * as crypto from 'crypto';
import { CreateUserDto } from 'src/dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async createUser(username: string, email: string, password: string): Promise<User> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    const user = this.userRepository.create({ username, email, password: hashedPassword, salt });
    return this.userRepository.save(user);
  }


  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (user) {
      const hashedPassword = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
      if (hashedPassword === user.password) {
        return user;
      }
    }
    return null;
  }

  async findById(id: number): Promise<User | undefined> {
    const options: FindOneOptions<User> = {
      where: { id },
    };
    return this.userRepository.findOne(options);
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }
  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findOne(id: number): Promise<User> {
    return this.userRepository.findOne({ where: { id } });
  }

  async updateUser(id: number, updateUserDto: Partial<CreateUserDto>): Promise<User> {
    await this.userRepository.update(id, updateUserDto);
    return this.findOne(id);
  }



  async searchUsers(query: string): Promise<{ id: number, username: string, email: string }[]> {
    if (!query || query.trim() === '') {
      return [];
    }
    return this.userRepository.find({
      where: [
        { username: Like(`%${query}%`) },
        { email: Like(`%${query}%`) },
      ],
      select: ['id', 'username', 'email']
    });
  }

  async findOneByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
  }


  
}
