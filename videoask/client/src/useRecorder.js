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
  const fileRef = useRef(null);
  const kindRef = useRef('video');
  const onstopFiredRef = useRef(false);
  const [diag, setDiag] = useState(null);

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
    fileRef.current = null;
    chunksRef.current = [];
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
      kindRef.current = kind;
      const buildResult = () => {
        if (fileRef.current || !chunksRef.current.length) return;
        const type = recorder.mimeType || (kindRef.current === 'audio' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(chunksRef.current, { type });
        setPreviewUrl(URL.createObjectURL(blob));
        const file = new File([blob], 'answer.webm', { type });
        fileRef.current = file;
        setFile(file);
      };
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        onstopFiredRef.current = true;
        buildResult();
        cleanup();
      };
      recorder.onerror = (e) => {
        setError('Ошибка записи: ' + ((e.error && e.error.name) || 'unknown'));
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
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* уже остановлен */ }
    }
    setRecording(false);
    setTimeout(() => {
      const bytes = chunksRef.current.reduce((n, c) => n + c.size, 0);
      if (!fileRef.current && chunksRef.current.length) {
        const type = recorder && recorder.mimeType
          ? recorder.mimeType
          : kindRef.current === 'audio' ? 'audio/webm' : 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        setPreviewUrl(URL.createObjectURL(blob));
        const file = new File([blob], 'answer.webm', { type });
        fileRef.current = file;
        setFile(file);
      }
      setDiag({
        chunks: chunksRef.current.length,
        bytes,
        onstop: onstopFiredRef.current,
        fileBuilt: !!fileRef.current,
        state: recorder ? recorder.state : 'none',
        mime: recorder && recorder.mimeType ? recorder.mimeType : 'default',
      });
      if (!fileRef.current) {
        setError('Запись не собралась в файл. Данные: ' + chunksRef.current.length + ' фрагм., ' + bytes + ' байт. Попробуйте записать дольше 2 секунд.');
      }
      cleanup();
    }, 600);
  }, [cleanup]);

  const setUploadedFile = useCallback((f, url) => {
    fileRef.current = f;
    setFile(f);
    setPreviewUrl(url);
  }, []);

  const reset = useCallback(() => {
    fileRef.current = null;
    onstopFiredRef.current = false;
    setDiag(null);
    chunksRef.current = [];
    setPreviewUrl(null);
    setFile(null);
    setError(null);
  }, []);

  return { recording, liveStream, lastKind, startedAt, previewUrl, file, error, diag, start, stop, setUploadedFile, reset };
}
