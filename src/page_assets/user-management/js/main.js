import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';

function autosizeUserListBody() {
  const userListContainer = document.getElementById('userListContainer');
  if (!userListContainer) return;

  const rect = userListContainer.getBoundingClientRect();
  const bottomGap = 110;
  const available = window.innerHeight - rect.top - bottomGap;

  userListContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;

  const userContainer = document.getElementById('userDetailsContainer');
  if (userContainer) {
    userContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  autosizeUserListBody();
  window.addEventListener('resize', autosizeUserListBody);
});
