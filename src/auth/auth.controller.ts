import { Controller, Post, Body, Res, HttpStatus, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginDto } from '../dto/login.dto';
import { Response } from 'express';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/register')
  async register(@Body() createUserDto: CreateUserDto, @Res() res: Response) {
    try {
      const result = await this.authService.register(createUserDto); // Get the result which includes both user and token
      return res.status(HttpStatus.CREATED).json({
        message: 'Registration successful',
        token: result.token,
        user: { id: result.user.id, email: result.user.email, username: result.user.username },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        return res.status(HttpStatus.CONFLICT).json({ message: error.message });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Registration failed' });
    }
  }

  @Post('auth/login')
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    try {
      const result = await this.authService.login(loginDto);
      return res.status(HttpStatus.OK).json({
        message: 'Login successful',
        token: result.token,
        userId: result.userId,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Invalid credentials' });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Login failed' });
    }
  }
}
