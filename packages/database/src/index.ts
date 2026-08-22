import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentSnapshot } from '@acrylic/contracts';
import type { TelemetryEvent } from '@acrylic/telemetry';

interface SyncRow { event_id: string; destination: string; payload_json: string; attempts: number; status: 'pending' | 'failed'; last_error?: string; updated_at: string; }
interface StoreData { events: TelemetryEvent[]; snapshots: AgentSnapshot[]; outbox: SyncRow[]; }

function emptyStore(): StoreData {
  return { events: [], snapshots: [], outbox: [] };
}

export class LocalDatabase {
  readonly filePath: string;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.filePath = filePath.endsWith('.json') ? filePath : `${filePath}.json`;
    this.readStore();
  }

  private readStore(): StoreData {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoreData>;
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
        outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
      };
    } catch {
      const store = emptyStore();
      this.writeStore(store);
      return store;
    }
  }

  private writeStore(store: StoreData) {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf8');
  }

  appendEvent(event: TelemetryEvent) {
    const store = this.readStore();
    if (!store.events.some((item) => item.eventId === event.eventId)) store.events.unshift(event);
    store.events = store.events.slice(0, 1000);
    this.writeStore(store);
  }

  enqueueSync(eventId: string, destination: string, payload: unknown) {
    const store = this.readStore();
    if (!store.outbox.some((item) => item.event_id === eventId && item.destination === destination)) {
      store.outbox.push({ event_id: eventId, destination, payload_json: JSON.stringify(payload), attempts: 0, status: 'pending', updated_at: new Date().toISOString() });
    }
    this.writeStore(store);
  }

  pendingSync(limit = 25): Array<{ event_id: string; destination: string; payload_json: string; attempts: number }> {
    return this.readStore().outbox.filter((item) => item.status === 'pending').slice(0, limit).map(({ event_id, destination, payload_json, attempts }) => ({ event_id, destination, payload_json, attempts }));
  }

  markSyncSuccess(eventId: string) {
    const store = this.readStore();
    store.outbox = store.outbox.filter((item) => item.event_id !== eventId);
    this.writeStore(store);
  }

  markSyncFailure(eventId: string, message: string) {
    const store = this.readStore();
    store.outbox = store.outbox.map((item) => item.event_id === eventId ? { ...item, attempts: item.attempts + 1, last_error: message.slice(0, 1000), updated_at: new Date().toISOString() } : item);
    this.writeStore(store);
  }

  recentEvents(limit = 100) {
    return this.readStore().events.slice(0, limit).map((event) => ({
      event_id: event.eventId,
      tool_id: event.toolId,
      machine_id: event.machineId,
      event_type: event.eventType,
      occurred_at: event.occurredAt,
      run_id: event.runId ?? null,
      sheet_id: event.sheetId ?? null,
      item_id: event.itemId ?? null,
      payload_json: JSON.stringify(event.payload),
    }));
  }

  saveSnapshot(snapshot: AgentSnapshot) {
    const store = this.readStore();
    store.snapshots.unshift(snapshot);
    store.snapshots = store.snapshots.slice(0, 200);
    this.writeStore(store);
  }

  listSnapshots(toolId: string, machineId: string, limit = 50): AgentSnapshot[] {
    return this.readStore().snapshots.filter((snapshot) => snapshot.toolId === toolId && snapshot.machineId === machineId).slice(0, limit);
  }

  latestSnapshot(toolId: string, machineId: string): AgentSnapshot | null {
    return this.listSnapshots(toolId, machineId, 1)[0] ?? null;
  }

  close() {}
}