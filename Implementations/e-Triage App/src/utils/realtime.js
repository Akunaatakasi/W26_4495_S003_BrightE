export function createRealtimeSocket(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = new URL(`${protocol}//${host}/ws`);
  if (token) url.searchParams.set('token', token);
  return new WebSocket(url.toString());
}

export function roomForCase(caseId) {
  return `case:${caseId}`;
}

export function sendWs(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
}
