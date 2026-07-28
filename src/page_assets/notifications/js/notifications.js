import api from '@/common/js/api';
import { $, $$, on } from '@/common/js/dom';
import { bsToastSuccess, bsToastError, bsToastInfo } from '@/common/js/bsToast';

/** Escape a string for safe HTML insertion. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch];
  });
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
function renderStatusBadge(notification) {
  const isUnread = notification.is_read === 0;
  const label = isUnread ? 'Unread' : 'Read';
  const levelClass = getLevelBadgeClass(notification.notification_level);
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
    <td>${renderStatusBadge(notification)}</td>
    <td>${escapeHtml(notification.title)}</td>
    <td>${escapeHtml(notification.message)}</td>
    <td>${escapeHtml(notification.model_name ?? '')}</td>
    <td>${escapeHtml(notification.project_name ?? '')}</td>
    <td>${escapeHtml(notification.created_at ?? '')}</td>
    <td>
      <button type="button" class="btn btn-sm btn-dark details-btn m-0">Details</button>
    </td>
  `;

  return tr;
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

/** Update the unread count badge and the total row count footer. */
function updateCounts(notifications) {
  const unreadCount = notifications.filter((n) => n.is_read === 0).length;
  const totalCount = notifications.length;

  const unreadBadge = $('#unreadCountBadge');
  if (unreadBadge) {
    unreadBadge.textContent = unreadCount;
    unreadBadge.classList.toggle('d-none', unreadCount === 0);
  }

  const rowCountInfo = $('#rowCountInfo');
  if (rowCountInfo) {
    rowCountInfo.textContent = `${totalCount} Row${totalCount !== 1 ? 's' : ''}`;
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

  if (fromUserInput) fromUserInput.value = notification.from_user_email || '';
  if (modelNameInput) modelNameInput.value = notification.model_name || '';
  if (projectNameHidden) projectNameHidden.value = notification.project_name || '';
  if (notificationIdHidden) notificationIdHidden.value = notification.notification_id || '';
  if (currentProjectInput) currentProjectInput.value = notification.project_name || '';
  if (newModelNameInput) newModelNameInput.value = notification.model_name || '';
  if (saveCopyCheckbox) saveCopyCheckbox.checked = false;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Accept';
  }
  if (rejectBtn) {
    rejectBtn.disabled = false;
    rejectBtn.textContent = 'Reject';
  }

  const modalEl = $('#acceptModelModal');
  if (modalEl && window.bootstrap) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

/** Handle the Details button click based on notification_type. */
function handleDetailsClick(notification) {
  if (notification.notification_type === 'task_update') {
    openTaskDetails(notification);
  } else if (notification.notification_type === 'model_share_request') {
    openAcceptModelModal(notification);
  } else {
    bsToastInfo(notification.message || notification.title || 'Notification');
  }
}

/**
 * Mark all selected notifications as read.
 * Calls /notifications/mark-read for each selected row and refreshes the table.
 */
async function markSelectedAsRead() {
  const selectedRows = $$('#sclTableBody tr .row-checkbox:checked').map((cb) => cb.closest('tr'));
  if (selectedRows.length === 0) {
    bsToastInfo('No notifications selected.');
    return;
  }

  try {
    await Promise.all(
      selectedRows.map((row) =>
        api.post('/notifications/mark-read', { notification_id: Number(row.dataset.notificationId) || 0 })
      )
    );
    bsToastSuccess('Selected notifications marked as read.', 2000);
    await loadNotifications();
  } catch {
    // api.js already shows an error toast.
  }
}

/** Accept the model share request currently shown in the modal. */
async function handleAcceptModel() {
  const newModelNameInput = $('#acceptNewModelName');
  const projectNameHidden = $('#acceptProjectName');
  const notificationIdHidden = $('#acceptNotificationId');
  const saveCopyCheckbox = $('#acceptSaveCopy');
  const submitBtn = $('#submitAcceptModelBtn');
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
  const notificationIdHidden = $('#acceptNotificationId');
  const submitBtn = $('#submitAcceptModelBtn');
  const rejectBtn = $('#submitRejectModelBtn');
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

  const selectAll = document.querySelector('thead input[type="checkbox"]');
  if (selectAll) {
    on(selectAll, 'change', () => {
      $$('#sclTableBody .row-checkbox').forEach((cb) => {
        cb.checked = selectAll.checked;
      });
    });
  }
}

/** Wire the toolbar buttons and the accept/reject modal buttons. */
function wireToolbarAndModal() {
  const markReadBtn = $('#markReadBtn');
  if (markReadBtn) on(markReadBtn, 'click', markSelectedAsRead);

  const markUnreadBtn = $('#markUnreadBtn');
  if (markUnreadBtn) {
    on(markUnreadBtn, 'click', () => {
      bsToastInfo('Mark as unread is not supported.');
    });
  }

  const archiveBtn = $('#archiveBtn');
  if (archiveBtn) {
    on(archiveBtn, 'click', () => {
      bsToastInfo('Archive is not supported.');
    });
  }

  const deleteNotifBtn = $('#deleteNotifBtn');
  if (deleteNotifBtn) {
    on(deleteNotifBtn, 'click', () => {
      bsToastInfo('Delete is not supported.');
    });
  }

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

    tbody.innerHTML = '';
    notifications.forEach((notification) => {
      tbody.appendChild(renderRow(notification));
    });

    updateCounts(notifications);
  } catch {
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
  wireTableEvents();
  wireToolbarAndModal();
  await loadNotifications();
}
