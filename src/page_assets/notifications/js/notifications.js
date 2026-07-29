import api from '@/common/js/api';
import { $, $$, on } from '@/common/js/dom';
import { bsToastSuccess, bsToastError, bsToastInfo } from '@/common/js/bsToast';

const NOTIFICATION_COLUMNS = [
  { label: 'Status', field: 'is_read', sortable: true },
  { label: 'Title', field: 'title', sortable: true },
  { label: 'Message', field: 'message', sortable: true },
  { label: 'Model Name', field: 'model_name', sortable: true },
  { label: 'Project Name', field: 'project_name', sortable: true },
  { label: 'Created At', field: 'created_at', sortable: true },
  { label: 'Action', field: null, sortable: false },
];

const tableState = {
  notifications: [],
  sortField: null,
  sortDirection: null,
  textFilters: {},
  selectFilters: {},
  currentProject: null,
};

async function fetchCurrentProject() {
  const data = await api.post('/projects/current', {});
  tableState.currentProject = data.project_name || 'Default';
}

function getReadStatusLabel(notification) {
  return notification.is_read === 0 ? 'Unread' : 'Read';
}

function getNotificationStatusLabel(notification) {
  if (notification.notification_type === 'model_share_request') {
    if (notification.is_accepted === 1) return 'Accepted';
    if (notification.is_accepted === -1) return 'Rejected';
  }
  return getReadStatusLabel(notification);
}

