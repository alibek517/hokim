// IJRO Mayor (Hokim) Module
let mayorCurrentTab = 0; // 0: Topshiriqlar (Default), 1: Rejalar, 2: Ishchilar, 3: Chatlar
let taskFilterIndex = 0; // 0: Barchasi, 1: Boshlanmagan, 2: Jarayonda, 3: Bajarildi, 4: Tekshirildi

function initMayorView() {
  const mayor = window.store.currentUser;
  if (!mayor) return;

  const headerName = document.getElementById('mayor-header-name');
  const headerRegion = document.getElementById('mayor-header-region');
  if (headerName) headerName.innerText = mayor.fullName || (mayor.firstName + ' ' + mayor.lastName);
  if (headerRegion) headerRegion.innerText = mayor.regionOrDistrict || 'Tuman Hokimi';

  // Set default tab to 0 (Topshiriqlar)
  switchMayorTab(0);
}

function switchMayorTab(tabIndex) {
  mayorCurrentTab = tabIndex;
  
  const navBtns = document.querySelectorAll('#mayor-bottom-nav .nav-item');
  navBtns.forEach((btn, idx) => {
    if (idx === tabIndex) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const fab = document.getElementById('mayor-fab');

  if (tabIndex === 0) {
    if (fab) { fab.style.display = 'flex'; fab.onclick = openCreateTaskModal; }
    renderMayorTasks();
  } else if (tabIndex === 1) {
    if (fab) { fab.style.display = 'flex'; fab.onclick = openCreateScheduleModal; }
    renderMayorSchedules();
  } else if (tabIndex === 2) {
    if (fab) { fab.style.display = 'flex'; fab.onclick = openCreateWorkerModal; }
    renderMayorWorkers();
  } else if (tabIndex === 3) {
    if (fab) fab.style.display = 'none';
    renderMayorChats();
  }
}

// 1. Topshiriqlar (Tasks) Tab - Default & Urgency Sorted
function renderMayorTasks() {
  const container = document.getElementById('mayor-tab-content');
  const mayor = window.store.currentUser;
  if (!container || !mayor) return;

  const now = Date.now();
  let tasks = window.store.tasks.filter(t => t.mayorId === mayor.id);

  if (taskFilterIndex === 1) tasks = tasks.filter(t => t.status === 'PENDING_RED');
  else if (taskFilterIndex === 2) tasks = tasks.filter(t => t.status === 'IN_PROGRESS_YELLOW');
  else if (taskFilterIndex === 3) tasks = tasks.filter(t => t.status === 'COMPLETED_GREEN');
  else if (taskFilterIndex === 4) tasks = tasks.filter(t => t.status === 'INSPECTED_BLUE');

  // URRENCY SORTING:
  // Active tasks (Red and Yellow) first, completed later.
  // Within active tasks, sorted by endDate ascending (least time remaining / overdue at the top)!
  tasks.sort((a, b) => {
    const isDoneA = (a.status === 'COMPLETED_GREEN' || a.status === 'INSPECTED_BLUE') ? 1 : 0;
    const isDoneB = (b.status === 'COMPLETED_GREEN' || b.status === 'INSPECTED_BLUE') ? 1 : 0;
    if (isDoneA !== isDoneB) return isDoneA - isDoneB;
    return (a.endDate || 0) - (b.endDate || 0);
  });

  const filterTabsHtml = `
    <div class="filter-tabs-wrapper">
      <span class="filter-tab ${taskFilterIndex === 0 ? 'active' : ''}" onclick="setTaskFilter(0)">Barchasi</span>
      <span class="filter-tab ${taskFilterIndex === 1 ? 'active' : ''}" onclick="setTaskFilter(1)">Boshlanmagan (🔴)</span>
      <span class="filter-tab ${taskFilterIndex === 2 ? 'active' : ''}" onclick="setTaskFilter(2)">Jarayonda (🟡)</span>
      <span class="filter-tab ${taskFilterIndex === 3 ? 'active' : ''}" onclick="setTaskFilter(3)">Bajarildi (🟢)</span>
      <span class="filter-tab ${taskFilterIndex === 4 ? 'active' : ''}" onclick="setTaskFilter(4)">Tekshirildi (🔵)</span>
    </div>
  `;

  if (tasks.length === 0) {
    container.innerHTML = filterTabsHtml + `
      <div class="main-content" style="align-items: center; justify-content: center; color: #94A3B8;">
        Topshiriqlar mavjud emas. Yangi topshiriq qo'shish uchun (+) tugmasini bosing.
      </div>
    `;
    return;
  }

  let cardsHtml = '';
  tasks.forEach(task => {
    const diff = (task.endDate || 0) - now;
    const isDone = task.status === 'COMPLETED_GREEN' || task.status === 'INSPECTED_BLUE';
    
    let badgeClass = 'badge-red';
    let badgeText = 'Boshlanmagan';
    if (task.status === 'IN_PROGRESS_YELLOW') { badgeClass = 'badge-yellow'; badgeText = 'Jarayonda'; }
    else if (task.status === 'COMPLETED_GREEN') { badgeClass = 'badge-green'; badgeText = 'Bajarildi'; }
    else if (task.status === 'INSPECTED_BLUE') { badgeClass = 'badge-blue'; badgeText = 'Tekshirildi'; }

    let remainingHtml = '';
    if (!isDone) {
      if (diff <= 0) {
        remainingHtml = `<div class="time-remaining" style="color: var(--status-red);">⚠️ Muddat o'tgan!</div>`;
      } else {
        const totalHours = Math.floor(diff / (1000 * 60 * 60));
        const totalMinutes = Math.floor((diff / (1000 * 60)) % 60);
        const days = Math.floor(totalHours / 24);
        const remHours = totalHours % 24;

        let timeStr = '';
        if (days > 0) timeStr = `${days} kun ${remHours} soat qoldi`;
        else if (remHours > 0) timeStr = `${remHours} soat ${totalMinutes} daq qoldi`;
        else timeStr = `${totalMinutes} daqiqa qoldi`;

        const color = diff < 12 * 3600 * 1000 ? 'var(--status-yellow)' : 'var(--primary-blue)';
        remainingHtml = `<div class="time-remaining" style="color: ${color};">⏳ ${timeStr}</div>`;
      }
    }

    const dateFormatted = new Date(task.endDate || Date.now()).toLocaleString([], {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Worker Completion Note
    let completionNoteHtml = '';
    if (task.completionNotes) {
      completionNoteHtml = `
        <div class="task-completion-note">
          <span class="note-label">📝 Xodim hisoboti / izohi:</span>
          <div>${escapeHtml(task.completionNotes)}</div>
        </div>
      `;
    }

    // Inspect button for Hokim
    let actionBtnHtml = '';
    if (task.status === 'COMPLETED_GREEN') {
      actionBtnHtml = `
        <button class="btn btn-blue" onclick="inspectTask('${task.id}')" style="margin-top: 4px;">
          ✓ Borib Tekshirdim (Tasdiqlash)
        </button>
      `;
    }

    cardsHtml += `
      <div class="task-card">
        <div class="task-header">
          <span class="badge ${badgeClass}">${badgeText}</span>
          <div class="task-deadline-box">
            <div class="task-date">Muddat: ${dateFormatted}</div>
            ${remainingHtml}
          </div>
        </div>
        <div class="task-title">${escapeHtml(task.title || '')}</div>
        <div class="task-address">📍 ${escapeHtml(task.address || '')}</div>
        <div class="task-desc">${escapeHtml(task.description || '')}</div>
        <div class="task-worker-box">
          👤 <strong>Mas'ul:</strong> ${escapeHtml(task.assignedWorkerName || 'Biriktirilmagan')}
        </div>
        ${completionNoteHtml}
        ${actionBtnHtml}
      </div>
    `;
  });

  container.innerHTML = filterTabsHtml + `<div class="main-content">${cardsHtml}</div>`;
}

function setTaskFilter(idx) {
  taskFilterIndex = idx;
  renderMayorTasks();
}

async function inspectTask(taskId) {
  await window.dbApi.updateTaskStatus(taskId, 'INSPECTED_BLUE');
  showToast("Topshiriq tekshirildi va tasdiqlandi!");
}

// 2. Rejalar (Schedules) Tab
function renderMayorSchedules() {
  const container = document.getElementById('mayor-tab-content');
  const mayor = window.store.currentUser;
  if (!container || !mayor) return;

  const schedules = window.store.schedules.filter(s => s.mayorId === mayor.id)
    .sort((a, b) => (a.scheduledTime || 0) - (b.scheduledTime || 0));

  if (schedules.length === 0) {
    container.innerHTML = `
      <div class="main-content" style="align-items: center; justify-content: center; color: #94A3B8;">
        Hozircha rejalar kiritilmagan. Yangi reja qo'shish uchun (+) tugmasini bosing.
      </div>
    `;
    return;
  }

  let html = '<div class="main-content">';
  schedules.forEach(s => {
    const timeFormatted = new Date(s.scheduledTime || Date.now()).toLocaleString([], {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    html += `
      <div class="task-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="badge badge-blue">🗓️ Reja</span>
          <span style="font-size: 11px; font-weight: bold; color: var(--primary-blue);">${timeFormatted}</span>
        </div>
        <div class="task-title" style="font-size: 15px;">${escapeHtml(s.title || '')}</div>
        <div class="task-address">📍 ${escapeHtml(s.location || '')}</div>
        ${s.notes ? `<div class="task-desc">${escapeHtml(s.notes)}</div>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// 3. Ishchilar (Workers) Tab
function renderMayorWorkers() {
  const container = document.getElementById('mayor-tab-content');
  const mayor = window.store.currentUser;
  if (!container || !mayor) return;

  const workers = window.store.users.filter(u => u.role === 'WORKER' && u.mayorId === mayor.id);

  if (workers.length === 0) {
    container.innerHTML = `
      <div class="main-content" style="align-items: center; justify-content: center; color: #94A3B8;">
        Xodimlar topilmadi. Yangi xodim qo'shish uchun (+) tugmasini bosing.
      </div>
    `;
    return;
  }

  let html = '<div class="main-content">';
  workers.forEach(w => {
    html += `
      <div class="task-card" style="flex-direction: row; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="user-avatar" style="width: 44px; height: 44px; font-size: 15px;">
            ${(w.firstName || 'X')[0]}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 15px; color: var(--navy-dark);">${escapeHtml(w.fullName || (w.firstName + ' ' + w.lastName))}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(w.position || 'Xodim')}</div>
            <div style="font-size: 11px; color: #94A3B8;">📞 ${escapeHtml(w.phone || w.username)}</div>
          </div>
        </div>
        <button class="btn btn-primary" style="width: auto; padding: 8px 14px; font-size: 12px;" onclick="openChatFromWorkerId('${w.id}')">
          💬 Chat
        </button>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// 4. Chatlar (Chats) Tab
function renderMayorChats() {
  const container = document.getElementById('mayor-tab-content');
  const mayor = window.store.currentUser;
  if (!container || !mayor) return;

  const peers = window.store.users.filter(u => u.id !== mayor.id);

  let html = '<div class="main-content">';
  peers.forEach(peer => {
    const peerMessages = window.store.messages.filter(m => 
      (m.senderId === mayor.id && m.receiverId === peer.id) ||
      (m.senderId === peer.id && m.receiverId === mayor.id)
    ).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));

    const lastMsg = peerMessages[peerMessages.length - 1];
    const unreadCount = peerMessages.filter(m => m.receiverId === mayor.id && !m.isRead && !m.read).length;

    let preview = "Xabarlar yo'q";
    let timeStr = "";
    if (lastMsg) {
      preview = lastMsg.textContent || (lastMsg.messageType === 'VOICE' ? '🎤 Ovozli xabar' : (lastMsg.messageType === 'IMAGE' ? '🖼️ Rasm' : '🎥 Video'));
      timeStr = new Date(lastMsg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    html += `
      <div class="task-card" style="flex-direction: row; align-items: center; cursor: pointer; gap: 12px;" onclick="openChatFromWorkerId('${peer.id}')">
        <div class="user-avatar" style="width: 46px; height: 46px;">${(peer.firstName || peer.fullName || 'U')[0]}</div>
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 14px; color: var(--navy-dark);">${escapeHtml(peer.fullName || (peer.firstName + ' ' + peer.lastName))}</div>
            <div style="font-size: 10px; color: #94A3B8;">${timeStr}</div>
          </div>
          <div style="font-size: 12px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
            ${escapeHtml(preview)}
          </div>
        </div>
        ${unreadCount > 0 ? `<span class="badge badge-red" style="border-radius: 12px; font-size: 11px;">${unreadCount}</span>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

function openChatFromWorkerId(workerId) {
  const peer = window.store.users.find(u => u.id === workerId);
  if (peer) openChat(peer);
}

// Modal Handlers
function openCreateTaskModal() {
  const mayor = window.store.currentUser;
  const workers = window.store.users.filter(u => u.role === 'WORKER' && u.mayorId === mayor.id);

  if (workers.length === 0) {
    alert("Avval 'Ishchilar' bo'limidan xodim qo'shing!");
    return;
  }

  const select = document.getElementById('new-task-worker');
  if (select) {
    select.innerHTML = workers.map(w => `<option value="${w.id}">${escapeHtml(w.fullName || (w.firstName + ' ' + w.lastName))}</option>`).join('');
  }

  const now = new Date();
  const later = new Date(now.getTime() + 48 * 3600 * 1000);
  const startInput = document.getElementById('new-task-start');
  const endInput = document.getElementById('new-task-end');
  if (startInput) startInput.value = now.toISOString().slice(0, 16);
  if (endInput) endInput.value = later.toISOString().slice(0, 16);

  document.getElementById('create-task-modal').classList.add('active');
}

async function saveNewTask() {
  const mayor = window.store.currentUser;
  const title = document.getElementById('new-task-title').value.trim();
  const address = document.getElementById('new-task-address').value.trim();
  const desc = document.getElementById('new-task-desc').value.trim();
  const workerId = document.getElementById('new-task-worker').value;
  const startDate = new Date(document.getElementById('new-task-start').value).getTime();
  const endDate = new Date(document.getElementById('new-task-end').value).getTime();

  if (!title || !address) {
    alert("Iltimos, vazifa nomi va manzilini kiriting!");
    return;
  }

  const worker = window.store.users.find(u => u.id === workerId);
  const workerName = worker ? (worker.fullName || (worker.firstName + ' ' + worker.lastName)) : '';

  const task = {
    id: 'task_' + Date.now(),
    title,
    description: desc,
    address,
    mayorId: mayor.id,
    assignedWorkerId: workerId,
    assignedWorkerName: workerName,
    startDate,
    endDate,
    status: 'PENDING_RED',
    createdAt: Date.now()
  };

  await window.dbApi.createTask(task);
  closeModal('create-task-modal');
  showToast("Yangi topshiriq biriktirildi!");
}

function openCreateScheduleModal() {
  const now = new Date();
  const timeInput = document.getElementById('new-schedule-time');
  if (timeInput) timeInput.value = now.toISOString().slice(0, 16);
  document.getElementById('create-schedule-modal').classList.add('active');
}

async function saveNewSchedule() {
  const mayor = window.store.currentUser;
  const title = document.getElementById('new-schedule-title').value.trim();
  const location = document.getElementById('new-schedule-loc').value.trim();
  const notes = document.getElementById('new-schedule-notes').value.trim();
  const scheduledTime = new Date(document.getElementById('new-schedule-time').value).getTime();

  if (!title || !location) {
    alert("Iltimos, reja nomi va manzilini kiriting!");
    return;
  }

  const schedule = {
    id: 'sched_' + Date.now(),
    mayorId: mayor.id,
    title,
    location,
    notes,
    scheduledTime
  };

  await window.dbApi.addSchedule(schedule);
  closeModal('create-schedule-modal');
  showToast("Yangi reja saqlandi!");
}

function openCreateWorkerModal() {
  document.getElementById('create-worker-modal').classList.add('active');
}

async function saveNewWorker() {
  const mayor = window.store.currentUser;
  const fullName = document.getElementById('new-worker-name').value.trim();
  const username = document.getElementById('new-worker-user').value.trim();
  const pass = document.getElementById('new-worker-pass').value.trim();
  const phone = document.getElementById('new-worker-phone').value.trim();
  const position = document.getElementById('new-worker-pos').value.trim();

  if (!fullName || !username || !pass) {
    alert("Ism, login va parolni kiriting!");
    return;
  }

  const parts = fullName.split(' ');
  const user = {
    id: 'worker_' + Date.now(),
    username,
    password: pass,
    role: 'WORKER',
    fullName,
    firstName: parts[0] || fullName,
    lastName: parts.slice(1).join(' ') || '',
    phone,
    position,
    mayorId: mayor.id
  };

  await window.dbApi.addUser(user);
  closeModal('create-worker-modal');
  showToast("Yangi xodim biriktirildi!");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// Auto update on store change
window.onStoreChange('tasks', () => {
  if (mayorCurrentTab === 0) renderMayorTasks();
});
window.onStoreChange('schedules', () => {
  if (mayorCurrentTab === 1) renderMayorSchedules();
});
window.onStoreChange('users', () => {
  if (mayorCurrentTab === 2) renderMayorWorkers();
});
