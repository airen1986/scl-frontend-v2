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

function autosizeRoleListBody() {
  const roleListContainer = document.getElementById('roleListContainer');
  if (!roleListContainer) return;

  const rect = roleListContainer.getBoundingClientRect();
  const bottomGap = 110;
  const available = window.innerHeight - rect.top - bottomGap;

  roleListContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;

  const roleContainer = document.getElementById('roleDetailsContainer');
  if (roleContainer) {
    roleContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
  }
}

function autosizeActiveTabBody() {
  const activeTab = document.querySelector('#managementTabs .nav-link.active');
  if (!activeTab) return;

  const target = activeTab.getAttribute('data-bs-target');
  if (target === '#roles-pane') {
    autosizeRoleListBody();
  } else {
    autosizeUserListBody();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  autosizeUserListBody();
  window.addEventListener('resize', autosizeActiveTabBody);

  const managementTabs = document.getElementById('managementTabs');
  if (managementTabs) {
    managementTabs.addEventListener('shown.bs.tab', (event) => {
      const target = event.target.getAttribute('data-bs-target');
      if (target === '#roles-pane') {
        autosizeRoleListBody();
      } else if (target === '#users-pane') {
        autosizeUserListBody();
      }
    });
  }
});