/** Escape a string for safe HTML insertion. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch];
  });
}

function populateTableHeaders() {
  try {
    // Populate head1: checkbox column + one <th> per column name
    const oldhead1 = document.getElementById('sclTableHead1');
    const head1 = oldhead1.cloneNode(true);
    oldhead1.replaceWith(head1);
    head1.id = 'sclTableHead1';

    head1.innerHTML =
      '<th style="width: 40px"><input type="checkbox" class="form-check-input" aria-label="Select all rows" /></th>';
    for (const column of NOTIFICATION_COLUMNS) {
      const th = document.createElement('th');
      const div = document.createElement('div');
      div.className = 'd-flex justify-content-between align-items-center';
      const span = document.createElement('span');
      span.textContent = column.label;
      div.appendChild(span);

      if (column.sortable) {
        const sortBtn = document.createElement('button');
        sortBtn.type = 'button';
        sortBtn.className = 'scl-sort-btn btn btn-link btn-sm p-0 text-dark';
        sortBtn.setAttribute('aria-label', `Sort by ${column.label}`);
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-sort';
        sortBtn.appendChild(icon);
        div.appendChild(sortBtn);
      }

      th.appendChild(div);
      head1.appendChild(th);
    }

    // Sort: click the <i> icon to cycle sort direction (none → ASC → DESC → none)
    head1.addEventListener('click', (e) => {
      const sortBtn = e.target.closest('.scl-sort-btn');
      if (sortBtn) {
        const th = sortBtn.closest('th');
        if (!th || !head1.contains(th)) return;
        const colIndex = [...head1.children].indexOf(th);
        if (colIndex <= 0) return;
        toggleColumnSort(colIndex);
        return;
      }
    });

    // Populate head2: empty checkbox column + one filter <th> per column
    const oldhead2 = document.getElementById('sclTableHead2');
    const head2 = oldhead2.cloneNode(true);
    oldhead2.replaceWith(head2);
    head2.id = 'sclTableHead2';
    head2.innerHTML = '<th></th>';
    let i = 0;
    for (const { label: colName } of NOTIFICATION_COLUMNS) {
      i += 1;
      const th = document.createElement('th');
      const div = document.createElement('div');
      div.className = 'input-group input-group-sm my-1';
      div.style.flexWrap = 'nowrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.dataset.col = colName; // Safe: dataset escapes automatically
      input.value = '';
      input.style.minWidth = '0';
      input.setAttribute('aria-label', `Filter ${colName}`);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'input-group-text px-1';
      btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      btn.setAttribute('aria-label', `Select filter for ${colName}`);
      btn.setAttribute('data-bs-toggle', 'dropdown');
      btn.setAttribute('data-bs-auto-close', 'outside');
      btn.setAttribute('aria-expanded', 'false');
      btn.dataset.colIndex = String(i); // 1-based index to match columnNames
      updateFilterIcon(btn, colName in (tableState.selectFilters ?? {}));

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
      const saInput = form1.querySelector('.selectAll');
      if (saInput) {
        const saId = `filter-select-all-${colName.replace(/\W/g, '_')}-${i}`;
        saInput.id = saId;
        const saLabel = saInput.closest('.form-check')?.querySelector('label');
        if (saLabel) saLabel.htmlFor = saId;
      }
      div.append(input, btn, dropdown);
      th.appendChild(div);
      head2.appendChild(th);
    }

    // Text-filter: on Enter, update appState.textFilters and refresh data
    head2.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'text') return;

      const colName = input.dataset.col;
      if (!colName) return;

      const filterValue = input.value.trim();
      if (filterValue) {
        tableState.textFilters[colName] = filterValue;
      } else {
        delete tableState.textFilters[colName];
      }

      renderNotifications(tableState.notifications);
    });

    head2.addEventListener('show.bs.dropdown', (e) => {
      const currentButton = e.target;

      for (const otherButton of head2.querySelectorAll('[data-bs-toggle="dropdown"]')) {
        if (otherButton === currentButton) continue;

        otherButton.closest('th')?.classList.remove('dropdown-open');
        window.bootstrap.Dropdown.getOrCreateInstance(otherButton).hide();
      }

      currentButton.closest('th')?.classList.add('dropdown-open');

      populateFilterDropdown(
        currentButton.nextElementSibling,
        currentButton.previousElementSibling.dataset.col,
        Number(currentButton.dataset.colIndex)
      );
    });

    head2.addEventListener('hide.bs.dropdown', (e) => {
      e.target.closest('th')?.classList.remove('dropdown-open');
    });

    // Select-all checkbox: toggle all body checkboxes
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    selectAllCb.addEventListener('change', () => {
      const tbody = document.getElementById('sclTableBody');
      for (const cb of tbody.querySelectorAll('input[type="checkbox"]')) {
        cb.checked = selectAllCb.checked;
      }
    });

    const oldtbody = document.getElementById('sclTableBody');
    const tbody = oldtbody.cloneNode(true);
    oldtbody.replaceWith(tbody);
    tbody.id = 'sclTableBody';

    // Body checkbox: sync select-all when individual rows change
    tbody.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const all = tbody.querySelectorAll('input[type="checkbox"]');
      const checked = tbody.querySelectorAll('input[type="checkbox"]:checked');
      selectAllCb.checked = all.length > 0 && checked.length === all.length;
      selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
    });

    // Clear body
    tbody.innerHTML = '';
  } finally {
    // hideTableLoader();
  }
}

/** Map notification_level to a Bootstrap badge background class. */
function getLevelBadgeClass(level) {
  switch (String(level).toUpperCase()) {
    case 'INFO':
      return 'bg-primary';
    case 'WARNING':
      return 'bg-warning text-dark';
    case 'ERROR':
      return 'bg-danger';
    default:
      return 'bg-secondary';
  }
}

/**
 * Render the status badge for a notification.
 * The badge text is "Unread" or "Read" and the background color is driven by notification_level.
 */
function getStatusBadgeClass(notification) {
  if (notification.notification_type === 'model_share_request') {
    if (notification.is_accepted === 1) return 'bg-success';
    if (notification.is_accepted === -1) return 'bg-danger';
  }
  return getLevelBadgeClass(notification.notification_level);
}

function renderStatusBadge(notification) {
  const label = getNotificationStatusLabel(notification);
  const levelClass = getStatusBadgeClass(notification);
  return `<span class="m-0 badge ${levelClass}">${escapeHtml(label)}</span>`;
}

