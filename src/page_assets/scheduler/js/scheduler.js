import api from '@/common/js/api';
import { bsToastError, bsToastSuccess } from '@/common/js/bsToast';
import cronstrue from 'cronstrue';
import { CronExpressionParser } from 'cron-parser';

const SCHEDULER_COLUMNS = [
  { label: 'Function', field: 'task_name' },
  { label: 'Description', field: 'schedule_description' },
  { label: 'Created By', field: 'created_by' },
  { label: 'Type', field: 'schedule_type' },
  { label: 'Expression', field: 'cron_expression' },
  { label: 'Enabled', field: 'is_enabled' },
  { label: 'Running', field: 'is_running' },
  { label: 'Last run', field: 'last_run_at' },
  { label: 'Next run', field: 'next_run_at' },
  { label: 'Action', field: null },
];

const tableState = {
  schedules: [],
  executions: [],
  selectFilters: {},
  selectedScheduleId: null,
};

function setPageLoader(visible) {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  loader.classList.toggle('d-none', !visible);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[ch];
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getBooleanLabel(value) {
  return value === 1 || value === true ? 'Yes' : 'No';
}

function getEnabledBadge(schedule) {
  if (schedule.is_enabled === 1 || schedule.is_enabled === true) {
    return '<span class="badge bg-success">Enabled</span>';
  }
  return '<span class="badge bg-secondary">Disabled</span>';
}

function getRunningBadge(schedule) {
  if (schedule.is_running === 1 || schedule.is_running === true) {
    return '<span class="badge bg-info text-dark">Running</span>';
  }
  return '<span class="badge bg-secondary">Idle</span>';
}

function prettyIfJson(value) {
  const rawValue = value === null || value === undefined ? '' : String(value);
  const trimmed = rawValue.trim();

  if (trimmed.length > 0 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // Fall back to the original value when it is not valid JSON.
    }
  }

  return rawValue;
}

function getExecutionStatusBadge(status) {
  switch (String(status).toLowerCase()) {
    case 'success':
      return '<span class="badge bg-success">Success</span>';
    case 'failed':
    case 'failure':
    case 'error':
      return '<span class="badge bg-danger">Failed</span>';
    case 'running':
      return '<span class="badge bg-info text-dark">Running</span>';
    default:
      return '<span class="badge bg-secondary">Unknown</span>';
  }
}

function canEditSchedule(schedule) {
  return String(schedule?.schedule_type ?? '').toLowerCase() === 'cron';
}

async function runSchedule(scheduleId) {
  if (!scheduleId) return;

  setPageLoader(true);
  try {
    const response = await api.post('/scheduler/run', { schedule_id: scheduleId });
    bsToastSuccess(response?.message || 'Run request sent successfully.');

    const updatedNextRunAt = response?.next_run_at ?? response?.schedule?.next_run_at;
    if (updatedNextRunAt !== undefined) {
      const schedule = tableState.schedules.find((item) => item.schedule_id === scheduleId);
      if (schedule) {
        schedule.next_run_at = updatedNextRunAt;
        renderSchedules();
      }
    }

    await loadExecutionHistory();
  } catch {
    bsToastError('Unable to run the selected schedule.');
  } finally {
    setPageLoader(false);
  }
}

function getCellValue(schedule, field) {
  switch (field) {
    case 'task_name':
      return schedule.task_name || '';
    case 'schedule_description':
      return schedule.schedule_description || '';
    case 'created_by':
      return schedule.created_by || '';
    case 'schedule_type':
      return schedule.schedule_type || '';
    case 'cron_expression':
      return schedule.cron_expression || '';
    case 'is_enabled':
      return getBooleanLabel(schedule.is_enabled);
    case 'is_running':
      return getBooleanLabel(schedule.is_running);
    case 'last_run_at':
      return schedule.last_run_at || '';
    case 'next_run_at':
      return schedule.next_run_at || '';
    default:
      return '';
  }
}

