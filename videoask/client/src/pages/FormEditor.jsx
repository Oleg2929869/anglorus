import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getForm, addQuestion, deleteQuestion } from '../api.js';
import { useRecorder } from '../useRecorder.js';

const ALL_KINDS = ['video', 'audio', 'text'];
const KIND_LABEL = { video: 'видео', audio: 'аудио', text: 'текст' };

export default function FormEditor() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [allowed, setAllowed] = useState(['video', 'audio', 'text']);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const rec = useRecorder();

  useEffect(() => { getForm(id).then(setForm).catch((e) => setError(e.message)); }, [id]);

  function toggleKind(k) {
    setAllowed((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    if (allowed.length === 0) return setError('Выберите хотя бы один тип ответа');
    setSaving(true);
    try {
      const updated = await addQuestion(id, { prompt: prompt.trim(), allowedAnswers: allowed, mediaFile: rec.file });
      setForm(updated);
      setPrompt('');
      rec.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion(qid) {
    await deleteQuestion(qid);
    setForm(await getForm(id));
  }

  if (error) return <div className="page"><div className="error">{error}</div></div>;
  if (!form) return <div className="page">Загрузка…</div>;

  const shareUrl = `${location.origin}/f/${form.id}`;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/">← Все формы</Link>
        <h1>{form.title}</h1>
        <Link to={`/forms/${id}/inbox`}>📥 Ответы</Link>
      </header>

      <div className="card share">
        <strong>Ссылка для респондентов:</strong>{' '}
        <code>{shareUrl}</code>{' '}
        <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Копировать</button>
      </div>

      <ol className="question-list">
        {form.questions.map((q, i) => (
          <li key={q.id} className="card question">
            <div className="question-head">
              <strong>Вопрос {i + 1}</strong>
              <span className="muted small">
                типы ответов: {q.allowed_answers.map((k) => KIND_LABEL[k]).join(', ')}
              </span>
              <button className="danger small-btn" onClick={() => handleDeleteQuestion(q.id)}>✕</button>
            </div>
            {q.media_path && (
              <video className="question-video" src={`/${q.media_path}`} controls preload="metadata" />
            )}
            <p>{q.prompt}</p>
          </li>
        ))}
        {form.questions.length === 0 && <p className="muted">Вопросов пока нет — добавьте первый ниже.</p>}
      </ol>

      <form className="card add-question" onSubmit={handleAdd}>
        <h2>Новый вопрос</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Текст вопроса / пояснение к видео…"
          rows={2}
        />
        <div className="kinds">
          {ALL_KINDS.map((k) => (
            <label key={k}>
              <input type="checkbox" checked={allowed.includes(k)} onChange={() => toggleKind(k)} />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
        <div className="recorder-row">
          <button type="button" onClick={() => rec.start('video')} disabled={rec.recording || saving}>
            🔴 Записать видео-вопрос
          </button>
          <button type="button" onClick={() => rec.stop()} disabled={!rec.recording}>⏹ Стоп</button>
          <label className="upload-label">
            или файл: <input type="file" accept="video/*,audio/*" onChange={(e) => {
              const f = e.target.files[0];
              if (f) rec.setUploadedFile(f, URL.createObjectURL(f));
            }} />
          </label>
        </div>
        {rec.error && <div className="error">{rec.error}</div>}
        {rec.previewUrl && (
          <video className="question-video" src={rec.previewUrl} controls />
        )}
        <button type="submit" disabled={saving}>
          {saving ? 'Сохранение…' : 'Добавить вопрос'}
        </button>
      </form>
    </div>
  );
}
