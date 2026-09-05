import api from '@/common/js/api';
import { bsToastError } from '@/common/js/bsToast';
import { initDirectory } from './directory';
import { initRoleEditor } from './role-editor';
import { initUserEditor } from './user-editor';

const endpoints = ['get-users', 'get-roles', 'get-templates', 'get-modules'];

export async function initUserManagement() {
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

  document.getElementById('addUserButton').addEventListener('click', userEditor.add);
  document.getElementById('saveUserButton').addEventListener('click', userEditor.save);
  document.getElementById('addRoleButton').addEventListener('click', roleEditor.add);
  document.getElementById('saveRoleButton').addEventListener('click', roleEditor.save);

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
