const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'state.json');

const OPTIONS = ['A', 'B', 'C'];

function defaultState() {
  return {
    round: 1,
    labels: { A: '', B: '', C: '' },
    votes: { A: 0, B: 0, C: 0 },
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      round: parsed.round ?? 1,
      labels: { A: parsed.labels?.A ?? '', B: parsed.labels?.B ?? '', C: parsed.labels?.C ?? '' },
      votes: { A: parsed.votes?.A ?? 0, B: parsed.votes?.B ?? 0, C: parsed.votes?.C ?? 0 },
    };
  } catch (err) {
    return defaultState();
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/vote', (req, res) => {
  const { option, round } = req.body || {};
  if (!OPTIONS.includes(option)) {
    return res.status(400).json({ error: 'invalid_option' });
  }
  if (round !== state.round) {
    // Stale vote from a previous round (student had the page open before a reset)
    return res.status(409).json({ error: 'round_mismatch', state });
  }
  state.votes[option] += 1;
  saveState(state);
  res.json(state);
});

app.post('/api/admin/labels', (req, res) => {
  const { A, B, C } = req.body || {};
  state.labels = {
    A: typeof A === 'string' ? A.slice(0, 200) : state.labels.A,
    B: typeof B === 'string' ? B.slice(0, 200) : state.labels.B,
    C: typeof C === 'string' ? C.slice(0, 200) : state.labels.C,
  };
  saveState(state);
  res.json(state);
});

app.post('/api/admin/reset', (req, res) => {
  state.round += 1;
  state.votes = { A: 0, B: 0, C: 0 };
  saveState(state);
  res.json(state);
});

app.post('/api/admin/reset-all', (req, res) => {
  state = defaultState();
  saveState(state);
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`Student poll app running at http://localhost:${PORT}`);
  console.log(`  Student page:  http://localhost:${PORT}/`);
  console.log(`  Results (projector): http://localhost:${PORT}/results.html`);
  console.log(`  Admin page:    http://localhost:${PORT}/admin.html`);
});
