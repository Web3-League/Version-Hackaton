import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany } from 'typeorm';
import { ServerEntity } from 'src/server/server.entity';
import { User } from 'src/user/user.entity';
import { MessageEntity } from 'src/message/message.entity';

@Entity('channel')
export class ChannelEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => ServerEntity, (server) => server.channels)
  server: ServerEntity;

  @ManyToOne(() => User)
  owner: User;

  @OneToMany(() => MessageEntity, (message: MessageEntity) => message.channel)
  messages: MessageEntity[];
}

// Ensure you export the entity
export { ChannelEntity as Channel };
