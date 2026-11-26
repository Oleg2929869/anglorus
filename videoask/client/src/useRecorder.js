import { useCallback, useEffect, useRef, useState } from 'react';

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [liveStream, setLiveStream] = useState(null);
  const [lastKind, setLastKind] = useState('video');
  const [startedAt, setStartedAt] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLiveStream(null);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async (kind) => {
    setError(null);
    setPreviewUrl(null);
    setFile(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Браузер не поддерживает запись видео. Откройте страницу по https:// или на localhost (в Chrome, Edge или Firefox).');
      return;
    }
    if (!window.MediaRecorder) {
      setError('Браузер не поддерживает MediaRecorder. Используйте Chrome, Edge, Firefox или Safari 14.1+.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? { audio: true }
          : {
              audio: true,
              video: { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: 'user' },
            }
      );
      streamRef.current = stream;
      setLiveStream(stream);
      setLastKind(kind);
      const mime = kind === 'audio' ? 'audio/webm' : 'video/webm';
      const options = MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || (kind === 'audio' ? 'audio/webm' : 'video/webm') });
        setPreviewUrl(URL.createObjectURL(blob));
        setFile(new File([blob], 'answer.webm', { type: blob.type || (kind === 'audio' ? 'audio/webm' : 'video/webm') }));
        cleanup();
      };
      recorder.start(1000);
      setStartedAt(Date.now());
      setRecording(true);
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Доступ к камере/микрофону запрещён. Разрешите его в запросе браузера (иконка 🔒 в адресной строке → Камера).');
      } else if (e.name === 'NotFoundError') {
        setError('Камера или микрофон не найдены.');
      } else {
        setError('Не удалось начать запись: ' + (e.message || e.name));
      }
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    setRecording(false);
  }, []);

  const setUploadedFile = useCallback((f, url) => {
    setFile(f);
    setPreviewUrl(url);
  }, []);

  const reset = useCallback(() => {
    setPreviewUrl(null);
    setFile(null);
    setError(null);
  }, []);

  return { recording, liveStream, lastKind, startedAt, previewUrl, file, error, start, stop, setUploadedFile, reset };
}
