import '../assets/deckpad.css';
import '../app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { getDeck } from '../lib/deck';
import { DialogHost } from './DialogHost';
import { parseDialogParams } from './params';

const parsed = parseDialogParams(window.location.search);

if (parsed === null) {
  createRoot(document.getElementById('root')!).render(
    <div className="dp-dialog-window" style={{ padding: 16 }}>Invalid dialog.</div>
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <DialogHost view={parsed.view} id={parsed.id} deck={getDeck()} />
    </React.StrictMode>
  );
}
