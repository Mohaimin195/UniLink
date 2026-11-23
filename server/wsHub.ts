import type WebSocket from 'ws';

type BroadcastPayload = {
  type: string;
  data: unknown;
};

class WsHub {
  private clientsByUser = new Map<string, Set<WebSocket>>();

  register(userId: string, ws: WebSocket) {
    let set = this.clientsByUser.get(userId);
    if (!set) {
      set = new Set();
      this.clientsByUser.set(userId, set);
    }
    set.add(ws);
  }

  unregister(userId: string, ws: WebSocket) {
    const set = this.clientsByUser.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.clientsByUser.delete(userId);
    }
  }

  isUserOnline(userId: string): boolean {
    const set = this.clientsByUser.get(userId);
    return Boolean(set && set.size > 0);
  }

  sendToUser(userId: string, payload: BroadcastPayload) {
    const set = this.clientsByUser.get(userId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(raw);
      }
    }
  }

  sendToUsers(userIds: string[], payload: BroadcastPayload) {
    for (const uid of userIds) {
      this.sendToUser(uid, payload);
    }
  }
}

export const wsHub = new WsHub();
