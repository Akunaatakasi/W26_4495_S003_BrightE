import { useState, useEffect, useRef } from 'react';
import { PhoneIcon, LaptopIcon } from './CallIcons';
import styles from './NurseCall.module.css';

/**
 * In-call modal for nurse: audio or video call to a patient.
 * Uses getUserMedia for nurse's mic (and camera for video). Patient side is placeholder
 * until a signaling/WebRTC backend is connected.
 */
export default function NurseCall({ patientName, caseId, mode, onClose }) {
  const [status, setStatus] = useState('requesting'); // requesting | connected | error
  const [errorMessage, setErrorMessage] = useState('');
  const [muted, setMuted] = useState(false);
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);

  const isVideo = mode === 'video';

  useEffect(() => {
    const constraints = isVideo
      ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
      : { audio: true, video: false };

    let stream = null;
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        stream = s;
        streamRef.current = s;
        if (s.getVideoTracks().length > 0 && localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
        setStatus('connected');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Could not access microphone' + (isVideo ? ' or camera' : ''));
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
    };
  }, [isVideo]);

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

        {status === 'connected' && (
          <div className={styles.body}>
            <div className={styles.videoGrid}>
              <div className={styles.remoteTile}>
                <div className={styles.placeholder}>
                  <span className={styles.placeholderIcon}>{isVideo ? <LaptopIcon /> : <PhoneIcon />}</span>
                  <span>Patient will appear here when they join</span>
                  <span className={styles.placeholderHint}>In production, connect via WebRTC or your telemedicine provider.</span>
                </div>
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
