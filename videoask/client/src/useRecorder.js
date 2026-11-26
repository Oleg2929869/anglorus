import { useCallback, useEffect, useRef, useState } from 'react';

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async (kind) => {
    setError(null);
    setPreviewUrl(null);
    setFile(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio' ? { audio: true } : { audio: true, video: true }
      );
      streamRef.current = stream;
      const mime = kind === 'audio' ? 'audio/webm' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : '' });
      mediaRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        setPreviewUrl(URL.createObjectURL(blob));
        setFile(new File([blob], `answer.${kind === 'audio' ? 'webm' : 'webm'}`, { type: mime }));
        cleanup();
      };
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError('Нет доступа к камере/микрофону: ' + e.message);
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

  return { recording, previewUrl, file, error, start, stop, setUploadedFile, reset };
}
