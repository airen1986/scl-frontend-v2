/**
 * Model Files modal — list, delete, download, and upload input/output files
 * for the currently selected project + model.
 *
 * API conventions used (all POST to match the existing codebase style):
 *   POST /models/list-files          { project, model }                       → [{file_id, file_name, file_type, file_extension, uploaded_file_name, last_updated, file_exists}]
 *   POST /models/delete-file         { project, model, file_id }              → 200
 *   POST /models/download-file       { project, model, file_id }              → blob
 *   POST /models/upload-file         FormData(project, model, file_id, file)  → 200
 */

import { bsToastSuccess as toastSuccess } from '../../../common/js/bsToast';
import api from '@/common/js/api';
import { $, on } from '@/common/js/dom';

/* ── DOM refs ───────────────────────────────────────────────────────────────── */

const EL = () => ({
  modal: $('#modelFilesModal'),
  icon: $('#modelFilesModalIcon'),
  titleText: $('#modelFilesModalTitleText'),
  loading: $('#modelFilesLoading'),
  empty: $('#modelFilesEmpty'),
  tableWrap: $('#modelFilesTableWrap'),
  thead: $('#modelFilesTableHead'),
  tbody: $('#modelFilesTableBody'),
  hiddenInput: $('#modelFilesHiddenUpload'),
});

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function showOnly(el, { loading, empty, tableWrap }) {
  loading.classList.toggle('d-none', el !== loading);
  empty.classList.toggle('d-none', el !== empty);
  tableWrap.classList.toggle('d-none', el !== tableWrap);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString();
}

/** Trigger a browser download from a Blob. */
function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/* ── Table rendering ─────────────────────────────────────────────────────────── */

function renderTableHead(fileType, els) {
  if (fileType === 'input') {
    els.thead.innerHTML = `
      <tr>
        <th scope="col">Filename</th>
        <th scope="col">Uploaded File</th>
        <th scope="col" style="width:140px">Date</th>
        <th scope="col" class="text-center" style="width:140px">Actions</th>
      </tr>`;
  } else {
    els.thead.innerHTML = `
      <tr>
        <th scope="col">Filename</th>
        <th scope="col" style="width:160px">Output Date</th>
        <th scope="col" class="text-center" style="width:120px">Actions</th>
      </tr>`;
  }
}

