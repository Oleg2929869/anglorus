const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, uid, UPLOADS_DIR } = require('./db');

const app = express();
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, uid('media') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use('/media', express.static(UPLOADS_DIR));

function rowToForm(f) {
  return { ...f, collect_contact: !!f.collect_contact };
}

function formWithQuestions(f) {
  const questions = db
    .prepare('SELECT * FROM questions WHERE form_id = ? ORDER BY position, id')
    .all(f.id)
    .map((q) => ({ ...q, allowed_answers: JSON.parse(q.allowed_answers) }));
  return { ...rowToForm(f), questions };
}

// ---------- Forms ----------

app.get('/api/forms', (req, res) => {
  const forms = db.prepare('SELECT * FROM forms ORDER BY created_at DESC').all();
  res.json(forms.map(rowToForm));
});

app.post('/api/forms', (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = uid('form');
  const collect_contact = req.body.collect_contact === false ? 0 : 1;
  db.prepare('INSERT INTO forms (id, title, collect_contact) VALUES (?, ?, ?)').run(id, title, collect_contact);
  res.status(201).json(formWithQuestions(db.prepare('SELECT * FROM forms WHERE id = ?').get(id)));
});

app.get('/api/forms/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  res.json(formWithQuestions(f));
});

app.delete('/api/forms/:id', (req, res) => {
  const info = db.prepare('DELETE FROM forms WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------- Questions ----------

app.post(
  '/api/forms/:id/questions',
  upload.single('media'),
  (req, res) => {
    const f = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
    if (!f) return res.status(404).json({ error: 'not_found' });
    const prompt = (req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt_required' });
    const allowed = (() => {
      try {
        const parsed = JSON.parse(req.body.allowed_answers || '["video","audio","text"]');
        return Array.isArray(parsed) && parsed.length ? parsed : ['video', 'audio', 'text'];
      } catch {
        return ['video', 'audio', 'text'];
      }
    })();
    const position = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM questions WHERE form_id = ?').get(f.id)).p;
    const id = uid('q');
    db.prepare('INSERT INTO questions (id, form_id, position, prompt, media_path, allowed_answers) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, f.id, position, prompt, req.file ? 'media/' + req.file.filename : null, JSON.stringify(allowed)
    );
    res.status(201).json(formWithQuestions(f));
  }
);

app.delete('/api/questions/:id', (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM questions WHERE id = ?').run(q.id);
  res.json({ ok: true });
});

// ---------- Responding ----------

app.post('/api/forms/:id/responses', (req, res) => {
  const f = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  const id = uid('resp');
  db.prepare('INSERT INTO responses (id, form_id) VALUES (?, ?)').run(id, f.id);
  res.status(201).json({ id, form_id: f.id, status: 'in_progress' });
});

app.post(
  '/api/responses/:id/answers',
  upload.single('media'),
  (req, res) => {
    const r = db.prepare('SELECT * FROM responses WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not_found' });
    const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.body.question_id);
    if (!q || q.form_id !== r.form_id) return res.status(400).json({ error: 'invalid_question' });
    const kind = req.body.kind;
    if (!['video', 'audio', 'text'].includes(kind)) return res.status(400).json({ error: 'invalid_kind' });
    const text_value = kind === 'text' ? (req.body.text || '').trim() : null;
    if (kind === 'text' && !text_value) return res.status(400).json({ error: 'text_required' });
    if (kind !== 'text' && !req.file) return res.status(400).json({ error: 'media_required' });
    const id = uid('ans');
    db.prepare('INSERT INTO answers (id, response_id, question_id, kind, media_path, text_value) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, r.id, q.id, kind, req.file ? 'media/' + req.file.filename : null, text_value
    );
    res.status(201).json({ id, question_id: q.id, kind });
  }
);

app.patch('/api/responses/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM responses WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  const status = req.body.status;
  if (!['in_progress', 'completed', 'dropped_out'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  db.prepare('UPDATE responses SET status = ?, contact_name = ?, contact_email = ? WHERE id = ?').run(
    status,
    req.body.contact_name ?? r.contact_name,
    req.body.contact_email ?? r.contact_email,
    r.id
  );
  res.json({ ok: true });
});

// ---------- Inbox ----------

function responseWithAnswers(r) {
  const answers = db.prepare('SELECT * FROM answers WHERE response_id = ?').all(r.id);
  return { ...r, answers };
}

app.get('/api/forms/:id/responses', (req, res) => {
  const f = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  const responses = db.prepare("SELECT * FROM responses WHERE form_id = ? ORDER BY created_at DESC").all(f.id);
  res.json(responses.map(responseWithAnswers));
});

// ---------- Static client ----------

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|media).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`VideoAsk server: http://localhost:${PORT}`);
});
