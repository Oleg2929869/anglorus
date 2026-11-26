import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getForm, addQuestion, deleteQuestion } from '../api.js';
import { useRecorder } from '../useRecorder.js';
import LivePreview, { useElapsed } from '../LivePreview.jsx';

const ALL_KINDS = ['video', 'audio', 'text'];
const KIND_LABEL = { video: 'видео', audio: 'аудио', text: 'текст' };
const KIND_EMOJI = { video: '🎬', audio: '🎤', text: '⌨️' };

const NEXT_LABEL = (q, i) => `→ «${q.prompt.slice(0, 30)}${q.prompt.length > 30 ? '…' : ''}»`;

export default function FormEditor() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState('open');
  const [allowed, setAllowed] = useState(['video', 'audio', 'text']);
  const [options, setOptions] = useState([{ label: '', next: null }]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const rec = useRecorder();
  const elapsed = useElapsed(rec.recording, rec.startedAt);

  useEffect(() => { getForm(id).then(setForm).catch((e) => setError(e.message)); }, [id]);

  function toggleKind(k) {
    setAllowed((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function setOption(i, patch) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    if (allowed.length === 0) return setError('Выберите хотя бы один тип ответа');
    const opts = type === 'choice' ? options.filter((o) => o.label.trim()) : [];
    if (type === 'choice' && opts.length === 0) return setError('Добавьте хотя бы одну кнопку-вариант');
    setSaving(true);
    try {
      const updated = await addQuestion(id, {
        prompt: prompt.trim(),
        type,
        allowedAnswers: allowed,
        options: opts.map((o) => ({ label: o.label.trim(), next: o.next })),
        mediaFile: rec.file,
      });
      setForm(updated);
      setPrompt('');
      setOptions([{ label: '', next: null }]);
      setType('open');
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

  if (error && !form) return <div className="page"><div className="error">{error}</div></div>;
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
              <strong>Шаг {i + 1} {q.type === 'choice' ? '🔘 с кнопками' : '🎤 открытый'}</strong>
              <span className="muted small">
                {q.type === 'choice'
                  ? `вариантов: ${q.options.length}`
                  : `ответы: ${q.allowed_answers.map((k) => KIND_LABEL[k]).join(', ')}`}
              </span>
              <button className="danger small-btn" onClick={() => handleDeleteQuestion(q.id)}>✕</button>
            </div>
            {q.media_path && (
              <video className="question-video" src={`/${q.media_path}`} controls preload="metadata" />
            )}
            <p>{q.prompt}</p>
            {q.type === 'choice' && (
              <ul className="options-list">
                {q.options.map((o) => (
                  <li key={o.id}>
                    <span className="option-label">{o.label}</span>{' '}
                    <span className="muted small">
                      {o.next === 'end'
                        ? '→ завершить форму'
                        : o.next
                          ? NEXT_LABEL(form.questions.find((x) => x.id === o.next), i)
                          : '→ далее по порядку'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {form.questions.length === 0 && <p className="muted">Вопросов пока нет — добавьте первый ниже.</p>}
      </ol>

      <form className="card add-question" onSubmit={handleAdd}>
        <h2>Новый шаг</h2>
        <div className="seg">
          <button type="button" className={'seg-btn' + (type === 'open' ? ' active' : '')} onClick={() => setType('open')}>
            <span className="seg-ico">🎤</span>
            <span>Открытый вопрос<small>ответ видео / аудио / текстом</small></span>
          </button>
          <button type="button" className={'seg-btn' + (type === 'choice' ? ' active' : '')} onClick={() => setType('choice')}>
            <span className="seg-ico">🔘</span>
            <span>Сценарий с кнопками<small>выбор ведёт к разным шагам</small></span>
          </button>
        </div>
        <label className="field-label">Текст вопроса</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Что спросить у респондента…"
          rows={2}
        />

        {type === 'open' && (
          <>
            <label className="field-label">Допустимые типы ответов</label>
            <div className="kinds">
              {ALL_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={'chip' + (allowed.includes(k) ? ' chip-on' : '')}
                  onClick={() => toggleKind(k)}
                >
                  {KIND_EMOJI[k]} {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </>
        )}

        {type === 'choice' && (
          <div className="options-editor">
            <label className="field-label">Кнопки-варианты и переходы</label>
            {options.map((o, i) => (
              <div key={i} className="option-row">
                <span className="option-num">{i + 1}</span>
                <input
                  value={o.label}
                  onChange={(e) => setOption(i, { label: e.target.value })}
                  placeholder={`Вариант ${i + 1}`}
                />
                <select value={o.next ?? ''} onChange={(e) => setOption(i, { next: e.target.value || null })}>
                  <option value="">→ далее по порядку</option>
                  <option value="end">→ завершить</option>
                  <optgroup label="Перейти к шагу:">
                    {form.questions.map((q, qi) => (
                      <option key={q.id} value={q.id}>
                        {NEXT_LABEL(q, qi)}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {options.length > 1 && (
                  <button type="button" className="danger small-btn option-del"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className="add-opt" onClick={() => setOptions((prev) => [...prev, { label: '', next: null }])}>
              + добавить вариант
            </button>
            <p className="muted small">
              Переход возможен только на уже созданные шаги. Сначала добавьте все шаги сценария, затем
              настройте кнопки-переходы.
            </p>
          </div>
        )}

        <label className="field-label">Видео-сообщение к шагу</label>
        <div className="recorder-row">
          {!rec.recording ? (
            <button type="button" className="primary" onClick={() => rec.start('video')} disabled={saving}>
              🔴 Записать с камеры
            </button>
          ) : (
            <button type="button" className="danger" onClick={rec.stop}>⏹ Остановить запись</button>
          )}
          <label className="file-label">
            📁 Загрузить файл
            <input type="file" accept="video/*,audio/*" onChange={(e) => {
              const f = e.target.files[0];
              if (f) rec.setUploadedFile(f, URL.createObjectURL(f));
            }} />
          </label>
        </div>
        {rec.recording && <LivePreview stream={rec.liveStream} kind="video" elapsed={elapsed} />}
        {rec.error && <div className="error">{rec.error}</div>}
        {rec.previewUrl && !rec.recording && (
          <div className="review-wrap">
            <video className="question-video" src={rec.previewUrl} controls />
            <button type="button" onClick={() => rec.start('video')}>🔄 Перезаписать</button>
          </div>
        )}
        <button className="primary wide" type="submit" disabled={saving}>
          {saving ? 'Сохранение…' : 'Добавить шаг'}
        </button>
      </form>
    </div>
  );
}
