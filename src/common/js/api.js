/**
 * Lightweight API client built on top of fetch.
 *
 * Uses VITE_API_BASE_URL from the environment to prefix all requests.
 *
 * Usage:
 *   import api from '@/common/js/api';
 *   const data = await api.get('/users');
 *   await api.post('/users', { name: 'Jane' });
 */

import { bsToastError } from './bsToast';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Extracts and decodes a filename from a Content-Disposition header value.
 * @param {string} contentDisposition - The raw Content-Disposition header (for example: `attachment; filename="file.txt"` or `attachment; filename*=UTF-8''file%20name.txt`).
 * @returns {string} The decoded filename if present, otherwise an empty string.
 */
function getDownloadFileName(contentDisposition) {
  if (!contentDisposition) return '';

  const fileNameMatch = contentDisposition.match(
    /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i
  );
  return fileNameMatch ? decodeURIComponent(fileNameMatch[1] || fileNameMatch[2]) : '';
}

/**
 * Execute an HTTP request against the configured API base URL with unified header handling, error reporting, and response parsing.
 *
 * @param {string} endpoint - Path appended to the configured BASE_URL.
 * @param {Object} [options] - Request options and overrides.
 * @param {boolean} [options.silent=false] - If true, suppresses user-facing toast error notifications.
 * @param {Object} [options.headers] - Additional headers to merge into the request; caller-provided headers override defaults.
 * @param {'json'|'blob'} [options.responseType='json'] - Expected response type; `'blob'` causes a `{ blob, fileName, contentType }` result.
 * @param {*} [options.*] - Any other fetch options (method, body, credentials, etc.). If `body` is a FormData instance, no default `Content-Type` is set.
 * @returns {any|null|{blob: Blob, fileName: string, contentType: string}} Parsed response: JSON by default, `null` for 204 No Content, or an object containing the blob and file metadata when `responseType` is `'blob'`.
 * @throws {Error} Throws the original network error if the request fails to reach the server.
 * @throws {Error} Throws an Error with `status` and optional `data` properties when the HTTP response has a non-OK status.
 */
async function request(endpoint, options = {}) {
  const { silent, headers = {}, responseType = 'json', ...fetchOptions } = options;
  const url = `${BASE_URL}${endpoint}`;
  const isFormDataBody = fetchOptions.body instanceof FormData;
  const resolvedHeaders = {
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    ...headers,
  };

  const config = {
    headers: resolvedHeaders,
    ...fetchOptions,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    if (!silent) bsToastError('Unable to reach the server. Please check your connection.');
    throw networkError;
  }

  if (!response.ok) {
    const error = new Error(`API error: ${response.status} ${response.statusText}`);
    error.status = response.status;
    try {
      error.data = await response.json();
    } catch {
      // response body is not JSON — ignore
    }

    if (!silent) {
      let message;
      if (error.status === 422) {
        // add more details on what is missing from the error response if available
        const missingFields = error.data?.detail
          ?.filter((item) => item.type === 'missing')
          .map((item) => item.loc.slice(-1)[0])
          .join(', ');
        message = missingFields
          ? `Missing required fields: ${missingFields}`
          : 'Validation error: Please check your input.';
      } else {
        message = error.data?.detail || 'An unexpected error occurred. Please try again.';
      }

      bsToastError(message);
    }
    throw error;
  }

  // 204 No Content
  if (response.status === 204) return null;

  if (responseType === 'blob') {
    return {
      blob: await response.blob(),
      fileName: getDownloadFileName(response.headers.get('content-disposition') || ''),
      contentType: response.headers.get('content-type') || '',
    };
  }

  return response.json();
}

const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),

  postDownload: (endpoint, body, options = {}) =>
    request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
      responseType: 'blob',
    }),

  postFormData: (endpoint, formData, options = {}) =>
    request(endpoint, { ...options, method: 'POST', body: formData, headers: {} }),

  put: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),

  patch: (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),

  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
