import api from '@/common/js/api';

/**
 * Request table column metadata, render the table header rows (including a leading select-all checkbox and per-column text filters), attach filter and checkbox handlers, and clear the table body.
 * @param {Object} appState - Application state object; must include `tableName`, `projectName`, and `modelName`. This function updates `appState.columnNames` with the returned headers and may initialize `appState.textFilters`.
 */
async function getTableHeaders(appState) {
  // showTableLoader();
  try {
    const { headers } = await api.post('/tables/headers', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
    });

    appState.columnNames = headers; // [[columnName, dataType], ...]

    // Populate head1: checkbox column + one <th> per column name
    const head1 = document.getElementById('sclTableHead1');
    head1.innerHTML =
      '<th style="width: 40px"><input type="checkbox" class="form-check-input" /></th>';
    for (const [colName] of headers) {
      const th = document.createElement('th');
      th.style.minWidth = '80px';
      const div = document.createElement('div');
      div.className = 'd-flex justify-content-between align-items-center';
      const span = document.createElement('span');
      span.textContent = colName;
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-sort';
      div.append(span, icon);
      th.appendChild(div);
      head1.appendChild(th);
    }

    // Populate head2: empty checkbox column + one filter <th> per column
    const head2 = document.getElementById('sclTableHead2');
    head2.innerHTML = '<th></th>';
    for (const [colName] of headers) {
      const th = document.createElement('th');
      th.style.minWidth = '80px';
      // th.style.overflow = 'hidden';
      const div = document.createElement('div');
      div.className = 'input-group input-group-sm my-1';
      div.style.flexWrap = 'nowrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.dataset.col = colName; // Safe: dataset escapes automatically
      input.style.minWidth = '0';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'input-group-text px-1';
      btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      btn.setAttribute('aria-label', `Select filter for ${colName}`);
      btn.setAttribute('data-bs-toggle', 'dropdown');
      btn.setAttribute('data-bs-auto-close', 'outside');
      btn.setAttribute('aria-expanded', 'false');

      const dropdown = document.createElement('div');
      dropdown.className = 'dropdown-menu dropdown-menu-start';
      const form1 = document.createElement('form');
      form1.style.fontSize = '0.8rem';
      form1.innerHTML = `<a class="dropdown-item px-2 py-0">
                          <div class="form-check">
                          <input class="form-check-input selectAll" type="checkbox" />
                          <label class="form-check-label">Select All</label>
                          </div>
                        </a>
                        <div class="dropdown-divider"></div>
                        <fieldset class="lovValuesFieldset">
                        </fieldset>
                        <div class="dropdown-divider"></div>
                        <div class="dropdown-item d-flex px-2 py-0 clearOKBtn">
                        </div>`;
      dropdown.appendChild(form1);
      div.append(input, btn, dropdown);
      th.appendChild(div);
      head2.appendChild(th);
    }

    // Text-filter: on Enter, update appState.textFilters and refresh data
    head2.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target;
      if (input.tagName !== 'INPUT' || input.type !== 'text') return;

      const col = input.dataset.col;
      const val = input.value.trim();

      if (!appState.textFilters) appState.textFilters = {};

      if (val) {
        appState.textFilters[col] = val;
      } else {
        delete appState.textFilters[col];
      }
      appState.currentPage = 1; // Reset to first page on filter change, since current page may become invalid
      fetchTableData(appState);
    });

    head2.addEventListener('show.bs.dropdown', (e) => {
      const currentButton = e.target;

      populateFilterDropdown(
        currentButton.nextElementSibling,
        currentButton.previousElementSibling.dataset.col,
        appState
      );
    });

    // Select-all checkbox: toggle all body checkboxes
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    selectAllCb.addEventListener('change', () => {
      const tbody = document.getElementById('sclTableBody');
      for (const cb of tbody.querySelectorAll('input[type="checkbox"]')) {
        cb.checked = selectAllCb.checked;
      }
    });

    // Body checkbox: sync select-all when individual rows change
    document.getElementById('sclTableBody').addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const tbody = document.getElementById('sclTableBody');
      const all = tbody.querySelectorAll('input[type="checkbox"]');
      const checked = tbody.querySelectorAll('input[type="checkbox"]:checked');
      selectAllCb.checked = all.length > 0 && checked.length === all.length;
      selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
    });

    // Clear body
    document.getElementById('sclTableBody').innerHTML = '';
  } finally {
    // hideTableLoader();
  }
}

