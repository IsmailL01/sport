// WebSocket-based RealtimeAdapter с auto-reconnect (exponential backoff).
// Phase 8 / A5.
//
// Использует built-in RN WebSocket (нет extra deps). Reconnect:
//   1s → 2s → 4s → 8s → 16s → 30s (cap), + random jitter [0, 1s)
// Reset backoff на successful open.

import type {
  RealtimeAdapter, RealtimeEvent, RealtimeListener,
  RealtimeStatus, StatusListener,
} from '../RealtimeAdapter';

const RECONNECT_MAX_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const URL_FACTORY_KEY = '__url_factory__'; // private-ish

type URLFactory = (token: string, deviceID: string) => string;

export class WebSocketRealtimeAdapter implements RealtimeAdapter {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = 'idle';
  private listeners = new Set<RealtimeListener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private accessToken: string | null = null;
  private deviceID: string | null = null;
  private intentionalClose = false;
  private urlFactory: URLFactory;

  constructor(urlFactory: URLFactory) {
    this.urlFactory = urlFactory;
  }

  async connect(accessToken: string, deviceID: string): Promise<void> {
    this.intentionalClose = false;
    this.accessToken = accessToken;
    this.deviceID = deviceID;
    this.openWS();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws !== null) {
      try { this.ws.close(1000, 'client disconnect'); } catch { /* ignore */ }
    }
    this.ws = null;
    this.setStatus('idle');
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  send(payload: unknown): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
  }

  on(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  // === internals ===

  private openWS(): void {
    if (this.accessToken === null || this.deviceID === null) return;
    this.setStatus(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');
    const url = this.urlFactory(this.accessToken, this.deviceID);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn('[WS] new WebSocket failed', e);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.startPing();
    };

    ws.onmessage = (ev: MessageEvent) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      if (!data) return;
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch {
        if (__DEV__) console.warn('[WS] non-JSON frame', data.slice(0, 100));
        return;
      }
      const e = parsed as RealtimeEvent;
      // ready frame от realtime-gw — нет 'event' поля, пропускаем.
      if (!('event' in e) || typeof e.event !== 'string') return;
      this.listeners.forEach((l) => {
        try { l(e); } catch (err) { console.warn('[WS] listener error', err); }
      });
    };

    ws.onerror = (ev) => {
      if (__DEV__) console.warn('[WS] error', ev);
    };

    ws.onclose = () => {
      this.clearPing();
      this.ws = null;
      if (this.intentionalClose) {
        this.setStatus('idle');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    this.setStatus('reconnecting');
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempts), RECONNECT_MAX_MS);
    const jitter = Math.floor(Math.random() * 1000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWS();
    }, base + jitter);
  }

  private startPing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(s: RealtimeStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => {
      try { l(s); } catch (e) { console.warn('[WS] status listener error', e); }
    });
  }
}

// Удалим private-ish key которая нигде не используется, но оставляем экспорт в case если что
export { URL_FACTORY_KEY as _URL_FACTORY_KEY };
