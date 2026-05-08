import { MockRealtimeAdapter } from '../realtime/adapters/MockRealtimeAdapter';
import type { RealtimeEvent, RealtimeStatus } from '../realtime/RealtimeAdapter';

describe('MockRealtimeAdapter', () => {
  it('connect → status transitions idle → connected', async () => {
    const a = new MockRealtimeAdapter();
    const states: RealtimeStatus[] = [];
    a.onStatus((s) => states.push(s));
    await a.connect();
    expect(states).toContain('connected');
    expect(a.isConnected()).toBe(true);
  });

  it('disconnect returns to idle', async () => {
    const a = new MockRealtimeAdapter();
    await a.connect();
    a.disconnect();
    expect(a.isConnected()).toBe(false);
  });

  it('emit() dispatches к listeners', () => {
    const a = new MockRealtimeAdapter();
    const received: RealtimeEvent[] = [];
    a.on((e) => received.push(e));
    a.emit({
      event: 'message.new', messageId: 'm1', conversationId: 'c1',
      senderId: 's1', clientMsgId: 'cm1', kind: 'text',
      body: 'hi', replyToId: null, createdAt: '2026-05-08T00:00:00Z',
    } as RealtimeEvent);
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe('message.new');
  });

  it('unsubscribe останавливает доставку', () => {
    const a = new MockRealtimeAdapter();
    const received: RealtimeEvent[] = [];
    const unsub = a.on((e) => received.push(e));
    unsub();
    a.emit({ event: 'message.deleted', messageId: 'x', conversationId: 'c', deletedBy: 'u' } as RealtimeEvent);
    expect(received).toHaveLength(0);
  });
});
