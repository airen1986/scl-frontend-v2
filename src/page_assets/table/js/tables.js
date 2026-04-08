import api from '@/common/js/api';

async function getTableHeaders(appState) {
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
    th.style.minWidth = '100px';
    th.innerHTML =
      `<div class="d-flex justify-content-between align-items-center">` +
      `<span>${colName}</span>` +
      `<i class="fa-solid fa-sort"></i>` +
      `</div>`;
    head1.appendChild(th);
  }

  // Populate head2: empty checkbox column + one filter <th> per column
  const head2 = document.getElementById('sclTableHead2');
  head2.innerHTML = '<th></th>';
  for (const [colName] of headers) {
    const th = document.createElement('th');
    th.style.minWidth = '80px';
    th.style.overflow = 'hidden';
    th.innerHTML =
      `<div class="input-group input-group-sm my-1" style="flex-wrap: nowrap;">` +
      `<input type="text" class="form-control" data-col="${colName}" style="min-width: 0;" />` +
      `<button type="button" class="input-group-text px-1">` +
      `<i class="fa-solid fa-chevron-down"></i>` +
      `</button>` +
      `</div>`;
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

  // Clear body
  document.getElementById('sclTableBody').innerHTML = '';
}

async function fetchTableData(appState) {
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
    checkTd.innerHTML = `<input type="checkbox" class="form-check-input" value="${rowid}" />`;
    tr.appendChild(checkTd);

    // Data cells
    for (const val of values) {
      const td = document.createElement('td');
      td.textContent = val ?? '';
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

function initRefreshDataBtn(appState) {
  document.getElementById('refreshDataBtn').addEventListener('click', () => {
    appState.textFilters = {};
    appState.selectFilters = {};

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
