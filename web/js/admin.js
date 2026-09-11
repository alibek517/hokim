// IJRO Big Admin Module
function initAdminView() {
  renderAdminStats();
}

function renderAdminStats() {
  const mayors = window.store.users.filter(u => u.role === 'MAYOR');
  const workers = window.store.users.filter(u => u.role === 'WORKER');
  const tasks = window.store.tasks;

  const container = document.getElementById('admin-content');
  if (!container) return;

  container.innerHTML = `
    <div class="task-card">
      <div class="task-title" style="font-size: 16px;">Tizim Umumiy Ko'rsatkichlari</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
        <div style="background: #F1F5F9; padding: 12px; border-radius: 8px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: var(--primary-blue);">${mayors.length}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">Hokimlar</div>
        </div>
        <div style="background: #F1F5F9; padding: 12px; border-radius: 8px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: var(--status-yellow);">${workers.length}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">Mas'ul Xodimlar</div>
        </div>
        <div style="background: #F1F5F9; padding: 12px; border-radius: 8px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: var(--navy-dark);">${tasks.length}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">Barcha Topshiriqlar</div>
        </div>
        <div style="background: #F1F5F9; padding: 12px; border-radius: 8px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: var(--status-green);">${tasks.filter(t => t.status === 'COMPLETED_GREEN' || t.status === 'INSPECTED_BLUE').length}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">Bajarilganlar</div>
        </div>
      </div>
    </div>

    <div style="font-weight: bold; font-size: 15px; margin: 12px 0 6px 0; color: var(--navy-dark);">Hokimlar va Xodimlar Ro'yxati</div>
    ${window.store.users.map(u => `
      <div class="task-card" style="flex-direction: row; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="user-avatar" style="width: 40px; height: 40px; font-size: 14px;">${(u.firstName || u.fullName || 'U')[0]}</div>
          <div>
            <div style="font-weight: bold; font-size: 14px;">${escapeHtml(u.fullName || (u.firstName + ' ' + u.lastName))}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">${u.role === 'MAYOR' ? 'Tuman Hokimi' : (u.position || 'Xodim')} • @${escapeHtml(u.username)}</div>
          </div>
        </div>
        <span class="badge ${u.role === 'MAYOR' ? 'badge-blue' : 'badge-yellow'}">${u.role}</span>
      </div>
    `).join('')}
  `;
}
