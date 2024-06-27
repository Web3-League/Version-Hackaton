import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import { exec } from 'child_process';
import * as whois from 'whois';
import * as dns from 'dns';
import { promisify } from 'util';
import * as winston from 'winston';

const execPromise = promisify(exec);
const MAX_BATCH_SIZE = 255; // Batch size set to 255
const SCAN_DELAY = 5000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

@Injectable()
export class WebSocketGuard implements CanActivate {
  private requestTimestamps: { [key: string]: number[] } = {};
  private readonly REQUEST_LIMIT = 50;
  private readonly TIME_WINDOW = 5000;

  private messageHistory: { [key: string]: string[] } = {};
  private readonly SPAM_MESSAGE_LIMIT = 10;
  private readonly SPAM_TIME_WINDOW = 10000;

  private ipCounts: { [ip: string]: number } = {};
  private readonly MAX_IP_CONNECTIONS = 5;

  private userIPs: { [userId: string]: string } = {};

  private isScanning: boolean = false;
  private scanRanges: string[] = [];
  private ignoredProviders: string[] = ['YOUR_ISP_NAME', 'ANOTHER_ISP_NAME'];
  private ignoredRanges: string[] = ['192.168.0.0/16', '90.3.0.0/16'];

  private exclusionList: string[] = ['90.3.221.95'];
  private currentIP: string = '0';
  private ipCounter: number = 1;
  private totalScannedIPs: number = 0;

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const data = context.switchToWs().getData();
    const token = client.handshake.auth?.token;

