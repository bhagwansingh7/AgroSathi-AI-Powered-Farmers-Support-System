import { io } from 'socket.io-client';

let socket = null;

// One shared socket per logged-in session. Auth uses the HTTP-only cookie (withCredentials).
// socket.io-client reconnects automatically with exponential backoff.
export function getSocket() {
  if (!socket) {
    socket = io('/', { withCredentials: true, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 8000 });
  }
  return socket;
}

export function closeSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