/**
 * Fetches paginated, filtered rows for the current table state and renders them into the table body.
 *
 * Renders each returned row as a <tr> appended to #sclTableBody where the first row value is used as the row's checkbox value and remaining values populate subsequent cells. Null or undefined cell values are rendered as an empty string.
 *
 * @param {Object} appState - Application state used to build the request and rendering.
 * @param {string} appState.tableName - Name of the table to request.
 * @param {string} appState.projectName - Project identifier sent with the request.
 * @param {string} appState.modelName - Model identifier sent with the request.
 * @param {number} appState.currentPage - Page number for pagination.
 * @param {number} appState.pageSize - Number of rows per page.
 * @param {Object} appState.selectFilters - Selection filters included in the request body.
 * @param {Object} appState.textFilters - Text filters included in the request body.
 * @param {Array<[string,string]>} appState.columnNames - Array of [columnName, dataType] tuples; column names are sent as `column_names`.
 */
async function fetchTableData(appState) {
  // showTableLoader();
  try {
    const column_names = appState.columnNames.map(([name]) => name);
    const { data } = await api.post('/tables/data', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      page_number: appState.currentPage,
      page_size: appState.pageSize,
      select_filters: appState.selectFilters,
      text_filters: appState.textFilters,
      column_names,
    });

    appState.currentRowCount = data.length;
    const tbody = document.getElementById('sclTableBody');
    tbody.innerHTML = '';

    for (const row of data) {
      const [rowid, ...values] = row;
      const tr = document.createElement('tr');

      // Checkbox cell with rowid
      const checkTd = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input';
      checkbox.value = rowid;
      checkTd.appendChild(checkbox);
      tr.appendChild(checkTd);

      // Data cells
      for (const val of values) {
        const td = document.createElement('td');
        td.textContent = val ?? '';
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
  } finally {
    // hideTableLoader();
  }
  populatePaginationInfo(appState);
}

/**
 * Wire the page's refresh button to reset table filters, clear related UI controls, and reload table rows.
 *
 * Resets appState.textFilters and appState.selectFilters to empty objects, clears the header row text inputs, resets the select-all checkbox state, and triggers a table data refresh.
 * @param {Object} appState - Application state for the table. The function mutates `textFilters` and `selectFilters` and relies on other fields (e.g., pagination, table identifiers) used by the data fetch.
 */
function initRefreshDataBtn(appState) {
  const refreshButton = document.getElementById('refreshDataBtn');

  refreshButton.addEventListener('click', async () => {
    if (refreshButton.disabled) return;

    refreshButton.disabled = true;

    appState.textFilters = {};
    appState.selectFilters = {};
    appState.currentPage = 1; // Reset to first page on refresh, since filters may change total pages and current page may become invalid

    try {
      const head1 = document.getElementById('sclTableHead1');
      const selectAllCb = head1.querySelector('input[type="checkbox"]');
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;

      // Clear filter inputs in head2
      const head2 = document.getElementById('sclTableHead2');
      for (const input of head2.querySelectorAll('input[type="text"]')) {
        input.value = '';
      }

      // Reset all dropdown filter icons back to chevron
      for (const btn of head2.querySelectorAll('[data-bs-toggle="dropdown"]')) {
        updateFilterIcon(btn, false);
      }

      await fetchTableData(appState);
    } finally {
      refreshButton.disabled = false;
    }
  });
}

async function populateFilterDropdown(dropdown, colName, appState) {
  const fieldset = dropdown.querySelector('.lovValuesFieldset');
  const selectAllCb = dropdown.querySelector('.selectAll');
  const toggleButton = dropdown.previousElementSibling;
  const selectAllItem = selectAllCb.closest('.dropdown-item');

  fieldset.innerHTML = '<div class="text-center py-2"><small>Loading…</small></div>';

  let values;
  try {
    const res = await api.post('/tables/distinct-values', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      column_name: colName,
      page_size: appState.pageSize,
      select_filters: appState.selectFilters,
      text_filters: appState.textFilters,
    });
    values = res.values ?? [];
  } catch {
    fieldset.innerHTML =
      '<div class="text-center py-2 text-danger"><small>Failed to load</small></div>';
    return;
  }

  const activeSet = new Set(appState.selectFilters?.[colName] ?? []);

  fieldset.innerHTML = '';
  for (const val of values) {
    const a = document.createElement('a');
    a.className = 'dropdown-item px-2 py-0';
    const wrapper = document.createElement('div');
    wrapper.className = 'form-check';
    const cb = document.createElement('input');
    cb.className = 'form-check-input lov-cb';
    cb.type = 'checkbox';
    cb.value = val;
    if (activeSet.has(val)) cb.checked = true;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.textContent = val ?? '(blank)';
    wrapper.append(cb, label);
    bindDropdownItemToggle(a, cb);
    a.appendChild(wrapper);
    fieldset.appendChild(a);
  }

  // Clone & replace the entire dropdown-item wrapper to remove stale listeners
  // from prior loads (both the click handler on the item and change handler on the checkbox)
  const newSelectAllItem = selectAllItem.cloneNode(true);
  selectAllItem.parentNode.replaceChild(newSelectAllItem, selectAllItem);
  const newSelectAll = newSelectAllItem.querySelector('.selectAll');

  // Sync select-all checkbox state with individual checkboxes
  const syncSelectAll = () => {
    const all = fieldset.querySelectorAll('.lov-cb');
    const checked = fieldset.querySelectorAll('.lov-cb:checked');
    newSelectAll.checked = all.length > 0 && checked.length === all.length;
    newSelectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  };
  syncSelectAll();

  bindDropdownItemToggle(newSelectAllItem, newSelectAll);
  newSelectAll.addEventListener('change', () => {
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = newSelectAll.checked;
    }
  });

  fieldset.addEventListener('change', syncSelectAll);

  const OkBtn = document.createElement('button');
  OkBtn.type = 'button';
  OkBtn.className = 'btn btn-sm btn-dark rounded-2 ms-auto';
  OkBtn.textContent = 'OK';
  const ClearBtn = document.createElement('button');
  ClearBtn.type = 'button';
  ClearBtn.className = 'btn btn-sm btn-secondary rounded-2';
  ClearBtn.textContent = 'Clear';
  const clearOKContainer = dropdown.querySelector('.clearOKBtn');
  clearOKContainer.innerHTML = '';
  clearOKContainer.appendChild(ClearBtn);
  clearOKContainer.appendChild(OkBtn);

  OkBtn.addEventListener('click', () => {
    const selected = [...fieldset.querySelectorAll('.lov-cb:checked')].map((cb) => cb.value);
    if (!appState.selectFilters) appState.selectFilters = {};
    if (selected.length) {
      appState.selectFilters[colName] = selected;
    } else {
      delete appState.selectFilters[colName];
    }
    updateFilterIcon(toggleButton, colName in (appState.selectFilters ?? {}));
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    appState.currentPage = 1;
    fetchTableData(appState);
  });

  ClearBtn.addEventListener('click', () => {
    delete appState.selectFilters?.[colName];
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = false;
    }
    newSelectAll.checked = false;
    newSelectAll.indeterminate = false;
    updateFilterIcon(toggleButton, false);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    appState.currentPage = 1;
    fetchTableData(appState);
  });
}

