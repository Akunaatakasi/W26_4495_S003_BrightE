import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createRealtimeSocket, roomForCase, sendWs } from '../utils/realtime';
import styles from './NurseCall.module.css';

export default function PatientCall({ caseId, onClose, onTriageUpdate, tokenOverride }) {
  const { token } = useAuth();
  const [status, setStatus] = useState('requesting');
  const [errorMessage, setErrorMessage] = useState('');
  const [muted, setMuted] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);

  useEffect(() => {
    let PeerCtor = null;
    let stream = null;
    import('simple-peer/simplepeer.min.js')
      .then((mod) => {
        PeerCtor = mod.default;
        return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
      })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        if (localVideoRef.current) localVideoRef.current.srcObject = s;

        const wsToken = tokenOverride || token;
        const ws = createRealtimeSocket(wsToken);
        socketRef.current = ws;
        ws.onopen = () => {
          sendWs(ws, { type: 'join-room', roomId: roomForCase(caseId) });
        };
        ws.onmessage = (event) => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.type === 'error') {
            setStatus('error');
            setErrorMessage(msg.message || 'Realtime connection failed');
            return;
          }
          if ((msg.type === 'joined-room' || msg.type === 'peer-joined') && !peerRef.current) {
            const peer = new PeerCtor({ initiator: false, trickle: true, stream: s });
            peerRef.current = peer;
            peer.on('signal', (signal) => sendWs(ws, { type: 'webrtc-signal', signal }));
            peer.on('stream', (remoteStream) => {
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
              setStatus('in_call');
            });
            peer.on('error', (err) => {
              setStatus('error');
              setErrorMessage(err.message || 'WebRTC error');
            });
            peer.on('close', () => setStatus('ready'));
            setStatus('ready');
            return;
          }
          if (msg.type === 'webrtc-signal' && peerRef.current) {
            peerRef.current.signal(msg.signal);
            return;
          }
          if (msg.type === 'triage-update') {
            onTriageUpdate?.(msg);
          }
        };
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Could not access camera/microphone');
      });

    return () => {
      if (peerRef.current) peerRef.current.destroy();
      if (socketRef.current) socketRef.current.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      peerRef.current = null;
      socketRef.current = null;
      streamRef.current = null;
    };
  }, [caseId, token, onTriageUpdate, tokenOverride]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [muted]);

  const handleEnd = () => {
    if (peerRef.current) peerRef.current.destroy();
    if (socketRef.current) socketRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    onClose();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Call for case ${caseId}`}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Telemedicine call — Case #{caseId}</span>
          <button type="button" className={styles.closeBtn} onClick={handleEnd} aria-label="End call">✕</button>
        </div>
        {status === 'requesting' && (
          <div className={styles.body}>
            <div className={styles.spinner} aria-hidden />
            <p>Requesting camera and microphone...</p>
          </div>
        )}
        {status === 'error' && (
          <div className={styles.body}>
            <p className={styles.error}>{errorMessage}</p>
            <button type="button" className={styles.endBtn} onClick={handleEnd}>Close</button>
          </div>
        )}
        {(status === 'ready' || status === 'in_call') && (
          <div className={styles.body}>
            <div className={styles.videoGrid}>
              <div className={styles.remoteTile}>
                {status === 'in_call' ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className={styles.video} />
                ) : (
                  <div className={styles.placeholder}><span>Waiting for nurse to connect...</span></div>
                )}
              </div>
              <div className={styles.localTile}>
                <video ref={localVideoRef} autoPlay playsInline muted className={styles.video} />
              </div>
            </div>
            <div className={styles.controls}>
              <button type="button" className={muted ? styles.muteBtnActive : styles.muteBtn} onClick={() => setMuted((m) => !m)}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" className={styles.endBtn} onClick={handleEnd}>End call</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