function shouldShowFilter(column) {
  return column.label === 'Function' || column.label === 'Created By';
}

function populateTableHeaders() {
  const oldHead1 = document.getElementById('sclTableHead1');
  const head1 = oldHead1.cloneNode(true);
  oldHead1.replaceWith(head1);
  head1.id = 'sclTableHead1';

  head1.innerHTML = '';
  SCHEDULER_COLUMNS.forEach((column, index) => {
    const th = document.createElement('th');
    const div = document.createElement('div');
    div.className = 'd-flex justify-content-between align-items-center';
    const span = document.createElement('span');
    span.textContent = column.label;
    div.appendChild(span);

    if (shouldShowFilter(column)) {
      const filterBtn = document.createElement('button');
      filterBtn.type = 'button';
      filterBtn.className = 'scl-filter-btn btn btn-link btn-sm p-0 text-dark';
      filterBtn.setAttribute('aria-label', `Filter by ${column.label}`);
      filterBtn.setAttribute('data-bs-toggle', 'dropdown');
      filterBtn.setAttribute('data-bs-auto-close', 'outside');
      filterBtn.setAttribute('aria-expanded', 'false');
      filterBtn.dataset.col = column.label;
      filterBtn.dataset.colIndex = String(index + 1);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-chevron-down';
      filterBtn.appendChild(icon);
      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu dropdown-menu-start';
      const form1 = document.createElement('form');
      form1.style.fontSize = '0.8rem';
      form1.innerHTML = `<a class="dropdown-item px-2 py-0">
                            <div class="form-check">
                            <input class="form-check-input selectAll" type="checkbox" />
                            <label class="form-check-label">Select All</label>
                            </div>
                            </a>
                            <div class="dropdown-divider"></div>
                            <fieldset class="lovValuesFieldset">
                            </fieldset>
                            <div class="dropdown-divider"></div>
                            <div class="dropdown-item d-flex px-2 py-0 clearOKBtn">
                            </div>`;
      dropdown.appendChild(form1);
      div.append(filterBtn, dropdown);
    }

    th.appendChild(div);
    head1.appendChild(th);
  });

  head1.addEventListener('show.bs.dropdown', (e) => {
    const currentButton = e.target;

    for (const otherButton of head1.querySelectorAll('[data-bs-toggle="dropdown"]')) {
      if (otherButton === currentButton) continue;

      otherButton.closest('th')?.classList.remove('dropdown-open');
      window.bootstrap.Dropdown.getOrCreateInstance(otherButton).hide();
    }

    currentButton.closest('th')?.classList.add('dropdown-open');

    populateFilterDropdown(
      currentButton.nextElementSibling,
      currentButton.dataset.col,
      Number(currentButton.dataset.colIndex)
    );
  });

  head1.addEventListener('hide.bs.dropdown', (e) => {
    e.target.closest('th')?.classList.remove('dropdown-open');
  });

  const oldTbody = document.getElementById('sclTableBody');
  const tbody = oldTbody.cloneNode(true);
  oldTbody.replaceWith(tbody);
  tbody.id = 'sclTableBody';
  tbody.innerHTML = '';

  tbody.addEventListener('click', (event) => {
    const row = event.target.closest('tr');
    const actionButton = event.target.closest('[data-action]');
    if (row && !actionButton) {
      const scheduleId = Number(row.dataset.scheduleId || 0);
      if (scheduleId) {
        tableState.selectedScheduleId =
          tableState.selectedScheduleId === scheduleId ? null : scheduleId;
        renderSchedules();
        loadExecutionHistory();
      }
    }

    if (!actionButton) return;
    const scheduleId = Number(actionButton.dataset.scheduleId);
    const action = actionButton.dataset.action;

    if (action === 'edit') {
      const schedule = tableState.schedules.find((item) => item.schedule_id === scheduleId);
      if (schedule && canEditSchedule(schedule)) {
        openScheduleModal(scheduleId);
      }
      return;
    }

    if (action === 'run') {
      runSchedule(scheduleId);
    }
  });
}