function updateFilterIcon(toggleButton, isFiltered) {
  const icon = toggleButton.querySelector('i');
  icon.className = isFiltered ? 'fa-solid fa-filter' : 'fa-solid fa-chevron-down';
}

function bindDropdownItemToggle(dropdownItem, checkbox) {
  dropdownItem.addEventListener('click', (e) => {
    if (e.target.closest('input') === checkbox) return;

    e.preventDefault();
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

async function populatePaginationInfo(appState) {
  if (appState.currentRowCount === undefined) return;

  const paginationControls = document.getElementById('paginationControls');
  const paginationInfo = document.getElementById('paginationInfo');

  if (appState.currentRowCount < appState.pageSize) {
    // Fewer rows than page size — we're on the last (or only) page

    const totalRowCount = (appState.currentPage - 1) * appState.pageSize + appState.currentRowCount;
    appState.totalRowCount = totalRowCount;

    if (appState.currentPage === 1) {
      paginationInfo.textContent = `${totalRowCount} Row${totalRowCount !== 1 ? 's' : ''}`;
      paginationControls.classList.remove('d-flex');
      paginationControls.classList.add('d-none');
    } else {
      const start = (appState.currentPage - 1) * appState.pageSize + 1;
      paginationInfo.textContent = `${start}-${totalRowCount} of ${totalRowCount} Rows`;
      const pageInput = document.getElementById('paginationPageInput');
      if (pageInput) pageInput.value = appState.currentPage;
    }
    return;
  }

  // currentRowCount === pageSize — there may be more rows, fetch total
  paginationInfo.textContent = 'Fetching row count…';
  try {
    if (appState.currentPage === 1) {
      const { row_count: totalRowCount } = await api.post('/tables/row-count', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        select_filters: appState.selectFilters,
        text_filters: appState.textFilters,
      });

      appState.totalRowCount = totalRowCount;
    }
    const totalPages = Math.ceil(appState.totalRowCount / appState.pageSize);
    const start = (appState.currentPage - 1) * appState.pageSize + 1;
    const end = Math.min(start + appState.pageSize - 1, appState.totalRowCount);

    paginationInfo.textContent = `${start}-${end} of ${appState.totalRowCount} Rows`;

    // Show pagination controls and update page info
    paginationControls.classList.remove('d-none');
    paginationControls.classList.add('d-flex');
    const pageInput = document.getElementById('paginationPageInput');
    if (pageInput) pageInput.value = appState.currentPage;

    const totalPagesSpan = document.getElementById('paginationTotalPages');
    if (totalPagesSpan) totalPagesSpan.textContent = `of ${totalPages}`;
  } catch {
    paginationInfo.textContent = '';
    paginationControls.classList.remove('d-flex');
    paginationControls.classList.add('d-none');
  }
}

/**
 * Wire pagination control buttons (first, prev, next, last) and the page
 * input field so the user can navigate between pages.
 * @param {Object} appState - Application state; uses and mutates `currentPage`
 *   and reads `totalRowCount` and `pageSize` to compute bounds.
 */
function initPaginationControls(appState) {
  const getTotalPages = () =>
    Math.max(1, Math.ceil((appState.totalRowCount ?? 0) / appState.pageSize));

  const goToPage = (page) => {
    const totalPages = getTotalPages();
    const target = Math.max(1, Math.min(page, totalPages));
    if (target === appState.currentPage) return;
    appState.currentPage = target;
    fetchTableData(appState);
  };

  document.getElementById('paginationFirstBtn').addEventListener('click', () => goToPage(1));
  document
    .getElementById('paginationPrevBtn')
    .addEventListener('click', () => goToPage(appState.currentPage - 1));
  document
    .getElementById('paginationNextBtn')
    .addEventListener('click', () => goToPage(appState.currentPage + 1));
  document
    .getElementById('paginationLastBtn')
    .addEventListener('click', () => goToPage(getTotalPages()));

  document.getElementById('paginationPageInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) {
      goToPage(val);
    } else {
      e.target.value = appState.currentPage;
    }
  });
}

export { getTableHeaders, fetchTableData, initRefreshDataBtn, initPaginationControls };
