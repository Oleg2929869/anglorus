import { useEffect, useRef, useState } from 'react';

export function useElapsed(recording, startedAt) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!recording || !startedAt) { setSec(0); return; }
    setSec(0);
    const t = setInterval(() => {
      setSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [recording, startedAt]);
  return sec;
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function LivePreview({ stream, kind, elapsed }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  const isVideo = kind === 'video';
  return (
    <div className="live-wrap">
      {isVideo ? (
        <video ref={ref} autoPlay muted playsInline className="live-video live-mirror" />
      ) : (
        <div className="live-audio">
          <span className="live-ico">🎤</span>
          <span>Идёт запись аудио…</span>
        </div>
      )}
      <span className="live-badge">● {fmt(elapsed)}</span>
    </div>
  );
}
