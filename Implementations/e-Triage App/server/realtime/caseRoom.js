let impl = (_caseId, _payload) => {};

export function registerCaseRoomBroadcast(fn) {
  impl = fn;
}

export function broadcastCaseRoom(caseId, payload) {
  impl(caseId, payload);
}
