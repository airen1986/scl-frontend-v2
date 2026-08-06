import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';

const users = {
  'Priya Sharma': {
    email: 'priya.sharma@summence.com',
    firstName: 'Priya',
    initials: 'PS',
    role: 'Admin',
    status: 'Active',
    worksheetAccess: true,
    expiry: '2026-12-31',
    constraints: 'Full access to models, roles, templates, and admin modules.',
  },
  'Marcus Chen': {
    email: 'marcus.chen@summence.com',
    firstName: 'Marcus',
    initials: 'MC',
    role: 'Planner',
    status: 'Active',
    worksheetAccess: true,
    expiry: '2026-10-31',
    constraints: 'Limited to North America projects and assigned planning templates.',
  },
  'Nadia Patel': {
    email: 'nadia.patel@summence.com',
    firstName: 'Nadia',
    initials: 'NP',
    role: 'Analyst',
    status: 'Pending',
    worksheetAccess: false,
    expiry: '2026-09-30',
    constraints: 'Read-only until manager approval is complete.',
  },
  'Owen Walker': {
    email: 'owen.walker@summence.com',
    firstName: 'Owen',
    initials: 'OW',
    role: 'Viewer',
    status: 'Inactive',
    worksheetAccess: false,
    expiry: '2026-08-15',
    constraints: 'Account disabled after 30 days idle. Read-only access retained for audit.',
  },
};

function setSelectValue(select, value) {
  if (!select) return;
  const option = Array.from(select.options).find(
    (item) => item.value === value || item.text === value
  );
  if (option) {
    select.value = option.value;
  }
}

function selectUser(row) {
  const userName = row.dataset.userName;
  const user = users[userName];
  if (!user) return;

  document
    .querySelectorAll('.user-row')
    .forEach((item) => item.classList.remove('active', 'table-active'));
  row.classList.add('active');

  const selectedUserName = document.getElementById('selectedUserName');
  const selectedUserEmail = document.getElementById('selectedUserEmail');
  const selectedFirstName = document.getElementById('selectedFirstName');
  const selectedUserStatus = document.getElementById('selectedUserStatus');
  const worksheetAccess = document.getElementById('worksheetAccess');
  const avatar = document.querySelector('.avatar-initials');
  const constraints = document.getElementById('accessConstraints');
  const expiry = document.getElementById('accessExpiry');

  if (selectedUserName) selectedUserName.textContent = userName;
  if (selectedUserEmail) selectedUserEmail.value = user.email;
  if (selectedFirstName) selectedFirstName.value = user.firstName;
  if (selectedUserStatus) {
    selectedUserStatus.checked = user.status === 'Active';
    const statusLabel = document.querySelector('label[for="selectedUserStatus"]');
    if (statusLabel) statusLabel.textContent = user.status;
  }
  if (worksheetAccess) {
    worksheetAccess.checked = user.worksheetAccess;
    const worksheetLabel = document.querySelector('label[for="worksheetAccess"]');
    if (worksheetLabel)
      worksheetLabel.textContent = user.worksheetAccess ? 'Read & Write' : 'Read Only';
  }
  if (avatar) avatar.textContent = user.initials;
  if (constraints) constraints.value = user.constraints;
  if (expiry) expiry.value = user.expiry;

  setSelectValue(document.getElementById('selectedUserRole'), user.role);
}

document.querySelectorAll('.user-row').forEach((row) => {
  row.addEventListener('click', () => selectUser(row));
});

document.querySelectorAll('#roleList .list-group-item').forEach((roleButton) => {
  roleButton.addEventListener('click', () => {
    document
      .querySelectorAll('#roleList .list-group-item')
      .forEach((item) => item.classList.remove('active'));
    roleButton.classList.add('active');

    const roleName = roleButton.querySelector('.fw-semibold')?.textContent?.trim();
    const roleNameInput = document.getElementById('roleName');
    if (roleName && roleNameInput) {
      roleNameInput.value = roleName;
    }
  });
});
