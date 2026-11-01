import type { ClientMessage, ServerMessage } from '../shared/protocol.js';

/** WebSocket link to the authoritative sim. The page never steps the sim itself. */
export class Live {
  #socket?: WebSocket;

  connect(url: string, onMessage: (message: ServerMessage) => void): void {
    const socket = new WebSocket(url);
    socket.addEventListener('message', (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // A malformed frame is not worth tearing the connection down over.
      }
    });
    this.#socket = socket;
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }
}
