import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import api from '@/common/js/api';
import { $, on } from '@/common/js/dom';

async function fetchModels(appState) {
  try {
    const data = await api.post('/models/list');
    appState.projectModels = data.project_models || {};
    appState.projects = Object.keys(appState.projectModels);
  } catch {
    // api.js already displayed the error toast
  }

  try {
    const template_data = await api.post('/models/templates');
    appState.modelTemplates = template_data.model_templates || [];
  } catch {
    // api.js already displayed the error toast
  }
}

function renderCurrentProjectModels(appState) {
  const modelList = $('#modelList');
  if (!modelList) return;

  const currentProject = appState.currentProject;
  const projectModels = appState.projectModels?.[currentProject];

  let modelNames = [];
  if (Array.isArray(projectModels)) {
    modelNames = projectModels;
  } else if (projectModels && typeof projectModels === 'object') {
    modelNames = Object.keys(projectModels);
  }

  modelList.innerHTML = '';

  if (!modelNames.length) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'list-group-item text-muted';
    emptyItem.textContent = 'No models found for current project.';
    modelList.appendChild(emptyItem);
    return;
  }

  modelNames.forEach((name, index) => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = `list-group-item list-group-item-action${index === 0 ? ' active' : ''}`;
    item.textContent = name;
    modelList.appendChild(item);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      document
        .querySelectorAll('#modelList .list-group-item')
        .forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      appState.selected_model = item.textContent;
      updateModelActionVisibility(appState);
    });
  });
  // update appState.selected_model to first model if not set
  if (!appState.selected_model || !modelNames.includes(appState.selected_model)) {
    appState.selected_model = modelNames[0];
  } else {
    // ensure the correct model is highlighted as active
    const activeItem = Array.from(document.querySelectorAll('#modelList .list-group-item')).find(
      (el) => el.textContent === appState.selected_model
    );
    if (activeItem) {
      document
        .querySelectorAll('#modelList .list-group-item')
        .forEach((el) => el.classList.remove('active'));
      activeItem.classList.add('active');
    }
  }
  updateModelActionVisibility(appState);
}

function updateModelActionVisibility(appState) {
  const access =
    appState.projectModels?.[appState.currentProject]?.[appState.selected_model] || 'none';
  const backup = document.getElementById('backupModelMenu');
  const restore = document.getElementById('restoreModelMenu');
  const share = document.getElementById('shareModelMenu');
  const upload = document.getElementById('uploadModelMenu');

  if (!backup || !restore || !share || !upload) return;

  const isOwner = access === 'owner';

  backup.style.display = isOwner ? '' : 'none';
  restore.style.display = isOwner ? '' : 'none';
  share.style.display = isOwner ? '' : 'none';
  upload.style.display = isOwner ? '' : 'none';
}

/* ── Add New Model Modal ───────────────────────────────────────────────────── */

