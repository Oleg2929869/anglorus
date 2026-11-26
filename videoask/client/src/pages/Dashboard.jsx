import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InboxIcon, PlayIcon, TrashIcon, FilmIcon } from '../Icons.jsx';
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
      <header className="brand">
        <div className="brand-mark"><PlayIcon size={22} /></div>
        <div>
          <h1>VideoAsk Clone</h1>
          <p>асинхронные видео-формы для вашего сайта</p>
        </div>
      </header>

      <form className="create-hero card" onSubmit={handleCreate}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Как назовём вашу видео-форму?"
        />
        <button className="primary" type="submit">Создать форму</button>
      </form>

      {error && <div className="error">{error}</div>}

      {forms === null ? (
        <p>Загрузка…</p>
      ) : forms.length === 0 ? (
        <div className="empty-box">
          <div className="empty-ico"><FilmIcon size={44} /></div>
          <h3>Пока нет ни одной формы</h3>
          <p>Придумайте название выше, создайте форму —<br />и запишите первое видео-приветствие.</p>
        </div>
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
                <Link to={`/forms/${f.id}/inbox`}><InboxIcon /> Ответы</Link>
                <Link to={`/f/${f.id}`}><PlayIcon /> Открыть</Link>
                <button className="danger" onClick={() => handleDelete(f.id)}><TrashIcon /> Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
