import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';
import api from '@/common/js/api';
import { saveRedirectUrl, handleAccessControlRedirect, currentPageUrl } from '@/common/js/auth';
import { ready } from '@/common/js/dom';
import { initSchedulerPage } from './scheduler';

function setStickyHead2() {
  const head1 = document.querySelector('.scl-table .head1');
  if (!head1) return;
  const height = head1.getBoundingClientRect().height;
  document.querySelectorAll('.scl-table .head2 th').forEach((th) => {
    th.style.setProperty('--head1-height', `${height}px`);
  });
}

function autosizeSclTable() {
  const tableContainer = document.getElementById('historyTableDiv');
  if (!tableContainer) return;

  const rect = tableContainer.getBoundingClientRect();
  const bottomGap = 10;
  const available = window.innerHeight - rect.top - bottomGap;

  tableContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
}

const appState = {
  user: null,
};

ready(async () => {
  document.title = 'Scheduler - Supply Chain Lite';

  let user;
  try {
    user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
      appState.user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
      if (handleAccessControlRedirect(user)) return;

      if (user.role_name !== 'SUPER_ADMIN') {
        window.location.href = '/home-page.html';
        return;
      }
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

  await initSchedulerPage();
  setStickyHead2();
  autosizeSclTable();
  window.addEventListener('resize', () => {
    setStickyHead2();
    autosizeSclTable();
  });
});
