import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Side-effect import: registers real room blueprints (radio_mesh, …) over
// the placeholders so the Chat shell picks up the implemented composer/widgets.
import './rooms';
// Side-effect imports — typed-room blueprints register themselves with the
// room registry at module load. Importing here keeps the registry populated
// before any room view mounts.
import './rooms/blueprints/fmTunerBlueprint';
import './rooms/blueprints/musicJukeboxBlueprint';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
