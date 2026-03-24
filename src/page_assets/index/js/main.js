import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // home-page-specific styles

import api from '@/common/js/api';
import { ready } from '@/common/js/dom';

// ── Already authenticated? Redirect immediately ─────────────────────────────
ready(async () => {
  try {
    const user = await api.post('/auth/me', {}, { silent: true });
    if (user && user.role_name) {
      sessionStorage.setItem('user', JSON.stringify(user));
      window.location.href = 'home-page.html';
    }
  } catch {
    // Not authenticated — stay on current page.
  }
});
