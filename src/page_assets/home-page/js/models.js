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

    item.addEventListener('click', () => {
      document
        .querySelectorAll('#modelList .list-group-item')
        .forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      appState.selected_model = item.textContent;
      updateModelActionVisibility(appState);
    });
    // update appState.selected_model to first model if not set
    if (!appState.selected_model) {
      appState.selected_model = modelNames[0];
    }
  });
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

export { fetchModels, renderCurrentProjectModels, setupAddNewModel };
