// IJRO Worker (Xodim) Module
let completingTaskId = null;

function initWorkerView() {
  const worker = window.store.currentUser;
  if (!worker) return;

  const headerName = document.getElementById('worker-header-name');
  const headerPos = document.getElementById('worker-header-pos');
  if (headerName) headerName.innerText = worker.fullName || (worker.firstName + ' ' + worker.lastName);
  if (headerPos) headerPos.innerText = worker.position || 'Xodim';

  renderWorkerTasks();
}

function renderWorkerTasks() {
  const container = document.getElementById('worker-tasks-list');
  const worker = window.store.currentUser;
  if (!container || !worker) return;

  const now = Date.now();
  let myTasks = window.store.tasks.filter(t => t.assignedWorkerId === worker.id);

  // Urgent sorting: Active first, then by endDate ascending (least time remaining at top)
  myTasks.sort((a, b) => {
    const isDoneA = (a.status === 'COMPLETED_GREEN' || a.status === 'INSPECTED_BLUE') ? 1 : 0;
    const isDoneB = (b.status === 'COMPLETED_GREEN' || b.status === 'INSPECTED_BLUE') ? 1 : 0;
    if (isDoneA !== isDoneB) return isDoneA - isDoneB;
    return (a.endDate || 0) - (b.endDate || 0);
  });

  // Summary stats
  const pendingCount = myTasks.filter(t => t.status === 'PENDING_RED').length;
  const inProgressCount = myTasks.filter(t => t.status === 'IN_PROGRESS_YELLOW').length;
  const completedCount = myTasks.filter(t => t.status === 'COMPLETED_GREEN' || t.status === 'INSPECTED_BLUE').length;

  const statsBox = document.getElementById('worker-stats-box');
  if (statsBox) {
    statsBox.innerHTML = `
      <div style="flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: var(--status-red);">${pendingCount}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Boshlanmagan</div>
      </div>
      <div style="flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: var(--status-yellow);">${inProgressCount}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Jarayonda</div>
      </div>
      <div style="flex: 1; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: var(--status-green);">${completedCount}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Bajarildi</div>
      </div>
    `;
  }

  if (myTasks.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #94A3B8; margin-top: 40px; font-size: 14px;">
        Sizga biriktirilgan topshiriqlar yo'q.
      </div>
    `;
    return;
  }

  let html = '';
  myTasks.forEach(task => {
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

    // Action button based on state
    let actionBtnHtml = '';
    if (task.status === 'PENDING_RED') {
      actionBtnHtml = `
        <button class="btn btn-yellow" onclick="workerStartTask('${task.id}')">
          ▶ Ishni Boshladim (Sariq holatga o'tish)
        </button>
      `;
    } else if (task.status === 'IN_PROGRESS_YELLOW') {
      actionBtnHtml = `
        <button class="btn btn-green" onclick="openWorkerCompleteModal('${task.id}')">
          ✓ Ishni Tugatdim (Yashil holatga o'tish)
        </button>
      `;
    } else if (task.status === 'COMPLETED_GREEN') {
      actionBtnHtml = `
        <div style="background: var(--status-green-bg); color: var(--status-green); padding: 8px 12px; border-radius: 8px; font-weight: bold; font-size: 12px; text-align: center;">
          🟢 Ish tugatildi! Hokim tekshiruvi kutilmoqda.
        </div>
      `;
    } else if (task.status === 'INSPECTED_BLUE') {
      actionBtnHtml = `
        <div style="background: var(--status-blue-bg); color: var(--status-blue); padding: 8px 12px; border-radius: 8px; font-weight: bold; font-size: 12px; text-align: center;">
          🔵 Hokim joyiga borib tekshirdi va tasdiqladi!
        </div>
      `;
    }

    // Worker Completion Note
    let completionNoteHtml = '';
    if (task.completionNotes) {
      completionNoteHtml = `
        <div class="task-completion-note">
          <span class="note-label">Siz qoldirgan izoh:</span>
          <div>${escapeHtml(task.completionNotes)}</div>
        </div>
      `;
    }

    html += `
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
        ${completionNoteHtml}
        ${actionBtnHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

// Start task
async function workerStartTask(taskId) {
  await window.dbApi.updateTaskStatus(taskId, 'IN_PROGRESS_YELLOW');
  showToast("Ish boshlandi! Holat Sariq rangga o'tdi.");
}

// Complete task modal
function openWorkerCompleteModal(taskId) {
  completingTaskId = taskId;
  const task = window.store.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('complete-task-title').innerText = task.title || '';
  document.getElementById('complete-task-addr').innerText = 'Manzil: ' + (task.address || '');
  document.getElementById('complete-task-note').value = '';

  document.getElementById('worker-complete-modal').classList.add('active');
}

async function confirmWorkerComplete() {
  if (!completingTaskId) return;
  const worker = window.store.currentUser;
  const task = window.store.tasks.find(t => t.id === completingTaskId);
  const notes = document.getElementById('complete-task-note').value.trim();

  await window.dbApi.updateTaskStatus(completingTaskId, 'COMPLETED_GREEN', notes || null);

  // Send automatic chat message to Mayor with completion report!
  const mayor = window.store.users.find(u => u.id === (task ? task.mayorId : (worker.mayorId || '')));
  if (mayor) {
    const reportText = notes ? 
      `Hurmatli Hokim! '${task.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi.\n\n📝 Xodim izohi: ${notes}\n📍 Manzil: ${task.address}` :
      `Hurmatli Hokim! '${task.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi va topshirishga tayyor. (Manzil: ${task.address})`;

    const chatMsg = {
      id: 'msg_rep_' + Date.now(),
      senderId: worker.id,
      receiverId: mayor.id,
      senderName: worker.fullName || worker.firstName,
      messageType: 'TEXT',
      textContent: reportText,
      timestamp: Date.now(),
      isRead: false
    };
    await window.dbApi.sendMessage(chatMsg);
  }

  closeModal('worker-complete-modal');
  showToast("Topshiriq tugatildi! Izoh va xabarnoma Hokimga yuborildi.");
}

function openWorkerChatWithMayor() {
  const worker = window.store.currentUser;
  if (!worker) return;

  const mayor = window.store.users.find(u => u.role === 'MAYOR' && (u.id === worker.mayorId || !worker.mayorId));
  if (mayor) {
    openChat(mayor);
  } else {
    alert("Hokim hisobi topilmadi.");
  }
}

window.onStoreChange('tasks', () => {
  if (window.store.currentUser && window.store.currentUser.role === 'WORKER') {
    renderWorkerTasks();
  }
});
