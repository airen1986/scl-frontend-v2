import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // table-specific styles

import { ready } from '@/common/js/dom';

ready(() => {
  autosizeSclTable();
  window.addEventListener('resize', autosizeSclTable);
});

function autosizeSclTable() {
  const tableContainer = document.getElementById('sclTableDiv');
  if (!tableContainer) return;

  const rect = tableContainer.getBoundingClientRect();
  const bottomGap = 60;
  const available = window.innerHeight - rect.top - bottomGap;

  tableContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;

  //   const tablesContainer = document.getElementById('tablesContainer');
  //   if (tablesContainer) {
  //     tablesContainer.style.maxHeight = `${Math.max(220, Math.floor(available))}px`;
  //   }
}
