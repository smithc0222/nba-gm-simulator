import type { FastifyReply } from 'fastify';

interface SSEConnection {
  reply: FastifyReply;
  heartbeat: NodeJS.Timeout;
}

const connections = new Map<number, Set<SSEConnection>>();

export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function addConnection(draftId: number, reply: FastifyReply): SSEConnection {
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(': heartbeat\n\n');
    } catch {
      removeConnection(draftId, conn);
    }
  }, 30_000);

  const conn: SSEConnection = { reply, heartbeat };

  if (!connections.has(draftId)) {
    connections.set(draftId, new Set());
  }
  connections.get(draftId)!.add(conn);

  return conn;
}

export function removeConnection(draftId: number, conn: SSEConnection): void {
  clearInterval(conn.heartbeat);
  const set = connections.get(draftId);
  if (set) {
    set.delete(conn);
    if (set.size === 0) {
      connections.delete(draftId);
    }
  }
}

export function broadcast(draftId: number, event: string, data: unknown): void {
  const set = connections.get(draftId);
  if (!set) return;

  const message = formatSSE(event, data);
  for (const conn of set) {
    try {
      conn.reply.raw.write(message);
    } catch {
      removeConnection(draftId, conn);
    }
  }
}

export function getConnectionCount(draftId: number): number {
  return connections.get(draftId)?.size ?? 0;
}

/** Clear all connections — useful for tests */
export function clearAll(): void {
  for (const [draftId, set] of connections) {
    for (const conn of set) {
      clearInterval(conn.heartbeat);
    }
    set.clear();
  }
  connections.clear();
}
