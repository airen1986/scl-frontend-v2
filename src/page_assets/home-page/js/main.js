import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // home-page-specific styles

import api from '@/common/js/api';
import { ready } from '@/common/js/dom';

/* ── Home Page ─────────────────────────────────────────────────────────────── */

ready(async () => {
  // ── Auth guard: redirect to login if not authenticated ────────────────
  try {
    const user = await api.get('/auth/me', { silent: true });
    if (user && user.rolename) {
      sessionStorage.setItem('user', JSON.stringify(user));
    } else {
      window.location.href = 'login.html';
      return;
    }
  } catch {
    window.location.href = 'login.html';
    return;
  }

  // TODO: home-page initialisation
});
