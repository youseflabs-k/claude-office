export function createBroadcaster() {
  const clients = new Set();

  return {
    attach(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-store',
      });
      res.flushHeaders();
      res.write(': connected\n\n');
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
      heartbeat.unref();
      clients.add(res);
      req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
    },

    send(event) {
      const frame = `data: ${JSON.stringify(event)}\n\n`;
      for (const res of clients) {
        try {
          res.write(frame);
        } catch {
          clients.delete(res);
        }
      }
    },

    count() {
      return clients.size;
    },
  };
}
