export interface NocoDbConfig { baseUrl: string; apiToken: string; eventsTableId?: string; snapshotsTableId?: string; }

export class NocoDbClient {
  constructor(private readonly config: NocoDbConfig) {}
  get enabled() { return Boolean(this.config.baseUrl && this.config.apiToken); }
  async insert(tableId: string | undefined, record: Record<string, unknown>) {
    if (!this.enabled || !tableId) return { skipped: true } as const;
    const response = await fetch(this.config.baseUrl.replace(/\/$/, '') + '/api/v2/tables/' + encodeURIComponent(tableId) + '/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xc-token': this.config.apiToken },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error('NocoDB ' + response.status + ': ' + (await response.text()).slice(0, 500));
    return { skipped: false, value: await response.json() };
  }
  async syncEvent(tableId: string | undefined, payload: Record<string, unknown>) {
    return this.insert(tableId, payload);
  }
}
