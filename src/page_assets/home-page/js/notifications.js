import api from '@/common/js/api';
import { $ } from '@/common/js/dom';

/**
 * Populate the notifications dropdown and update the unread indicator.
 *
 * Fetches notifications, renders them into #notificationList (including "New" badges for unread items),
 * toggles the visibility of #notificationDot when unread notifications exist, and appends a divider with a
 * "View all notifications" link. If a notification has type "model_share_request", clicking it opens the
 * accept-model modal populated from the notification. On fetch failure or when there are no notifications,
 * replaces the list with an appropriate message and hides the unread dot if present.
 */
export async function initNotifications() {
  const list = $('#notificationList');
  const dot = $('#notificationDot');
  if (!list) return;

  let notifications;
  try {
    const data = await api.post('/models/get-notifications');
    notifications = data.notifications || [];
  } catch {
    list.innerHTML = '<li class="dropdown-item text-danger">Failed to load notifications</li>';
    if (dot) dot.style.display = 'none';
    return;
  }

  // ── Render list ──────────────────────────────────────────────────────────
  if (!notifications || notifications.length === 0) {
    list.innerHTML = '<li class="dropdown-item text-muted">No notifications</li>';
    if (dot) dot.style.display = 'none';
    return;
  }

  const hasUnread = notifications.some((notification) => notification.is_read === 0);

  if (dot) dot.style.display = hasUnread ? 'block' : 'none';

  list.innerHTML = '';

  notifications.forEach((notification) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'dropdown-item d-flex justify-content-between align-items-center';
    a.href = '#';

    const label = document.createElement('small');
    label.textContent = notification.title || notification.message;
    a.appendChild(label);

    if (notification.is_read === 0) {
      const badge = document.createElement('span');
      badge.className = 'badge bg-primary ms-2';
      badge.textContent = 'New';
      a.appendChild(badge);
    }

    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (notification.notification_type === 'model_share_request') {
        openAcceptModelModal(notification);
      }
    });

    li.appendChild(a);
    list.appendChild(li);
  });

  // ── Divider + "View all" link ──────────────────────────────────────────
  const divider = document.createElement('li');
  divider.innerHTML = '<hr class="dropdown-divider">';
  list.appendChild(divider);

  const viewAll = document.createElement('li');
  viewAll.innerHTML =
    '<a class="dropdown-item small text-muted" href="#">View all notifications</a>';
  list.appendChild(viewAll);
}

/**
 * Populate and display the Accept Model modal using values from a notification.
 *
 * Populates form fields for sender email, model name, project name, and notification id
 * from the provided notification object, then opens the Bootstrap modal #acceptModelModal.
 *
 * @param {Object} notification - Notification data used to fill the modal.
 * @param {string} [notification.from_user_email] - Email of the user who sent the model share request.
 * @param {string} [notification.model_name] - Name of the shared model.
 * @param {string} [notification.project_name] - Name of the project containing the model.
 * @param {string|number} [notification.notification_id] - Identifier of the notification.
 */
function openAcceptModelModal(notification) {
  const fromUserInput = $('#acceptFromUser');
  const modelNameInput = $('#acceptModelName');
  const projectNameHidden = $('#acceptProjectName');
  const notificationIdHidden = $('#acceptNotificationId');

  if (fromUserInput) fromUserInput.value = notification.from_user_email || '';
  if (modelNameInput) modelNameInput.value = notification.model_name || '';
  if (projectNameHidden) projectNameHidden.value = notification.project_name || '';
  if (notificationIdHidden) notificationIdHidden.value = notification.notification_id || '';

  const modalEl = $('#acceptModelModal');
  if (modalEl) {
    const modal = new window.bootstrap.Modal(modalEl);
    modal.show();
  }
}
