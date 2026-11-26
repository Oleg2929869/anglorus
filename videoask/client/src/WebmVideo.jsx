import { useEffect, useRef } from 'react';

// Записи MediaRecorder в Chrome приходят без метаданных длительности
// (duration: Infinity), из-за чего <video> показывает чёрный кадр и не
// проигрывает файл. Пересчёт duration форсируется установкой currentTime
// на большое число и сбросом назад.
export default function WebmVideo({ src, className, autoPlay, playsInline }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const fix = () => {
      const seekToFrame = () => {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 10);
        if (autoPlay) v.play().catch(() => {});
      };
      if (v.duration === Infinity || isNaN(v.duration)) {
        const onSeek = () => {
          v.removeEventListener('timeupdate', onSeek);
          seekToFrame();
        };
        v.addEventListener('timeupdate', onSeek);
        v.currentTime = 1e101;
      } else if (!autoPlay && v.currentTime === 0) {
        seekToFrame();
      }
    };
    if (v.readyState >= 1) fix();
    else v.addEventListener('loadedmetadata', fix, { once: true });
    return () => v.removeEventListener('loadedmetadata', fix);
  }, [src, autoPlay]);
  return (
    <video
      ref={ref}
      src={src}
      className={className}
      controls
      autoPlay={autoPlay}
      playsInline={playsInline}
      preload="auto"
    />
  );
}
