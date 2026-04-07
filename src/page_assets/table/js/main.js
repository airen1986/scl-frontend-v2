import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss'; // Bootstrap + SCSS theme
import '../../../common/css/custom.css'; // shared plain-CSS utilities
import '../css/main.css'; // table-specific styles

import { ready } from '@/common/js/dom';

ready(() => {
  autosizeSclTable();
  setStickyHead2();
  window.addEventListener('resize', () => {
    autosizeSclTable();
    setStickyHead2();
  });
});

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
