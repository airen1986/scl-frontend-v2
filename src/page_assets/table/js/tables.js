import api from '@/common/js/api';
import { bsToastWarning, bsToastSuccess } from '@/common/js/bsToast';

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
 * Load column metadata and build the table header rows with filter controls and selection UI.
 *
 * Fetches column headers from the server, updates appState.columnNames, clears appState.selectedColumn,
 * replaces the header rows and table body, and attaches handlers for column selection, per-column
 * text/value filters, and row-selection checkboxes. When filters are changed via the UI this function
 * ensures appState.currentPage is reset to 1 and triggers a data refresh.
 *
 * @param {Object} appState - Application state; must include `tableName`, `projectName`, and `modelName`.
 *   Mutated properties:
 *   - `columnNames`: set to the returned headers (array of [columnName, dataType] tuples).
 *   - `selectedColumn`: set to `null`.
 *   - may create or modify `textFilters` and will set `currentPage = 1` when filters change.
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
      const sortBtn = document.createElement('button');
      sortBtn.type = 'button';
      sortBtn.className = 'scl-sort-btn btn btn-link btn-sm p-0 text-dark';
      sortBtn.setAttribute('aria-label', `Sort by ${colName}`);
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-sort';
      sortBtn.appendChild(icon);
      div.append(span, sortBtn);
      th.appendChild(div);
      head1.appendChild(th);
    }

    // Sort: click the <i> icon to cycle sort direction (none → ASC → DESC → none)
    head1.addEventListener('click', (e) => {
      const sortBtn = e.target.closest('.scl-sort-btn');
      if (sortBtn) {
        const th = sortBtn.closest('th');
        if (!th || !head1.contains(th)) return;
        const colIndex = [...head1.children].indexOf(th);
        if (colIndex <= 0) return;
        toggleColumnSort(appState, colIndex);
        return;
      }

      // Column selection: click a column header to select/deselect the column
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
      input.value = appState.textFilters?.[colName] ?? '';
      input.style.minWidth = '0';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'input-group-text px-1';
      btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
      btn.setAttribute('aria-label', `Select filter for ${colName}`);
      btn.setAttribute('data-bs-toggle', 'dropdown');
      btn.setAttribute('data-bs-auto-close', 'outside');
      btn.setAttribute('aria-expanded', 'false');
      updateFilterIcon(btn, colName in (appState.selectFilters ?? {}));

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
      appState.totalRowCount = null;
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

    // Restore sort icons from appState
    refreshSortIcons(appState);
  } finally {
    hideTableLoader();
  }
}

/**
 * Cycle sort direction for a column: none → ASC → DESC → none.
 *
 * Supports multi-column sort. Each click cycles the column through
 * ASC → DESC → removed. Columns not yet in the sort list are appended;
 * removing a column preserves the order of the remaining sorts.
 *
 * @param {Object} appState - Application state; reads `columnNames`, mutates `sortColumns` and `currentPage`.
 * @param {number} colIndex - 1-based column index in the table (0 is the checkbox column).
 */
function toggleColumnSort(appState, colIndex) {
  const colName = appState.columnNames[colIndex - 1]?.[0];
  if (!colName) return;

  if (!appState.sortColumns) appState.sortColumns = [];

  const idx = appState.sortColumns.findIndex(([name]) => name === colName);

  if (idx === -1) {
    // Not sorted yet — add as ASC
    appState.sortColumns.push([colName, 'ASC']);
  } else if (appState.sortColumns[idx][1] === 'ASC') {
    // ASC → DESC
    appState.sortColumns[idx] = [colName, 'DESC'];
  } else {
    // DESC → remove from sort list
    appState.sortColumns.splice(idx, 1);
  }

  appState.currentPage = 1;
  refreshSortIcons(appState);
  fetchTableData(appState);
}

const SORT_ICON_MAP = {
  ASC: 'fa-solid fa-sort-up',
  DESC: 'fa-solid fa-sort-down',
};
const SORT_ICON_DEFAULT = 'fa-solid fa-sort';

/**
 * Update all sort icons in head1 to reflect the current `appState.sortColumns`.
 *
 * @param {Object} appState - Application state; reads `sortColumns` and `columnNames`.
 */
