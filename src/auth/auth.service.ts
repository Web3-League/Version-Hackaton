import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginDto } from '../dto/login.dto';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string = process.env.JWT_SECRET; // Ensure you have this environment variable set

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const userExists = await this.userService.findByEmail(createUserDto.email);
    if (userExists) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.userService.createUser(createUserDto.username, createUserDto.email, createUserDto.password);
    const token = this.generateJwtToken(user);
    return { user, token };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userService.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      console.log('Invalid credentials');
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.generateJwtToken(user);
    return { userId: user.id, token };
  }

  public generateJwtToken(user: any) {
    const payload = { username: user.username, userId: user.id };
    return this.jwtService.sign(payload, { secret: this.jwtSecret });
  }

  async findUserById(userId: number) {
    return this.userService.findById(userId);
  }

  async validateUserById(userId: number): Promise<any> {
    return this.userService.findById(userId);
  }
  
}