function setupAddNewModel(appState) {
  const modal = $('#addNewModelModal');
  const projectSelect = $('#projectName');
  const modelNameInput = $('#modelName');
  const templateSelect = $('#modelTemplate');
  const sampleDataCheckbox = $('#upload_model_with_sample_data');
  const submitBtn = $('#submitAddModelBtn');

  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    // Populate project select, pre-select current project
    projectSelect.innerHTML = '';
    appState.projects.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === appState.currentProject) opt.selected = true;
      projectSelect.appendChild(opt);
    });
    projectSelect.disabled = true;

    // Populate template select from app state
    templateSelect.innerHTML = '';

    const templates = appState.modelTemplates || [];
    templates.forEach((tpl) => {
      const opt = document.createElement('option');
      opt.value = tpl;
      opt.textContent = tpl;
      templateSelect.appendChild(opt);
    });

    if (!templates.length) {
      toastError('No model templates available.');
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    modelNameInput.value = '';
    sampleDataCheckbox.checked = false;
  });

  on(submitBtn, 'click', async () => {
    const projectName = projectSelect.value;
    const modelName = modelNameInput.value.trim();
    const template = templateSelect.value;

    if (!projectName) {
      toastError('Please select a project.');
      return;
    }
    if (!modelName) {
      toastError('Model name is required.');
      return;
    }
    if (!template) {
      toastError('Please select a template.');
      return;
    }

    const currentModels = Object.keys(appState.projectModels[projectName] || {});

    if (currentModels.includes(modelName)) {
      toastError('A model with this name already exists in the selected project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating…';

    try {
      await api.post('/models/create', {
        project_name: projectName,
        model_name: modelName,
        model_template: template,
        with_sample_data: sampleDataCheckbox.checked,
      });
      toastSuccess('Model created successfully!');
      if (!appState.projectModels[projectName]) {
        appState.projectModels[projectName] = {};
      }
      appState.projectModels[projectName][modelName] = 'owner'; // Add new model to app state with default role
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Model';
    }
  });
}

function setupSaveAsModel(appState) {
  const modal = $('#saveAsModelModal');
  const projectInput = $('#saveAsTargetProject');
  const existingModelInput = $('#saveAsExistingModelName');
  const newModelNameInput = $('#saveAsNewModelName');
  const submitBtn = $('#submitSaveAsModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    // Auto-populate and disable current project
    projectInput.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = appState.currentProject;
    opt.textContent = appState.currentProject;
    opt.selected = true;
    projectInput.appendChild(opt);
    projectInput.disabled = true;

    // Auto-populate and disable existing (active) model name
    existingModelInput.value = appState.selected_model || '';
    existingModelInput.disabled = true;

    // Clear new model name and enable submit
    newModelNameInput.value = '';
    submitBtn.disabled = false;
  });

  on(modal, 'hidden.bs.modal', () => {
    newModelNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const newModelName = newModelNameInput.value.trim();
    if (!newModelName) {
      toastError('New model name is required.');
      return;
    }

    // Check for duplicate model name in current project
    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    if (currentModels.includes(newModelName)) {
      toastError('A model with this name already exists in the current project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving…';

    try {
      await api.post('/models/save-as', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        new_model_name: newModelName,
      });
      toastSuccess('Model saved successfully!');
      // Add new model to app state
      if (!appState.projectModels[appState.currentProject]) {
        appState.projectModels[appState.currentProject] = {};
      }
      appState.projectModels[appState.currentProject][newModelName] = 'owner';
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save As';
    }
  });
}

/* ── Add Existing Model Modal (tree UI) ─────────────────────────────────── */

/** Build the project→model tree inside #existingModelTree. */
function buildModelTree(container, projectModels, currentProject) {
  container.innerHTML = '';

  const ul = document.createElement('ul');
  ul.className = 'model-tree';

  Object.entries(projectModels).forEach(([project, models]) => {
    if (project === currentProject) return; // skip current project

    const modelNames = Array.isArray(models) ? models : Object.keys(models || {});
    if (!modelNames.length) return;

    const projectLi = document.createElement('li');
    projectLi.className = 'tree-project';

    // Project checkbox + label
    const projectLabel = document.createElement('label');
    projectLabel.className = 'tree-label';
    const projectCb = document.createElement('input');
    projectCb.type = 'checkbox';
    projectCb.className = 'tree-cb tree-project-cb';
    projectCb.dataset.project = project;
    const projectIcon = document.createElement('span');
    projectIcon.className = 'tree-icon me-1';
    projectIcon.innerHTML = '<i class="fa-solid fa-bars text-secondary"></i>';
    projectLabel.append(projectCb, projectIcon, ` ${project}`);
    projectLi.appendChild(projectLabel);

    // Model children
    const modelsUl = document.createElement('ul');
    modelsUl.className = 'tree-models';
    modelNames.forEach((modelName) => {
      const modelLi = document.createElement('li');
      const modelLabel = document.createElement('label');
      modelLabel.className = 'tree-label';
      const modelCb = document.createElement('input');
      modelCb.type = 'checkbox';
      modelCb.className = 'tree-cb tree-model-cb';
      modelCb.dataset.project = project;
      modelCb.dataset.model = modelName;

      const access = typeof models === 'object' && !Array.isArray(models) ? models[modelName] : '';
      const iconClass = access === 'owner' ? 'fa-solid fa-database' : 'fa-solid fa-link';
      const modelIcon = document.createElement('span');
      modelIcon.className = 'tree-icon me-1';
      modelIcon.innerHTML = `<i class="${iconClass} text-secondary"></i>`;

      modelLabel.append(modelCb, modelIcon, ` ${modelName}`);
      modelLi.appendChild(modelLabel);
      modelsUl.appendChild(modelLi);

      // Update project checkbox state when a model is toggled
      modelCb.addEventListener('change', () => {
        const siblings = modelsUl.querySelectorAll('.tree-model-cb');
        const allChecked = [...siblings].every((cb) => cb.checked);
        const someChecked = [...siblings].some((cb) => cb.checked);
        projectCb.checked = allChecked;
        projectCb.indeterminate = !allChecked && someChecked;
      });
    });
    projectLi.appendChild(modelsUl);

    // Toggle all models when project checkbox is clicked
    projectCb.addEventListener('change', () => {
      modelsUl.querySelectorAll('.tree-model-cb').forEach((cb) => (cb.checked = projectCb.checked));
      projectCb.indeterminate = false;
    });

    ul.appendChild(projectLi);
  });

  if (!ul.children.length) {
    container.innerHTML = '<p class="text-muted">No other projects with models found.</p>';
    return;
  }
  container.appendChild(ul);
}

/** Return array of { model_name, project_name } for every checked model. */
function getSelectedModels(container) {
  return [...container.querySelectorAll('.tree-model-cb:checked')].map((cb) => ({
    model_name: cb.dataset.model,
    project_name: cb.dataset.project,
  }));
}

/* ── Backup Model Modal ───────────────────────────────────────────────────── */

function setupBackupModel(appState) {
  const modal = $('#backupModelModal');
  const currentProjectInput = $('#backupCurrentProject');
  const currentModelInput = $('#backupModelName');
  const commentInput = $('#backupUserComment');
  const submitBtn = $('#submitBackupModelBtn');
  if (!modal || !submitBtn || !commentInput) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    commentInput.value = '';

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for backup.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    commentInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Backup';
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for backup.');
      return;
    }

    const userComment = commentInput.value.trim();
    if (!userComment) {
      toastError('Backup comment is required.');
      commentInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Backing up…';

    try {
      await api.post('/models/backup', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        backup_comment: userComment,
      });
      toastSuccess('Model backup created successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Backup';
    }
  });
}

