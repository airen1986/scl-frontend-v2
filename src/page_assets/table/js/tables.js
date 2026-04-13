import api from '@/common/js/api';

let tableLoaderDepth = 0;

/**
 * Makes the global page loader visible and increments the internal reference counter.
 *
 * If the '#pageLoader' element is not present, the function does nothing. It increments the module-level
 * `tableLoaderDepth`, removes the 'd-none' class from the loader, and sets `aria-hidden` to "false"
 * so the loader remains visible across nested async operations.
 */
function showTableLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  tableLoaderDepth += 1;
  loader.classList.remove('d-none');
  loader.setAttribute('aria-hidden', 'false');
}

/**
 * Decrements the table-loader reference counter and hides the #pageLoader element when the counter reaches zero.
 *
 * If the #pageLoader element is not present this function does nothing. The internal counter is never allowed to go below zero; when it becomes zero the loader receives `d-none` and `aria-hidden="true"`.
 */
function hideTableLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  tableLoaderDepth = Math.max(0, tableLoaderDepth - 1);
  if (tableLoaderDepth > 0) return;

  loader.classList.add('d-none');
  loader.setAttribute('aria-hidden', 'true');
}

/**
 * Request column metadata and render the table header rows with selection and per-column filter controls.
 *
 * Updates appState.columnNames with the returned headers and sets appState.selectedColumn = null.
 * Attaches handlers for column selection, text-filter enter, filter dropdowns, and row selection checkboxes, and clears the table body.
 * May initialize or modify appState.textFilters and will reset appState.currentPage to 1 when filters change.
 *
 * @param {Object} appState - Application state; must include `tableName`, `projectName`, and `modelName`. This function mutates `appState.columnNames`, `appState.selectedColumn`, and may create or modify `appState.textFilters` and `appState.currentPage`.
 */
async function getTableHeaders(appState) {
  showTableLoader();
  try {
    const { headers } = await api.post('/tables/headers', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
    });

    appState.columnNames = headers; // [[columnName, dataType], ...]
    appState.selectedColumn = null;

    // Populate head1: checkbox column + one <th> per column name
    const oldhead1 = document.getElementById('sclTableHead1');
    const head1 = oldhead1.cloneNode(true);
    oldhead1.replaceWith(head1);
    head1.id = 'sclTableHead1';

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

    // Column selection: click a column header to select/deselect the column
    head1.addEventListener('click', (e) => {
      const th = e.target.closest('th');
      if (!th || !head1.contains(th)) return;
      const colIndex = [...head1.children].indexOf(th);
      if (colIndex <= 0) return; // Skip checkbox column
      selectColumn(appState, colIndex);
    });

    // Populate head2: empty checkbox column + one filter <th> per column
    const oldhead2 = document.getElementById('sclTableHead2');
    const head2 = oldhead2.cloneNode(true);
    oldhead2.replaceWith(head2);
    head2.id = 'sclTableHead2';
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

      for (const otherButton of head2.querySelectorAll('[data-bs-toggle="dropdown"]')) {
        if (otherButton === currentButton) continue;

        otherButton.closest('th')?.classList.remove('dropdown-open');
        window.bootstrap.Dropdown.getOrCreateInstance(otherButton).hide();
      }

      currentButton.closest('th')?.classList.add('dropdown-open');

      populateFilterDropdown(
        currentButton.nextElementSibling,
        currentButton.previousElementSibling.dataset.col,
        appState
      );
    });

    head2.addEventListener('hide.bs.dropdown', (e) => {
      e.target.closest('th')?.classList.remove('dropdown-open');
    });

    // Select-all checkbox: toggle all body checkboxes
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    selectAllCb.addEventListener('change', () => {
      const tbody = document.getElementById('sclTableBody');
      for (const cb of tbody.querySelectorAll('input[type="checkbox"]')) {
        cb.checked = selectAllCb.checked;
      }
    });

    const oldtbody = document.getElementById('sclTableBody');
    const tbody = oldtbody.cloneNode(true);
    oldtbody.replaceWith(tbody);
    tbody.id = 'sclTableBody';

    // Body checkbox: sync select-all when individual rows change
    tbody.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const all = tbody.querySelectorAll('input[type="checkbox"]');
      const checked = tbody.querySelectorAll('input[type="checkbox"]:checked');
      selectAllCb.checked = all.length > 0 && checked.length === all.length;
      selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
    });

    // Clear body
    tbody.innerHTML = '';
  } finally {
    hideTableLoader();
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
  showTableLoader();
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
      for (let i = 0; i < values.length; i++) {
        const td = document.createElement('td');
        const val = values[i];
        if (isNumericType(appState.columnNames[i]?.[1])) {
          td.style.textAlign = 'right';
          td.title = val ?? '';
          td.textContent = formatNumericValue(val);
        } else if (isIntegerType(appState.columnNames[i]?.[1])) {
          td.style.textAlign = 'right';
          td.title = val ?? '';
          td.textContent = val ?? '';
        } else {
          td.title = val ?? '';
          td.textContent = val ?? '';
        }
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    refreshColumnHighlight(appState);

    await populatePaginationInfo(appState);
  } finally {
    hideTableLoader();
  }
}

