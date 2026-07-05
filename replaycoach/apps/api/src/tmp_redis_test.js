const Redis = require('ioredis');
const redisUrl = "rediss://default:gQAAAAAAAmXJAAIgcDFhNjYyNTI0Y2QwYzQ0ZDFkOWJkMzI5ZjVlNjUxNzYxNg@witty-bass-157129.upstash.io:6379";
const client = new Redis(redisUrl);
client.on('error', (err) => {
  console.error('Redis error:', err);
  process.exit(1);
});
client.ping()
  .then((res) => {
    console.log('Connected! Ping response:', res);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Connect failed:', err);
    process.exit(1);
  });