/**
 * Build a table row for a notification.
 * All API fields are stored as data-* attributes on the <tr> for later use by action handlers.
 */
function renderRow(notification) {
  const isUnread = notification.is_read === 0;
  const tr = document.createElement('tr');
  tr.className = `scl-row ${isUnread ? 'fw-bold' : ''}`;

  // Store all notification fields as data attributes on the row.
  tr.dataset.notificationId = notification.notification_id ?? '';
  tr.dataset.fromUserEmail = notification.from_user_email ?? '';
  tr.dataset.title = notification.title ?? '';
  tr.dataset.message = notification.message ?? '';
  tr.dataset.notificationType = notification.notification_type ?? '';
  tr.dataset.notificationLevel = notification.notification_level ?? '';
  tr.dataset.projectName = notification.project_name ?? '';
  tr.dataset.modelName = notification.model_name ?? '';
  tr.dataset.isRead = notification.is_read ?? 0;
  tr.dataset.isAccepted = notification.is_accepted ?? 0;
  tr.dataset.taskId = notification.task_id ?? '';
  tr.dataset.createdAt = notification.created_at ?? '';

  tr.innerHTML = `
    <td class="text-center">
      <input type="checkbox" class="form-check-input"/>
    </td>
    <td title="${escapeHtml(getReadStatusLabel(notification))}">${renderStatusBadge(notification)}</td>
    <td title="${escapeHtml(notification.title)}">${escapeHtml(notification.title)}</td>
    <td title="${escapeHtml(notification.message)}">${escapeHtml(notification.message)}</td>
    <td title="${escapeHtml(notification.model_name ?? '')}">${escapeHtml(notification.model_name ?? '')}</td>
    <td title="${escapeHtml(notification.project_name ?? '')}">${escapeHtml(notification.project_name ?? '')}</td>
    <td title="${escapeHtml(notification.created_at ?? '')}">${escapeHtml(notification.created_at ?? '')}</td>
    <td>
      <button type="button" class="btn btn-xs btn-dark details-btn m-0">Details</button>
    </td>
  `;

  return tr;
}

function updateFilterIcon(toggleButton, isFiltered) {
  const icon = toggleButton.querySelector('i');
  if (!icon) return;
  icon.className = isFiltered ? 'fa-solid fa-filter' : 'fa-solid fa-chevron-down';
}

function getColumnByLabel(colName) {
  return NOTIFICATION_COLUMNS.find(({ label }) => label === colName);
}

