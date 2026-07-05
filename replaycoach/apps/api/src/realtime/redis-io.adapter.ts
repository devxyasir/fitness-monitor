import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: any;

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
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            return new Error('Redis reconnect limits exceeded. Disabling Redis Socket.IO adapter fallback.');
          }
          return Math.min(retries * 100, 1000);
        }
      }
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      this.logger.error(`Redis Socket.IO pubClient error: ${err.message || err}`);
    });
    subClient.on('error', (err) => {
      this.logger.error(`Redis Socket.IO subClient error: ${err.message || err}`);
    });

    try {
      await Promise.race([
        Promise.all([pubClient.connect(), subClient.connect()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout (3000ms)')), 3000))
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Redis client connected. Socket.IO cluster scaling enabled via Redis adapter.');
    } catch (err: any) {
      this.logger.warn(
        `Redis connection failed or timed out: ${err.message || err}. Falling back to default in-memory Socket.IO adapter.`
      );
      try {
        await Promise.all([pubClient.disconnect(), subClient.disconnect()]);
      } catch (disconnectErr) {
        // ignore disconnect failure on unestablished connections
      }
    }
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('Socket.IO successfully configured with Redis adapter.');
    } else {
      this.logger.warn('Socket.IO running with default in-memory adapter (Redis skipped/failed).');
    }
    return server;
  }
}
