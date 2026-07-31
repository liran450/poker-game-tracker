/**
 * A minimal in-memory stand-in for the slice of `@supabase/supabase-js`'s
 * `SupabaseClient` that `src/data/realtime.ts` uses — `channel().on().subscribe()`
 * and `removeChannel()`. Same rationale as `fakePostgrestClient.ts`/
 * `fakeAuthClient.ts`.
 */

type Handler = () => void;

export class FakeRealtimeChannel {
  handlers: Handler[] = [];
  subscribed = false;
  removed = false;

  constructor(readonly name: string) {}

  on(_type: string, _filter: unknown, handler: Handler): this {
    this.handlers.push(handler);
    return this;
  }

  subscribe(): this {
    this.subscribed = true;
    return this;
  }

  /** Test-only: simulates a matching Postgres change arriving over the socket. */
  emit(): void {
    for (const handler of this.handlers) handler();
  }
}

export class FakeRealtimeClient {
  readonly channels: FakeRealtimeChannel[] = [];

  channel(name: string): FakeRealtimeChannel {
    const ch = new FakeRealtimeChannel(name);
    this.channels.push(ch);
    return ch;
  }

  removeChannel(channel: FakeRealtimeChannel): Promise<'ok'> {
    channel.removed = true;
    return Promise.resolve('ok');
  }
}
