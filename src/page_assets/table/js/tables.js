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
      th.style.overflow = 'hidden';
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

      div.append(input, btn);
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

      fetchTableData(appState);
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
}

/**
 * Wire the page's refresh button to reset table filters, clear related UI controls, and reload table rows.
 *
 * Resets appState.textFilters and appState.selectFilters to empty objects, clears the header row text inputs, resets the select-all checkbox state, and triggers a table data refresh.
 * @param {Object} appState - Application state for the table. The function mutates `textFilters` and `selectFilters` and relies on other fields (e.g., pagination, table identifiers) used by the data fetch.
 */
function initRefreshDataBtn(appState) {
  document.getElementById('refreshDataBtn').addEventListener('click', () => {
    appState.textFilters = {};
    appState.selectFilters = {};

    const head1 = document.getElementById('sclTableHead1');
    const selectAllCb = head1.querySelector('input[type="checkbox"]');
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;

    // Clear filter inputs in head2
    const head2 = document.getElementById('sclTableHead2');
    for (const input of head2.querySelectorAll('input[type="text"]')) {
      input.value = '';
    }

    // Clear select filters in head2 (if implemented as dropdowns in the future)

    fetchTableData(appState);
  });
}

export { getTableHeaders, fetchTableData, initRefreshDataBtn };