    return new Promise<boolean>(async (resolve) => {
      if (!token) {
        client.emit('error', 'Unauthorized access');
        return resolve(false);
      }

      if (data && data.userId && data.channelId) {
        if (this.isRateLimited(client, data)) {
          client.emit('error', 'Rate limit exceeded');
          return resolve(false);
        }

        if (this.isSpamMessage(client, data)) {
          client.emit('error', 'Spam message detected');
          return resolve(false);
        }
      }

      if (this.exceedsMaxConnections(client)) {
        client.emit('error', 'Too many connections from this IP');
        return resolve(false);
      }

      if (!this.isScanning) {
        this.isScanning = true;
        logger.info('Scan en cours...');
        this.scanContinuously();
      }

      return resolve(true);
    });
  }

  private isRateLimited(client: Socket, data: any): boolean {
    console.log('Data received in isRateLimited:', data);

    if (!data || !data.userId || !data.channelId) {
      logger.error('Data is missing userId or channelId');
      return false;
    }

    const userChannelKey = `${data.userId}:${data.channelId}`;
    const currentTime = Date.now();

    if (!this.requestTimestamps[userChannelKey]) {
      this.requestTimestamps[userChannelKey] = [];
    }

    this.requestTimestamps[userChannelKey] = this.requestTimestamps[userChannelKey].filter(
      timestamp => currentTime - timestamp < this.TIME_WINDOW,
    );

    if (this.requestTimestamps[userChannelKey].length >= this.REQUEST_LIMIT) {
      return true;
    }

    this.requestTimestamps[userChannelKey].push(currentTime);

    return false;
  }

  private isSpamMessage(client: Socket, data: any): boolean {
    console.log('Data received in isSpamMessage:', data);

    if (!data || !data.userId || !data.channelId) {
      logger.error('Data is missing userId or channelId');
      return false;
    }

    const userChannelKey = `${data.userId}:${data.channelId}`;
    const currentTime = Date.now();

    if (!this.messageHistory[userChannelKey]) {
      this.messageHistory[userChannelKey] = [];
    }

    this.messageHistory[userChannelKey].push(data.message);
    this.messageHistory[userChannelKey] = this.messageHistory[userChannelKey].filter(
      (message, index, arr) => currentTime - (arr.length - index) * this.SPAM_TIME_WINDOW < this.SPAM_TIME_WINDOW,
    );

    const identicalMessages = this.messageHistory[userChannelKey].filter(
      message => message === data.message,
    );

    if (identicalMessages.length >= this.SPAM_MESSAGE_LIMIT) {
      return true;
    }

    return false;
  }

  private exceedsMaxConnections(client: Socket): boolean {
    const clientIP = client.handshake.address;

    if (!this.ipCounts[clientIP]) {
      this.ipCounts[clientIP] = 0;
    }

    if (this.ipCounts[clientIP] >= this.MAX_IP_CONNECTIONS) {
      return true;
    }

    this.ipCounts[clientIP] += 1;
    client.on('disconnect', () => {
      this.ipCounts[clientIP] -= 1;
      if (this.ipCounts[clientIP] <= 0) {
        delete this.ipCounts[clientIP];
      }
    });

    return false;
  }

  private async scanGlobalIP(ip: string): Promise<void> {
    if (this.isExcludedIP(ip)) {
      logger.info(`Skipping scan for excluded IP: ${ip}`);
      return;
    }
    logger.info(`Scanning global IP: ${ip}`);
    const command = `nmap -Pn -sS -p 1-65535 ${ip}`;
    try {
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        logger.error(`Nmap scan stderr for ${ip}: ${stderr}`);
        return;
      }
      logger.info(`Scan results for ${ip}:\n${stdout}`);
    } catch (error) {
      logger.error(`Nmap scan error for ${ip}: ${error.message}`);
    }
  }

  private async scanContinuously(): Promise<void> {
    while (true) {
      logger.info(`Scanning IP number: ${this.ipCounter}`);
      await this.incrementAndScanIP(this.currentIP, MAX_BATCH_SIZE);
      this.ipCounter += MAX_BATCH_SIZE;
      await this.delay(SCAN_DELAY);
      this.logProgression();
    }
  }

  private async incrementAndScanIP(startIP: string, numberOfIPsToScan: number): Promise<void> {
    let ip = startIP;
    for (let i = 0; i < numberOfIPsToScan; i++) {
      await this.scanGlobalIP(ip);
      ip = this.incrementIP(ip, 1);
      this.totalScannedIPs++;
      this.currentIP = ip; // Ensure currentIP is updated after each scan
    }
  }

  private incrementIP(ip: string, increment: number): string {
    let parts = ip.split('.').map(str => {
      const num = parseInt(str, 10);
      return isNaN(num) ? 0 : num;
    });

    for (let i = 0; i < increment; i++) {
      parts[3]++;
      for (let j = 3; j >= 0; j--) {
        if (parts[j] > 255) {
          parts[j] = 0;
          if (j > 0) {
            parts[j - 1]++;
          }
        }
      }
    }

    return parts.join('.');
  }

  private isExcludedIP(ip: string): boolean {
    return this.exclusionList.some(exclusion => ip.startsWith(exclusion));
  }

  private lookupWhois(ip: string): Promise<string> {
    return new Promise((resolve, reject) => {
      whois.lookup(ip, (err, data) => {
        if (err) {
          logger.error(`WHOIS lookup error for ${ip}: ${err.message}`);
          return reject(err);
        }
        logger.info(`WHOIS info for ${ip}:\n${data}`);
        resolve(data);
      });
    });
  }

  private reverseDnsLookup(ip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      dns.reverse(ip, (err, hostnames) => {
        if (err) {
          if (err.code === 'ENOTFOUND') {
            logger.warn(`No reverse DNS record found for ${ip}`);
            return reject(err);
          }
          logger.error(`Reverse DNS lookup error for ${ip}: ${err.message}`);
          return reject(err);
        }
        logger.info(`Reverse DNS info for ${ip}:\n${hostnames.join(', ')}`);
        resolve();
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logProgression(): void {
    logger.info(`Current IP: ${this.currentIP}`);
    logger.info(`Total IPs scanned: ${this.totalScannedIPs}`);
  }

  public getStatus(): any {
    return {
      isScanning: this.isScanning,
      scanRanges: this.scanRanges,
      currentIP: this.currentIP,
      ipCounter: this.ipCounter,
      totalScannedIPs: this.totalScannedIPs,
    };
  }

  public addRangeToScan(range: string): void {
    this.scanRanges.push(range);
    logger.info(`Added new range to scan: ${range}`);
  }
}
