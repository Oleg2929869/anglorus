import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import FormEditor from './pages/FormEditor.jsx';
import Respond from './pages/Respond.jsx';
import Inbox from './pages/Inbox.jsx';
import './styles.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/forms/:id" element={<FormEditor />} />
      <Route path="/forms/:id/inbox" element={<Inbox />} />
      <Route path="/f/:id" element={<Respond />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
