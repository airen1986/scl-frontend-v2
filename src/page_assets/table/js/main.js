import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // table-specific styles
import api from '@/common/js/api';
import { getTableHeaders, fetchTableData, initRefreshDataBtn } from './tables';
import { bsToastError } from '../../../common/js/bsToast';
import { $, ready } from '@/common/js/dom';

function setStickyHead2() {
  const head1 = document.querySelector('.scl-table .head1');
  if (!head1) return;
  const height = head1.getBoundingClientRect().height;
  document.querySelectorAll('.scl-table .head2 th').forEach((th) => {
    th.style.setProperty('--head1-height', `${height}px`);
  });
}

function autosizeSclTable() {
  const tableContainer = document.getElementById('sclTableDiv');
  if (!tableContainer) return;

  const rect = tableContainer.getBoundingClientRect();
  const bottomGap = 60;
  const available = window.innerHeight - rect.top - bottomGap;

  tableContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
}

const appState = {
  user: null,

  modelName: '',

  projectName: '',

  tableName: '',

  displayName: '',

  currentPage: 1,

  pageSize: 1000,

  /** { [columnName]: string[] }  — column → filter values */
  selectFilters: {},

  /** { [columnName]: string }  — column → text filter value */
  textFilters: {},

  /** Array of tuples: [columnName, dataType] */
  columnNames: [],
};

ready(async () => {
  const params = new URLSearchParams(window.location.search);

  const tableName = params.get('table');
  if (tableName) {
    appState.tableName = tableName;
  } else {
    bsToastError(
      'No table specified',
      'Please specify a table in the URL, e.g. <code>?table=my_table</code>'
    );
    return;
  }

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

  const displayName = params.get('displayName');
  if (displayName) {
    appState.displayName = displayName;
  } else {
    appState.displayName = appState.tableName;
  }

  document.title = `${appState.displayName}`;

  $('#tableDisplayName').textContent =
    `${appState.projectName} > ${appState.modelName} > ${appState.displayName}`;

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

  await getTableHeaders(appState);
  await fetchTableData(appState);

  autosizeSclTable();
  setStickyHead2();
  window.addEventListener('resize', () => {
    autosizeSclTable();
    setStickyHead2();
  });

  initRefreshDataBtn(appState);
});
