const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const store = require('./store');

const app = express();
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, store.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, store.uid('media') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use('/media', express.static(store.UPLOADS_DIR));

function rowToForm(f) {
  return { ...f, collect_contact: !!f.collect_contact };
}

function formWithQuestions(f) {
  const questions = store.formQuestions(f.id).map((q) => ({
    ...q,
    allowed_answers: JSON.parse(q.allowed_answers),
  }));
  return { ...rowToForm(f), questions };
}

// ---------- Forms ----------

app.get('/api/forms', (req, res) => {
  res.json(store.listForms().map(rowToForm));
});

app.post('/api/forms', (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title_required' });
  const form = store.createForm({ title, collect_contact: req.body.collect_contact });
  res.status(201).json(formWithQuestions(form));
});

app.get('/api/forms/:id', (req, res) => {
  const f = store.getForm(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  res.json(formWithQuestions(f));
});

app.delete('/api/forms/:id', (req, res) => {
  if (!store.deleteForm(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------- Questions ----------

app.post(
  '/api/forms/:id/questions',
  upload.single('media'),
  (req, res) => {
    const f = store.getForm(req.params.id);
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
    store.addQuestion(f.id, {
      prompt,
      media_path: req.file ? 'media/' + req.file.filename : null,
      allowed_answers: allowed,
    });
    res.status(201).json(formWithQuestions(f));
  }
);

app.delete('/api/questions/:id', (req, res) => {
  if (!store.deleteQuestion(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------- Responding ----------

app.post('/api/forms/:id/responses', (req, res) => {
  const f = store.getForm(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  const r = store.startResponse(f.id);
  res.status(201).json({ id: r.id, form_id: f.id, status: r.status });
});

app.post(
  '/api/responses/:id/answers',
  upload.single('media'),
  (req, res) => {
    const r = store.getResponse(req.params.id);
    if (!r) return res.status(404).json({ error: 'not_found' });
    const q = store.getQuestion(req.body.question_id);
    if (!q || q.form_id !== r.form_id) return res.status(400).json({ error: 'invalid_question' });
    const kind = req.body.kind;
    if (!['video', 'audio', 'text'].includes(kind)) return res.status(400).json({ error: 'invalid_kind' });
    const text_value = kind === 'text' ? (req.body.text || '').trim() : null;
    if (kind === 'text' && !text_value) return res.status(400).json({ error: 'text_required' });
    if (kind !== 'text' && !req.file) return res.status(400).json({ error: 'media_required' });
    const a = store.addAnswer({
      response_id: r.id,
      question_id: q.id,
      kind,
      media_path: req.file ? 'media/' + req.file.filename : null,
      text_value,
    });
    res.status(201).json({ id: a.id, question_id: q.id, kind: a.kind });
  }
);

app.patch('/api/responses/:id', (req, res) => {
  const status = req.body.status;
  if (!['in_progress', 'completed', 'dropped_out'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  const r = store.patchResponse(req.params.id, {
    status,
    contact_name: req.body.contact_name,
    contact_email: req.body.contact_email,
  });
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------- Inbox ----------

app.get('/api/forms/:id/responses', (req, res) => {
  const f = store.getForm(req.params.id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  res.json(store.listResponses(f.id));
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
