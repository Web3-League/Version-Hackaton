import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Message } from '../message/message.entity';
import { PrivateMessage } from '../message/private-message.entity';
import { Server } from '../server/server.entity';
import { Reaction } from '../message/reaction.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column()
  salt: string;

  @OneToMany(() => Message, message => message.user)
  messages: Message[];

  @OneToMany(() => PrivateMessage, privateMessage => privateMessage.sender)
  sentMessages: PrivateMessage[];

  @OneToMany(() => PrivateMessage, privateMessage => privateMessage.receiver)
  receivedMessages: PrivateMessage[];

  @OneToMany(() => Server, server => server.owner)
  servers: Server[];

  @OneToMany(() => Reaction, reaction => reaction.user)
  reactions: Reaction[];
}
