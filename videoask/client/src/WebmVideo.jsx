import { useEffect, useRef } from 'react';

// Записи MediaRecorder в Chrome не содержат метаданных длительности
// (duration: Infinity). Форсировать пересчёт большим seek нельзя — браузер
// шлёт невыполнимый Range-запрос (416) и видео перестаёт грузиться. Здесь
// только безопасный маленький seek на 0.1 сек, чтобы отрисовался первый
// пригодный кадр (нулевой кадр записей часто чёрный).
export default function WebmVideo({ src, className, autoPlay, playsInline }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seekToFrame = () => {
      if (!autoPlay && v.readyState >= 2) {
        try { v.currentTime = 0.1; } catch { /* недостаточно данных */ }
      }
    };
    if (v.readyState >= 1) seekToFrame();
    else v.addEventListener('loadeddata', seekToFrame, { once: true });
    return () => v.removeEventListener('loadeddata', seekToFrame);
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
