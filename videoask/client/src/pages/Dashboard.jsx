import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getForms, createForm, deleteForm } from '../api.js';

export default function Dashboard() {
  const [forms, setForms] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);

  async function refresh() {
    setForms(await getForms());
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createForm(title.trim());
      setTitle('');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить видео-форму со всеми вопросами и ответами?')) return;
    await deleteForm(id);
    await refresh();
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>📹 VideoAsk Clone</h1>
        <span className="muted">асинхронные видео-формы</span>
      </header>

      <form className="card create-form" onSubmit={handleCreate}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название новой видео-формы…"
        />
        <button type="submit">Создать</button>
      </form>

      {error && <div className="error">{error}</div>}

      {forms === null ? (
        <p>Загрузка…</p>
      ) : forms.length === 0 ? (
        <p className="muted">Пока нет форм. Создайте первую выше ☝️</p>
      ) : (
        <ul className="form-list">
          {forms.map((f) => (
            <li key={f.id} className="card form-row">
              <div>
                <Link to={`/forms/${f.id}`} className="form-title">{f.title}</Link>
                <div className="muted small">
                  создана {f.created_at} · ссылка: <code>/f/{f.id}</code>
                </div>
              </div>
              <div className="row-actions">
                <Link to={`/forms/${f.id}/inbox`}>📥 Ответы</Link>
                <Link to={`/f/${f.id}`}>▶ Открыть</Link>
                <button className="danger" onClick={() => handleDelete(f.id)}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
