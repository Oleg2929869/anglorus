import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getForm, startResponse, submitAnswer, finishResponse } from '../api.js';
import { useRecorder } from '../useRecorder.js';
import LivePreview, { useElapsed } from '../LivePreview.jsx';

export default function Respond() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [expanded, setExpanded] = useState(() => window.self !== window.top);
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const responseIdRef = useRef(null);
  const doneRef = useRef(false);
  const rec = useRecorder();
  const elapsed = useElapsed(rec.recording, rec.startedAt);

  const [contact, setContact] = useState({ name: '', email: '' });

  useEffect(() => {
    getForm(id).then(setForm).catch((e) => setError(e.message));
    return () => {
      if (responseIdRef.current && !doneRef.current) {
        finishResponse(responseIdRef.current, { status: 'dropped_out' }).catch(() => {});
      }
    };
  }, [id]);

  async function ensureResponse() {
    if (!responseIdRef.current) {
      const r = await startResponse(id);
      responseIdRef.current = r.id;
    }
    return responseIdRef.current;
  }

  function markDone() {
    setDone(true);
    doneRef.current = true;
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'va:done' }, '*');
    }
  }

  function collapse() {
    setExpanded(false);
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'va:collapse' }, '*');
    }
  }

  function stepAfter(q, chosenOptionNext) {
    const idx = form.questions.findIndex((x) => x.id === q.id);
    if (q.type === 'choice' && chosenOptionNext) {
      if (chosenOptionNext === 'end') return 'finish';
      const target = form.questions.findIndex((x) => x.id === chosenOptionNext);
      if (target >= 0) return target;
    }
    return idx >= form.questions.length - 1 ? 'finish' : idx + 1;
  }

  async function handleNext() {
    const q = form.questions[step];
    if (!q) return;
    setError(null);
    if (!rec.file && !text.trim()) {
      setError('Запишите ответ или введите текст');
      return;
    }
    setSubmitting(true);
    try {
      const rid = await ensureResponse();
      if (rec.file) {
        const kind = rec.file.type.startsWith('audio') ? 'audio' : 'video';
        await submitAnswer(rid, { questionId: q.id, kind, mediaFile: rec.file });
      } else {
        await submitAnswer(rid, { questionId: q.id, kind: 'text', text: text.trim() });
      }
      rec.reset();
      setText('');
      setStep(stepAfter(q, null));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChoice(q, option) {
    setError(null);
    setSubmitting(true);
    try {
      const rid = await ensureResponse();
      const res = await submitAnswer(rid, { questionId: q.id, kind: 'choice', optionId: option.id });
      setStep(stepAfter(q, res.next ?? option.next));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const rid = await ensureResponse();
      await finishResponse(rid, {
        status: 'completed',
        contactName: contact.name,
        contactEmail: contact.email,
      });
      markDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !form) return <div className="page"><div className="error">{error}</div></div>;
  if (!form) return <div className="page">Загрузка…</div>;

  const firstVideo = form.questions.find((q) => q.media_path)?.media_path;
  const question = typeof step === 'number' ? form.questions[step] : null;

  if (!expanded) {
    return (
      <div className="widget-stage">
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h2>{form.title}</h2>
          <p className="muted">Нажмите на аватар, чтобы начать видео-диалог</p>
        </div>
        <button className="avatar-fab" onClick={() => setExpanded(true)} aria-label="Открыть видео-форму">
          {firstVideo ? (
            <video src={`/${firstVideo}`} muted loop autoPlay playsInline />
          ) : (
            <span className="fab-fallback">💬</span>
          )}
          <span className="fab-badge" />
        </button>
      </div>
    );
  }

  return (
    <div className="widget-stage">
      <div className="widget-overlay" onClick={(e) => e.target === e.currentTarget && collapse()}>
        <div className="phone-card">
          <button className="phone-close" onClick={collapse} aria-label="Свернуть">✕</button>

          {question && question.media_path ? (
            <video
              className="phone-video-fill"
              src={`/${question.media_path}`}
              controls
              autoPlay
              playsInline
            />
          ) : (
            <div className="phone-novideo"><span>🎥</span></div>
          )}
          <div className="phone-scrim" />

          <div className="phone-ui">
            {!done && form.questions.length === 0 && (
              <div className="empty-state">
                <div className="empty-ico">🎬</div>
                <p>В этой форме пока нет вопросов.</p>
                <span>Создатель ещё записывает видео-шаги — заходите позже.</span>
              </div>
            )}

            {done && (
              <>
                <h1 className="phone-title">✅ Спасибо!</h1>
                <p className="muted-onvideo">Ваш ответ отправлен.</p>
              </>
            )}

            {!done && question && (
              <>
                <div className="phone-step">шаг {step + 1} из {form.questions.length}</div>
                <h1 className="phone-title">{form.title}</h1>
                <p className="prompt">{question.prompt}</p>

                {question.type === 'choice' ? (
                  <div className="choices-wrap">
                    <div className="choices">
                      {question.options.map((o, i) => (
                        <button
                          key={o.id}
                          className={'choice-btn' + (i > 0 ? ' outline' : '')}
                          disabled={submitting}
                          onClick={() => handleChoice(question, o)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {stepAfter(question, null) === 'finish' && (
                      <p className="hint-onvideo">Это последний шаг — после выбора форма завершится</p>
                    )}
                  </div>
                ) : (
                  <>
                    {!rec.recording && (
                      <div className="composer">
                        <div className="composer-rec">
                          {question.allowed_answers.includes('video') && (
                            <button
                              type="button"
                              className="rec-orb"
                              onClick={() => { setShowText(false); rec.start('video'); }}
                              aria-label="Записать видео-ответ"
                            >
                              🎬<small>Видео</small>
                            </button>
                          )}
                          {question.allowed_answers.includes('audio') && (
                            <button
                              type="button"
                              className="rec-orb rec-orb-sm"
                              onClick={() => { setShowText(false); rec.start('audio'); }}
                              aria-label="Записать аудио-ответ"
                            >
                              🎤<small>Аудио</small>
                            </button>
                          )}
                        </div>
                        {question.allowed_answers.includes('text') && (
                          <button type="button" className="text-toggle" onClick={() => setShowText((v) => !v)}>
                            {showText ? '↑ Свернуть' : '⌨️ Написать текстом'}
                          </button>
                        )}
                        {showText && (
                          <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Ваш ответ…"
                            rows={3}
                          />
                        )}
                      </div>
                    )}
                    {rec.recording && (
                      <>
                        <LivePreview stream={rec.liveStream} kind={rec.lastKind} elapsed={elapsed} />
                        <button className="stop-btn" onClick={rec.stop}>⏹ Остановить запись</button>
                      </>
                    )}
                    {rec.previewUrl && !rec.recording && rec.file && (
                      <div className="answer-ready">
                        {rec.file.type.startsWith('audio') ? (
                          <audio className="preview-media" src={rec.previewUrl} controls />
                        ) : (
                          <video className="preview-media" src={rec.previewUrl} controls />
                        )}
                        <button type="button" className="rerecord" onClick={() => rec.start(rec.lastKind)}>
                          🔄 Перезаписать
                        </button>
                      </div>
                    )}
                    {rec.error && <div className="error">{rec.error}</div>}
                    <button className="next" onClick={handleNext} disabled={submitting}>
                      {stepAfter(question, null) === 'finish' ? 'Завершить ✓' : 'Следующий шаг →'}
                    </button>
                  </>
                )}
              </>
            )}

            {!done && !question && form.questions.length > 0 && (
              form.collect_contact ? (
                <form className="contact-form" onSubmit={handleFinish}>
                  <h1 className="phone-title">Почти готово</h1>
                  <input
                    value={contact.name}
                    onChange={(e) => setContact({ ...contact, name: e.target.value })}
                    placeholder="Ваше имя"
                  />
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    placeholder="Email"
                  />
                  <button className="primary" type="submit" disabled={submitting}>✅ Отправить ответы</button>
                </form>
              ) : (
                <>
                  <h1 className="phone-title">Готово!</h1>
                  <button
                    className="primary wide"
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        const rid = await ensureResponse();
                        await finishResponse(rid, { status: 'completed' });
                        markDone();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    ✅ Отправить ответы
                  </button>
                </>
              )
            )}

            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
