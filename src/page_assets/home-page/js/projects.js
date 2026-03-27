import api from '@/common/js/api';
import {
  bsToastSuccess as toastSuccess,
  bsToastError as toastError,
} from '../../../common/js/bsToast';
import { $, on } from '@/common/js/dom';
import { renderCurrentProjectModels } from './models';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Populate a <select> element with project names. */
function populateProjectSelect(
  selectEl,
  projects,
  currentProject = ''
  // placeholder = 'Select project'
) {
  selectEl.innerHTML = '';
  // const def = document.createElement('option');
  // def.disabled = true;
  // def.selected = true;
  // def.value = '';
  // def.textContent = placeholder;
  // selectEl.appendChild(def);
  // if length of projects = 1 and it's the current project, show it as selected but disabled
  if (projects.length === 1) {
    const opt = document.createElement('option');
    opt.value = currentProject;
    opt.textContent = currentProject;
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }
  projects.forEach((name) => {
    if (name !== currentProject) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    }
  });
  selectEl.options[0].selected = true;
}

/* ── Data fetchers ─────────────────────────────────────────────────────────── */

async function fetchCurrentProject(appState) {
  const data = await api.post('/projects/current', {});
  appState.currentProject = data.project_name || 'Default';
}

/* ── Modal handlers ────────────────────────────────────────────────────────── */

function setupCreateProject(appState) {
  const modal = $('#createProjectModal');
  const nameInput = $('#createProjectName');
  const openAfter = $('#createProjectOpenAfter');
  const submitBtn = $('#submitCreateProjectBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'hidden.bs.modal', () => {
    const form = $('#createProjectForm');
    if (form) form.reset();
  });

  on(submitBtn, 'click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      toastError('Project name is required.');
      return;
    }

    const nameExists =
      Array.isArray(appState.projects) &&
      appState.projects.some((project) => project.toLowerCase() === name.toLowerCase());

    if (nameExists) {
      toastError('Project name already exists.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating…';
    try {
      await api.post('/projects/create', {
        name,
        create_and_open: openAfter.checked,
      });
      toastSuccess('Project created successfully!');
      appState.projects.push(name);
      if (openAfter.checked) {
        appState.currentProject = name;
        renderCurrentProjectModels(appState);
      }
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create';
    }
  });
}

function setupOpenProject(appState) {
  const modal = $('#openProjectModal');
  const select = $('#openProjectSelect');
  const submitBtn = $('#submitOpenProjectBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'shown.bs.modal', () => {
    populateProjectSelect(select, appState.projects, appState.currentProject);
  });

  on(submitBtn, 'click', async () => {
    const projectName = select.value;
    if (!projectName) {
      toastError('Please select a project.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Opening…';

    try {
      await api.post('/projects/open', { project_name: projectName });
      toastSuccess('Project opened successfully!');
      appState.currentProject = projectName;
      renderCurrentProjectModels(appState);
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Open';
    }
  });
}

function setupRenameProject(appState) {
  const modal = $('#renameProjectModal');
  const select = $('#renameProjectSelect');
  const newNameInput = $('#renameProjectNewName');
  const submitBtn = $('#submitRenameProjectBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'shown.bs.modal', () => {
    populateProjectSelect(select, appState.projects);
    newNameInput.value = '';
  });

  on(modal, 'hidden.bs.modal', () => {
    newNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const oldName = select.value;
    const newName = newNameInput.value.trim();
    if (!oldName) {
      toastError('Please select a project.');
      return;
    }
    if (!newName) {
      toastError('New project name is required.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Renaming…';

    try {
      await api.post('/projects/rename', {
        old_project_name: oldName,
        new_project_name: newName,
      });
      toastSuccess('Project renamed successfully!');
      // replace old name with new name in appState.projects
      const index = appState.projects.findIndex((p) => p === oldName);
      if (index !== -1) {
        appState.projects[index] = newName;
      }
      if (Object.prototype.hasOwnProperty.call(appState.projectModels, oldName)) {
        appState.projectModels[newName] = appState.projectModels[oldName];
        delete appState.projectModels[oldName];
      }
      if (appState.currentProject === oldName) {
        appState.currentProject = newName;
      }
      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Rename';
    }
  });
}

function setupDeleteProject(appState) {
  const modal = $('#deleteProjectModal');
  const select = $('#deleteProjectSelect');
  const confirmCheckbox = $('#deleteProjectConfirmCheckbox');
  const confirmNameInput = $('#deleteProjectConfirmName');
  const submitBtn = $('#submitDeleteProjectBtn');
  if (!modal || !submitBtn) return;

  on(modal, 'shown.bs.modal', () => {
    populateProjectSelect(select, appState.projects, 'Default');
    confirmCheckbox.checked = false;
    confirmNameInput.value = '';
  });

  on(modal, 'hidden.bs.modal', () => {
    confirmCheckbox.checked = false;
    confirmNameInput.value = '';
  });

  on(submitBtn, 'click', async () => {
    const projectName = select.value;
    if (!projectName) {
      toastError('Please select a project.');
      return;
    }
    if (!confirmCheckbox.checked) {
      toastError('Please confirm you understand this cannot be undone.');
      return;
    }
    if (confirmNameInput.value.trim() !== projectName) {
      toastError('Project name does not match. Please type the exact project name.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Deleting…';

    try {
      await api.post('/projects/delete', { project_name: projectName });
      toastSuccess('Project deleted successfully!');
      // remove project from appState.projects
      appState.projects = appState.projects.filter((p) => p !== projectName);
      if (appState.currentProject === projectName) {
        await fetchCurrentProject(appState);
      }

      window.bootstrap.Modal.getInstance(modal)?.hide();
    } catch {
      // api.js already displayed the error toast
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Delete';
    }
  });
}

/* ── Public init ───────────────────────────────────────────────────────────── */

/**
 * Fetch project data and wire up all project-related modals.
 * Call once after auth guard succeeds.
 */
async function initProjects(appState) {
  try {
    await fetchCurrentProject(appState);
  } catch {
    toastError('Failed to load current project. Please refresh the page.');
    appState.currentProject = appState.currentProject || 'Default';
  }

  setupCreateProject(appState);
  setupOpenProject(appState);
  setupRenameProject(appState);
  setupDeleteProject(appState);
}

export { initProjects, populateProjectSelect };
