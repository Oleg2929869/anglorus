import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getForm, startResponse, submitAnswer, finishResponse } from '../api.js';
import { useRecorder } from '../useRecorder.js';

const KIND_LABEL = { video: '🎬 видео', audio: '🎤 аудио', text: '⌨️ текст' };

export default function Respond() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [step, setStep] = useState(0); // индекс вопроса в form.questions
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

  // Определяет следующий шаг после ответа на вопрос q
  function stepAfter(q, chosenOptionNext) {
    const idx = form.questions.findIndex((x) => x.id === q.id);
    if (q.type === 'choice' && chosenOptionNext) {
      if (chosenOptionNext === 'end') return 'finish';
      const target = form.questions.findIndex((x) => x.id === chosenOptionNext);
      if (target >= 0) return target;
    }
    return idx >= form.questions.length - 1 ? 'finish' : idx + 1;
  }

  async function submitOpenAnswer(q) {
    if (!rec.file && !text.trim()) {
      setError('Запишите ответ или введите текст');
      return;
    }
    const rid = await ensureResponse();
    if (rec.file) {
      const kind = rec.file.type.startsWith('audio') ? 'audio' : 'video';
      await submitAnswer(rid, { questionId: q.id, kind, mediaFile: rec.file });
    } else {
      await submitAnswer(rid, { questionId: q.id, kind: 'text', text: text.trim() });
    }
    rec.reset();
    setText('');
  }

  async function handleNext() {
    const q = form.questions[step];
    if (!q) return;
    setError(null);
    if (q.type !== 'choice' && !q.allowed_answers.some((k) => rec.file || text.trim())) {
      setError('Запишите ответ или введите текст');
      return;
    }
    setSubmitting(true);
    try {
      if (q.type === 'choice') return; // обрабатывается в handleChoice
      await submitOpenAnswer(q);
      const next = stepAfter(q, null);
      setStep(next);
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
      const next = stepAfter(q, res.next ?? option.next);
      setStep(next);
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
  if (done) {
    return (
      <div className="page respond done">
        <div className="card done-card">
          <h1>✅ Спасибо!</h1>
          <p>Ваш ответ отправлен.</p>
        </div>
      </div>
    );
  }

  const question = typeof step === 'number' ? form.questions[step] : null;
  const showContactStep = step === 'finish' && form.collect_contact;
  const showByeStep = step === 'finish' && !form.collect_contact;

  return (
    <div className="page respond">
      <div className="respond-card card">
        <div className="respond-header">
          <h1>{form.title}</h1>
          {question && <span className="muted">шаг {step + 1} из {form.questions.length}</span>}
        </div>

        {form.questions.length === 0 && <p className="muted">В этой форме пока нет вопросов.</p>}

        {question && question.type === 'choice' && (
          <>
            {question.media_path && (
              <video className="question-video big" src={`/${question.media_path}`} controls autoPlay />
            )}
            <p className="prompt">{question.prompt}</p>
            <div className="choices">
              {question.options.map((o) => (
                <button
                  key={o.id}
                  className="choice-btn"
                  disabled={submitting}
                  onClick={() => handleChoice(question, o)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {error && <div className="error">{error}</div>}
          </>
        )}

        {question && question.type !== 'choice' && (
          <>
            {question.media_path && (
              <video className="question-video big" src={`/${question.media_path}`} controls autoPlay />
            )}
            <p className="prompt">{question.prompt}</p>

            {question.allowed_answers.includes('video') && (
              <button className="primary" onClick={() => rec.start('video')} disabled={rec.recording}>
                🎬 Ответить видео
              </button>
            )}
            {question.allowed_answers.includes('audio') && (
              <button className="primary" onClick={() => rec.start('audio')} disabled={rec.recording}>
                🎤 Ответить аудио
              </button>
            )}
            {rec.recording && (
              <button className="danger" onClick={rec.stop}>⏹ Остановить запись</button>
            )}
            {question.allowed_answers.includes('text') && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="…или напишите ответ текстом"
                rows={3}
              />
            )}
            {rec.previewUrl && rec.file && rec.file.type.startsWith('audio') && (
              <audio src={rec.previewUrl} controls />
            )}
            {rec.previewUrl && rec.file && !rec.file.type.startsWith('audio') && (
              <video className="question-video" src={rec.previewUrl} controls />
            )}
            {rec.error && <div className="error">{rec.error}</div>}
            <button className="next" onClick={handleNext} disabled={submitting}>
              {stepAfter(question, null) === 'finish' ? 'Далее →' : 'Следующий шаг →'}
            </button>
          </>
        )}

        {showContactStep && (
          <form className="contact-form" onSubmit={handleFinish}>
            <h2>Оставьте контакты (необязательно)</h2>
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
            <button className="primary" type="submit" disabled={submitting}>
              ✅ Отправить ответы
            </button>
          </form>
        )}

        {showByeStep && (
          <button className="primary" onClick={async () => {
            setSubmitting(true);
            try {
              const rid = await ensureResponse();
              await finishResponse(rid, { status: 'completed' });
              markDone();
            } finally {
              setSubmitting(false);
            }
          }} disabled={submitting}>
            ✅ Отправить ответы
          </button>
        )}
      </div>
    </div>
  );
}
