// Thin WebSocket wrapper with typed message handlers.

export class Connection {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not connect to the server.'));
      ws.onclose = () => this.emit('close', {});
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg && typeof msg.t === 'string') this.emit(msg.t, msg);
      };
    });
  }

  /** Connect unless already connected (failed logins keep the socket open). */
  ensureConnected() {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    return this.connect();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) || []) fn(msg);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