function refreshSortIcons(appState) {
  const head1 = document.getElementById('sclTableHead1');
  if (!head1) return;

  const sortMap = new Map(appState.sortColumns ?? []);

  // Skip the first child (checkbox column)
  for (let i = 0; i < appState.columnNames.length; i++) {
    const th = head1.children[i + 1];
    if (!th) continue;
    const icon = th.querySelector('i');
    if (!icon) continue;
    const colName = appState.columnNames[i][0];
    const dir = sortMap.get(colName);
    icon.className = dir ? SORT_ICON_MAP[dir] : SORT_ICON_DEFAULT;
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
      sort_columns: appState.sortColumns,
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
        const [colName, dataType] = appState.columnNames[i] ?? [];
        const fmt = appState.columnFormats?.[colName];
        const { text, align } = formatCellValue(val, dataType, fmt);
        td.title = val ?? '';
        td.textContent = text;
        if (align) td.style.textAlign = align;
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
    appState.sortColumns = [];
    appState.currentPage = 1; // Reset to first page on refresh, since filters may change total pages and current page may become invalid
    appState.selectedColumn = null;
    appState.totalRowCount = null;

    try {
      clearColumnHighlight();
      refreshSortIcons(appState);

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
      appState.totalRowCount = null;
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
      appState.totalRowCount = null;
      fetchTableData(appState);
    }
  });
}

const NUMERIC_TYPE_RE = /^(NUMERIC|NUMBER|FLOAT|DOUBLE|REAL|DECIMAL|MONEY|SMALLMONEY)\b/i;
const INTEGER_TYPE_RE = /^(INTEGER|INT|BIGINT|SMALLINT|TINYINT|MEDIUMINT)\b/i;
const DATE_TYPE_RE = /^(DATE)\b/i;
const DATETIME_TYPE_RE =
  /^(DATETIME|TIMESTAMP|TIMESTAMPTZ|TIMESTAMP_TZ|TIMESTAMP_NTZ|TIMESTAMP_LTZ)\b/i;

/**
 * Map a SQL column data type to a default format column type.
 *
 * @param {string} dataType - SQL type as returned by the headers endpoint.
 * @returns {string} One of 'REAL', 'INTEGER', 'DATE', 'DATETIME', or 'TEXT'.
 */
function defaultFormatType(dataType) {
  if (NUMERIC_TYPE_RE.test(dataType)) return 'REAL';
  if (INTEGER_TYPE_RE.test(dataType)) return 'INTEGER';
  if (DATETIME_TYPE_RE.test(dataType)) return 'DATETIME';
  if (DATE_TYPE_RE.test(dataType)) return 'DATE';
  return 'TEXT';
}

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

// ── Excel serial-date helpers ────────────────────────────────────────────────

/** Excel epoch: 1899-12-30 (accounting for the Lotus 1-2-3 leap-year bug). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * Pad a number to at least `len` digits with leading zeros.
 * @param {number} n
 * @param {number} len
 * @returns {string}
 */
function pad(n, len) {
  return String(n).padStart(len, '0');
}

/**
 * Convert an Excel serial date number to a `YYYY-MM-DD` string.
 * @param {number} serial - Excel serial date.
 * @returns {string}
 */
