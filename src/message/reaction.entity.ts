import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../user/user.entity';
import { Message } from '../message/message.entity';

@Entity()
export class Reaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  emoji: string;

  @ManyToOne(() => User, user => user.reactions)
  user: User;

  @ManyToOne(() => Message, message => message.reactions)
  message: Message;
}

export { Reaction as ReactionEntity };