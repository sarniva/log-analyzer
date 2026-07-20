// scripts/load-test.ts
const TARGET_URL = 'http://localhost:3000/v1/ingest'; // Your Hono Gateway
const API_KEY = 'mock-tenant-uuid'; // Matches your auth.ts fallback
const BATCH_SIZE = 500; // Requests per batch
const TOTAL_BATCHES = 10;

const sampleLogs = [
  { level: 'ERROR', source: 'payment-service', message: 'Stripe API connection timeout after 30000ms' },
  { level: 'INFO', source: 'auth-service', message: 'User successfully authenticated via OAuth' },
  { level: 'WARN', source: 'nginx', message: 'Upstream server returned 502 Bad Gateway' },
  { level: 'FATAL', source: 'kernel', message: 'Out of memory: Killed process 1234 (node)' }
];

async function runLoadTest() {
  console.log(`Initiating stress test: ${BATCH_SIZE * TOTAL_BATCHES} logs...`);

  for (let i = 0; i < TOTAL_BATCHES; i++) {
    const promises = Array.from({ length: BATCH_SIZE }).map(() => {
      const randomLog = sampleLogs[Math.floor(Math.random() * sampleLogs.length)];
      return fetch(TARGET_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          ...randomLog,
          timestamp: new Date().toISOString()
        })
      });
    });

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 202).length;
    console.log(`Batch ${i + 1}/${TOTAL_BATCHES} | ${successCount} Accepted | ${BATCH_SIZE - successCount} Failed/Rate-Limited`);
  }

  console.log('Stress test complete. Check Redis queue depth and Qdrant/Quickwit ingestion.');
}

runLoadTest();
