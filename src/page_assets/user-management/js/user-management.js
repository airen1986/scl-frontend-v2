import api from '@/common/js/api';
import { bsToastError } from '@/common/js/bsToast';
import { initDirectory } from './directory';
import { initRoleEditor } from './role-editor';
import { initUserEditor } from './user-editor';

const endpoints = ['get-users', 'get-roles', 'get-templates', 'get-modules'];

export async function initUserManagement() {
  const state = { userDetails: [], roles: [], templates: [], modules: [], HomePages: [] };
  let isAddingUser = false;
  let isAddingRole = false;
  const userEditor = initUserEditor(state, refresh);
  const roleEditor = initRoleEditor(state, refresh);
  const users = initDirectory({
    listId: 'userList',
    searchId: 'userSearchInput',
    paginationId: 'paginationButtons',
    icon: 'fa-user',
    label: (user) => user.UserEmail,
    onSelect: (user) => {
      const selected = userEditor.select(user);
      if (selected) setUserAdding(false);
      return selected;
    },
  });
  const roles = initDirectory({
    listId: 'roleList',
    icon: 'fa-shield-halved',
    label: (role) => role.RoleName,
    onSelect: (role) => {
      const selected = roleEditor.select(role);
      if (selected) setRoleAdding(false);
      return selected;
    },
  });

  document.getElementById('addUserButton').addEventListener('click', () => {
    if (userEditor.add() === false) return;
    setUserAdding(true);
  });
  document
    .getElementById('saveUserButton')
    .addEventListener('click', () => saveEditor(userEditor, 'User'));
  document.getElementById('addRoleButton').addEventListener('click', () => {
    if (roleEditor.add() === false) return;
    setRoleAdding(true);
  });
  document
    .getElementById('saveRoleButton')
    .addEventListener('click', () => saveEditor(roleEditor, 'Role'));
  document.getElementById('selectedUserEmail').addEventListener('input', (event) => {
    if (isAddingUser) users.setDraft(formatDraftLabel('New User', event.target.value));
  });
  document.getElementById('selectedRoleName').addEventListener('input', (event) => {
    if (isAddingRole) roles.setDraft(formatDraftLabel('New Role', event.target.value));
  });

  function formatDraftLabel(prefix, value) {
    const trimmedValue = value.trim();
    return trimmedValue ? `${prefix}: ${trimmedValue}` : prefix;
  }

  function setUserAdding(isAdding) {
    isAddingUser = isAdding;
    setAddButtonState('addUserButton', isAdding);
    if (isAdding) users.setDraft('New User');
    else users.clearDraft();
  }

  function setRoleAdding(isAdding) {
    isAddingRole = isAdding;
    setAddButtonState('addRoleButton', isAdding);
    if (isAdding) roles.setDraft('New Role');
    else roles.clearDraft();
  }

  function setAddButtonState(buttonId, isAdding) {
    const button = document.getElementById(buttonId);
    button.classList.toggle('btn-dark', isAdding);
    button.classList.toggle('btn-outline-secondary', !isAdding);
  }

  async function saveEditor(editor, type) {
    const addButton = document.getElementById(`add${type}Button`);
    const saveButton = document.getElementById(`save${type}Button`);
    if (saveButton.disabled) return;

    const recordName = document
      .getElementById(type === 'User' ? 'selectedUserEmail' : 'selectedRoleName')
      .value.trim();
    const originalSaveContent = saveButton.innerHTML;
    addButton.disabled = true;
    saveButton.disabled = true;
    saveButton.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Saving...';

    try {
      const savedRecord = await editor.save();
      if (savedRecord) {
        if (type === 'User') setUserAdding(false);
        else setRoleAdding(false);
        selectSavedRecord(type, savedRecord || recordName);
      }
    } catch {
      // The API client has already shown the request error to the user.
    } finally {
      addButton.disabled = false;
      saveButton.disabled = false;
      saveButton.innerHTML = originalSaveContent;
    }
  }

  function selectSavedRecord(type, recordNameOrRecord) {
    if (type === 'User') {
      const user =
        typeof recordNameOrRecord === 'string'
          ? state.userDetails.find(
              (currentUser) =>
                currentUser.UserEmail?.toLowerCase() === recordNameOrRecord.toLowerCase()
            )
          : recordNameOrRecord;
      if (user) users.select(user);
      return;
    }

    const role =
      typeof recordNameOrRecord === 'string'
        ? state.roles.find((currentRole) => currentRole.RoleName === recordNameOrRecord)
        : recordNameOrRecord;
    if (role) roles.select(role);
  }

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
  setUserAdding(false);
  setRoleAdding(false);
}
