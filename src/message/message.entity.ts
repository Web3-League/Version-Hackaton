import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { Reaction } from './reaction.entity'; // Assurez-vous que ce fichier existe
import { Channel } from '../channel/channel.entity'; // Assurez-vous que ce fichier existe

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  text: string;

  @Column({ nullable: true })
  fileUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Reaction, reaction => reaction.message)
  reactions: Reaction[];

  @ManyToOne(() => User, user => user.messages)
  user: User;

  @ManyToOne(() => Channel, channel => channel.messages)
  channel: Channel;



}


export { Message as MessageEntity };
