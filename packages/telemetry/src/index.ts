import type { PlatformIdentity } from '@acrylic/contracts';

export type TelemetryEventType = 'agent.started' | 'agent.snapshot' | 'runner.started' | 'runner.status_changed' | 'sheet.opened' | 'sheet.progress' | 'item.queued' | 'item.started' | 'item.placed' | 'item.partial' | 'item.no_fit' | 'item.error' | 'sheet.saved_wait' | 'sheet.saved_output' | 'output.created' | 'runner.finished';

export interface TelemetryEvent<TPayload = Record<string, unknown>> extends PlatformIdentity {
  eventId: string;
  eventType: TelemetryEventType;
  occurredAt: string;
  runId?: string;
  sheetId?: string;
  itemId?: string;
  payload: TPayload;
}

export function createEvent<TPayload>(identity: PlatformIdentity, eventType: TelemetryEventType, payload: TPayload, refs: Pick<TelemetryEvent, 'runId' | 'sheetId' | 'itemId'> = {}): TelemetryEvent<TPayload> {
  return { eventId: crypto.randomUUID(), eventType, occurredAt: new Date().toISOString(), toolId: identity.toolId, machineId: identity.machineId, ...refs, payload };
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<TelemetryEvent>;
  return typeof event.eventId === 'string' && typeof event.eventType === 'string' && typeof event.occurredAt === 'string' && typeof event.toolId === 'string' && typeof event.machineId === 'string' && typeof event.payload === 'object';
}