/* ── Restore Model Modal ─────────────────────────────────────────────────── */

function formatBackupDateTime(dateTime) {
  if (!dateTime) return 'Unknown date';

  const parsedDate = new Date(dateTime);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(dateTime);
  }

  return parsedDate.toLocaleString();
}

function setupRestoreModel(appState) {
  const modal = $('#restoreModelModal');
  const currentProjectInput = $('#restoreCurrentProject');
  const currentModelInput = $('#restoreModelName');
  const backupSelect = $('#restoreBackupSelect');
  const submitBtn = $('#submitRestoreModelBtn');
  if (!modal || !submitBtn || !backupSelect) return;

  on(modal, 'show.bs.modal', async () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    backupSelect.innerHTML = '<option disabled selected value="">Loading backups...</option>';
    submitBtn.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for restore.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    try {
      const data = await api.post('/models/get-backups', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });

      const backups = Array.isArray(data['model_backups'])
        ? data['model_backups']
        : data.backups || data.available_backups || data.model_backups || [];

      backupSelect.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = backups.length ? 'Select backup' : 'No backups available';
      backupSelect.appendChild(placeholder);

      backups.forEach((backup) => {
        const option = document.createElement('option');
        option.value = backup[0];
        const comment = backup[1] || 'No comment';
        const dateTime = formatBackupDateTime(backup[2] || backup[3] || backup[4]);
        option.textContent = `${comment} (${dateTime})`;
        backupSelect.appendChild(option);
      });

      submitBtn.disabled = !backups.length;
    } catch {
      backupSelect.innerHTML = '<option disabled selected value="">Unable to load backups</option>';
      submitBtn.disabled = true;
    }
  });

  on(backupSelect, 'change', () => {
    submitBtn.disabled = !backupSelect.value;
  });

  on(modal, 'hidden.bs.modal', () => {
    backupSelect.innerHTML = '<option disabled selected value="">Select backup</option>';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Restore';
  });

  on(submitBtn, 'click', async () => {
    const backupId = backupSelect.value;
    if (!backupId) {
      toastError('Please select a backup to restore.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Restoring…';

    try {
      await api.post('/models/restore', {
        backup_id: backupId,
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model restored successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Restore';
    }
  });
}

/**
 * Wire the "Add Existing Model" modal: populate the model-selection tree on show and handle adding selected models into the current project.
 *
 * When the modal is submitted this function validates selection and name collisions, POSTs to `/models/add-existing`,
 * updates `appState.projectModels` by adding the selected models (preserving their access level or defaulting to `"read"`)
 * into the current project and removing them from their source project, re-renders the current project's model list,
 * and hides the modal. Validation failures show an error toast and abort the operation.
 *
 * @param {Object} appState - Application state object containing `projects`, `currentProject`, `projectModels`, and UI selection state.
 */
function setupAddExistingModel(appState) {
  const modal = $('#addExistingModelModal');
  const modelTree = $('#existingModelTree');
  const submitBtn = $('#submitAddExistingModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    buildModelTree(modelTree, appState.projectModels, appState.currentProject);
  });

  on(modal, 'hidden.bs.modal', () => {
    modelTree.innerHTML = '';
  });

  on(submitBtn, 'click', async () => {
    const selected = getSelectedModels(modelTree);
    if (!selected.length) {
      toastError('Please select at least one model.');
      return;
    }

    // Validate no name collisions with current project models
    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    const conflicts = selected
      .filter((s) => currentModels.includes(s.model_name))
      .map((s) => s.model_name);
    if (conflicts.length) {
      toastError(`Model name(s) already exist in current project: ${conflicts.join(', ')}`);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Adding…';

    try {
      await api.post('/models/add-existing', {
        project_name: appState.currentProject,
        model_project_pairs: selected.map((s) => [s.model_name, s.project_name]),
      });
      toastSuccess('Model(s) added successfully!');

      // Update local app state
      selected.forEach(({ model_name, project_name }) => {
        const access = appState.projectModels[project_name]?.[model_name] || 'read';
        if (!appState.projectModels[appState.currentProject]) {
          appState.projectModels[appState.currentProject] = {};
        }
        appState.projectModels[appState.currentProject][model_name] = access;
        delete appState.projectModels[project_name][model_name];
      });

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add';
    }
  });
}

/**
 * Wire the Rename Model modal: validate input, call the rename API, and update UI state.
 *
 * Validates a non-empty new model name and checks for name collisions within the current project;
 * on success it updates appState.projectModels for the current project (preserving the model's access),
 * sets appState.selected_model to the new name, re-renders the model list, and closes the modal.
 *
 * @param {Object} appState - Application state object (expects properties like `currentProject`, `selected_model`, and `projectModels`).
 */

function setupRenameModel(appState) {
  const modal = $('#renameModelModal');
  const projectInput = $('#RenameProjectName');
  const currentModelInput = $('#currentModelName');
  const newModelNameInput = $('#newModelName');
  const submitBtn = $('#submitRenameModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    projectInput.value = appState.currentProject || '';
    projectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    newModelNameInput.value = '';
    if (!appState.selected_model || !appState.currentProject) {
      toastError('No model selected for renaming.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    newModelNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const newModelName = newModelNameInput.value.trim();
    if (!newModelName) {
      toastError('New model name is required.');
      return;
    }

    const currentModels = Object.keys(appState.projectModels[appState.currentProject] || {});
    if (currentModels.includes(newModelName)) {
      toastError('A model with this name already exists in the current project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Renaming…';

    try {
      await api.post('/models/rename', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
        new_model_name: newModelName,
      });
      toastSuccess('Model renamed successfully!');

      // Update app state: replace old key with new key, preserve access
      const access =
        appState.projectModels[appState.currentProject]?.[appState.selected_model] || 'owner';
      delete appState.projectModels[appState.currentProject][appState.selected_model];
      appState.projectModels[appState.currentProject][newModelName] = access;
      appState.selected_model = newModelName;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Rename';
    }
  });
}

/**
 * Wire up the Delete Model modal: populate and validate inputs, perform deletion, and update appState on success.
 *
 * On modal show this populates and disables the project and model inputs and requires a confirmation checkbox
 * and exact model-name typing before enabling deletion. On submit it disables the button, shows a spinner,
 * posts to /models/delete, removes the model entry from appState.projectModels[currentProject], clears
 * appState.selected_model, re-renders the model list, and hides the modal on success.
 *
 * @param {Object} appState - Application state; used to read `currentProject` and `selected_model` and to update
 *                            `projectModels` and `selected_model` after a successful deletion.
 */

function setupDeleteModel(appState) {
  const modal = $('#deleteModelModal');
  const projectInput = $('#DeleteProjectName');
  const modelActualName = $('#deleteModelActualName');
  const confirmInput = $('#deleteModelConfirmInput');
  const confirmCheckbox = $('#confirmDeleteModel');
  const modelNameLabel = $('#deleteModelName');
  const submitBtn = $('#submitDeleteModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    projectInput.value = appState.currentProject || '';
    projectInput.disabled = true;
    modelActualName.value = appState.selected_model || '';
    modelActualName.disabled = true;
    modelNameLabel.textContent = appState.selected_model || '';
    if (!appState.selected_model || !appState.currentProject) {
      toastError('No model selected for deletion.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }
    confirmInput.value = '';
    confirmCheckbox.checked = false;
  });

  on(modal, 'hidden.bs.modal', () => {
    confirmInput.value = '';
    confirmCheckbox.checked = false;
  });

  on(submitBtn, 'click', async () => {
    if (!confirmCheckbox.checked) {
      toastError('Please confirm you understand this action is permanent.');
      return;
    }
    if (confirmInput.value.trim() !== appState.selected_model) {
      toastError('Model name does not match. Please type the exact model name.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Deleting…';

    try {
      await api.post('/models/delete', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model deleted successfully!');

      delete appState.projectModels[appState.currentProject]?.[appState.selected_model];
      appState.selected_model = null;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Delete';
    }
  });
}

/**
 * Initialize the download-model modal: populate inputs from app state, validate selection, and trigger model artifact download.
 *
 * When shown, the modal fills and disables project/model inputs and hides itself with an error toast if no model is selected.
 * On submit, it requests the selected model artifact from the server, starts the file download, displays a success toast, and hides the modal.
 * The submit button is disabled while the download is in progress and its label/state is restored afterwards.
 *
 * @param {Object} appState - Application state containing at least `currentProject` and `selected_model`.
 */

function setupDownloadModel(appState) {
  const modal = $('#downloadModelModal');
  const currentProjectInput = $('#downloadProjectName');
  const currentModelInput = $('#downloadModelName');
  const submitBtn = $('#submitDownloadModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for download.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for download.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Downloading…';

    try {
      const { blob: artifactBlob, fileName } = await api.postDownload('/models/download', {
        project_name: appState.currentProject,
        model_name: appState.selected_model,
      });
      const downloadUrl = window.URL.createObjectURL(artifactBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = fileName || `${appState.selected_model}.db`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toastSuccess('Model artifact download started.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Download';
    }
  });
}

/**
 * Initialize the Upload Model Bootstrap modal, validating input and handling artifact upload.
 *
 * Wires modal show/hidden events and the submit button to:
 * - populate and lock current project/model inputs from `appState`,
 * - validate a chosen file has an allowed extension (.db or .sqlite3),
 * - POST the file as FormData to the server and show success feedback,
 * - restore submit button state after completion.
 *
 * @param {Object} appState - Application state object. Expected to provide `currentProject` and `selected_model`.
 */

function setupUploadModel(appState) {
  const modal = $('#uploadModelModal');
  const currentProjectInput = $('#uploadProjectName');
  const currentModelInput = $('#uploadModelName');
  const fileInput = $('#uploadModelFile');
  const submitBtn = $('#submitUploadModelBtn');
  if (!modal || !submitBtn || !fileInput) return;

  const allowedExtensions = ['.db', '.sqlite3'];

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;
    fileInput.value = '';
    fileInput.accept = allowedExtensions.join(',');

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    }
  });

  on(modal, 'hidden.bs.modal', () => {
    fileInput.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  });

  on(submitBtn, 'click', async () => {
    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for upload.');
      return;
    }

    const selectedFile = fileInput.files?.[0];
    if (!selectedFile) {
      toastError('Please choose a model artifact file.');
      return;
    }

    const lowerName = selectedFile.name.toLowerCase();
    const isAllowedFile = allowedExtensions.some((extension) => lowerName.endsWith(extension));
    if (!isAllowedFile) {
      toastError('Only .db and .sqlite3 files are supported.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Uploading…';

    try {
      const formData = new FormData();
      formData.append('project_name', appState.currentProject);
      formData.append('model_name', appState.selected_model);
      formData.append('upload_file', selectedFile);
      await api.postFormData('/models/upload', formData);
      toastSuccess('Model artifact uploaded successfully!');
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload';
    }
  });
}

/**
 * Connects the "Move Model" modal UI to validation, server call, and local state updates for moving a model to another project.
 *
 * When activated, the modal is populated from appState, enforces selection and name-collision validation, calls the move API,
 * and on success updates appState.projectModels (moving the model entry to the target project), clears appState.selected_model,
 * re-renders the current project's model list, shows success toast messages, and hides the modal.
 *
 * @param {Object} appState - Application state object; expected keys used: `currentProject`, `selected_model`, `projects`, and `projectModels` (mapping project -> { modelName: access }).
 */

function setupMoveModel(appState) {
  const modal = $('#moveModelModal');
  const currentProjectInput = $('#moveModelModalProjectName');
  const currentModelInput = $('#moveModelName');
  const targetProjectSelect = $('#targetProjectSelect');
  const submitBtn = $('#submitMoveModelBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'show.bs.modal', () => {
    currentProjectInput.value = appState.currentProject || '';
    currentProjectInput.disabled = true;
    currentModelInput.value = appState.selected_model || '';
    currentModelInput.disabled = true;

    if (!appState.currentProject || !appState.selected_model) {
      toastError('No model selected for moving.');
      window.bootstrap.Modal.getInstance(modal)?.hide();
      return;
    }

    targetProjectSelect.innerHTML = '';
    const targetProjects = (appState.projects || []).filter(
      (project) => project !== appState.currentProject
    );

    targetProjects.forEach((project) => {
      const opt = document.createElement('option');
      opt.value = project;
      opt.textContent = project;
      targetProjectSelect.appendChild(opt);
    });

    submitBtn.disabled = !targetProjects.length;
  });

  on(modal, 'hidden.bs.modal', () => {
    targetProjectSelect.innerHTML = '<option disabled selected value="">Select project</option>';
    submitBtn.disabled = false;
  });

  on(submitBtn, 'click', async () => {
    const targetProject = targetProjectSelect.value;
    if (!targetProject) {
      toastError('Please select a target project.');
      return;
    }

    if (targetProject === appState.currentProject) {
      toastError('Target project must be different from current project.');
      return;
    }

    const targetProjectModels = Object.keys(appState.projectModels[targetProject] || {});
    if (targetProjectModels.includes(appState.selected_model)) {
      toastError('The target project already has a model with the same name.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Moving…';

    try {
      await api.post('/models/move', {
        project_name: appState.currentProject,
        new_project_name: targetProject,
        model_name: appState.selected_model,
      });
      toastSuccess('Model moved successfully!');

      const modelAccess =
        appState.projectModels[appState.currentProject]?.[appState.selected_model] || 'owner';

      if (!appState.projectModels[targetProject]) {
        appState.projectModels[targetProject] = {};
      }

      appState.projectModels[targetProject][appState.selected_model] = modelAccess;
      delete appState.projectModels[appState.currentProject]?.[appState.selected_model];
      appState.selected_model = null;

      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Move';
    }
  });
}

export {
  fetchModels,
  renderCurrentProjectModels,
  setupAddNewModel,
  setupSaveAsModel,
  setupAddExistingModel,
  setupRenameModel,
  setupDeleteModel,
  setupBackupModel,
  setupRestoreModel,
  setupDownloadModel,
  setupUploadModel,
  setupMoveModel,
};
