import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // signup-page-specific styles

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

/* ── Signup ─────────────────────────────────────────────────────────────────── */

ready(() => {
  const form = $('form');
  const firstNameInput = $('#firstNameInput');
  const lastNameInput = $('#lastNameInput');
  const emailInput = $('#emailInput');
  const passwordInput = $('#passwordInput');
  const confirmPasswordInput = $('#confirmPasswordInput');
  const termsCheck = $('#termsCheck');
  const submitBtn = $('button[type="submit"]', form);
  const signupMessage = $('#signupMessage');

  if (!form) return;

  // Clear validation on input
  on(firstNameInput, 'input', () => clearInvalid(firstNameInput));
  on(lastNameInput, 'input', () => clearInvalid(lastNameInput));
  on(emailInput, 'input', () => clearInvalid(emailInput));
  on(passwordInput, 'input', () => clearInvalid(passwordInput));
  on(confirmPasswordInput, 'input', () => clearInvalid(confirmPasswordInput));
  on(termsCheck, 'change', () => termsCheck.classList.remove('is-invalid'));

  on(form, 'submit', async (e) => {
    e.preventDefault();

    // ── Client-side validation ──────────────────────────────────────────
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    let valid = true;

    if (!firstName) {
      setInvalid(firstNameInput, 'First name is required.');
      valid = false;
    }

    if (!lastName) {
      setInvalid(lastNameInput, 'Last name is required.');
      valid = false;
    }

    if (!email) {
      setInvalid(emailInput, 'Email is required.');
      valid = false;
    } else if (!isValidEmail(email)) {
      setInvalid(emailInput, 'Please enter a valid email address.');
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

    if (!termsCheck.checked) {
      termsCheck.classList.add('is-invalid');
      valid = false;
    }

    if (!valid) return;

    // ── Submit ───────────────────────────────────────────────────────────
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating account…';

    try {
      const username = firstName + ' ' + lastName;
      await api.post('/auth/register', { username, email, password });

      signupMessage.classList.remove('d-none', 'alert-danger');
      signupMessage.classList.add('alert-success');
      signupMessage.textContent = 'Account created successfully! Redirecting to sign in…';

      await toastSuccess('Account created successfully!');
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      window.location.href = 'login.html';
    } catch (err) {
      // api.js already shows an error toast for network / HTTP errors.
      // Only show a toast for unexpected issues not caught by api.js.
      if (!err.status) {
        toastError('An unexpected error occurred. Please try again.');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  });
});
