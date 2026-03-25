import { bsToastError as toastError } from '../../../common/js/bsToast';
import api from '@/common/js/api';

async function fetchModels(appState) {
  try {
    const data = await api.post('/models/list');
    appState.projectModels = data.project_models || {};
    appState.projects = Object.keys(appState.projectModels);
  } catch {
    toastError('Failed to load models');
  }
}

export { fetchModels };
