const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function emptyDb() {
  return { forms: [], questions: [], responses: [], answers: [] };
}

function load() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    return emptyDb();
  }
}

let db = load();
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  }, 50);
}

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- forms ----------

function listForms() {
  return [...db.forms].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function createForm({ title, collect_contact }) {
  const form = {
    id: uid('form'),
    title,
    collect_contact: collect_contact === false ? 0 : 1,
    created_at: now(),
  };
  db.forms.push(form);
  save();
  return form;
}

function getForm(id) {
  return db.forms.find((f) => f.id === id) || null;
}

function deleteForm(id) {
  const before = db.forms.length;
  db.forms = db.forms.filter((f) => f.id !== id);
  const qids = new Set(db.questions.filter((q) => q.form_id === id).map((q) => q.id));
  db.questions = db.questions.filter((q) => q.form_id !== id);
  const rids = new Set(db.responses.filter((r) => r.form_id === id).map((r) => r.id));
  db.responses = db.responses.filter((r) => r.form_id !== id);
  db.answers = db.answers.filter((a) => !qids.has(a.question_id) && !rids.has(a.response_id));
  save();
  return db.forms.length < before;
}

// ---------- questions ----------

function formQuestions(formId) {
  return db.questions
    .filter((q) => q.form_id === formId)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

function addQuestion(formId, { prompt, media_path, allowed_answers, type, options }) {
  const position = formQuestions(formId).length + 1;
  const q = {
    id: uid('q'),
    form_id: formId,
    position,
    prompt,
    media_path: media_path || null,
    type: type || 'open',
    allowed_answers: JSON.stringify(allowed_answers),
    options: JSON.stringify(options || []),
  };
  db.questions.push(q);
  save();
  return q;
}

function getQuestion(id) {
  return db.questions.find((q) => q.id === id) || null;
}

function deleteQuestion(id) {
  const before = db.questions.length;
  db.questions = db.questions.filter((q) => q.id !== id);
  db.answers = db.answers.filter((a) => a.question_id !== id);
  save();
  return db.questions.length < before;
}

// ---------- responses ----------

function startResponse(formId) {
  const r = { id: uid('resp'), form_id: formId, contact_name: null, contact_email: null, status: 'in_progress', created_at: now() };
  db.responses.push(r);
  save();
  return r;
}

function getResponse(id) {
  return db.responses.find((r) => r.id === id) || null;
}

function addAnswer({ response_id, question_id, kind, media_path, text_value }) {
  const a = {
    id: uid('ans'),
    response_id,
    question_id,
    kind,
    media_path: media_path || null,
    text_value: text_value || null,
    created_at: now(),
  };
  db.answers.push(a);
  save();
  return a;
}

function patchResponse(id, { status, contact_name, contact_email }) {
  const r = getResponse(id);
  if (!r) return null;
  r.status = status;
  r.contact_name = contact_name ?? r.contact_name;
  r.contact_email = contact_email ?? r.contact_email;
  save();
  return r;
}

function listResponses(formId) {
  return db.responses
    .filter((r) => r.form_id === formId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => ({ ...r, answers: db.answers.filter((a) => a.response_id === r.id) }));
}

module.exports = {
  uid,
  UPLOADS_DIR,
  listForms,
  createForm,
  getForm,
  deleteForm,
  formQuestions,
  addQuestion,
  getQuestion,
  deleteQuestion,
  startResponse,
  getResponse,
  addAnswer,
  patchResponse,
  listResponses,
};
