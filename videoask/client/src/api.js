export async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch {}
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getForms() {
  return api('/api/forms');
}

export function createForm(title, collectContact = true) {
  return api('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, collect_contact: collectContact }),
  });
}

export function getForm(id) {
  return api(`/api/forms/${id}`);
}

export function deleteForm(id) {
  return api(`/api/forms/${id}`, { method: 'DELETE' });
}

export function addQuestion(formId, { prompt, type, allowedAnswers, options, mediaFile }) {
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('type', type);
  fd.append('allowed_answers', JSON.stringify(allowedAnswers));
  if (type === 'choice') fd.append('options', JSON.stringify(options));
  if (mediaFile) fd.append('media', mediaFile);
  return api(`/api/forms/${formId}/questions`, { method: 'POST', body: fd });
}

export function deleteQuestion(questionId) {
  return api(`/api/questions/${questionId}`, { method: 'DELETE' });
}

export function startResponse(formId) {
  return api(`/api/forms/${formId}/responses`, { method: 'POST' });
}

export function submitAnswer(responseId, { questionId, kind, mediaFile, text, optionId }) {
  const fd = new FormData();
  fd.append('question_id', questionId);
  fd.append('kind', kind);
  if (mediaFile) fd.append('media', mediaFile);
  if (text != null) fd.append('text', text);
  if (optionId != null) fd.append('option_id', optionId);
  return api(`/api/responses/${responseId}/answers`, { method: 'POST', body: fd });
}

export function finishResponse(responseId, { status, contactName, contactEmail }) {
  return api(`/api/responses/${responseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, contact_name: contactName, contact_email: contactEmail }),
  });
}

export function getResponses(formId) {
  return api(`/api/forms/${formId}/responses`);
}