function populateFilterDropdown(dropdown, colName, i) {
  const fieldset = dropdown.querySelector('.lovValuesFieldset');
  const selectAllCb = dropdown.querySelector('.selectAll');
  const toggleButton = dropdown.previousElementSibling;
  const selectAllItem = selectAllCb.closest('.dropdown-item');
  const rawValues = [];
  const column = getColumnByLabel(colName);

  fieldset.innerHTML = '<div class="text-center py-2"><small>Loading…</small></div>';

  if (!column) {
    fieldset.innerHTML =
      '<div class="text-center py-2 text-danger"><small>Failed to load</small></div>';
    return;
  }

  const values = getUniqueFilterValues(column);
  const activeSet = new Set(tableState.selectFilters?.[colName] ?? []);

  fieldset.innerHTML = '';
  dropdown.querySelector('.lov-truncated-note')?.remove();
  if (values.length === 0) {
    fieldset.innerHTML = '<div class="text-center py-2 text-muted"><small>No values</small></div>';
  }

  for (const val of values) {
    const a = document.createElement('a');
    a.className = 'dropdown-item px-2 py-0';
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
    bindDropdownItemToggle(a, cb);
    a.appendChild(wrapper);
    fieldset.appendChild(a);
  }

  // Clone & replace the entire dropdown-item wrapper to remove stale listeners
  // from prior loads (both the click handler on the item and change handler on the checkbox)
  const newSelectAllItem = selectAllItem.cloneNode(true);
  selectAllItem.parentNode.replaceChild(newSelectAllItem, selectAllItem);
  const newSelectAll = newSelectAllItem.querySelector('.selectAll');

  // Sync select-all checkbox state with individual checkboxes
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

  const OkBtn = document.createElement('button');
  OkBtn.type = 'button';
  OkBtn.className = 'btn btn-sm btn-dark rounded-2 ms-auto';
  OkBtn.textContent = 'OK';
  const ClearBtn = document.createElement('button');
  ClearBtn.type = 'button';
  ClearBtn.className = 'btn btn-sm btn-secondary rounded-2';
  ClearBtn.textContent = 'Clear';
  const clearOKContainer = dropdown.querySelector('.clearOKBtn');
  clearOKContainer.innerHTML = '';
  clearOKContainer.appendChild(ClearBtn);
  clearOKContainer.appendChild(OkBtn);

  OkBtn.addEventListener('click', () => {
    const selected = [...fieldset.querySelectorAll('.lov-cb:checked')].map(
      (cb) => rawValues[Number(cb.dataset.rawIndex)]
    );
    if (!tableState.selectFilters) tableState.selectFilters = {};
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
    updateFilterIcon(toggleButton, colName in (tableState.selectFilters ?? {}));
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      renderNotifications(tableState.notifications);
    }
  });

  ClearBtn.addEventListener('click', () => {
    const filterChanged = (tableState.selectFilters?.[colName] ?? []).length > 0;
    delete tableState.selectFilters?.[colName];
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = false;
    }
    newSelectAll.checked = false;
    newSelectAll.indeterminate = false;
    updateFilterIcon(toggleButton, false);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      renderNotifications(tableState.notifications);
    }
  });
}

