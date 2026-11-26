import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getForm, getResponses } from '../api.js';

const STATUS_LABEL = {
  completed: { label: '✅ завершён', cls: 'ok' },
  dropped_out: { label: '🚪 бросил', cls: 'warn' },
  in_progress: { label: '⏳ в процессе', cls: 'muted' },
};

export default function Inbox() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [responses, setResponses] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getForm(id), getResponses(id)])
      .then(([f, r]) => { setForm(f); setResponses(r); })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!form || responses === null) return <div className="page">Загрузка…</div>;

  const questionById = Object.fromEntries(form.questions.map((q) => [q.id, q]));

  return (
    <div className="page">
      <header className="topbar">
        <Link to={`/forms/${id}`}>← {form.title}</Link>
        <h1>📥 Ответы ({responses.length})</h1>
      </header>

      {responses.length === 0 && <p className="muted">Ответов пока нет. Поделитесь ссылкой на форму.</p>}

      <ul className="response-list">
        {responses.map((r) => {
          const st = STATUS_LABEL[r.status] || STATUS_LABEL.in_progress;
          const open = openId === r.id;
          return (
            <li key={r.id} className="card response">
              <button className="response-head" onClick={() => setOpenId(open ? null : r.id)}>
                <span className="avatar-initials">
                  {(r.contact_name || 'А').trim().charAt(0).toUpperCase()}
                </span>
                <strong>{r.contact_name || 'Аноним'}</strong>
                <span className="muted small">{r.created_at}</span>
                <span className={'pill ' + st.cls}>{st.label}</span>
              </button>
              {open && (
                <div className="answers">
                  {r.answers.map((a) => (
                    <div key={a.id} className="answer">
                      <div className="muted small">{questionById[a.question_id]?.prompt}</div>
                      {['text', 'choice'].includes(a.kind) ? (
                        <p>{a.kind === 'choice' ? '🔘 ' : ''}{a.text_value}</p>
                      ) : a.kind === 'audio' ? (
                        <audio src={`/${a.media_path}`} controls />
                      ) : (
                        <video className="question-video" src={`/${a.media_path}`} controls />
                      )}
                    </div>
                  ))}
                  {r.answers.length === 0 && <p className="muted">Нет ответов.</p>}
                  {r.contact_email && <p className="small">📧 {r.contact_email}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