/**
 * Initialize the page's refresh button so clicking it clears table filters, resets related UI, and reloads the table data.
 *
 * The click handler clears in-memory filters and pagination/selection state, resets header UI (header text inputs, header select-all checkbox, and per-column filter icons), and triggers a fresh table data fetch.
 * @param {Object} appState - Table application state. Mutated fields: `appState.textFilters` is set to `{}`, `appState.selectFilters` is set to `{}`, `appState.currentPage` is set to `1`, and `appState.selectedColumn` is set to `null`. Other fields are read by the subsequent data fetch.
 */
function initRefreshDataBtn(appState) {
  const refreshButton = document.getElementById('refreshDataBtn');

  refreshButton.addEventListener('click', async () => {
    if (refreshButton.disabled) return;

    refreshButton.disabled = true;

    appState.textFilters = {};
    appState.selectFilters = {};
    appState.currentPage = 1; // Reset to first page on refresh, since filters may change total pages and current page may become invalid
    appState.selectedColumn = null;

    try {
      clearColumnHighlight();

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

/**
 * Populate a column's filter dropdown with distinct values and wire its selection controls.
 *
 * Loads distinct values for `colName`, renders checkbox items and Select All/OK/Clear controls
 * inside the provided dropdown element, synchronizes the Select All state with individual items,
 * updates `appState.selectFilters` when OK or Clear are used, updates the filter icon, and triggers
 * a table data refresh (and resets pagination) when the effective filter set changes.
 *
 * @param {HTMLElement} dropdown - The dropdown menu element for the column's filter (contains `.lovValuesFieldset`, `.selectAll`, and `.clearOKBtn`).
 * @param {string} colName - The column name whose distinct values should be loaded and edited.
 * @param {Object} appState - Application state object (reads/writes properties such as `tableName`, `projectName`, `modelName`, `pageSize`, `selectFilters`, `textFilters`, and `currentPage`).
 */
async function populateFilterDropdown(dropdown, colName, appState) {
  const fieldset = dropdown.querySelector('.lovValuesFieldset');
  const selectAllCb = dropdown.querySelector('.selectAll');
  const toggleButton = dropdown.previousElementSibling;
  const selectAllItem = selectAllCb.closest('.dropdown-item');
  const rawValues = [];

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
  const colMeta = appState.columnNames.find(([name]) => name === colName);
  const isNumeric = colMeta && isNumericType(colMeta[1]);

  fieldset.innerHTML = '';
  for (const val of values) {
    const a = document.createElement('a');
    a.className = 'dropdown-item px-2 py-0';
    const wrapper = document.createElement('div');
    wrapper.className = 'form-check';
    const cb = document.createElement('input');
    cb.className = 'form-check-input lov-cb';
    cb.type = 'checkbox';
    cb.dataset.rawIndex = String(rawValues.push(val) - 1);
    if (activeSet.has(val)) cb.checked = true;
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.textContent = val !== null ? (isNumeric ? formatNumericValue(val) : val) : '(blank)';
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

  fieldset.onchange = syncSelectAll;

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
    const selected = [...fieldset.querySelectorAll('.lov-cb:checked')].map(
      (cb) => rawValues[Number(cb.dataset.rawIndex)]
    );
    if (!appState.selectFilters) appState.selectFilters = {};
    const previousSelected = appState.selectFilters[colName] ?? [];
    let filterChanged;

    if (selected.length) {
      filterChanged = !areArraysEqual(previousSelected, selected);
      if (filterChanged) {
        appState.selectFilters[colName] = selected;
      }
    } else {
      filterChanged = previousSelected.length > 0;
      if (filterChanged) {
        delete appState.selectFilters[colName];
      }
    }
    updateFilterIcon(toggleButton, colName in (appState.selectFilters ?? {}));
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      appState.currentPage = 1;
      fetchTableData(appState);
    }
  });

  ClearBtn.addEventListener('click', () => {
    const filterChanged = (appState.selectFilters?.[colName] ?? []).length > 0;
    delete appState.selectFilters?.[colName];
    for (const cb of fieldset.querySelectorAll('.lov-cb')) {
      cb.checked = false;
    }
    newSelectAll.checked = false;
    newSelectAll.indeterminate = false;
    updateFilterIcon(toggleButton, false);
    window.bootstrap.Dropdown.getOrCreateInstance(toggleButton).hide();
    if (filterChanged) {
      appState.currentPage = 1;
      fetchTableData(appState);
    }
  });
}

/**
 * Check whether two arrays have the same length and identical elements in the same order using strict equality.
 * @param {Array} left - The first array to compare.
 * @param {Array} right - The second array to compare.
 * @returns {boolean} `true` if both arrays have the same length and each element is strictly equal to the corresponding element, `false` otherwise.
 */
const NUMERIC_TYPE_RE = /^(NUMERIC|NUMBER|FLOAT|DOUBLE|REAL|DECIMAL|MONEY|SMALLMONEY)\b/i;
const INTEGER_TYPE_RE = /^(INTEGER|INT|BIGINT|SMALLINT|TINYINT|MEDIUMINT)\b/i;

/**
 * Determine whether a SQL column data type represents a numeric type.
 *
 * Recognizes type names with optional precision/scale suffixes (for example, "NUMERIC(10,2)").
 * @param {string} dataType - Column data type as returned by the headers endpoint.
 * @returns {boolean} `true` if `dataType` corresponds to a numeric SQL type, `false` otherwise.
 */
function isNumericType(dataType) {
  return NUMERIC_TYPE_RE.test(dataType);
}

/**
 * Determines whether a SQL data type name represents an integer type.
 * @param {string} dataType - The SQL type name to test (e.g., "int", "bigint", "smallint").
 * @returns {boolean} `true` if `dataType` matches integer-like SQL type names, `false` otherwise.
 */
function isIntegerType(dataType) {
  return INTEGER_TYPE_RE.test(dataType);
}

/**
 * Format numeric values according to the system locale with up to two decimal places.
 *
 * If `val` is `null`, returns an empty string. If `val` is numeric or can be converted to a number,
 * returns the locale-formatted string with up to two fraction digits. If conversion results in `NaN`,
 * returns `String(val)`.
 *
 * @param {*} val - The raw cell value to format (number or value convertible to number).
 * @returns {string} The formatted numeric string, `''` for `null`, or `String(val)` for non-numeric inputs.
 */
function formatNumericValue(val) {
  if (val === null) return '';
  const num = typeof val === 'number' ? val : Number(val);
  if (Number.isNaN(num)) return String(val);
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Check whether two arrays contain identical elements in the same order.
 * @param {Array} left - The first array to compare.
 * @param {Array} right - The second array to compare.
 * @returns {boolean} `true` if both arrays have the same length and each element is strictly equal (`===`) to the corresponding element in the other array, `false` otherwise.
 */
function areArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Update the icon inside a column filter toggle button to reflect whether the column is filtered.
 *
 * @param {HTMLElement} toggleButton - The button element that contains the icon to update.
 * @param {boolean} isFiltered - `true` to show the filter icon, `false` to show the chevron.
 */
function updateFilterIcon(toggleButton, isFiltered) {
  const icon = toggleButton.querySelector('i');
  icon.className = isFiltered ? 'fa-solid fa-filter' : 'fa-solid fa-chevron-down';
}

/**
 * Attach a click handler to a dropdown item that toggles its associated checkbox and emits a bubbling change event.
 *
 * When the user clicks the dropdown item (except directly on the checkbox input), this handler prevents the default
 * action, clears `indeterminate` if set, toggles the checkbox to the next checked state (clicking an indeterminate box
 * sets it to `true`), and dispatches a bubbling `change` event.
 *
 * @param {HTMLElement} dropdownItem - The clickable container element representing a selectable dropdown row.
 * @param {HTMLInputElement} checkbox - The checkbox input associated with the dropdown row.
 */
const COL_SELECTED_CLASS = 'scl-col-selected';

/**
 * Select or deselect a table column by its 1-based index (accounting for the
 * leading checkbox column). Highlights the column across both header rows and
 * all body rows, and updates `appState.selectedColumn`.
 *
 * Clicking the already-selected column deselects it.
 *
 * @param {Object} appState - Application state; reads `columnNames`, sets `selectedColumn`.
 * @param {number} colIndex - 1-based column index in the table (0 is the checkbox column).
 */
function selectColumn(appState, colIndex) {
  const colName = appState.columnNames[colIndex - 1]?.[0];
  if (!colName) return;

  const isDeselect = appState.selectedColumn === colName;
  clearColumnHighlight();

  if (isDeselect) {
    appState.selectedColumn = null;
    return;
  }

  appState.selectedColumn = colName;
  applyColumnHighlight(colIndex);
}

/**
 * Clears the column selection highlight from all table header and body cells.
 */
function clearColumnHighlight() {
  for (const cell of document.querySelectorAll(`.${COL_SELECTED_CLASS}`)) {
    cell.classList.remove(COL_SELECTED_CLASS);
  }
}

/**
 * Add the column-selected CSS class to header and body cells at the specified column index.
 * @param {number} colIndex - Zero-based column index matching the table's DOM columns (includes the leading checkbox column).
 */
function applyColumnHighlight(colIndex) {
  const head1 = document.getElementById('sclTableHead1');
  const head2 = document.getElementById('sclTableHead2');
  const tbody = document.getElementById('sclTableBody');

  head1.children[colIndex]?.classList.add(COL_SELECTED_CLASS);
  head2.children[colIndex]?.classList.add(COL_SELECTED_CLASS);
  for (const row of tbody.rows) {
    row.cells[colIndex]?.classList.add(COL_SELECTED_CLASS);
  }
}

/**
 * Restore visual highlight for the currently selected column after the table body is re-rendered.
 *
 * If the previously selected column no longer exists in `appState.columnNames`, clears `appState.selectedColumn`.
 * @param {Object} appState - Application state; uses `selectedColumn` and `columnNames`.
 */
function refreshColumnHighlight(appState) {
  if (!appState.selectedColumn) return;
  const idx = appState.columnNames.findIndex(([name]) => name === appState.selectedColumn);
  if (idx === -1) {
    appState.selectedColumn = null;
    return;
  }
  applyColumnHighlight(idx + 1); // +1 for the leading checkbox column
}

/**
 * Toggle a checkbox when its containing dropdown item is clicked, treating an indeterminate state as a transition to checked.
 *
 * Prevents clicks that directly target the checkbox input from duplicating behavior, stops the default link-like action,
 * clears `indeterminate` and sets `checked` (toggling unless it was indeterminate, in which case it becomes checked),
 * then dispatches a bubbling `change` event on the checkbox.
 *
 * @param {HTMLElement} dropdownItem - The clickable wrapper element representing a dropdown list item.
 * @param {HTMLInputElement} checkbox - The checkbox input inside the dropdown item to toggle.
 */
function bindDropdownItemToggle(dropdownItem, checkbox) {
  dropdownItem.addEventListener('click', (e) => {
    if (e.target.closest('input') === checkbox) return;

    e.preventDefault();

    // If the checkbox is in an indeterminate state, clicking the row should behave like a user click:
    // clear indeterminate and move to a determinate checked state.
    const nextChecked = checkbox.indeterminate ? true : !checkbox.checked;
    checkbox.indeterminate = false;
    checkbox.checked = nextChecked;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

/**
 * Update pagination UI and appState.totalRowCount based on the currently fetched rows and, when necessary, a remote total row count.
 *
 * Updates the contents and visibility of #paginationInfo and #paginationControls, sets #paginationPageInput and #paginationTotalPages, and assigns appState.totalRowCount when determinable. If appState.currentRowCount is less than pageSize the function computes and sets the total from the current page; if currentRowCount equals pageSize it may call the server endpoint `/tables/row-count` to obtain the total. On request failure the pagination UI is hidden and the info cleared.
 *
 * @param {Object} appState - Application state object.
 * @param {number} appState.currentRowCount - Number of rows returned for the current page (required to decide pagination state).
 * @param {number} appState.pageSize - Number of rows per page.
 * @param {number} appState.currentPage - Current page number (1-based).
 * @param {string} appState.tableName - Table name used when requesting total row count.
 * @param {string} appState.projectName - Project name used when requesting total row count.
 * @param {string} appState.modelName - Model name used when requesting total row count.
 * @param {Object} [appState.selectFilters] - Current select filters passed to the row-count request.
 * @param {Object} [appState.textFilters] - Current text filters passed to the row-count request.
 * @param {number} [appState.totalRowCount] - Will be set to the computed or fetched total row count.
 */
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
 * Wire pagination controls and the page-number input so users can navigate table pages.
 * The controls clamp requested pages to [1, totalPages], update `appState.currentPage`, and trigger data fetches.
 * @param {Object} appState - Application state; reads `totalRowCount` and `pageSize`, and mutates `currentPage`.
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

/**
 * Create a clickable list item element representing a column name.
 * @param {string} colName - The column name to display.
 * @returns {HTMLDivElement} The column item element.
 */
function createColumnItem(colName) {
  const div = document.createElement('div');
  div.className = 'col-select-item px-2 py-1 small';
  div.dataset.colName = colName;
  div.textContent = colName;
  return div;
}

/**
 * Move items from one list container to another.
 * @param {HTMLElement} fromList - Source list container.
 * @param {HTMLElement} toList - Destination list container.
 * @param {boolean} selectedOnly - If true, move only `.active` items; otherwise move all.
 */
function moveItems(fromList, toList, selectedOnly) {
  const selector = selectedOnly ? '.col-select-item.active' : '.col-select-item';
  const makeDraggable = toList.id === 'selectedColumnsList';
  for (const item of [...fromList.querySelectorAll(selector)]) {
    item.classList.remove('active');
    item.draggable = makeDraggable;
    toList.appendChild(item);
  }
}

/**
 * Given a container and a vertical cursor position, return the element
 * that the dragged item should be inserted before, or null to append.
 * @param {HTMLElement} container - The list container.
 * @param {number} y - The clientY position of the pointer.
 * @returns {HTMLElement|null}
 */
function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('.col-select-item:not(.dragging)')];
  return (
    items.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element ?? null
  );
}

/**
 * Initialize the Select Columns modal so users can move columns between
 * "Available" and "Selected" lists, reorder selected columns via
 * drag-and-drop, and persist the selection.
 *
 * @param {Object} appState - Application state.
 */
function initSelectColumnsModal(appState) {
  const modalEl = document.getElementById('selectColumnsModal');
  const availableList = document.getElementById('availableColumnsList');
  const selectedList = document.getElementById('selectedColumnsList');

  // Populate lists when modal opens (fetches all-headers each time)
  modalEl.addEventListener('show.bs.modal', async () => {
    availableList.innerHTML = '<div class="text-center py-3"><small>Loading…</small></div>';
    selectedList.innerHTML = '';

    // Selected columns in current display order (draggable)
    for (const [colName] of appState.columnNames) {
      const item = createColumnItem(colName);
      item.draggable = true;
      selectedList.appendChild(item);
    }

    try {
      const { headers } = await api.post('/tables/all-headers', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
      });
      appState.allColumns = headers;
    } catch {
      availableList.innerHTML =
        '<div class="text-center py-3 text-danger"><small>Failed to load</small></div>';
      return;
    }

    const selectedNames = new Set(appState.columnNames.map(([name]) => name));
    availableList.innerHTML = '';
    for (const colName of appState.allColumns) {
      if (!selectedNames.has(colName)) {
        availableList.appendChild(createColumnItem(colName));
      }
    }
  });

  // Click to select / deselect items
  for (const list of [availableList, selectedList]) {
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.col-select-item');
      if (!item) return;
      if (!e.ctrlKey && !e.metaKey) {
        for (const sib of list.querySelectorAll('.col-select-item.active')) {
          if (sib !== item) sib.classList.remove('active');
        }
      }
      item.classList.toggle('active');
    });
  }

  // Double-click to transfer single item
  availableList.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.col-select-item');
    if (item) {
      item.classList.remove('active');
      item.draggable = true;
      selectedList.appendChild(item);
    }
  });
  selectedList.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.col-select-item');
    if (item) {
      item.classList.remove('active');
      item.draggable = false;
      availableList.appendChild(item);
    }
  });

  // Drag-and-drop reordering in the selected list
  let dragItem = null;

  selectedList.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.col-select-item');
    if (!item) return;
    dragItem = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  selectedList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragItem) return;
    const after = getDragAfterElement(selectedList, e.clientY);
    if (after) {
      selectedList.insertBefore(dragItem, after);
    } else {
      selectedList.appendChild(dragItem);
    }
  });

  selectedList.addEventListener('dragend', () => {
    if (dragItem) {
      dragItem.classList.remove('dragging');
      dragItem = null;
    }
  });

  // Transfer buttons
  document.getElementById('moveToSelectedBtn').addEventListener('click', () => {
    moveItems(availableList, selectedList, true);
  });
  document.getElementById('moveAllToSelectedBtn').addEventListener('click', () => {
    moveItems(availableList, selectedList, false);
  });
  document.getElementById('moveToAvailableBtn').addEventListener('click', () => {
    moveItems(selectedList, availableList, true);
  });
  document.getElementById('moveAllToAvailableBtn').addEventListener('click', () => {
    moveItems(selectedList, availableList, false);
  });

  // OK — persist column order and apply selection
  document.getElementById('submitSelectColumnsBtn').addEventListener('click', async () => {
    const allColMap = new Map(appState.allColumns.map((col) => [col, col]));
    const selectedCols = [...selectedList.querySelectorAll('.col-select-item')]
      .map((item) => allColMap.get(item.dataset.colName))
      .filter(Boolean);

    if (selectedCols.length === 0) return; // prevent empty selection

    // Save column order to server
    await api.post('/tables/set-columns-order', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      column_names: selectedCols.map((col) => col),
    });

    // Clean up filters for removed columns
    for (const col of Object.keys(appState.selectFilters ?? {})) {
      if (!selectedCols.includes(col)) delete appState.selectFilters[col];
    }
    for (const col of Object.keys(appState.textFilters ?? {})) {
      if (!selectedCols.includes(col)) delete appState.textFilters[col];
    }

    appState.currentPage = 1;
    appState.selectedColumn = null;

    await getTableHeaders(appState);
    await fetchTableData(appState);

    window.bootstrap.Modal.getInstance(modalEl).hide();
  });
}

export {
  getTableHeaders,
  fetchTableData,
  initRefreshDataBtn,
  initPaginationControls,
  initSelectColumnsModal,
  selectColumn,
};
