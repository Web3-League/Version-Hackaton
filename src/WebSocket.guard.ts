import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';

@Injectable()
export class WebSocketGuard implements CanActivate {
  // Store the timestamps of requests for each user/channel combination
  private requestTimestamps: { [key: string]: number[] } = {};
  private readonly REQUEST_LIMIT = 5; // Max 5 requests
  private readonly TIME_WINDOW = 10000; // Per 10 seconds

  // Store the last few messages sent by each user/channel combination
  private messageHistory: { [key: string]: string[] } = {};
  private readonly SPAM_MESSAGE_LIMIT = 3; // Max 3 identical messages
  private readonly SPAM_TIME_WINDOW = 5000; // Within 5 seconds

  private userIPs: { [userId: string]: string } = {};

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();
    const token = client.handshake.auth?.token; // Fix to get token correctly

    // Use a switch structure to check different conditions
    switch (true) {
      case !token: // Check if token is missing
        client.emit('error', 'Unauthorized access');
        return false;

      case this.isRateLimited(client, data):
        client.emit('error', 'Rate limit exceeded');
        return false;

      case this.isSpamMessage(client, data):
        client.emit('error', 'Spam message detected');
        return false;

      case this.sameIP(client, data):
        client.emit('error', 'Same IP detected ');
        return false;

      default:
        return true;
    }
  }

  private isRateLimited(client: Socket, data: any): boolean {
    const userChannelKey = `${data.userId}:${data.channelId}`;
    const currentTime = Date.now();

    if (!this.requestTimestamps[userChannelKey]) {
      this.requestTimestamps[userChannelKey] = [];
    }

    // Filter requests outside the time window
    this.requestTimestamps[userChannelKey] = this.requestTimestamps[userChannelKey].filter(
      timestamp => currentTime - timestamp < this.TIME_WINDOW,
    );

    if (this.requestTimestamps[userChannelKey].length >= this.REQUEST_LIMIT) {
      return true;
    }

    // Record the current request
    this.requestTimestamps[userChannelKey].push(currentTime);

    return false;
  }

  private isSpamMessage(client: Socket, data: any): boolean {
    const userChannelKey = `${data.userId}:${data.channelId}`;
    const currentTime = Date.now();

    if (!this.messageHistory[userChannelKey]) {
      this.messageHistory[userChannelKey] = [];
    }

    // Add the new message to the history
    this.messageHistory[userChannelKey].push(data.message);
    // Filter out messages outside the spam time window
    this.messageHistory[userChannelKey] = this.messageHistory[userChannelKey].filter(
      (message, index, arr) => currentTime - (arr.length - index) * this.SPAM_TIME_WINDOW < this.SPAM_TIME_WINDOW,
    );

    // Check if the number of identical messages exceeds the limit
    const identicalMessages = this.messageHistory[userChannelKey].filter(
      message => message === data.message,
    );

    if (identicalMessages.length >= this.SPAM_MESSAGE_LIMIT) {
      return true;
    }

    return false;
  }

  private sameIP(client: Socket, data: any): boolean {
    const userId = data.userId;
    const clientIP = client.handshake.address;

    if (this.userIPs[userId] && this.userIPs[userId] !== clientIP) {
      return true;
    }

    // Store the current IP address for the user
    this.userIPs[userId] = clientIP;
    return false;
  }
}