function updateRowCount() {
  const rowCountInfo = document.getElementById('rowCountInfo');
  if (!rowCountInfo) return;
  const visibleRows = getFilteredSchedules().length;
  rowCountInfo.textContent = `${visibleRows} ${visibleRows === 1 ? 'Schedule' : 'Schedules'}`;
}

function updateFilterIcon(toggleButton, isFiltered) {
  const icon = toggleButton.querySelector('i');
  if (!icon) return;
  icon.className = isFiltered ? 'fa-solid fa-filter' : 'fa-solid fa-chevron-down';
}

function getColumnByLabel(colName) {
  return SCHEDULER_COLUMNS.find(({ label }) => label === colName);
}

function getFilterValue(schedule, column) {
  if (column.field) return String(getCellValue(schedule, column.field) ?? '');
  return '';
}

function getUniqueFilterValues(column) {
  return [
    ...new Set(tableState.schedules.map((schedule) => getFilterValue(schedule, column))),
  ].sort((first, second) =>
    String(first).localeCompare(String(second), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

function bindDropdownItemToggle(dropdownItem, checkbox) {
  dropdownItem.addEventListener('click', (e) => {
    if (e.target.closest('input') === checkbox) return;

    e.preventDefault();

    const nextChecked = checkbox.indeterminate ? true : !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.checked = nextChecked;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

function areArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function populateFilterDropdown(dropdown, colName, i) {
  const fieldset = dropdown.querySelector('.lovValuesFieldset');
  const selectAllCb = dropdown.querySelector('.selectAll');
  const toggleButton = dropdown.previousElementSibling;
  const selectAllItem = selectAllCb.closest('.dropdown-item');
  const rawValues = [];
  const column = getColumnByLabel(colName);

  fieldset.innerHTML = '<div class="text-center py-2"><small>Loading...</small></div>';

  if (!column) {
    fieldset.innerHTML =
      '<div class="text-center py-2 text-danger"><small>Failed to load</small></div>';
    return;
  }

  const values = getUniqueFilterValues(column);
  const activeSet = new Set(tableState.selectFilters?.[colName] ?? []);

  fieldset.innerHTML = '';
  if (values.length === 0) {
    fieldset.innerHTML = '<div class="text-center py-2 text-muted"><small>No values</small></div>';
  }

  for (const val of values) {
    const item = document.createElement('a');
    item.className = 'dropdown-item px-2 py-0';
    const wrapper = document.createElement('div');
    wrapper.className = 'form-check';
    const cb = document.createElement('input');
    cb.className = 'form-check-input lov-cb';
    cb.type = 'checkbox';
    const rawIndex = rawValues.push(val) - 1;
    cb.dataset.rawIndex = String(rawIndex);
    if (activeSet.has(val)) cb.checked = true;
    const cbId = `lov-cb-${colName.replace(/\W/g, '_')}-${rawIndex}-${i}`;
    cb.id = cbId;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.textContent = val ? val : '(blank)';
    label.htmlFor = cbId;
    wrapper.append(cb, label);
    bindDropdownItemToggle(item, cb);
    item.appendChild(wrapper);
    fieldset.appendChild(item);
  }

  const newSelectAllItem = selectAllItem.cloneNode(true);
  selectAllItem.parentNode.replaceChild(newSelectAllItem, selectAllItem);
  const newSelectAll = newSelectAllItem.querySelector('.selectAll');

  const syncSelectAll = () => {
    const all = fieldset.querySelectorAll('.lov-cb');
    const checked = fieldset.querySelectorAll('.lov-cb:checked');
    newSelectAll.checked = all.length > 0 && checked.length === all.length;
    newSelectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  };
  syncSelectAll();

  bindDropdownItemToggle(newSelectAllItem, newSelectAll);
  newSelectAll.addEventListener('change', () => {
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = newSelectAll.checked;
    }
  });

  fieldset.onchange = syncSelectAll;

  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn btn-sm btn-dark rounded-2 ms-auto';
  okBtn.textContent = 'OK';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-sm btn-secondary rounded-2';
  clearBtn.textContent = 'Clear';
  const clearOKContainer = dropdown.querySelector('.clearOKBtn');
  clearOKContainer.innerHTML = '';
  clearOKContainer.append(clearBtn, okBtn);

  okBtn.addEventListener('click', () => {
    const selected = [...fieldset.querySelectorAll('.lov-cb:checked')].map(
      (cb) => rawValues[Number(cb.dataset.rawIndex)]
    );
    const previousSelected = tableState.selectFilters[colName] ?? [];
    let filterChanged;

    if (selected.length) {
      filterChanged = !areArraysEqual(previousSelected, selected);
      if (filterChanged) {
        tableState.selectFilters[colName] = selected;
      }
    } else {
      filterChanged = previousSelected.length > 0;
      if (filterChanged) {
        delete tableState.selectFilters[colName];
      }
    }

    updateFilterIcon(toggleButton, colName in tableState.selectFilters);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      renderSchedules();
    }
  });

  clearBtn.addEventListener('click', () => {
    const filterChanged = (tableState.selectFilters[colName] ?? []).length > 0;
    delete tableState.selectFilters[colName];
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = false;
    }
    newSelectAll.checked = false;
    newSelectAll.indeterminate = false;
    updateFilterIcon(toggleButton, false);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      renderSchedules();
    }
  });
}

function getFilteredSchedules() {
  const activeSelectFilters = Object.entries(tableState.selectFilters).filter(
    ([, values]) => values.length > 0
  );
  const filteredSchedules =
    activeSelectFilters.length === 0
      ? [...tableState.schedules]
      : tableState.schedules.filter((schedule) =>
          activeSelectFilters.every(([columnLabel, selectedValues]) => {
            const column = getColumnByLabel(columnLabel);
            if (!column) return true;
            return selectedValues.includes(getFilterValue(schedule, column));
          })
        );

  return filteredSchedules;
}

function renderSchedules() {
  const tbody = document.getElementById('sclTableBody');
  if (!tbody) return;

  const visibleSchedules = getFilteredSchedules();
  if (
    tableState.selectedScheduleId &&
    !tableState.schedules.some((schedule) => schedule.schedule_id === tableState.selectedScheduleId)
  ) {
    tableState.selectedScheduleId = null;
  }

  if (visibleSchedules.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" class="text-center text-muted">No schedules found.</td></tr>';
    updateRowCount();
    return;
  }

  tbody.innerHTML = visibleSchedules
    .map((schedule) => {
      const isSelected = schedule.schedule_id === tableState.selectedScheduleId;
      const canEdit = canEditSchedule(schedule);
      const isEnabled = schedule.is_enabled === 1 || schedule.is_enabled === true;
      return `
        <tr class="${isSelected ? 'table-active' : ''}" data-schedule-id="${schedule.schedule_id}">
          <td>${escapeHtml(schedule.task_name || '—')}</td>
          <td>${escapeHtml(schedule.schedule_description || '—')}</td>
          <td>${escapeHtml(schedule.created_by || '—')}</td>
          <td>${escapeHtml(schedule.schedule_type || '—')}</td>
          <td>${escapeHtml(schedule.cron_expression || '—')}</td>
          <td>${getEnabledBadge(schedule)}</td>
          <td>${getRunningBadge(schedule)}</td>
          <td>${escapeHtml(formatDateTime(schedule.last_run_at))}</td>
          <td>${escapeHtml(formatDateTime(schedule.next_run_at))}</td>
          <td>
            <div class="d-flex gap-1 flex-wrap">
              <button type="button" class="btn btn-xs btn-outline-dark" data-action="run" data-schedule-id="${schedule.schedule_id}" title="Run schedule now" ${isEnabled ? '' : 'disabled'}>
                <i class="fa-solid fa-play" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn-xs btn-outline-dark" data-action="edit" data-schedule-id="${schedule.schedule_id}" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Edit schedule' : 'Only cron schedules are editable'}">
                <i class="fa-solid fa-pencil" aria-hidden="true"></i>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  updateRowCount();
}

function fillScheduleForm(schedule) {
  const descriptionInput = document.getElementById('scheduleDescription');
  const taskInput = document.getElementById('scheduleTask');
  const cronInput = document.getElementById('cronExpression');
  const nextRunInput = document.getElementById('scheduleNextRun');
  const enabledInput = document.getElementById('scheduleEnabled');
  const scheduleIdInput = document.getElementById('scheduleId');

  if (
    !descriptionInput ||
    !taskInput ||
    !cronInput ||
    !nextRunInput ||
    !enabledInput ||
    !scheduleIdInput
  )
    return;

  scheduleIdInput.value = schedule.schedule_id;
  descriptionInput.value = schedule.schedule_description || '';
  nextRunInput.value = '';
  taskInput.value = schedule.task_name || '';
  const cronExpression = (schedule.cron_expression || '').trim();
  cronInput.value = cronExpression;
  enabledInput.checked = schedule.is_enabled === 1 || schedule.is_enabled === true;

  if (!cronExpression) {
    setCronValidationState(false);
    return;
  }

  const isValid = getCronDescription(cronExpression) !== 'Invalid cron expression';
  setCronValidationState(isValid);
  validateCronExpression();
}

function openScheduleModal(scheduleId) {
  const schedule = tableState.schedules.find((item) => item.schedule_id === scheduleId);
  if (!schedule) return;
  tableState.selectedScheduleId = scheduleId;
  fillScheduleForm(schedule);
  const modalElement = document.getElementById('scheduleModal');
  if (modalElement) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();
  }
  renderSchedules();
}

function renderExecutionHistory(executions) {
  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  const selectedSchedule = tableState.schedules.find(
    (schedule) => schedule.schedule_id === tableState.selectedScheduleId
  );
  const historyHeading = document.getElementById('executionHistoryHeading');
  if (historyHeading) {
    historyHeading.textContent = selectedSchedule
      ? `Execution History - ${selectedSchedule.task_name || 'Selected Schedule'}`
      : 'Execution History - All Schedules';
  }

  const historyCount = document.getElementById('executionHistoryCount');
  if (historyCount) {
    historyCount.textContent = `${executions.length} ${
      executions.length === 1 ? 'Execution' : 'Executions'
    }`;
  }

  if (!executions.length) {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="text-center text-muted">No execution history found.</td></tr>';
    return;
  }

  tableBody.innerHTML = executions
    .map((execution) => {
      const resultText =
        execution.error_message ||
        (execution.result_data ? JSON.stringify(execution.result_data) : '—');
      const resultTitle = prettyIfJson(resultText);
      return `
        <tr>
          <td>${escapeHtml(execution.task_name || '—')}</td>
          <td>${getExecutionStatusBadge(execution.status)}</td>
          <td>${escapeHtml(formatDateTime(execution.started_at))}</td>
          <td>${escapeHtml(formatDateTime(execution.completed_at))}</td>
          <td>${escapeHtml(execution.duration_seconds ?? '—')}</td>
          <td>${escapeHtml(execution.retry_count ?? 0)}</td>
          <td title="${escapeHtml(resultTitle)}">${escapeHtml(resultText)}</td>
        </tr>`;
    })
    .join('');
}

async function loadExecutionHistory(scheduleId = tableState.selectedScheduleId) {
  setPageLoader(true);
  try {
    const response = await api.post('/scheduler/executions', {
      schedule_id: scheduleId || null,
    });
    tableState.executions = response.executions || [];
    renderExecutionHistory(tableState.executions);
  } catch {
    bsToastError('Unable to load scheduler execution history.');
  } finally {
    setPageLoader(false);
  }
}

async function saveSchedule() {
  const scheduleIdInput = document.getElementById('scheduleId');
  const descriptionInput = document.getElementById('scheduleDescription');
  const cronInput = document.getElementById('cronExpression');
  const enabledInput = document.getElementById('scheduleEnabled');

  if (!scheduleIdInput || !descriptionInput || !cronInput || !enabledInput) {
    return;
  }

  const payload = {
    schedule_id: Number(scheduleIdInput.value),
    schedule_description: descriptionInput.value.trim(),
    schedule_type: 'cron',
    cron_expression: cronInput.value.trim(),
    run_at: null,
    is_enabled: enabledInput.checked ? 1 : 0,
  };

  setPageLoader(true);
  try {
    const response = await api.post('/scheduler/update-schedule', payload);
    bsToastSuccess(response.message || 'Schedule updated successfully.');

    const scheduleId = Number(scheduleIdInput.value);
    const updatedNextRunAt = response?.next_run_at ?? response?.schedule?.next_run_at;

    if (scheduleId && updatedNextRunAt !== undefined) {
      const schedule = tableState.schedules.find((item) => item.schedule_id === scheduleId);
      if (schedule) {
        schedule.next_run_at = updatedNextRunAt;
        renderSchedules();
      }
    }

    const modalElement = document.getElementById('scheduleModal');
    if (modalElement) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
      modal.hide();
    }
    await loadSchedulerData();
    await loadExecutionHistory();
  } catch {
    bsToastError('Unable to save the selected schedule.');
  } finally {
    setPageLoader(false);
  }
}

function getCronDescription(expression) {
  try {
    return cronstrue.toString(expression, { locale: 'en' });
  } catch {
    return 'Invalid cron expression';
  }
}

function getNextCronRun(expression) {
  try {
    const interval = CronExpressionParser.parse(expression, { currentDate: new Date(), tz: 'UTC' });
    return formatDateTime(interval.next().toDate());
  } catch {
    return '';
  }
}

function setCronValidationState(isValid) {
  const cronInput = document.getElementById('cronExpression');
  const saveButton = document.getElementById('saveScheduleBtn');

  if (!cronInput || !saveButton) return;

  cronInput.classList.toggle('is-invalid', !isValid);
  saveButton.disabled = !isValid;
}

function validateCronExpression() {
  const cronInput = document.getElementById('cronExpression');
  const descriptionInput = document.getElementById('scheduleDescription');
  const nextRunInput = document.getElementById('scheduleNextRun');
  if (!cronInput || !descriptionInput || !nextRunInput) return;

  const expression = cronInput.value.trim();
  if (!expression) {
    descriptionInput.value = '';
    nextRunInput.value = '';
    setCronValidationState(false);
    return;
  }

  try {
    const description = getCronDescription(expression);
    const isValid = description !== 'Invalid cron expression';
    descriptionInput.value = description;
    nextRunInput.value = isValid ? getNextCronRun(expression) : '';
    setCronValidationState(isValid);
  } catch {
    bsToastError('Unable to validate the cron expression.');
    setCronValidationState(false);
  }
}

async function loadSchedulerData() {
  setPageLoader(true);
  try {
    const response = await api.post('/scheduler/schedules', {});
    tableState.schedules = response.schedules || [];
    renderSchedules();
  } catch {
    bsToastError('Unable to load scheduler information.');
  } finally {
    setPageLoader(false);
  }
}

export async function initSchedulerPage() {
  populateTableHeaders();
  document.getElementById('saveScheduleBtn')?.addEventListener('click', saveSchedule);

  const cronInput = document.getElementById('cronExpression');
  cronInput?.addEventListener('input', () => {
    validateCronExpression();
  });

  await loadSchedulerData();
  await loadExecutionHistory();
}
