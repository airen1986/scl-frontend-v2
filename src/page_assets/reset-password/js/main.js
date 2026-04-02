import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // reset-password-page-specific styles

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

/* ── Reset Password ────────────────────────────────────────────────────────── */

ready(() => {
  const form = $('#resetPasswordForm');
  const emailInput = $('#emailInput');
  const verificationCodeInput = $('#verificationCodeInput');
  const passwordInput = $('#passwordInput');
  const confirmPasswordInput = $('#confirmPasswordInput');
  const submitBtn = $('button[type="submit"]', form);
  if (!form) return;

  // ── Pre-fill from URL query params ───────────────────────────────────────
  const params = new URLSearchParams(window.location.search);

  const userEmail = params.get('useremail');
  if (userEmail) {
    emailInput.value = userEmail;
    emailInput.disabled = true;
  }

  const verificationCode = params.get('verificationcode');
  if (verificationCode) {
    verificationCodeInput.value = verificationCode;
    verificationCodeInput.disabled = true;
  }

  // ── Clear validation on input ────────────────────────────────────────────
  on(emailInput, 'input', () => clearInvalid(emailInput));
  on(verificationCodeInput, 'input', () => clearInvalid(verificationCodeInput));
  on(passwordInput, 'input', () => clearInvalid(passwordInput));
  on(confirmPasswordInput, 'input', () => clearInvalid(confirmPasswordInput));

  on(form, 'submit', async (e) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────
    const email = emailInput.value.trim();
    const verification_code = verificationCodeInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    let valid = true;

    if (!email) {
      setInvalid(emailInput, 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      setInvalid(emailInput, 'Please enter a valid email address.');
      valid = false;
    }

    if (!verification_code) {
      setInvalid(verificationCodeInput, 'Verification code is required.');
      valid = false;
    }

    if (!password) {
      setInvalid(passwordInput, 'Password is required.');
      valid = false;
    } else if (password.length < 8) {
      setInvalid(passwordInput, 'Password must be at least 8 characters.');
      valid = false;
    }

    if (!confirmPassword) {
      setInvalid(confirmPasswordInput, 'Please confirm your password.');
      valid = false;
    } else if (password !== confirmPassword) {
      setInvalid(confirmPasswordInput, 'Passwords do not match.');
      valid = false;
    }

    if (!valid) return;

    // ── Submit ───────────────────────────────────────────────────────────
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Resetting…';

    try {
      await api.post('/auth/reset-password', { email, verification_code, password });

      await toastSuccess('Password reset successfully!');
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      window.location.href = '/login.html';
    } catch (err) {
      // api.js already shows an error toast for network / HTTP errors.
      // Only show a toast for unexpected issues not caught by api.js.
      if (!err.status) {
        toastError('An unexpected error occurred. Please try again.');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  });
});
