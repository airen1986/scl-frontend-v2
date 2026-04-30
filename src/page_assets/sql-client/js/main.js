import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';
import api from '../../../common/js/api.js';
import { bsToastError } from '../../../common/js/bsToast.js';
import { ready } from '../../../common/js/dom.js';

const appState = {
  user: null,
  modelName: '',
  projectName: '',
};

ready(async () => {
  const params = new URLSearchParams(window.location.search);

  const projectName = params.get('project');
  if (projectName) {
    appState.projectName = projectName;
  } else {
    bsToastError(
      'No project specified',
      'Please specify a project in the URL, e.g. <code>?project=my_project</code>'
    );
    return;
  }

  const modelName = params.get('model');
  if (modelName) {
    appState.modelName = modelName;
  } else {
    bsToastError(
      'No model specified',
      'Please specify a model in the URL, e.g. <code>?model=my_model</code>'
    );
    return;
  }

  document.title = `${appState.projectName} > ${appState.modelName}`;

  let user;
  try {
    user = await api.post('/auth/me', {}, { silent: true });
    if (user && user.role_name) {
      appState.user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
    } else {
      window.location.href = '/login.html';
      return;
    }
  } catch {
    window.location.href = '/login.html';
    return;
  }
});
