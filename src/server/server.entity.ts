import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { User } from '../user/user.entity';
import { Channel } from '../channel/channel.entity';

@Entity()
export class Server {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  category: string;

  @ManyToOne(() => User, user => user.ownedServers)
  owner: User;

  @OneToMany(() => Channel, channel => channel.server)
  channels: Channel[];

  @ManyToMany(() => User)
  @JoinTable()
  members: User[];
}

export { Server as ServerEntity };
