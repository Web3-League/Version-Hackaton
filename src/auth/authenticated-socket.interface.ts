import { Socket } from 'socket.io';
import { User } from '../user/user.entity';

export interface AuthenticatedSocket extends Socket {
  user: User;
}
