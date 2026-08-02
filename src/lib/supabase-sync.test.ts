import { describe, expect, it } from 'vitest';
import { subscribeToSpaceChanges, type RealtimeChannelLike, type RealtimeClientLike } from './supabase-sync';

class FakeChannel implements RealtimeChannelLike {
  filters: string[] = [];
  callback?: () => void;
  subscribed = false;

  on(_event: 'postgres_changes', filter: { table: string; filter: string }, callback: () => void): RealtimeChannelLike {
    this.filters.push(`${filter.table}:${filter.filter}`);
    this.callback = callback;
    return this;
  }

  subscribe(): RealtimeChannelLike {
    this.subscribed = true;
    return this;
  }
}

class FakeClient implements RealtimeClientLike {
  channelInstance = new FakeChannel();
  removed?: RealtimeChannelLike;

  channel(): RealtimeChannelLike {
    return this.channelInstance;
  }

  async removeChannel(channel: RealtimeChannelLike): Promise<void> {
    this.removed = channel;
  }
}

describe('subscribeToSpaceChanges', () => {
  it('subscribes to shared space tables and removes the channel on cleanup', async () => {
    const client = new FakeClient();
    let changes = 0;
    const cleanup = subscribeToSpaceChanges(client, 'space-123', () => { changes += 1; });

    expect(client.channelInstance.subscribed).toBe(true);
    expect(client.channelInstance.filters).toEqual([
      'spaces:id=eq.space-123',
      'timeline_entries:space_id=eq.space-123',
      'plans:space_id=eq.space-123',
      'photos:space_id=eq.space-123'
    ]);

    client.channelInstance.callback?.();
    expect(changes).toBe(1);

    cleanup();
    await Promise.resolve();
    expect(client.removed).toBe(client.channelInstance);
  });
});
