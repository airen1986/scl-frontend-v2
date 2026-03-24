import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // home-page-specific styles

import api from '@/common/js/api';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import { $, on, ready } from '@/common/js/dom';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Return up to 2 uppercase initials from a display name. */
function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Mark a field as invalid with Bootstrap validation classes */
function setInvalid(input, message) {
  input.classList.add('is-invalid');
  let feedback = input.nextElementSibling;
  if (!feedback || !feedback.classList.contains('invalid-feedback')) {
    feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    input.parentNode.insertBefore(feedback, input.nextSibling);
  }
  feedback.textContent = message;
}

/** Clear validation state from a field */
function clearInvalid(input) {
  input.classList.remove('is-invalid');
  const feedback = input.nextElementSibling;
  if (feedback && feedback.classList.contains('invalid-feedback')) {
    feedback.textContent = '';
  }
}

/* ── Home Page ─────────────────────────────────────────────────────────────── */

ready(async () => {
  // ── Auth guard: redirect to login if not authenticated ────────────────
  let user;
  try {
    user = await api.post('/auth/me', {}, { silent: true });
    if (user && user.role_name) {
      sessionStorage.setItem('user', JSON.stringify(user));
    } else {
      window.location.href = 'login.html';
      return;
    }
  } catch {
    window.location.href = 'login.html';
    return;
  }

  // ── Display avatar initials ──────────────────────────────────────────
  const avatar = $('#displayAvatar');
  if (avatar) {
    avatar.textContent = getInitials(user.display_name);
  }

  // ── Logout ───────────────────────────────────────────────────────────
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) {
    on(logoutBtn, 'click', async (e) => {
      e.preventDefault();
      try {
        await api.post('/auth/logout', {});
      } catch {
        // Even if the server call fails, clear local session.
      }
      sessionStorage.removeItem('user');
      window.location.href = 'login.html';
    });
  }

  // ── Reset Password ──────────────────────────────────────────────────────
  const resetForm = $('#resetPasswordForm');
  const currentPasswordInput = $('#currentPassword');
  const newPasswordInput = $('#newPassword');
  const confirmPasswordInput = $('#confirmPassword');
  const submitResetBtn = $('#submitResetBtn');
  const resetModal = $('#resetPasswordModal');

  if (resetForm) {
    on(currentPasswordInput, 'input', () => clearInvalid(currentPasswordInput));
    on(newPasswordInput, 'input', () => clearInvalid(newPasswordInput));
    on(confirmPasswordInput, 'input', () => clearInvalid(confirmPasswordInput));

    // Clear form when modal is closed
    on(resetModal, 'hidden.bs.modal', () => {
      resetForm.reset();
      clearInvalid(currentPasswordInput);
      clearInvalid(newPasswordInput);
      clearInvalid(confirmPasswordInput);
    });

    on(submitResetBtn, 'click', async () => {
      const currentPassword = currentPasswordInput.value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      let valid = true;

      if (!currentPassword) {
        setInvalid(currentPasswordInput, 'Current password is required.');
        valid = false;
      }

      if (!newPassword) {
        setInvalid(newPasswordInput, 'New password is required.');
        valid = false;
      } else if (newPassword.length < 8) {
        setInvalid(newPasswordInput, 'Password must be at least 8 characters.');
        valid = false;
      }

      if (!confirmPassword) {
        setInvalid(confirmPasswordInput, 'Please confirm your new password.');
        valid = false;
      } else if (newPassword !== confirmPassword) {
        setInvalid(confirmPasswordInput, 'Passwords do not match.');
        valid = false;
      }

      if (!valid) return;

      submitResetBtn.disabled = true;
      submitResetBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting…';

      try {
        await api.post('/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        });

        await toastSuccess('Password reset successfully!');
        bootstrap.Modal.getInstance(resetModal)?.hide();
      } catch (err) {
        if (!err.status) {
          toastError('An unexpected error occurred. Please try again.');
        }
      } finally {
        submitResetBtn.disabled = false;
        submitResetBtn.textContent = 'Reset Password';
      }
    });
  }
});
