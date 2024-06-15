import { User } from '../user/user.entity'; // Assurez-vous que le chemin est correct

declare module 'express' {
  export interface Request {
    user?: User;
  }
}
