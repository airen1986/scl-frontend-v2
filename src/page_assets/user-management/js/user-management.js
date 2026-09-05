import api from '@/common/js/api';
import { bsToastError } from '@/common/js/bsToast';
import { initDirectory } from './directory';
import { initRoleEditor } from './role-editor';
import { initUserEditor } from './user-editor';

const endpoints = ['get-users', 'get-roles', 'get-templates', 'get-modules'];

function hideUnsupportedControls() {
  const worksheetAccess = document.getElementById('worksheetAccess');
  worksheetAccess.parentElement.previousElementSibling.remove();
  worksheetAccess.parentElement.remove();
  document.getElementById('selectedRegion').closest('.col-md-6').remove();
  document.getElementById('user-groups-tab2').closest('li').remove();
  document.getElementById('user-groups-pane').remove();
  const roleStatus = document.getElementById('selectedRoleStatus');
  roleStatus.parentElement.previousElementSibling.remove();
  roleStatus.parentElement.remove();
  const addModelControl = document.getElementById('adminRoleFlag');
  addModelControl.parentElement.previousElementSibling.textContent = 'Can Add New Model';
  document.querySelector('#useractionButtons .btn:nth-child(2)').classList.add('d-none');
  document.querySelector('#useractionButtons .btn:nth-child(4)').classList.add('d-none');
  document.querySelector('#roleActionButtons .btn:nth-child(3)').classList.add('d-none');
}

export async function initUserManagement() {
  hideUnsupportedControls();
  const state = { userDetails: [], roles: [], templates: [], modules: [], HomePages: [] };
  const userEditor = initUserEditor(state, refresh);
  const roleEditor = initRoleEditor(state, refresh);
  const users = initDirectory({
    listId: 'userList',
    searchId: 'userSearchInput',
    paginationId: 'paginationButtons',
    icon: 'fa-user',
    label: (user) => user.UserEmail,
    onSelect: userEditor.select,
  });
  const roles = initDirectory({
    listId: 'roleList',
    icon: 'fa-shield-halved',
    label: (role) => role.RoleName,
    onSelect: roleEditor.select,
  });

  document
    .querySelector('#useractionButtons .btn:first-child')
    .addEventListener('click', userEditor.add);
  document
    .querySelector('#useractionButtons .btn:nth-child(3)')
    .addEventListener('click', userEditor.save);
  document
    .querySelector('#roleActionButtons .btn:first-child')
    .addEventListener('click', roleEditor.add);
  document
    .querySelector('#roleActionButtons .btn:nth-child(2)')
    .addEventListener('click', roleEditor.save);

  async function refresh() {
    const results = await Promise.allSettled(
      endpoints.map((endpoint) => api.post(`/user-management/${endpoint}`, {}))
    );
    if (results.some((result) => result.status === 'rejected')) {
      bsToastError('Unable to load user management data. Please refresh the page and try again.');
      return;
    }
    Object.assign(state, ...results.map((result) => result.value));
    users.render(state.userDetails || []);
    roles.render(state.roles || []);
    userEditor.refresh();
    roleEditor.refresh();
  }

  await refresh();
  if (state.userDetails.length) users.selectFirst();
  else userEditor.add();
  roleEditor.add();
}
