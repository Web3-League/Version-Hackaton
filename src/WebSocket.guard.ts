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
  private ipCounter: number = 1;
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

  private reverseDNSMap: { [ip: string]: boolean } = {};
  private googleMatchCounter: number = 0;

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

  private async scanGoogleIPsAround(): Promise<void> {
    for (const baseIP of this.googleBaseIPs) {
      await this.scanRangeAroundIP(baseIP);
    }
  }

  private async scanRangeAroundIP(baseIP: string): Promise<void> {
    let ip = this.incrementIP(baseIP, -this.RANGE_SIZE);
    let foundReverseDNS = false;

    for (let i = 0; i < this.RANGE_SIZE * 2 + 1; i++) {
      const reverseDNSResult = await this.reverseDnsLookup(ip);
      if (reverseDNSResult) {
        await this.scanGlobalIP(ip);
        logger.info(`Continuing scan for next IP: ${ip}`);
        this.googleMatchCounter++;
        this.RANGE_SIZE++; // Increment RANGE_SIZE for each successful DNS reverse lookup
        this.currentIP = ip; // Update currentIP when reverse DNS is successful
        foundReverseDNS = true;
      }

      if (!foundReverseDNS && i === this.RANGE_SIZE * 2) {
        logger.info(`No successful DNS reverse lookups in range. Reverting to current IP: ${this.currentIP}`);
        ip = this.incrementIP(this.currentIP, 1); // Increment IP by 1 after resetting
      }

      if (this.scanRanges.length === 0) {
        const resetIP = this.incrementIP(ip, -100);
        logger.info(`Resetting scan to ${this.currentIP}`);
        ip = this.incrementIP(this.currentIP, 1); // Increment IP by 1 after resetting
        this.googleMatchCounter += 1;
        this.RANGE_SIZE = 50; // Reset RANGE_SIZE to initial value
      }

      ip = this.incrementIP(ip, 1);
      this.totalScannedIPs++;
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

  private async trackRedirections(ip: string): Promise<void> {
    try {
      // Vérifiez d'abord l'accessibilité HTTP de l'IP
      const { accessible, statusCode } = await this.checkHttpAccessibility(ip);
      if (!accessible) {
        logger.warn(`HTTP not accessible for ${ip} (status code: ${statusCode})`);
        return;
      }

      const command = `curl -Ls -o /dev/null -w "%{url_effective}" http://${ip}`;
      const { stdout } = await execPromise(command);
      if (stdout && stdout !== `http://${ip}`) {
        logger.info(`Redirection detected for ${ip}: ${stdout}`);
        await this.lookupWhois(stdout);
      }
    } catch (error) {
      logger.error(`Redirection tracking error for ${ip}: ${error.message}`);
    }
  }

  private async checkHttpAccessibility(ip: string): Promise<{ accessible: boolean, statusCode: string }> {
    const command = `curl -Is http://${ip} -o /dev/null -w "%{http_code}"`;
    try {
      const { stdout } = await execPromise(command);
      const statusCode = stdout.trim();
      return { accessible: statusCode.startsWith('2') || statusCode.startsWith('3'), statusCode };
    } catch (error) {
      return { accessible: false, statusCode: '000' }; // '000' for network errors
    }
  }

  private async reverseDnsLookup(ip: string): Promise<boolean> {
    try {
      const hostnames = await dnsReversePromise(ip);
      logger.info(`Reverse DNS info for ${ip}:\n${hostnames.join(', ')}`);
      if (hostnames.length > 0) {
        this.reverseDNSMap[ip] = true;
        return true;
      }
      return false;
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        logger.warn(`No reverse DNS record found for ${ip}`);
      } else {
        logger.error(`Reverse DNS lookup error for ${ip}: ${error.message}`);
      }
      return false;
    }
  }

  private async lookupWhois(ipOrDomain: string): Promise<void> {
    try {
      const data = await whoisPromise(ipOrDomain);
      logger.info(`WHOIS info for ${ipOrDomain}:\n${data}`);
    } catch (error) {
      logger.error(`WHOIS lookup error for ${ipOrDomain}: ${error.message}`);
    }
  }

  private async pingIP(ip: string): Promise<number | null> {
    const command = `ping -c 4 ${ip}`; // Sur Windows, utilisez `ping -n 4 ${ip}`
    try {
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        logger.error(`Ping stderr for ${ip}: ${stderr}`);
        return null;
      }
      const latency = this.extractLatency(stdout);
      logger.info(`Ping results for ${ip}: ${latency} ms`);
      return latency;
    } catch (error) {
      logger.error(`Ping error for ${ip}: ${error.message}`);
      return null;
    }
  }

  private extractLatency(pingOutput: string): number | null {
    const match = pingOutput.match(/min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+ ms/);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    return null;
  }

  private async pingLocal(): Promise<number[]> {
    const localIPs = ['192.168.0.1', '192.168.1.1']; // Ajoutez ici les IP locales
    const latencies: number[] = [];
    for (const ip of localIPs) {
      const latency = await this.pingIP(ip);
      if (latency !== null) {
        latencies.push(latency);
      }
    }
    return latencies;
  }

  private async pingProviders(): Promise<number[]> {
    const providersIPs = ['8.8.8.8', '1.1.1.1', '9.9.9.9']; // Ajoutez les IPs principales des fournisseurs ici
    const latencies: number[] = [];
    for (const ip of providersIPs) {
      const latency = await this.pingIP(ip);
      if (latency !== null) {
        latencies.push(latency);
      }
    }
    return latencies;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logLatencies(latencies: number[], type: string): void {
    const averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
    logger.info(`${type} Latencies: ${latencies.join(', ')} ms`);
    logger.info(`Average ${type} Latency: ${averageLatency.toFixed(2)} ms`);
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
