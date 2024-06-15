import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions } from 'typeorm';
import { User } from './user.entity';
import * as crypto from 'crypto';

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

  async findByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
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
}
