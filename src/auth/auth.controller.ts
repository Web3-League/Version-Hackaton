import { Controller, Post, Body, Res, HttpStatus, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginDto } from '../dto/login.dto';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}


  @Post('register')
  async register(@Body() createUserDto: CreateUserDto, @Res() res: Response) {
    console.log('Register route called');
    console.log('Received data:', createUserDto);
    try {
      const result = await this.authService.register(createUserDto); // Get the result which includes both user and token
      console.log('Registration successful, result:', result);
      return res.status(HttpStatus.CREATED).json({
        message: 'Registration successful',
        token: result.token,
        user: { id: result.user.id, email: result.user.email, username: result.user.username },
      });
    } catch (error) {
      console.error('Error during registration:', error);
      if (error instanceof ConflictException) {
        return res.status(HttpStatus.CONFLICT).json({ message: error.message });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Registration failed' });
    }
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    console.log('Login route called');
    console.log('Received data:', loginDto);
    try {
      const result = await this.authService.login(loginDto);
      console.log('Login successful, result:', result);
      return res.status(HttpStatus.OK).json({
        message: 'Login successful',
        token: result.token,
        userId: result.userId,
      });
    } catch (error) {
      console.error('Error during login:', error);
      if (error instanceof UnauthorizedException) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Invalid credentials' });
      }
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Login failed' });
    }
  }
}
