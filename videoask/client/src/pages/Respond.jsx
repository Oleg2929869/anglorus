import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getForm, startResponse, submitAnswer, finishResponse } from '../api.js';
import { useRecorder } from '../useRecorder.js';

const KIND_LABEL = { video: '🎬 видео', audio: '🎤 аудио', text: '⌨️ текст' };

export default function Respond() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
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

  const question = form && form.questions[step];
  const isLastQuestion = form && step === form.questions.length - 1;
  const needContact = form && form.collect_contact;

  async function handleNext() {
    if (!question) return;
    setError(null);
    if (!rec.file && question.allowed_answers.includes('text') === false) {
      setError('Запишите ответ перед продолжением');
      return;
    }
    if (question.allowed_answers.includes('text') && !rec.file && !text.trim()) {
      setError('Запишите ответ или введите текст');
      return;
    }
    setSubmitting(true);
    try {
      const rid = await ensureResponse();
      if (rec.file) {
        const kind = rec.file.type.startsWith('audio') ? 'audio' : 'video';
        await submitAnswer(rid, { questionId: question.id, kind, mediaFile: rec.file });
      } else {
        await submitAnswer(rid, { questionId: question.id, kind: 'text', text: text.trim() });
      }
      rec.reset();
      setText('');
      if (isLastQuestion) {
        setStep(form.questions.length);
      } else {
        setStep(step + 1);
      }
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
      setDone(true);
      doneRef.current = true;
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

  const showContactStep = step === form.questions.length && needContact;

  return (
    <div className="page respond">
      <div className="respond-card card">
        <div className="respond-header">
          <h1>{form.title}</h1>
          <span className="muted">
            {showContactStep ? 'Почти готово' : `Вопрос ${step + 1} из ${form.questions.length}`}
          </span>
        </div>

        {form.questions.length === 0 && <p className="muted">В этой форме пока нет вопросов.</p>}

        {!showContactStep && question && (
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
              {isLastQuestion ? 'Далее →' : 'Следующий вопрос →'}
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

        {!needContact && step === form.questions.length && !done && (
          <ContactlessFinish onDone={() => { setDone(true); doneRef.current = true; }} responseRef={responseIdRef} />
        )}
      </div>
    </div>
  );
}

function ContactlessFinish({ onDone, responseRef }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const rid = responseRef.current;
          if (rid) await finishResponse(rid, { status: 'completed' });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      ✅ Отправить ответы
    </button>
  );
}
