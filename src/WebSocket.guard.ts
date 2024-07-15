import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import { exec } from 'child_process';
import * as whois from 'whois';
import * as dns from 'dns';
import { promisify } from 'util';
import * as winston from 'winston';

const execPromise = promisify(exec);
const whoisPromise = promisify(whois.lookup);
const dnsReversePromise = promisify(dns.reverse);
const MAX_BATCH_SIZE = 10;
const SCAN_DELAY = 5000;
const SKIP_DELAY = 100;
const SCAN_TIMEOUT = 2000; // 2 seconds timeout for each scan

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
  private currentIP: string = '8.34.208.0'; // Start IP from 8.34.208.0
  private ipCounter: number = 0; // Counter for scanned IPs
  private scanCounter: number = 0; // Counter for successful DNS matches
  private totalScannedIPs: number = 0;

  // List of base Google IP addresses to scan around
  private googleBaseIPs: string[] = [
    '8.8.8.8',    // Google Public DNS
    '8.34.208.0', // Google LLC
    '8.35.192.0', // Google LLC
    '23.236.48.0',// Google LLC
    // Add more Google base IP addresses as needed
  ];
  private RANGE_SIZE = 50; // Number of IPs to scan before and after the base IP
  private currentRangeIndex: number = 0; // Index of the current range being scanned

  private reverseDNSMap: { [ip: string]: boolean } = {};
  private googleMatchCounter: number = 0;
  private dnsMatchCounter: number = 0;

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
        await this.scanGoogleIPsAround();
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

  // Helper functions to convert IP addresses to numerical and back
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  }

  private numberToIp(num: number): string {
    return `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;
  }

  private async scanGoogleIPsAround(): Promise<void> {
    while (true) {
      const baseIP = this.googleBaseIPs[this.currentRangeIndex];
      await this.scanRangeAroundIP(baseIP);
      this.currentRangeIndex++;
      if (this.currentRangeIndex >= this.googleBaseIPs.length) {
        this.currentRangeIndex = 0; // Restart from the first range
      }
    }
  }

  private async scanRangeAroundIP(baseIP: string): Promise<void> {
    let startIP = this.incrementIP(baseIP, -this.RANGE_SIZE);
    let endIP = this.incrementIP(baseIP, this.RANGE_SIZE);
    await this.scanIPRange(startIP, endIP);
  }

  private async scanIPRange(startIP: string, endIP: string): Promise<void> {
    const startNum = this.ipToNumber(startIP);
    const endNum = this.ipToNumber(endIP);
    let foundGoogleUserContent = false;

    for (let currentNum = startNum; currentNum <= endNum; currentNum++) {
      const currentIP = this.numberToIp(currentNum);
      const hasDNSRecord = await this.hasDnsRecord(currentIP);
      if (hasDNSRecord) {
        const isGoogleUserContent = await this.isGoogleUserContent(currentIP);
        if (isGoogleUserContent) {
          const port80Open = await this.isPort80Open(currentIP);
          if (port80Open) {
            await this.scanGlobalIP(currentIP);
            foundGoogleUserContent = true;
            // Regular scan delay
            await this.delay(SCAN_DELAY);
          } else {
            logger.info(`Port 80 not open for ${currentIP}. Skipping.`);
            // Shorter delay for skipping IPs without port 80 open
            await this.delay(SKIP_DELAY);
          }
        }
      } else {
        logger.info(`No DNS record found for ${currentIP}. Skipping.`);
        // Shorter delay for skipping IPs without DNS records
        await this.delay(SKIP_DELAY);
      }
    }

    if (!foundGoogleUserContent) {
      logger.info(`No Google user content found in range ${startIP} to ${endIP}. Skipping to next range.`);
    }
  }

  private async hasDnsRecord(ip: string): Promise<boolean> {
    try {
      const hostnames = await dnsReversePromise(ip);
      return hostnames.length > 0;
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        return false;
      } else {
        logger.error(`DNS lookup error for ${ip}: ${error.message}`);
        return false;
      }
    }
  }

  private async isGoogleUserContent(ip: string): Promise<boolean> {
    try {
      const hostnames = await dnsReversePromise(ip);
      logger.info(`Reverse DNS info for ${ip}:\n${hostnames.join(', ')}`);
      return hostnames.some(hostname => hostname.includes('googleusercontent.com'));
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        logger.warn(`No reverse DNS record found for ${ip}`);
      } else {
        logger.error(`Reverse DNS lookup error for ${ip}: ${error.message}`);
      }
      return false;
    }
  }

  private async isPort80Open(ip: string): Promise<boolean> {
    const command = `nmap -Pn -p 80 ${ip}`;

    try {
      const { stdout } = await Promise.race([
        execPromise(command),
        this.timeout(SCAN_TIMEOUT)
      ]);
      return stdout.includes('80/tcp open');
    } catch (error) {
      if (error.message === 'Scan timed out') {
        logger.warn(`Scan timed out for ${ip}`);
      } else {
        logger.error(`Nmap scan error for ${ip}: ${error.message}`);
      }
      return false;
    }
  }

  private async scanGlobalIP(ip: string): Promise<void> {
    if (this.isExcludedIP(ip)) {
      logger.info(`Skipping scan for excluded IP: ${ip}`);
      return;
    }
    logger.info(`Scanning global IP: ${ip}`);
    const command = `nmap -Pn -p 80 ${ip}`;

    try {
      const { stdout, stderr } = await Promise.race([
        execPromise(command),
        this.timeout(SCAN_TIMEOUT)
      ]);
      if (stderr) {
        logger.error(`Nmap scan stderr for ${ip}: ${stderr}`);
        return;
      }
      logger.info(`Scan results for ${ip}:\n${stdout}`);
    } catch (error) {
      if (error.message === 'Scan timed out') {
        logger.warn(`Scan timed out for ${ip}`);
      } else {
        logger.error(`Nmap scan error for ${ip}: ${error.message}`);
      }
    }
  }

  private timeout(ms: number): Promise<any> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Scan timed out'));
      }, ms);
    });
  }

  private incrementIP(ip: string, increment: number): string {
    let parts = ip.split('.').map(str => {
      const num = parseInt(str, 10);
      return isNaN(num) ? 0 : num;
    });

    for (let i = 0; i < Math.abs(increment); i++) {
      if (increment > 0) {
        parts[3]++;
      } else {
        parts[3]--;
      }
      for (let j = 3; j >= 0; j--) {
        if (parts[j] > 255) {
          parts[j] = 0;
          if (j > 0) {
            parts[j - 1]++;
          }
        } else if (parts[j] < 0) {
          parts[j] = 255;
          if (j > 0) {
            parts[j - 1]--;
          }
        }
      }
    }

    return parts.join('.');
  }

  private isExcludedIP(ip: string): boolean {
    return this.exclusionList.some(exclusion => ip.startsWith(exclusion));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