function excelSerialToDate(serial) {
  const d = new Date(EXCEL_EPOCH_MS + serial * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/**
 * Convert an Excel serial date/time number to a `YYYY-MM-DD HH:MM:SS` string.
 * @param {number} serial - Excel serial date (may include fractional time).
 * @returns {string}
 */
function excelSerialToDatetime(serial) {
  const totalMs = EXCEL_EPOCH_MS + serial * MS_PER_DAY;
  const d = new Date(totalMs);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`
  );
}

// ── Currency symbol map ────────────────────────────────────────────────────

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  CHF: 'CHF',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  KRW: '₩',
  BRL: 'R$',
  ZAR: 'R',
  RUB: '₽',
  TRY: '₺',
  MXN: 'MX$',
  SGD: 'S$',
  HKD: 'HK$',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  THB: '฿',
  IDR: 'Rp',
  MYR: 'RM',
  PHP: '₱',
  TWD: 'NT$',
  AED: 'AED',
  SAR: 'SAR',
  EGP: 'E£',
  ILS: '₪',
  CLP: 'CL$',
  ARS: 'AR$',
  COP: 'COL$',
  PEN: 'S/.',
  VND: '₫',
  NGN: '₦',
  KES: 'KSh',
  PKR: '₨',
  BDT: '৳',
  LKR: 'Rs',
};

/**
 * Resolve a prefix/currency code to its symbol. If the uppercase value exists
 * in the currency map the symbol is returned; otherwise the original string
 * is returned unchanged (allows users to type arbitrary prefixes like "%" or "€").
 *
 * @param {string} prefix - User-entered prefix or ISO currency code.
 * @returns {string} Resolved symbol or the original prefix.
 */
function resolveCurrencySymbol(prefix) {
  if (!prefix) return '';
  return CURRENCY_SYMBOLS[prefix.toUpperCase()] ?? prefix;
}

// ── Unified cell formatter ───────────────────────────────────────────────────

const TEXT_TYPE_RE = /^(TEXT|VARCHAR|STRING|CHAR|NVARCHAR|NCHAR|CLOB|NCLOB)\b/i;

/**
 * Test whether a SQL data type is a text/string type.
 * @param {string} dataType
 * @returns {boolean}
 */
function isTextType(dataType) {
  return TEXT_TYPE_RE.test(dataType);
}

/**
 * Format a single cell value using the column's saved format and SQL data type.
 *
 * Applies the rules:
 * - REAL/NUMERIC format: prefix + thousand-separator + decimal places (falls back to default numeric formatting).
 * - INTEGER/TEXT/LOV format: no special formatting; falls back to default.
 * - DATE format + text SQL type: first 10 chars.
 * - DATE format + numeric SQL type: Excel serial → YYYY-MM-DD.
 * - DATETIME format + text SQL type: first 19 chars.
 * - DATETIME format + numeric SQL type: Excel serial → YYYY-MM-DD HH:MM:SS.
 * - null values: fall through to the default data-type-based formatting.
 *
 * @param {*} val - Raw cell value.
 * @param {string} dataType - SQL column data type.
 * @param {Object|undefined} fmt - Saved format from `appState.columnFormats[colName]`.
 * @returns {{ text: string, align: string }} Formatted text and CSS text-align value.
 */
function formatCellValue(val, dataType, fmt) {
  const formatType = fmt?.column_type;

  // ── null / undefined: always fall through to default ──────────────
  if (val === null) {
    if (isNumericType(dataType) || isIntegerType(dataType)) {
      return { text: '', align: 'right' };
    }
    return { text: '', align: '' };
  }

  // ── DATE format ───────────────────────────────────────────────────
  if (formatType === 'DATE') {
    if (isTextType(dataType)) {
      return { text: String(val).substring(0, 10), align: '' };
    }
    // Numeric SQL type → Excel serial
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return { text: excelSerialToDate(num), align: '' };
    }
    return { text: String(val), align: '' };
  }

  // ── DATETIME format ──────────────────────────────────────────────
  if (formatType === 'DATETIME') {
    if (isTextType(dataType)) {
      return { text: String(val).substring(0, 19), align: '' };
    }
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return { text: excelSerialToDatetime(num), align: '' };
    }
    return { text: String(val), align: '' };
  }

  // ── REAL / NUMERIC format ────────────────────────────────────────
  if (formatType === 'REAL' || formatType === 'NUMERIC') {
    const num = typeof val === 'number' ? val : Number(val);
    if (Number.isNaN(num)) return { text: String(val), align: 'right' };

    const decimals = fmt.decimal_places ?? 2;
    const useSeparator = (fmt.thousand_separator ?? 'YES') === 'YES';
    const rawPrefix = fmt.prefix?.toUpperCase() ?? '';
    const isCurrencyCode = rawPrefix in CURRENCY_SYMBOLS;

    let formatted;
    if (isCurrencyCode) {
      formatted = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: rawPrefix,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: useSeparator,
      }).format(num);
    } else {
      const prefix = fmt.prefix ? resolveCurrencySymbol(fmt.prefix) : '';
      formatted =
        prefix +
        new Intl.NumberFormat(undefined, {
          style: 'decimal',
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: useSeparator,
        }).format(num);
    }
    return { text: formatted, align: 'right' };
  }

  if (formatType === 'TEXT' || formatType === 'LOV') {
    return { text: String(val), align: '' };
  }

  // ── No format override → default data-type-based formatting ──────
  if (isNumericType(dataType)) {
    return { text: formatNumericValue(val), align: 'right' };
  }
  if (isIntegerType(dataType)) {
    return { text: String(val), align: 'right' };
  }
  return { text: String(val), align: '' };
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
    if (appState.currentPage === 1 && appState.totalRowCount === null) {
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
 * Create a column list item element for the Select Columns modal.
 * @param {string} colName - Column name to display and store on the element.
 * @returns {HTMLDivElement} A `div.col-select-item` with `data-col-name` set and text content set to `colName`.
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
 * Find the non-dragging child element in container that a dragged item at vertical position `y` should be inserted before.
 * @param {HTMLElement} container - The list container to inspect.
 * @param {number} y - The pointer's clientY vertical coordinate.
 * @returns {HTMLElement|null} The child element to insert before, or `null` to append at the end.
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

    appState.sortColumns = (appState.sortColumns ?? []).filter(([name]) =>
      selectedCols.includes(name)
    );

    appState.currentPage = 1;
    appState.selectedColumn = null;
    appState.totalRowCount = null;

    await getTableHeaders(appState);
    await fetchTableData(appState);

    window.bootstrap.Modal.getInstance(modalEl).hide();
  });
}

/**
 * Initialize the Remove Column button
 *
 * If no column is selected (`appState.selectedColumn` is null), a warning toast is shown.
 * Otherwise the selected column is removed from the visible column list, the updated order
 * is persisted via the server, related filters are cleaned up, and the table is refreshed.
 *
 * @param {Object} appState - Application state.
 */
function initRemoveColumnBtn(appState) {
  const removeBtn = document.getElementById('removeColumnBtn');

  removeBtn.addEventListener('click', async () => {
    if (!appState.selectedColumn) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colToRemove = appState.selectedColumn;
    const remainingCols = appState.columnNames
      .map(([name]) => name)
      .filter((name) => name !== colToRemove);

    if (remainingCols.length === 0) {
      bsToastWarning('Cannot remove the last column');
      return;
    }

    // Persist updated column order
    await api.post('/tables/set-columns-order', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
      column_names: remainingCols,
    });

    // Clean up filters for the removed column
    delete appState.selectFilters?.[colToRemove];
    delete appState.textFilters?.[colToRemove];
    appState.sortColumns = (appState.sortColumns ?? []).filter(([name]) => name !== colToRemove);

    appState.currentPage = 1;
    appState.selectedColumn = null;
    appState.totalRowCount = null;

    await getTableHeaders(appState);
    await fetchTableData(appState);
  });
}

/**
 * Initialize the Add Column button
 *
 * Clicking `#addColumnBtn` opens the `#addColumnModal`. On OK the entered column name
 * and selected data type are validated, sent to `/tables/add-column`, and the table is
 * refreshed to reflect the new column.
 *
 * @param {Object} appState - Application state.
 */
function initAddColumnBtn(appState) {
  const addBtn = document.getElementById('addColumnBtn');
  const modalEl = document.getElementById('addColumnModal');
  const nameInput = document.getElementById('addColumnName');
  const dataTypeSelect = document.getElementById('addColumnDataType');
  const submitBtn = document.getElementById('submitAddColumnBtn');
  const modal = new window.bootstrap.Modal(modalEl);

  addBtn.addEventListener('click', () => {
    nameInput.value = '';
    dataTypeSelect.value = 'TEXT';
    modal.show();
  });

  submitBtn.addEventListener('click', async () => {
    const columnName = nameInput.value.trim();
    if (!columnName) {
      bsToastWarning('Please enter a column name');
      return;
    }

    // validate if the column name already exists in the current table
    if (appState.columnNames.some(([name]) => name === columnName)) {
      bsToastWarning(`Column "${columnName}" already exists`);
      return;
    }

    const dataType = dataTypeSelect.value;

    submitBtn.disabled = true;
    try {
      await api.post('/tables/add-column', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: columnName,
        column_type: dataType,
      });

      // update column order to include the new column at the end
      const newColumnOrder = [...appState.columnNames.map(([name]) => name), columnName];
      await api.post('/tables/set-columns-order', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_names: newColumnOrder,
      });

      bsToastSuccess(`Column "${columnName}" added`);

      appState.currentPage = 1;
      appState.selectedColumn = null;
      appState.totalRowCount = null;

      await getTableHeaders(appState);
      await fetchTableData(appState);

      modal.hide();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/**
 * Initialize the Format Column button and its modal.
 *
 * Clicking `#formatColumnBtn` checks that a column is selected (toast warning if not),
 * then opens `#formatColumnModal` pre-populated from `appState.columnFormats`.
 * Conditional sections for REAL and LOV are shown/hidden based on the Column Type select.
 * On OK the format is saved via `/tables/set-format` and written back to `appState.columnFormats`.
 *
 * @param {Object} appState - Application state.
 */
function initFormatColumnBtn(appState) {
  const formatBtn = document.getElementById('formatColumnBtn');
  const modalEl = document.getElementById('formatColumnModal');
  const titleName = document.getElementById('formatColumnTitleName');
  const columnTypeSelect = document.getElementById('formatColumnType');
  const aggregationOptions = document.getElementById('formatAggregationOptions');
  const aggregationSelect = document.getElementById('formatAggregation');
  const realOptions = document.getElementById('formatRealOptions');
  const lovOptions = document.getElementById('formatLovOptions');
  const prefixInput = document.getElementById('formatRealPrefix');
  const separatorSelect = document.getElementById('formatRealSeparator');
  const decimalsInput = document.getElementById('formatRealDecimals');
  const lovTextarea = document.getElementById('formatLovValues');
  const submitBtn = document.getElementById('submitFormatColumnBtn');
  const modal = new window.bootstrap.Modal(modalEl);

  function toggleSections() {
    const type = columnTypeSelect.value;
    const isNumeric = type === 'REAL' || type === 'INTEGER';
    aggregationOptions.classList.toggle('d-none', !isNumeric);
    realOptions.classList.toggle('d-none', type !== 'REAL');
    lovOptions.classList.toggle('d-none', type !== 'LOV');
  }

  columnTypeSelect.addEventListener('change', toggleSections);

  formatBtn.addEventListener('click', () => {
    if (!appState.selectedColumn) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colName = appState.selectedColumn;
    titleName.textContent = `${colName}`;

    // Load existing format, or derive default type from the SQL data type
    const fmt = appState.columnFormats?.[colName] ?? {};
    const colMeta = appState.columnNames.find(([name]) => name === colName);
    const defaultType = colMeta ? defaultFormatType(colMeta[1]) : 'TEXT';
    columnTypeSelect.value = fmt.column_type ?? defaultType;
    aggregationSelect.value = fmt.aggregation ?? '';
    prefixInput.value = fmt.prefix ?? '';
    separatorSelect.value = fmt.thousand_separator ?? 'YES';
    decimalsInput.value = fmt.decimal_places ?? 2;
    lovTextarea.value = (fmt.lov_options ?? []).join('\n');

    toggleSections();
    modal.show();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    titleName.textContent = '';
  });

  submitBtn.addEventListener('click', async () => {
    const colName = appState.selectedColumn;
    if (!colName) return;

    const columnType = columnTypeSelect.value;
    const format = {};

    if (columnType === 'REAL' || columnType === 'INTEGER') {
      const agg = aggregationSelect.value;
      if (agg) format.aggregation = agg;
    }

    if (columnType === 'REAL') {
      format.prefix = prefixInput.value.trim();
      format.thousand_separator = separatorSelect.value;
      format.decimal_places = parseInt(decimalsInput.value, 10) || 0;
    }

    if (columnType === 'LOV') {
      format.lov_options = lovTextarea.value
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
    }

    submitBtn.disabled = true;
    try {
      await api.post('/tables/set-column-formatting', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: colName,
        column_type: columnType,
        format,
      });

      format.column_type = columnType;
      if (!appState.columnFormats) appState.columnFormats = {};
      appState.columnFormats[colName] = format;

      // Apply formatting to visible cells without re-rendering the table
      const colIndex = appState.columnNames.findIndex(([name]) => name === colName);
      if (colIndex !== -1) {
        const [, dataType] = appState.columnNames[colIndex];
        const tbody = document.getElementById('sclTableBody');
        for (const row of tbody.rows) {
          const td = row.cells[colIndex + 1]; // +1 for leading checkbox column
          if (!td) continue;
          // Skip cells that were originally null (empty title + empty text)
          if (td.title === '' && td.textContent === '') continue;
          const { text, align } = formatCellValue(td.title, dataType, format);
          td.textContent = text;
          td.style.textAlign = align || '';
        }
      }

      bsToastSuccess(`Format updated for "${colName}"`);
      modal.hide();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/**
 * Initialize the Increase / Decrease Decimal toolbar buttons.
 *
 * Each click adjusts `decimal_places` by ±1 for the selected column (must
 * resolve to a REAL format type), persists the change to the server, and
 * re-formats visible cells in-place without a full table re-render.
 *
 * @param {Object} appState - Application state.
 */
function initDecimalBtns(appState) {
  const increaseBtn = document.getElementById('increaseDecimalBtn');
  const decreaseBtn = document.getElementById('decreaseDecimalBtn');

  async function adjustDecimals(delta) {
    const colName = appState.selectedColumn;
    if (!colName) {
      bsToastWarning('Please select a column first');
      return;
    }

    const colMeta = appState.columnNames.find(([name]) => name === colName);
    const fmt = appState.columnFormats?.[colName];
    const columnType = fmt?.column_type ?? (colMeta ? defaultFormatType(colMeta[1]) : 'TEXT');

    if (columnType !== 'REAL') {
      bsToastWarning('Decimal formatting is only available for numeric columns');
      return;
    }

    const currentDecimals = fmt?.decimal_places ?? 2;
    const newDecimals = Math.max(0, currentDecimals + delta);
    if (newDecimals === currentDecimals) return;

    const format = {
      prefix: fmt?.prefix ?? '',
      thousand_separator: fmt?.thousand_separator ?? 'YES',
      decimal_places: newDecimals,
    };
    if (fmt?.aggregation) format.aggregation = fmt.aggregation;

    increaseBtn.disabled = true;
    decreaseBtn.disabled = true;
    try {
      await api.post('/tables/set-column-formatting', {
        table_name: appState.tableName,
        project_name: appState.projectName,
        model_name: appState.modelName,
        column_name: colName,
        column_type: columnType,
        format,
      });

      format.column_type = columnType;
      if (!appState.columnFormats) appState.columnFormats = {};
      appState.columnFormats[colName] = format;

      // Apply formatting to visible cells without re-rendering
      const colIndex = appState.columnNames.findIndex(([name]) => name === colName);
      if (colIndex !== -1) {
        const [, dataType] = appState.columnNames[colIndex];
        const tbody = document.getElementById('sclTableBody');
        for (const row of tbody.rows) {
          const td = row.cells[colIndex + 1]; // +1 for leading checkbox column
          if (!td) continue;
          if (td.title === '' && td.textContent === '') continue;
          const { text, align } = formatCellValue(td.title, dataType, format);
          td.textContent = text;
          td.style.textAlign = align || '';
        }
      }
    } catch {
      bsToastWarning('Failed to update decimal formatting');
    } finally {
      increaseBtn.disabled = false;
      decreaseBtn.disabled = false;
    }
  }

  increaseBtn.addEventListener('click', () => adjustDecimals(1));
  decreaseBtn.addEventListener('click', () => adjustDecimals(-1));
}

/**
 * Initialize all table toolbar controls and pagination.
 *
 * Wires up the refresh button, pagination controls, Select Columns modal,
 * Remove Column button, Add Column button, and Format Column button.
 *
 * @param {Object} appState - Application state.
 */
function initTableControls(appState) {
  initRefreshDataBtn(appState);
  initPaginationControls(appState);
  initSelectColumnsModal(appState);
  initRemoveColumnBtn(appState);
  initAddColumnBtn(appState);
  initFormatColumnBtn(appState);
  initDecimalBtns(appState);
}

/**
 * Fetch saved column formats from the server and store them in `appState.columnFormats`.
 *
 * @param {Object} appState - Application state; reads `tableName`, `projectName`, `modelName`.
 *   Sets `columnFormats` to the returned format map (keyed by column name).
 */
async function fetchColumnFormats(appState) {
  try {
    const { column_formatting } = await api.post('/tables/get-column-formatting', {
      table_name: appState.tableName,
      project_name: appState.projectName,
      model_name: appState.modelName,
    });
    appState.columnFormats = column_formatting ?? {};
  } catch {
    appState.columnFormats = {};
  }
}

export { getTableHeaders, fetchTableData, fetchColumnFormats, initTableControls, selectColumn };
