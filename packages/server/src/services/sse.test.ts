import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addConnection, removeConnection, broadcast, getConnectionCount, formatSSE, clearAll } from './sse.js';
import type { FastifyReply } from 'fastify';

function mockReply(): FastifyReply {
  return {
    raw: {
      write: vi.fn(),
    },
  } as unknown as FastifyReply;
}

beforeEach(() => {
  vi.useFakeTimers();
  clearAll();
});

describe('formatSSE', () => {
  it('formats event and JSON data correctly', () => {
    const result = formatSSE('state', { foo: 1 });
    expect(result).toBe('event: state\ndata: {"foo":1}\n\n');
  });
});

describe('addConnection / removeConnection', () => {
  it('adds a connection and increments count', () => {
    const reply = mockReply();
    addConnection(1, reply);
    expect(getConnectionCount(1)).toBe(1);
  });

  it('tracks multiple connections per draft', () => {
    addConnection(1, mockReply());
    addConnection(1, mockReply());
    expect(getConnectionCount(1)).toBe(2);
  });

  it('tracks connections for different drafts independently', () => {
    addConnection(1, mockReply());
    addConnection(2, mockReply());
    expect(getConnectionCount(1)).toBe(1);
    expect(getConnectionCount(2)).toBe(1);
  });

  it('removes a connection and decrements count', () => {
    const reply = mockReply();
    const conn = addConnection(1, reply);
    removeConnection(1, conn);
    expect(getConnectionCount(1)).toBe(0);
  });

  it('cleans up map entry when last connection is removed', () => {
    const reply = mockReply();
    const conn = addConnection(1, reply);
    removeConnection(1, conn);
    // getConnectionCount returns 0 for missing keys
    expect(getConnectionCount(1)).toBe(0);
  });

  it('sends heartbeat every 30 seconds', () => {
    const reply = mockReply();
    addConnection(1, reply);
    vi.advanceTimersByTime(30_000);
    expect(reply.raw.write).toHaveBeenCalledWith(': heartbeat\n\n');
  });

  it('clears heartbeat on removeConnection', () => {
    const reply = mockReply();
    const conn = addConnection(1, reply);
    removeConnection(1, conn);
    vi.advanceTimersByTime(60_000);
    // write should never have been called (heartbeat cleared before it fired)
    expect(reply.raw.write).not.toHaveBeenCalled();
  });
});

describe('broadcast', () => {
  it('writes SSE-formatted message to all connections for a draft', () => {
    const reply1 = mockReply();
    const reply2 = mockReply();
    addConnection(1, reply1);
    addConnection(1, reply2);

    broadcast(1, 'state', { value: 42 });

    const expected = 'event: state\ndata: {"value":42}\n\n';
    expect(reply1.raw.write).toHaveBeenCalledWith(expected);
    expect(reply2.raw.write).toHaveBeenCalledWith(expected);
  });

  it('does not write to connections for other drafts', () => {
    const reply1 = mockReply();
    const reply2 = mockReply();
    addConnection(1, reply1);
    addConnection(2, reply2);

    broadcast(1, 'state', { value: 1 });

    expect(reply1.raw.write).toHaveBeenCalled();
    expect(reply2.raw.write).not.toHaveBeenCalled();
  });

  it('is a no-op when no connections exist for the draft', () => {
    // Should not throw
    broadcast(999, 'state', { value: 1 });
  });

  it('removes connection if write throws', () => {
    const reply = mockReply();
    (reply.raw.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('connection closed');
    });
    addConnection(1, reply);

    broadcast(1, 'state', { data: 'test' });

    expect(getConnectionCount(1)).toBe(0);
  });
});
