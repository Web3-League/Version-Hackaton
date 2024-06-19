import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable, BeforeInsert, BeforeUpdate } from 'typeorm';
import { Message } from '../message/message.entity';
import { Server } from 'src/server/server.entity';
import { PrivateMessage } from 'src/message/private-message.entity';
import { Reaction } from '../message/reaction.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  profilePicture: string;

  @Column({ nullable: true })
  status: string;

  @Column()
  salt: string;
  
  @OneToMany(() => Message, message => message.user)
  messages: Message[];

  // Define the one-to-many relationship with PrivateMessage
  @OneToMany(() => PrivateMessage, privateMessage => privateMessage.sender)
  sentMessages: PrivateMessage[];

  @OneToMany(() => PrivateMessage, privateMessage => privateMessage.receiver)
  receivedMessages: PrivateMessage[];

  @OneToMany(() => Server, server => server.owner)
  ownedServers: Server[];

  @OneToMany(() => Reaction, reaction => reaction.user) // Add this line
  reactions: Reaction[];

  @ManyToMany(() => Server)
  @JoinTable()
  servers: Server[];

}