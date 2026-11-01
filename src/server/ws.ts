import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { ClientMessage } from '../shared/protocol.js';
import type { SimSession } from './sim/session.js';

const BROADCAST_MS = 33;

/** Streams snapshots to browsers and accepts human input from them. */
export async function registerLive(app: FastifyInstance, session: SimSession): Promise<void> {
  await app.register(websocket);

  const sockets = new Set<{ send(data: string): void; readyState: number }>();

  app.get('/ws', { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'snapshot', ...session.snapshot() }));

    socket.on('message', (raw: unknown) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (message.type === 'input') {
        session.setHumanInput({
          throttle: message.throttle,
          turn: message.turn,
          lift: message.lift,
          boost: message.boost,
        });
      } else if (message.type === 'pause') {
        session.setPaused(message.paused);
      }
    });

    socket.on('close', () => {
      sockets.delete(socket);
      session.setHumanInput({ throttle: 0, turn: 0, lift: 0, boost: 0 });
    });
  });

  setInterval(() => {
    const payload = JSON.stringify({ type: 'snapshot', ...session.snapshot() });
    for (const socket of sockets) {
      if (socket.readyState === 1) socket.send(payload);
    }
  }, BROADCAST_MS);
}
