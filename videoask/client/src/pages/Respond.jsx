import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getForm, startResponse, submitAnswer, finishResponse } from '../api.js';
import { useRecorder } from '../useRecorder.js';

export default function Respond() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const responseIdRef = useRef(null);
  const doneRef = useRef(false);
  const rec = useRecorder();

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
            <video src={`/${firstVideo}`} muted playsInline preload="metadata" />
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
      <div className="widget-overlay" onClick={(e) => e.target === e.currentTarget && setExpanded(false)}>
        <div className="phone-card">
          <button className="phone-close" onClick={() => setExpanded(false)} aria-label="Свернуть">✕</button>

          <video
            className="phone-video"
            src={question && question.media_path ? `/${question.media_path}` : firstVideo ? `/${firstVideo}` : undefined}
            controls
            autoPlay
          />

          <div className="phone-body">
            {form.questions.length === 0 && <p className="muted">В этой форме пока нет вопросов.</p>}

            {done && (
              <div className="done-card card">
                <h1>✅ Спасибо!</h1>
                <p>Ваш ответ отправлен.</p>
              </div>
            )}

            {!done && question && (
              <>
                <div className="phone-topline">
                  <h1>{form.title}</h1>
                  <span className="muted">шаг {step + 1}/{form.questions.length}</span>
                </div>
                <p className="prompt">{question.prompt}</p>

                {question.type === 'choice' ? (
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
                ) : (
                  <>
                    <div className="rec-btns">
                      {question.allowed_answers.includes('video') && (
                        <button className="primary" onClick={() => rec.start('video')} disabled={rec.recording}>
                          🎬 Видео
                        </button>
                      )}
                      {question.allowed_answers.includes('audio') && (
                        <button className="primary" onClick={() => rec.start('audio')} disabled={rec.recording}>
                          🎤 Аудио
                        </button>
                      )}
                      {rec.recording && (
                        <button className="danger" onClick={rec.stop}>⏹ Стоп</button>
                      )}
                    </div>
                    {question.allowed_answers.includes('text') && (
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="…или напишите текстом"
                        rows={3}
                      />
                    )}
                    {rec.previewUrl && rec.file && rec.file.type.startsWith('audio') && (
                      <audio className="preview-media" src={rec.previewUrl} controls />
                    )}
                    {rec.previewUrl && rec.file && !rec.file.type.startsWith('audio') && (
                      <video className="preview-media" src={rec.previewUrl} controls />
                    )}
                    {rec.error && <div className="error">{rec.error}</div>}
                    <button className="next" onClick={handleNext} disabled={submitting}>
                      {stepAfter(question, null) === 'finish' ? 'Отправить →' : 'Далее →'}
                    </button>
                  </>
                )}
              </>
            )}

            {!done && !question && (
              form.collect_contact ? (
                <form className="contact-form" onSubmit={handleFinish}>
                  <div className="phone-topline">
                    <h1>Почти готово</h1>
                  </div>
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
                  <div className="phone-topline">
                    <h1>Готово!</h1>
                  </div>
                  <button
                    className="primary"
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
