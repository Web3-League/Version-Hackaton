// src/auth/auth.module.ts
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'a167c44c7851a84acb1bd5dd032bb5e88ef81fa3989c0e65cad73b13e6bbeeb9',
      signOptions: { expiresIn: '1d' },
    }),
    UserModule,
      ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})

export class AuthModule {}

