export type RealtimeFilter = {
  event?: string;
  schema?: string;
  table: string;
  filter: string;
};

export type RealtimeChannelLike = {
  on(event: 'postgres_changes', filter: RealtimeFilter, callback: () => void): RealtimeChannelLike;
  subscribe(): RealtimeChannelLike;
};

export type RealtimeClientLike = {
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): Promise<unknown>;
};

const SPACE_TABLES = [
  ['spaces', 'id'],
  ['timeline_entries', 'space_id'],
  ['plans', 'space_id'],
  ['photos', 'space_id']
] as const;

export function subscribeToSpaceChanges(
  client: RealtimeClientLike,
  spaceId: string,
  onChange: () => void
): () => void {
  const channel = client.channel(`space-sync:${spaceId}`);
  SPACE_TABLES.forEach(([table, key]) => {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `${key}=eq.${spaceId}`
    }, onChange);
  });
  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
