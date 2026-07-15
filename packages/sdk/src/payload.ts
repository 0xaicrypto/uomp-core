import { Transport } from './transport.js';
import type { PayloadInfo } from './types.js';

export class PayloadClient {
  constructor(private transport: Transport) {}

  async upload(data: string | Buffer | Uint8Array, contentType = 'application/octet-stream'): Promise<string> {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data as any);
    const resp = await this.transport.request('/v1/payload/upload', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      throw errBody;
    }
    const result = await resp.json() as PayloadInfo;
    return result.payload_id;
  }

  async download(id: string): Promise<Buffer> {
    const resp = await this.transport.request(`/v1/payload/${encodeURIComponent(id)}`);
    if (!resp.ok) throw new Error(`Payload ${id} not found`);
    const text = await resp.text();
    return Buffer.from(text, 'utf-8');
  }

  async info(id: string): Promise<PayloadInfo> {
    const resp = await this.transport.request(`/v1/payload/${encodeURIComponent(id)}`);
    if (!resp.ok) throw new Error(`Payload ${id} not found`);
    return { payload_id: id, size: 0 };
  }
}
