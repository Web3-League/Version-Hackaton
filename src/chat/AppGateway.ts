import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

@WebSocketGateway()
export class AppGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('Init');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('execute')
  async handleExecute(@MessageBody() data: { command: string }, @ConnectedSocket() client: Socket): Promise<void> {
    try {
      const { stdout, stderr } = await execPromise(`wsl ${data.command}`);
      if (stderr) {
        client.emit('output', `Error: ${stderr}`);
      } else {
        client.emit('output', stdout);
      }
    } catch (error) {
      client.emit('output', `Execution failed: ${error.message}`);
    }
  }
}
