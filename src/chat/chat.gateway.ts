import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { MessagesService } from 'src/message/messages.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3001',
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('ChatGateway');

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly messagesService: MessagesService,
  ) { }

  async afterInit(server: Server) {
    server.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      jwt.verify(token, this.configService.get('JWT_SECRET'), (err, decoded) => {
        if (err) {
          return next(new Error('Authentication error: Invalid token'));
        }
        socket.data.user = decoded;
        next();
      });
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }


  // Typing event handlers
  @SubscribeMessage('typing')
  handleTyping(@MessageBody() username: string, @ConnectedSocket() client: Socket): void {
    client.broadcast.emit('user_typing', username);
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(@MessageBody() username: string, @ConnectedSocket() client: Socket): void {
    client.broadcast.emit('stop_typing');
  }


  // Server CRUD methods

  @SubscribeMessage('create_server')
  handleCreateServer(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const newServer = {
      id: Date.now(), // Replace with actual ID generation logic
      name: data.name,
      owner: client.data.user.userId,
    };
    // Save the new server to your database or in-memory storage
    this.server.emit('server_created', newServer);
  }

  @SubscribeMessage('update_server')
  handleUpdateServer(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const updatedServer = {
      id: data.id,
      name: data.name,
      owner: client.data.user.userId,
    };
    // Update the server in your database or in-memory storage
    this.server.emit('server_updated', updatedServer);
  }

  @SubscribeMessage('delete_server')
  handleDeleteServer(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const serverId = data.id;
    // Delete the server from your database or in-memory storage
    this.server.emit('server_deleted', { id: serverId });
  }

  // Channel CRUD methods

  @SubscribeMessage('create_channel')
  handleCreateChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const newChannel = {
      id: Date.now(), // Replace with actual ID generation logic
      name: data.name,
      serverId: data.serverId,
      owner: client.data.user.userId,
    };
    // Save the new channel to your database or in-memory storage
    this.server.emit('channel_created', newChannel);
  }

  @SubscribeMessage('update_channel')
  handleUpdateChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const updatedChannel = {
      id: data.id,
      name: data.name,
      serverId: data.serverId,
      owner: client.data.user.userId,
    };
    // Update the channel in your database or in-memory storage
    this.server.emit('channel_updated', updatedChannel);
  }

  @SubscribeMessage('delete_channel')
  handleDeleteChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): void {
    const channelId = data.id;
    // Delete the channel from your database or in-memory storage
    this.server.emit('channel_deleted', { id: channelId });
  }
  
  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() content: string,
    @MessageBody('channelId') channelId: number, // Extract channelId from message body
    @ConnectedSocket() client: Socket
  ): Promise<void> {
    const { userId, username } = client.data.user;
    const message = await this.messagesService.create(content, userId, username, channelId);
    this.server.emit('message', message);
  }

  @SubscribeMessage('get_messages')
  async handleGetMessages(@ConnectedSocket() client: Socket): Promise<void> {
    const messages = await this.messagesService.findAll();
    client.emit('messages', messages);
  }
}