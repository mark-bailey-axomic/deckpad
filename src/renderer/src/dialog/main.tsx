import '../assets/deckpad.css';
import '../app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { DialogView } from '@shared/types';
import { getDeck } from '../lib/deck';
import { DialogHost } from './DialogHost';

const params = new URLSearchParams(window.location.search);
const view = params.get('view') as DialogView;
const id = params.get('id') ?? '';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DialogHost view={view} id={id} deck={getDeck()} />
  </React.StrictMode>
);
