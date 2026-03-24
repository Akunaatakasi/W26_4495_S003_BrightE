import { useState, useEffect, useRef } from 'react';
import { PhoneIcon, LaptopIcon } from './CallIcons';
import { useAuth } from '../context/AuthContext';
import { createRealtimeSocket, roomForCase, sendWs } from '../utils/realtime';
import styles from './NurseCall.module.css';

/**
 * In-call modal for nurse: audio or video call to a patient.
 * Uses getUserMedia + WebSocket signaling + simple-peer WebRTC.
 */
export default function NurseCall({ patientName, caseId, mode, onClose }) {
  const { token } = useAuth();
  const [status, setStatus] = useState('requesting'); // requesting | ready | in_call | error
  const [errorMessage, setErrorMessage] = useState('');
  const [muted, setMuted] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);

  const isVideo = mode === 'video';

  useEffect(() => {
    let cancelled = false;
    let PeerCtor = null;
    const constraints = isVideo
      ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
      : { audio: true, video: false };

    let stream = null;
    import('simple-peer/simplepeer.min.js')
      .then((mod) => {
        PeerCtor = mod.default;
        return navigator.mediaDevices.getUserMedia(constraints);
      })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        const ws = createRealtimeSocket(token);
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
          if (msg.type === 'joined-room' || msg.type === 'peer-joined') {
            const hasPatient = (msg.peers || []).some((p) => p.role === 'patient') || msg.role === 'patient';
            if (hasPatient && !peerRef.current) {
              const peer = new PeerCtor({ initiator: true, trickle: true, stream: s });
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
            } else if (!peerRef.current) {
              setStatus('ready');
            }
            return;
          }
          if (msg.type === 'webrtc-signal' && peerRef.current) {
            peerRef.current.signal(msg.signal);
          }
        };
        if (s.getVideoTracks().length > 0 && localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
        if (!cancelled) setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Could not access microphone' + (isVideo ? ' or camera' : ''));
      });

    return () => {
      cancelled = true;
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    };
  }, [isVideo, caseId, token]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [muted]);

  const handleEndCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    onClose();
  };

  const displayName = patientName || 'Patient';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${mode} call with ${displayName}`}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>
            {isVideo ? 'Video' : 'Audio'} call — {displayName}
            {caseId != null && <span className={styles.caseId}>Case #{caseId}</span>}
          </span>
          <button type="button" className={styles.closeBtn} onClick={handleEndCall} aria-label="End call">
            ✕
          </button>
        </div>

        {status === 'requesting' && (
          <div className={styles.body}>
            <div className={styles.spinner} aria-hidden />
            <p>Requesting {isVideo ? 'camera and microphone' : 'microphone'}…</p>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.body}>
            <p className={styles.error}>{errorMessage}</p>
            <button type="button" className={styles.endBtn} onClick={handleEndCall}>
              Close
            </button>
          </div>
        )}

        {(status === 'ready' || status === 'in_call') && (
          <div className={styles.body}>
            <div className={styles.videoGrid}>
              <div className={styles.remoteTile}>
                {status === 'in_call' ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className={styles.video} />
                ) : (
                  <div className={styles.placeholder}>
                    <span className={styles.placeholderIcon}>{isVideo ? <LaptopIcon /> : <PhoneIcon />}</span>
                    <span>Waiting for patient to join this case room...</span>
                  </div>
                )}
              </div>
              <div className={styles.localTile}>
                {isVideo ? (
                  <video ref={localVideoRef} autoPlay playsInline muted className={styles.video} />
                ) : (
                  <div className={styles.audioOnly}>
                    <span className={styles.audioIcon}><PhoneIcon /></span>
                    <span>You</span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.controls}>
              <button
                type="button"
                className={muted ? styles.muteBtnActive : styles.muteBtn}
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute' : 'Mute'}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" className={styles.endBtn} onClick={handleEndCall}>
                End call
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
