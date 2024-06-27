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
import { Logger, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { UserService } from 'src/user/user.service';
import { MessagesService } from 'src/message/messages.service';
import { ServerService } from 'src/server/server.service';
import { ChannelService } from 'src/channel/channel.service';
import { CreateServerDto } from 'src/dto/create-server.dto';
import { AuthService } from 'src/auth/auth.service';
import { WebSocketGuard } from '../websocket.guard';


@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3001' , 'http://192.168.1.16:3001', 'http://localhost:3000', 'http://192.168.1.16:3000', 'http://90.3.221.95:3001/', 'http://90.3.221.95:3000/'],
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('ChatGateway');

  constructor(
    private readonly webSocketGuard: WebSocketGuard,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly messagesService: MessagesService,
    private readonly serverService: ServerService,
    private readonly channelService: ChannelService,
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
    this.logger.log('WebSocket server initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('typing')
  handleTyping(@MessageBody() username: string, @ConnectedSocket() client: Socket): void {
    client.broadcast.emit('user_typing', username);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('stop_typing')
  handleStopTyping(@MessageBody() username: string, @ConnectedSocket() client: Socket): void {
    client.broadcast.emit('stop_typing');
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('create_channel')
  async handleCreateChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): Promise<void> {
    console.log('Received create_channel event with data:', data);

    const ownerId = client.data.user.userId;
    console.log('Owner ID from client data:', ownerId);

    try {
      const newChannel = await this.channelService.createChannel(data.name, data.serverId, ownerId);
      console.log('New channel created:', newChannel);

      client.emit('channel_created', newChannel);
    } catch (error) {
      console.error('Error creating channel:', error);
      client.emit('error', { message: 'Error creating channel' });
    }
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('update_channel')
  async handleUpdateChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): Promise<void> {
    const ownerId = client.data.user.userId;
    const updatedChannel = await this.channelService.updateChannel(data.id, data.name, data.serverId, ownerId);
    this.server.emit('channel_updated', updatedChannel);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('delete_channel')
  async handleDeleteChannel(@MessageBody() data: any, @ConnectedSocket() client: Socket): Promise<void> {
    await this.channelService.deleteChannel(data.id);
    this.server.emit('channel_deleted', { id: data.id });
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() data: { userId: number, text: string, channelId: number, fileUrl?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      console.log('Received message data:', data);
      const user = await this.userService.findById(data.userId);
      if (!data.channelId) {
        client.emit('error', 'Channel ID must be provided');
        return;
      }

      const message = await this.messagesService.create(user.id, data.text, data.channelId, data.fileUrl);
      const room = `channel:${data.channelId}`;
      this.server.to(room).emit('message', message);
    } catch (error) {
      console.error('Error sending message:', error);
      client.emit('error', 'Failed to send message');
    }
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @MessageBody() data: { channelId: number },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      console.log(`Received get_messages request for channelId: ${data.channelId}`); // Log request
      const messages = await this.messagesService.findByChannelId(data.channelId);
      console.log('Sending messages from historical data:', messages); // Log messages to be sent
      client.emit('messages', messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      client.emit('error', 'Failed to fetch messages');
    }
  }



  @UseGuards(WebSocketGuard)
  @SubscribeMessage('joinServer')
  async handleJoinServer(@MessageBody() data: { serverId: number }, @ConnectedSocket() client: Socket) {
    if (!client.data.user) {
      client.emit('error', { message: 'Unauthorized access' });
      throw new UnauthorizedException('Unauthorized access');
    }
    const server = await this.serverService.findById(data.serverId);
    client.join(`server-${server.id}`);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('leave_server')
  async handleLeaveServer(@MessageBody() data: { serverId: number }, @ConnectedSocket() client: Socket) {
    if (!client.data.user) {
      client.emit('error', { message: 'Unauthorized access' });
      throw new UnauthorizedException('Unauthorized access');
    }
    const server = await this.serverService.findById(data.serverId);
    client.leave(`server-${server.id}`);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('fetch_servers')
  async handleFetchServers(@MessageBody() data: { userId: number }, @ConnectedSocket() client: Socket) {
    const servers = await this.serverService.getServersForUser(data.userId);
    client.emit('servers', { servers });
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('fetch_channels')
  async handleFetchChannels(
    @MessageBody() data: { serverId: number },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const channels = await this.channelService.findChannelsByServer(data.serverId);
    console.log('Fetched channels for serverId:', data.serverId, 'Channels:', channels);
    client.emit('channels', channels);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('create_server')
  async handleCreateServer(
    @MessageBody() createServerDto: CreateServerDto,
    @ConnectedSocket() client: Socket,
  ) {
    console.log('Received create_server event with data:', createServerDto);

    if (!client.data.user) {
      client.emit('error', { message: 'Unauthorized access' });
      throw new UnauthorizedException('Unauthorized access');
    }

    try {
      const owner = await this.userService.findById(createServerDto.owner);
      if (!owner) {
        console.error('Owner not found');
        client.emit('error', { message: 'Owner not found' });
        return;
      }
      const newServer = await this.serverService.create(createServerDto, owner);
      console.log('Server created successfully:', newServer);
      client.emit('server_created', newServer);
    } catch (error) {
      console.error('Error creating server:', error);
      client.emit('error', { message: 'Error creating server' });
    }
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('delete_server')
  async handleDeleteServer(@MessageBody() data: { serverId: number }, @ConnectedSocket() client: Socket) {
    if (!client.data.user) {
      client.emit('error', { message: 'Unauthorized access' });
      throw new UnauthorizedException('Unauthorized access');
    }
    try {
      await this.serverService.remove(data.serverId);
      client.emit('server_deleted', data.serverId);
    } catch (error) {
      client.emit('error', { message: 'Error deleting server' });
    }
  }
  
  @UseGuards(WebSocketGuard)
  @SubscribeMessage('fetch_all_channels')
  async handleFetchAllChannels(@ConnectedSocket() client: Socket): Promise<void> {
    const channels = await this.channelService.findAll(); // Ensure findAll method exists in your channel service
    client.emit('fetched_channels', channels);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('getStatus')
  handleGetStatus(@ConnectedSocket() client: Socket) {
    const status = this.webSocketGuard.getStatus();
    client.emit('status', status);
  }

  @UseGuards(WebSocketGuard)
  @SubscribeMessage('addRange')
  handleAddRange(@MessageBody() body: { range: string }, @ConnectedSocket() client: Socket) {
    this.webSocketGuard.addRangeToScan(body.range);
    client.emit('message', { message: 'Range added to scan list' });
  }

}