function bindDropdownItemToggle(dropdownItem, checkbox) {
  dropdownItem.addEventListener('click', (e) => {
    if (e.target.closest('input') === checkbox) return;

    e.preventDefault();

    // If the checkbox is in an indeterminate state, clicking the row should behave like a user click:
    // clear indeterminate and move to a determinate checked state.
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

/** Reconstruct a notification object from a row's data-* attributes. */
function notificationFromRow(row) {
  return {
    notification_id: Number(row.dataset.notificationId) || 0,
    from_user_email: row.dataset.fromUserEmail,
    title: row.dataset.title,
    message: row.dataset.message,
    notification_type: row.dataset.notificationType,
    notification_level: row.dataset.notificationLevel,
    project_name: row.dataset.projectName,
    model_name: row.dataset.modelName,
    is_read: Number(row.dataset.isRead) || 0,
    is_accepted: Number(row.dataset.isAccepted) || 0,
    task_id: Number(row.dataset.taskId) || null,
    created_at: row.dataset.createdAt,
  };
}

function getSortValue(notification, field) {
  if (field === 'is_read') {
    return getReadStatusLabel(notification);
  }

  if (field === 'created_at') {
    const timestamp = Date.parse(notification.created_at ?? '');
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  return String(notification[field] ?? '').toLocaleLowerCase();
}

function getFilterValue(notification, column) {
  if (column.field === 'is_read') return getNotificationStatusLabel(notification);
  if (column.field) return String(notification[column.field] ?? '');
  if (column.label === 'Action') return 'Details';
  return '';
}

function getUniqueFilterValues(column) {
  const values = [
    ...new Set(
      tableState.notifications.map((notification) => getFilterValue(notification, column))
    ),
  ];

  if (column.field === 'is_read') {
    return values
      .filter((value) => value)
      .sort((first, second) =>
        String(first).localeCompare(String(second), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
  }

  return values.sort((first, second) =>
    String(first).localeCompare(String(second), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

function filterNotifications(notifications) {
  const activeTextFilters = Object.entries(tableState.textFilters).filter(([, value]) => value);
  const activeSelectFilters = Object.entries(tableState.selectFilters).filter(
    ([, values]) => values.length > 0
  );
  if (activeTextFilters.length === 0 && activeSelectFilters.length === 0) {
    return [...notifications];
  }

  return notifications.filter(
    (notification) =>
      activeTextFilters.every(([columnLabel, filterValue]) => {
        const column = getColumnByLabel(columnLabel);
        if (!column) return true;

        return getFilterValue(notification, column)
          .toLocaleLowerCase()
          .includes(filterValue.toLocaleLowerCase());
      }) &&
      activeSelectFilters.every(([columnLabel, selectedValues]) => {
        const column = getColumnByLabel(columnLabel);
        if (!column) return true;

        return selectedValues.includes(getFilterValue(notification, column));
      })
  );
}

function sortNotifications(notifications) {
  if (!tableState.sortField || !tableState.sortDirection) return [...notifications];

  const directionMultiplier = tableState.sortDirection === 'ASC' ? 1 : -1;
  return [...notifications].sort((first, second) => {
    const firstValue = getSortValue(first, tableState.sortField);
    const secondValue = getSortValue(second, tableState.sortField);

    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
      return (firstValue - secondValue) * directionMultiplier;
    }

    return (
      String(firstValue).localeCompare(String(secondValue), undefined, {
        numeric: true,
        sensitivity: 'base',
      }) * directionMultiplier
    );
  });
}

function updateSortIcons() {
  const head1 = $('#sclTableHead1');
  if (!head1) return;

  NOTIFICATION_COLUMNS.forEach((column, index) => {
    const th = head1.children[index + 1];
    const sortBtn = th?.querySelector('.scl-sort-btn');
    const icon = sortBtn?.querySelector('i');
    if (!sortBtn || !icon) return;

    const isActive = column.field === tableState.sortField;
    const direction = isActive ? tableState.sortDirection : null;
    const iconClass =
      direction === 'ASC'
        ? 'fa-solid fa-sort-up'
        : direction === 'DESC'
          ? 'fa-solid fa-sort-down'
          : 'fa-solid fa-sort';

    icon.className = iconClass;
    sortBtn.setAttribute(
      'aria-label',
      `Sort by ${column.label}${direction ? ` ${direction.toLowerCase()}` : ''}`
    );
  });
}

function renderNotifications(notifications) {
  const tbody = $('#sclTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const visibleNotifications = sortNotifications(filterNotifications(notifications));
  visibleNotifications.forEach((notification) => {
    tbody.appendChild(renderRow(notification));
  });
  updateCounts(visibleNotifications, notifications.length);

  const selectAllCb = $('#sclTableHead1 input[type="checkbox"]');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
  }
}

function toggleColumnSort(colIndex) {
  const column = NOTIFICATION_COLUMNS[colIndex - 1];
  if (!column?.sortable || !column.field) return;

  if (tableState.sortField !== column.field) {
    tableState.sortField = column.field;
    tableState.sortDirection = 'ASC';
  } else if (tableState.sortDirection === 'ASC') {
    tableState.sortDirection = 'DESC';
  } else {
    tableState.sortField = null;
    tableState.sortDirection = null;
  }

  updateSortIcons();
  renderNotifications(tableState.notifications);
}

async function resetTableView() {
  tableState.sortField = null;
  tableState.sortDirection = null;
  tableState.textFilters = {};
  tableState.selectFilters = {};

  $$('#sclTableHead2 input[type="text"]').forEach((input) => {
    input.value = '';
  });
  $$('#sclTableHead2 [data-bs-toggle="dropdown"]').forEach((button) => {
    updateFilterIcon(button, false);
  });

  updateSortIcons();
  await loadNotifications();
}

/** Update the unread count badge and the total/filtered row count footer. */
function updateCounts(notifications, totalRowCount = notifications.length) {
  const unreadCount = tableState.notifications.filter((n) => n.is_read === 0).length;
  const visibleRowCount = notifications.length;

  const unreadBadge = $('#unreadCountBadge');
  if (unreadBadge) {
    unreadBadge.textContent = unreadCount;
    unreadBadge.classList.toggle('d-none', unreadCount === 0);
  }

  const rowCountInfo = $('#rowCountInfo');
  if (rowCountInfo) {
    rowCountInfo.textContent =
      visibleRowCount === totalRowCount
        ? `${totalRowCount} Row${totalRowCount !== 1 ? 's' : ''}`
        : `${visibleRowCount} out of ${totalRowCount} rows filtered`;
  }
}

/** Open the task-details page in a new tab for a task_update notification. */
function openTaskDetails(notification) {
  const params = new URLSearchParams();
  if (notification.task_id) params.set('task_id', notification.task_id);
  if (notification.model_name) params.set('model_name', notification.model_name);
  if (notification.project_name) params.set('project_name', notification.project_name);
  window.open(`/task-details.html?${params.toString()}`, '_blank');
}

/** Mark a single notification as read via API and update local state. */
async function markNotificationAsRead(notification) {
  if (!notification || notification.is_read === 1) return;

  try {
    await api.post('/notifications/mark-read', {
      notification_ids: [Number(notification.notification_id) || 0],
    });
    const rowNotification = tableState.notifications.find(
      (item) => Number(item.notification_id) === Number(notification.notification_id)
    );
    if (rowNotification) {
      rowNotification.is_read = 1;
    }
    renderNotifications(tableState.notifications);
    bsToastSuccess('Notification marked as read.', 1500);
  } catch {
    // api.js already shows an error toast.
  }
}

/** Populate and show the Accept Model modal for a model_share_request notification. */
function openAcceptModelModal(notification) {
  const fromUserInput = $('#acceptFromUser');
  const modelNameInput = $('#acceptModelName');
  const projectNameHidden = $('#acceptProjectName');
  const notificationIdHidden = $('#acceptNotificationId');
  const currentProjectInput = $('#acceptCurrentProject');
  const newModelNameInput = $('#acceptNewModelName');
  const saveCopyCheckbox = $('#acceptSaveCopy');
  const submitBtn = $('#submitAcceptModelBtn');
  const rejectBtn = $('#submitRejectModelBtn');

  const isAccepted = notification.is_accepted === 1;
  const isRejected = notification.is_accepted === -1;
  const isReadOnly = isAccepted || isRejected;

  if (fromUserInput) fromUserInput.value = notification.from_user_email || '';
  if (modelNameInput) modelNameInput.value = notification.model_name || '';
  if (projectNameHidden) projectNameHidden.value = notification.project_name || '';
  if (notificationIdHidden) notificationIdHidden.value = notification.notification_id || '';
  if (currentProjectInput) currentProjectInput.value = tableState.currentProject || '';
  if (newModelNameInput) newModelNameInput.value = notification.model_name || '';
  if (saveCopyCheckbox) saveCopyCheckbox.checked = false;

  const newModelNameWrapper = newModelNameInput?.closest('.mb-3');
  const saveCopyWrapper = saveCopyCheckbox?.closest('.form-check');
  const projectNameWrapper = $('#acceptProjectNameGroup');
  const currentProjectWrapper = $('#acceptCurrentProjectGroup');
  const modalTitle = $('#acceptModelLabel');
  let statusMessage = $('#acceptModalStatusMessage');

  if (!statusMessage && newModelNameWrapper) {
    statusMessage = document.createElement('div');
    statusMessage.id = 'acceptModalStatusMessage';
    statusMessage.className = 'alert py-2 d-none';
    newModelNameWrapper.parentNode.insertBefore(statusMessage, newModelNameWrapper);
  }

  if (isReadOnly) {
    const statusText = isAccepted
      ? 'This model share request has already been accepted.'
      : 'This model share request has already been rejected.';
    const statusClass = isAccepted ? 'alert-success' : 'alert-danger';
    if (modalTitle) modalTitle.textContent = isAccepted ? 'Model Accepted' : 'Model Rejected';
    if (statusMessage) {
      statusMessage.textContent = statusText;
      statusMessage.className = `alert ${statusClass} py-2`;
    }
    if (newModelNameWrapper) newModelNameWrapper.classList.add('d-none');
    if (saveCopyWrapper) saveCopyWrapper.classList.add('d-none');
    if (projectNameWrapper) projectNameWrapper.classList.remove('d-none');
    if (currentProjectWrapper) currentProjectWrapper.classList.add('d-none');
  } else {
    if (modalTitle) modalTitle.textContent = 'Accept Model';
    if (statusMessage) statusMessage.classList.add('d-none');
    if (newModelNameWrapper) newModelNameWrapper.classList.remove('d-none');
    if (saveCopyWrapper) saveCopyWrapper.classList.remove('d-none');
    if (projectNameWrapper) projectNameWrapper.classList.add('d-none');
    if (currentProjectWrapper) currentProjectWrapper.classList.remove('d-none');
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = isReadOnly ? 'OK' : 'Accept';
    submitBtn.dataset.mode = isReadOnly ? 'close' : 'action';
  }
  if (rejectBtn) {
    rejectBtn.disabled = false;
    rejectBtn.textContent = isReadOnly ? 'Cancel' : 'Reject';
    rejectBtn.dataset.mode = isReadOnly ? 'close' : 'action';
  }

  const modalEl = $('#acceptModelModal');
  if (modalEl && window.bootstrap) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

/** Handle the Details button click based on notification_type. */
async function handleDetailsClick(notification) {
  if (notification.notification_type === 'task_update') {
    openTaskDetails(notification);
  } else if (notification.notification_type === 'model_share_request') {
    openAcceptModelModal(notification);
  } else {
    bsToastInfo(notification.message || notification.title || 'Notification');
  }

  if (notification.is_read === 0) {
    await markNotificationAsRead(notification);
  }
}

/**
 * Mark all selected unread notifications as read.
 * Calls /notifications/mark-read for unread selected rows and refreshes the table.
 */
async function markSelectedAsRead() {
  const selectedRows = $$('#sclTableBody tr .form-check-input:checked').map((cb) =>
    cb.closest('tr')
  );
  if (selectedRows.length === 0) {
    bsToastInfo('No notifications selected.');
    return;
  }

  const unreadRows = selectedRows.filter((row) => Number(row.dataset.isRead) === 0);
  if (unreadRows.length === 0) {
    bsToastInfo('Selected notifications are already read.');
    return;
  }

  const notification_ids = unreadRows.map((row) => Number(row.dataset.notificationId) || 0);

  try {
    await api.post('/notifications/mark-read', { notification_ids });
    bsToastSuccess('Selected unread notifications marked as read.', 2000);
    await loadNotifications();
  } catch {
    // api.js already shows an error toast.
  }
}

/** Accept the model share request currently shown in the modal. */
async function handleAcceptModel() {
  const submitBtn = $('#submitAcceptModelBtn');
  const mode = submitBtn?.dataset.mode;

  if (mode === 'close') {
    $('#acceptModelModal') && window.bootstrap?.Modal.getInstance($('#acceptModelModal'))?.hide();
    return;
  }

  const newModelNameInput = $('#acceptNewModelName');
  const projectNameHidden = $('#acceptCurrentProject');
  const notificationIdHidden = $('#acceptNotificationId');
  const saveCopyCheckbox = $('#acceptSaveCopy');
  const rejectBtn = $('#submitRejectModelBtn');

  const newModelName = newModelNameInput?.value.trim();
  const projectName = projectNameHidden?.value;
  const notificationId = Number(notificationIdHidden?.value) || 0;

  if (!newModelName) {
    bsToastError('New model name is required.');
    return;
  }
  if (!notificationId) {
    bsToastError('Notification ID is missing.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Accepting…';
  }
  if (rejectBtn) rejectBtn.disabled = true;

  try {
    await api.post('/notifications/accept', {
      notification_id: notificationId,
      accept: true,
      model_name: newModelName,
      project_name: projectName,
      create_new_copy: saveCopyCheckbox?.checked ?? false,
    });
    bsToastSuccess('Model accepted successfully!', 2000);
    $('#acceptModelModal') && window.bootstrap?.Modal.getInstance($('#acceptModelModal'))?.hide();
    await loadNotifications();
  } catch {
    // api.js already shows an error toast.
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Accept';
    }
    if (rejectBtn) rejectBtn.disabled = false;
  }
}

/** Reject the model share request currently shown in the modal. */
async function handleRejectModel() {
  const rejectBtn = $('#submitRejectModelBtn');
  const submitBtn = $('#submitAcceptModelBtn');
  const mode = rejectBtn?.dataset.mode;

  if (mode === 'close') {
    $('#acceptModelModal') && window.bootstrap?.Modal.getInstance($('#acceptModelModal'))?.hide();
    return;
  }

  const notificationIdHidden = $('#acceptNotificationId');
  const notificationId = Number(notificationIdHidden?.value) || 0;

  if (!notificationId) {
    bsToastError('Notification ID is missing.');
    return;
  }

  if (rejectBtn) {
    rejectBtn.disabled = true;
    rejectBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Rejecting…';
  }
  if (submitBtn) submitBtn.disabled = true;

  try {
    await api.post('/notifications/accept', {
      notification_id: notificationId,
      accept: false,
    });
    bsToastSuccess('Model rejected.', 2000);
    $('#acceptModelModal') && window.bootstrap?.Modal.getInstance($('#acceptModelModal'))?.hide();
    await loadNotifications();
  } catch {
    // api.js already shows an error toast.
  } finally {
    if (rejectBtn) {
      rejectBtn.disabled = false;
      rejectBtn.textContent = 'Reject';
    }
    if (submitBtn) submitBtn.disabled = false;
  }
}

/** Wire up the select-all checkbox and Details buttons inside the table body. */
function wireTableEvents() {
  const tbody = $('#sclTableBody');
  if (!tbody) return;

  on(tbody, 'click', (event) => {
    const target = event.target;

    if (target.classList.contains('details-btn')) {
      const row = target.closest('tr');
      if (row) handleDetailsClick(notificationFromRow(row));
      return;
    }
  });
}

/** Wire the toolbar buttons and the accept/reject modal buttons. */
function wireToolbarAndModal() {
  const markReadBtn = $('#markReadBtn');
  if (markReadBtn) on(markReadBtn, 'click', markSelectedAsRead);

  const refreshNotifBtn = $('#refreshNotifBtn');
  if (refreshNotifBtn) on(refreshNotifBtn, 'click', resetTableView);

  const submitAcceptBtn = $('#submitAcceptModelBtn');
  if (submitAcceptBtn) on(submitAcceptBtn, 'click', handleAcceptModel);

  const submitRejectBtn = $('#submitRejectModelBtn');
  if (submitRejectBtn) on(submitRejectBtn, 'click', handleRejectModel);
}

/**
 * Fetch notifications from the server and render the table.
 */
async function loadNotifications() {
  const tbody = $('#sclTableBody');
  if (!tbody) return;

  try {
    const data = await api.post('/notifications/get', { get_all: true });
    const notifications = data.notifications || [];

    tableState.notifications = notifications;
    renderNotifications(tableState.notifications);
    updateSortIcons();
  } catch {
    tableState.notifications = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-danger">
          Failed to load notifications. Please try again.
        </td>
      </tr>
    `;
    updateCounts([]);
  }
}

/**
 * Initialize the notifications table page.
 * Loads the initial data and wires all interactive controls.
 */
export async function initNotificationsTable() {
  populateTableHeaders();
  wireTableEvents();
  wireToolbarAndModal();
  await Promise.all([
    fetchCurrentProject().catch(() => {
      tableState.currentProject = 'Default';
    }),
    loadNotifications(),
  ]);
}
