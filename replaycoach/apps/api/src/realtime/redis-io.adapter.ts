import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: any;
  private ioServer: any;
  private attached = false;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = this.configService.get<string>('redis.url') ?? 'redis://localhost:6379';
    this.logger.log(`Connecting Socket.IO Redis adapter to: ${redisUrl}`);

    const pubClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        // Capped exponential backoff that never gives up — a transient outage must not
        // permanently strand the process on the in-memory adapter. Returning an Error here
        // (the old behavior) stops node-redis from ever retrying again.
        reconnectStrategy: (retries) => Math.min(retries * 500, 10000),
      }
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      this.logger.error(`Redis Socket.IO pubClient error: ${err.message || err}`);
    });
    subClient.on('error', (err) => {
      this.logger.error(`Redis Socket.IO subClient error: ${err.message || err}`);
    });

    // If the initial connect attempt is slow/down, attach the adapter later once both
    // clients come up (recovery path) rather than only ever trying once at boot.
    pubClient.on('ready', () => this.tryAttach(pubClient, subClient));
    subClient.on('ready', () => this.tryAttach(pubClient, subClient));

    try {
      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout (3000ms)')), 3000))
      ]);

      this.tryAttach(pubClient, subClient);
    } catch (err: any) {
      this.logger.warn(
        `Redis connection failed or timed out: ${err.message || err}. Falling back to default in-memory ` +
        `Socket.IO adapter for now — clients will keep retrying in the background and the Redis adapter ` +
        `will attach automatically once Redis is reachable.`
      );
      // Do NOT disconnect the clients — node-redis keeps retrying via reconnectStrategy,
      // and the 'ready' listeners above will attach the adapter once it recovers.
    }
  }

  /** Build the Redis adapter and attach it — to the live server if already created, or
   * stash it for createIOServer to pick up. Idempotent: only attaches once. */
  private tryAttach(pubClient: any, subClient: any): void {
    if (this.attached || !pubClient.isReady || !subClient.isReady) return;
    this.attached = true;

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Redis client connected. Socket.IO cluster scaling enabled via Redis adapter.');

    if (this.ioServer) {
      this.ioServer.adapter(this.adapterConstructor);
      this.logger.log('Redis adapter attached to the running Socket.IO server (recovered from earlier outage).');
    }
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    this.ioServer = server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('Socket.IO successfully configured with Redis adapter.');
    } else {
      this.logger.warn('Socket.IO running with default in-memory adapter (Redis skipped/failed for now).');
    }
    return server;
  }
}
