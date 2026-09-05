import api from '@/common/js/api';
import { bsToastSuccess } from '@/common/js/bsToast';

export function initUserEditor(state, refreshData) {
  let selectedUser = null;
  const email = document.getElementById('selectedUserEmail');
  const displayName = document.getElementById('selectedFirstName');
  const role = document.getElementById('selectedUserRole');
  const active = document.getElementById('selectedUserStatus');
  const expiry = document.getElementById('accessExpiry');
  const maxRuns = document.getElementById('accessConstraints');
  const templates = document.getElementById('user-modules-pane').querySelector('.template-list');
  const detailGrid = email.closest('.user-detail-grid');
  const expiryGroup = expiry.closest('.col-md-6');
  const maxRunsGroup = maxRuns.closest('.col-12');
  const templatesPane = templates.closest('section');

  displayName.previousElementSibling.textContent = 'Display Name';
  detailGrid.append(expiryGroup.querySelector('label'), expiry);
  expiryGroup.remove();
  const maxRunsLabel = maxRuns.previousElementSibling;
  maxRuns.replaceWith(createNumberInput());
  const maxRunsInput = document.getElementById('maxConcurrentRuns');
  const templatesGrid = document.createElement('div');
  templatesGrid.className = 'user-detail-grid';
  const templatesLabel = document.createElement('span');
  templatesLabel.className = 'form-label';
  templatesLabel.textContent = 'Templates';
  maxRunsLabel.textContent = 'Maximum Concurrent Runs';
  templatesGrid.append(templatesLabel, templates, maxRunsLabel, maxRunsInput);
  maxRunsGroup.remove();
  templatesPane.replaceChildren(templatesGrid);
  document.getElementById('user-modules-tab2').textContent = 'Templates';
  document.getElementById('level-access-tab').closest('li').remove();
  document.getElementById('level-access-pane').remove();
  active.addEventListener('change', updateActiveLabel);

  function updateActiveLabel() {
    document.querySelector('label[for="selectedUserStatus"]').textContent = active.checked
      ? 'Active'
      : 'Inactive';
  }

  function renderRoles() {
    const currentValue = role.value;
    role.replaceChildren();
    for (const currentRole of state.roles) {
      const option = document.createElement('option');
      option.value = currentRole.RoleName;
      option.textContent = currentRole.RoleName;
      option.selected = currentRole.RoleName === currentValue;
      role.append(option);
    }
  }

  function renderTemplates(selectedTemplates = []) {
    templates.replaceChildren();
    for (const templateName of state.templates) {
      const row = document.createElement('div');
      row.className = 'form-check';
      const checkbox = document.createElement('input');
      checkbox.className = 'form-check-input';
      checkbox.type = 'checkbox';
      checkbox.id = `template-${templateName.replace(/[^a-z0-9]/gi, '-')}`;
      checkbox.value = templateName;
      checkbox.checked = selectedTemplates.includes(templateName);
      const label = document.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = checkbox.id;
      label.textContent = templateName;
      row.append(checkbox, label);
      templates.append(row);
    }
    if (!state.templates.length) templates.textContent = 'No templates are available.';
  }

  function select(user) {
    selectedUser = user;
    email.value = user.UserEmail;
    email.readOnly = true;
    displayName.value = user.DisplayName;
    role.value = user.RoleName;
    active.checked = user.IsActive === 1;
    updateActiveLabel();
    expiry.value = user.EndDate;
    maxRunsInput.value = user.MaxConcurrentRuns;
    renderTemplates(user.Templates || []);
  }

  function add() {
    selectedUser = null;
    email.value = '';
    email.readOnly = false;
    displayName.value = '';
    role.selectedIndex = 0;
    active.checked = true;
    updateActiveLabel();
    expiry.value = '';
    maxRunsInput.value = 1;
    renderTemplates();
  }

  async function save() {
    const selectedTemplates = [...templates.querySelectorAll('input:checked')].map(
      (input) => input.value
    );
    const payload = {
      UserEmail: email.value.trim(),
      DisplayName: displayName.value.trim(),
      RoleName: role.value,
      EndDate: expiry.value,
      MaxConcurrentRuns: Number(maxRunsInput.value),
      Templates: selectedTemplates,
    };
    if (selectedUser) payload.IsActive = Number(active.checked);
    if (
      !payload.UserEmail ||
      !payload.DisplayName ||
      !payload.RoleName ||
      !payload.EndDate ||
      payload.MaxConcurrentRuns < 1
    ) {
      email.form.reportValidity();
      return;
    }
    const endpoint = selectedUser ? 'update-user' : 'add-user';
    const response = await api.post(`/user-management/${endpoint}`, payload);
    bsToastSuccess(response.message);
    await refreshData();
  }

  return {
    select,
    add,
    save,
    refresh: () => {
      renderRoles();
      if (!selectedUser) renderTemplates();
    },
  };
}

function createNumberInput() {
  const input = document.createElement('input');
  input.className = 'form-control';
  input.id = 'maxConcurrentRuns';
  input.type = 'number';
  input.min = '1';
  input.step = '1';
  input.required = true;
  return input;
}
