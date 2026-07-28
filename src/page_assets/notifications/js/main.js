import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // table-specific styles
import api from '@/common/js/api';
import { saveRedirectUrl, handleAccessControlRedirect, currentPageUrl } from '@/common/js/auth';
import { ready } from '@/common/js/dom';
import { initNotificationsTable } from './notifications';

/**
 * Synchronizes header row heights by setting the CSS variable `--head1-height` on each `.scl-table .head2 th` to match the computed height of `.scl-table .head1`.
 *
 * If `.scl-table .head1` is not present, the function does nothing.
 */
function setStickyHead2() {
  const head1 = document.querySelector('.scl-table .head1');
  if (!head1) return;
  const height = head1.getBoundingClientRect().height;
  document.querySelectorAll('.scl-table .head2 th').forEach((th) => {
    th.style.setProperty('--head1-height', `${height}px`);
  });
}

/**
 * Adjusts the max-height of the table container (#sclTableDiv) so it fits the viewport.
 *
 * If the container exists, sets its inline `maxHeight` CSS property to the larger of 220px
 * or the available vertical space calculated as window.innerHeight minus the container's
 * top offset and a 60px bottom gap.
 */
function autosizeSclTable() {
  const tableContainer = document.getElementById('sclTableDiv');
  if (!tableContainer) return;

  const rect = tableContainer.getBoundingClientRect();
  const bottomGap = 60;
  const available = window.innerHeight - rect.top - bottomGap;

  tableContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
}

const appState = {
  user: null,
};

ready(async () => {
  document.title = `Notifications - Supply Chain Lite`;

  let user;
  try {
    user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
      appState.user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
      if (handleAccessControlRedirect(user)) return;
    } else {
      saveRedirectUrl();
      window.location.href = '/login.html';
      return;
    }
  } catch {
    saveRedirectUrl();
    window.location.href = '/login.html';
    return;
  }

  await initNotificationsTable();

  autosizeSclTable();
  setStickyHead2();
  window.addEventListener('resize', () => {
    autosizeSclTable();
    setStickyHead2();
  });
});
