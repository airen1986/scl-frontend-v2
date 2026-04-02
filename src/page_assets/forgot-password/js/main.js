import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // forgot-password-page-specific styles

import api from '@/common/js/api';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import { $, on, ready } from '@/common/js/dom';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Basic email format check */
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

/* ── Forgot Password ────────────────────────────────────────────────────────── */

ready(() => {
  const form = $('form');
  const emailInput = $('#emailInput');
  const submitBtn = $('button[type="submit"]', form);

  if (!form || !emailInput || !submitBtn) return;

  // Clear validation on input
  on(emailInput, 'input', () => clearInvalid(emailInput));

  on(form, 'submit', async (e) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────
    const email = emailInput.value.trim();

    if (!email) {
      setInvalid(emailInput, 'Email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setInvalid(emailInput, 'Please enter a valid email address.');
      return;
    }

    // ── Submit ───────────────────────────────────────────────────────────
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending…';

    try {
      const base_url = window.location.origin;
      await api.post('/auth/forgot-password', { email, base_url });

      // Show inline success message above the submit button
      let successAlert = $('#forgotPasswordSuccess');
      if (!successAlert) {
        successAlert = document.createElement('div');
        successAlert.id = 'forgotPasswordSuccess';
        successAlert.className = 'alert alert-success';
        submitBtn.parentElement.insertAdjacentElement('beforebegin', successAlert);
      }
      successAlert.textContent = `Reset link sent to ${email}. Check your inbox (and spam folder).`;

      await toastSuccess('Reset link sent!');

      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      window.location.href = '/reset-password.html?useremail=' + encodeURIComponent(email);

      // Keep button disabled with a confirmation label — no redirect needed
      submitBtn.textContent = 'Email Sent';
    } catch (err) {
      // api.js already shows an error toast for network / HTTP errors.
      // Only show a toast for unexpected issues not caught by api.js.
      if (!err.status) {
        toastError('An unexpected error occurred. Please try again.');
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reset Link';
    }
  });
});