function actionBtn(icon, title, disabled, cls) {
  if (disabled) return '';
  return `<button class="btn btn-sm btn-outline-secondary ${cls}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
}

let pendingUploadChangeHandler = null;

function appendCell(row, text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  row.appendChild(td);
  return td;
}

function appendActionsCell(row, actionsMarkup) {
  const td = document.createElement('td');
  td.className = 'text-center text-nowrap';
  td.innerHTML = actionsMarkup;
  row.appendChild(td);
  return td;
}

function renderTableBody(files, fileType, els) {
  els.tbody.innerHTML = '';

  files.forEach((f) => {
    const tr = document.createElement('tr');
    tr.dataset.fileId = f.file_id;
    tr.dataset.fileExtension = f.file_extension || '';
    tr.dataset.fileName = f.file_name || '';

    if (fileType === 'input') {
      appendCell(tr, f.file_name || '');
      appendCell(tr, f.uploaded_file_name || '—');
      appendCell(tr, formatDate(f.last_updated));
      appendActionsCell(
        tr,
        `${actionBtn('fa-trash', 'Delete', !f.file_exists, 'btn-file-delete')}
          ${actionBtn('fa-download', 'Download', !f.file_exists, 'btn-file-download')}
          ${actionBtn('fa-upload', 'Upload', false, 'btn-file-upload')}`
      );
    } else {
      appendCell(tr, f.file_name || '');
      appendCell(tr, formatDate(f.last_updated));
      appendActionsCell(
        tr,
        actionBtn('fa-download', 'Download', !f.file_exists, 'btn-file-download')
      );
    }

    els.tbody.appendChild(tr);
  });
}

/* ── Actions ─────────────────────────────────────────────────────────────────── */

async function handleDelete(fileId, row, appState) {
  const btn = row.querySelector('.btn-file-delete');
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

  try {
    await api.post('/models/delete-file', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
      file_id: fileId,
    });
    toastSuccess('File deleted.');
    // Refresh the table
    await loadFiles(appState, appState._filesModalType);
  } catch {
    // api.js shows the error toast
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  }
}

async function handleDownload(fileId, row, appState) {
  const btn = row.querySelector('.btn-file-download');
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

  try {
    const { blob, fileName } = await api.postDownload('/models/download-file', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
      file_id: fileId,
    });
    const fallbackName = row.dataset.fileName || `file_${fileId}`;
    downloadBlob(blob, fileName || fallbackName);
    toastSuccess('File downloaded.');
  } catch {
    // api.js shows the error toast
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-download"></i>';
  }
}

function handleUpload(fileId, row, appState, els) {
  const ext = row.dataset.fileExtension || '';
  // Build accept string: e.g. ".xls,.xlsx,.csv"
  const accept = ext
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => (e.startsWith('.') ? e : `.${e}`))
    .join(',');

  els.hiddenInput.accept = accept || '*';
  els.hiddenInput.value = '';

  if (pendingUploadChangeHandler) {
    els.hiddenInput.removeEventListener('change', pendingUploadChangeHandler);
    pendingUploadChangeHandler = null;
  }

  // One-time handler for the selected file
  pendingUploadChangeHandler = async () => {
    els.hiddenInput.removeEventListener('change', pendingUploadChangeHandler);
    pendingUploadChangeHandler = null;
    const file = els.hiddenInput.files?.[0];
    if (!file) return;

    const btn = row.querySelector('.btn-file-upload');
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    const fd = new FormData();
    fd.append('project_name', appState.currentProject);
    fd.append('model_name', appState.selected_model);
    fd.append('file_name', file.name);
    fd.append('file_id', fileId);
    fd.append('upload_file', file);

    try {
      await api.postFormData('/models/upload-file', fd);
      toastSuccess('File uploaded.');
      await loadFiles(appState, appState._filesModalType);
    } catch {
      // api.js shows the error toast
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-upload"></i>';
    }
  };

  els.hiddenInput.addEventListener('change', pendingUploadChangeHandler);
  els.hiddenInput.click();
}

/* ── Load & render ───────────────────────────────────────────────────────────── */

async function loadFiles(appState, fileType) {
  const els = EL();
  showOnly(els.loading, els);

  try {
    const allFiles = await api.post('/models/list-files', {
      project_name: appState.currentProject,
      model_name: appState.selected_model,
    });

    const files = (allFiles.files || []).filter(
      (f) => f.file_type?.toLowerCase() === fileType?.toLowerCase()
    );

    if (!files.length) {
      els.empty.textContent = `No ${fileType} files found for this model.`;
      showOnly(els.empty, els);
      return;
    }

    renderTableHead(fileType, els);
    renderTableBody(files, fileType, els);
    showOnly(els.tableWrap, els);
  } catch {
    showOnly(els.empty, els);
    els.empty.textContent = 'Failed to load files.';
  }
}

/* ── Public init ────────────────────────────────────────────────────────────── */

export function initFiles(appState) {
  const modal = document.getElementById('modelFilesModal');
  if (!modal) return;

  // Load files every time the modal opens
  on(modal, 'show.bs.modal', (e) => {
    const els = EL();
    const button = e.relatedTarget;
    appState._filesModalType = 'input'; // default
    if (button) {
      if (button.id === 'inputFileUploadBtn') appState._filesModalType = 'input';
      else if (button.id === 'outputFileUploadBtn') appState._filesModalType = 'output';
    }

    // Update title & icon
    els.titleText.textContent =
      appState._filesModalType === 'input' ? 'Input Files' : 'Output Files';
    els.icon.className =
      appState._filesModalType === 'input'
        ? 'fa-solid fa-file-import me-2'
        : 'fa-solid fa-file-export me-2';

    loadFiles(appState, appState._filesModalType);
  });

  // Clean up on close
  on(modal, 'hidden.bs.modal', () => {
    const els = EL();
    els.tbody.innerHTML = '';
    els.thead.innerHTML = '';
    showOnly(els.loading, els); // reset to loading for next open
    els.loading.classList.add('d-none'); // but hide it too
  });

  // Delegate click handlers on the table body
  on(modal, 'click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const fileId = row.dataset.fileId;
    const els = EL();

    if (btn.classList.contains('btn-file-delete')) handleDelete(fileId, row, appState);
    if (btn.classList.contains('btn-file-download')) handleDownload(fileId, row, appState);
    if (btn.classList.contains('btn-file-upload')) handleUpload(fileId, row, appState, els);
  });
}
