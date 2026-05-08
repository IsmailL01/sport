// In-memory RealtimeAdapter для тестов.
import type {
  RealtimeAdapter, RealtimeEvent, RealtimeListener,
  RealtimeStatus, StatusListener,
} from '../RealtimeAdapter';

export class MockRealtimeAdapter implements RealtimeAdapter {
  private listeners = new Set<RealtimeListener>();
  private statusListeners = new Set<StatusListener>();
  private status: RealtimeStatus = 'idle';

  async connect(): Promise<void> { this.setStatus('connected'); }
  disconnect(): void { this.setStatus('idle'); }
  isConnected(): boolean { return this.status === 'connected'; }
  send(_p: unknown): void { /* swallow */ }
  on(l: RealtimeListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onStatus(l: StatusListener): () => void {
    this.statusListeners.add(l);
    l(this.status);
    return () => this.statusListeners.delete(l);
  }
  /** Test-only: имитировать прилёт события. */
  emit(e: RealtimeEvent): void {
    this.listeners.forEach((l) => l(e));
  }
  private setStatus(s: RealtimeStatus): void {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }
}
