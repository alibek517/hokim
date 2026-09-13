// IJRO Mayor (Hokim) Module
let mayorCurrentTab = 0; // 0: Topshiriqlar (Default), 1: Rejalar, 2: Ishchilar, 3: Chatlar
let taskFilterIndex = 0; // 0: Barchasi, 1: Boshlanmagan, 2: Jarayonda, 3: Bajarildi, 4: Tekshirildi
let mayorTaskSearchQuery = '';
let mayorScheduleSearchQuery = '';
let mayorWorkerSearchQuery = '';

function onMayorTaskSearch(val) {
  mayorTaskSearchQuery = val;
  renderMayorTasks();
}

function onMayorScheduleSearch(val) {
  mayorScheduleSearchQuery = val;
  renderMayorSchedules();
}

function onMayorWorkerSearch(val) {
  mayorWorkerSearchQuery = val;
  renderMayorWorkers();
}

function initMayorView() {
  const mayor = window.store.currentUser;
  if (!mayor) return;

  const headerName = document.getElementById('mayor-header-name');
  const headerRegion = document.getElementById('mayor-header-region');
  if (headerName) headerName.innerText = mayor.fullName || (mayor.firstName + ' ' + mayor.lastName);
  if (headerRegion) headerRegion.innerText = mayor.regionOrDistrict || 'Tuman Hokimi';

  // Set default tab to 0 (Topshiriqlar) if not already set
  if (mayorCurrentTab === undefined || mayorCurrentTab === null) {
    switchMayorTab(0, false);
  }
}

function switchMayorTab(tabIndex, updateUrl = true) {
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
    if (updateUrl && typeof navigateTo === 'function') navigateTo('/mayor/tasks');
  } else if (tabIndex === 1) {
    if (fab) { fab.style.display = 'flex'; fab.onclick = openCreateScheduleModal; }
    renderMayorSchedules();
    if (updateUrl && typeof navigateTo === 'function') navigateTo('/mayor/schedules');
  } else if (tabIndex === 2) {
    if (fab) { fab.style.display = 'flex'; fab.onclick = openCreateWorkerModal; }
    renderMayorWorkers();
    if (updateUrl && typeof navigateTo === 'function') navigateTo('/mayor/workers');
  } else if (tabIndex === 3) {
    if (fab) fab.style.display = 'none';
    renderMayorChats();
    if (updateUrl && typeof navigateTo === 'function') navigateTo('/mayor/chats');
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

  if (mayorTaskSearchQuery && mayorTaskSearchQuery.trim()) {
    const q = mayorTaskSearchQuery.trim().toLowerCase();
    tasks = tasks.filter(t =>
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.assignedWorkerName && t.assignedWorkerName.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

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
    <div class="search-bar-container">
      <input type="text" class="search-input-pill" placeholder="🔍 Topshiriq yoki mas'ul xodimni qidirish..." oninput="onMayorTaskSearch(this.value)" value="${escapeHtml(mayorTaskSearchQuery)}">
    </div>
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
        Topshiriqlar topilmadi. Yangi topshiriq qo'shish uchun (+) tugmasini bosing.
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
      if (diff > 0) {
        const totalHours = Math.floor(diff / (1000 * 60 * 60));
        const totalMinutes = Math.floor((diff / (1000 * 60)) % 60);
        const days = Math.floor(totalHours / 24);
        const remHours = totalHours % 24;

        let timeStr = '';
        if (days > 0) timeStr = `${days}k ${remHours}s qoldi`;
        else if (remHours > 0) timeStr = `${remHours}s ${totalMinutes}d qoldi`;
        else timeStr = `${totalMinutes} daq qoldi`;

        remainingHtml = `<span>• ⏳ ${timeStr}</span>`;
      }
    }

    const dateFormatted = new Date(task.endDate || Date.now()).toLocaleDateString([], {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // Worker Completion Note
    let completionNoteHtml = '';
    if (task.completionNotes) {
      completionNoteHtml = `
        <div class="task-completion-note" style="margin-top: 4px; padding: 6px 10px; font-size: 11.5px;">
          <span class="note-label">📝 Xodim hisoboti:</span>
          <div>${escapeHtml(task.completionNotes)}</div>
        </div>
      `;
    }

    // Inspect button for Hokim
    let actionBtnHtml = '';
    if (task.status === 'COMPLETED_GREEN') {
      actionBtnHtml = `
        <button class="btn btn-blue" onclick="inspectTask('${task.id}')" style="margin-top: 4px; padding: 7px 12px; font-size: 13px;">
          ✓ Borib Tekshirdim (Tasdiqlash)
        </button>
      `;
    }

    const taskVoices = (task.voiceList && Array.isArray(task.voiceList) && task.voiceList.length > 0)
      ? task.voiceList
      : (task.voiceBase64 ? [task.voiceBase64] : []);

    let taskVoicesHtml = '';
    if (taskVoices.length === 1) {
      taskVoicesHtml = `
        <div class="task-audio-pill">
          <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap;">🎤 Ovozli topshiriq:</span>
          <audio controls src="data:audio/mp4;base64,${taskVoices[0]}" class="compact-audio-player"></audio>
        </div>
      `;
    } else if (taskVoices.length > 1) {
      taskVoicesHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
          ${taskVoices.map((vB64, idx) => `
            <div class="task-audio-pill">
              <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap;">🎤 Ovoz #${idx + 1}:</span>
              <audio controls src="data:audio/mp4;base64,${vB64}" class="compact-audio-player"></audio>
            </div>
          `).join('')}
        </div>
      `;
    }

    cardsHtml += `
      <div class="task-card">
        <div class="task-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${badgeClass}"><span class="badge-dot"></span>${badgeText}</span>
            ${diff <= 0 && !isDone ? '<span class="badge-overdue">⚠️ Kechikkan</span>' : ''}
          </div>
          <div class="task-deadline-info">
            <span>📅 ${dateFormatted}</span>
            ${remainingHtml}
          </div>
        </div>

        <div class="task-title-row">
          <div class="task-title">${escapeHtml(task.title || '')}</div>
          <div class="task-voice-box" id="task-voice-box-${task.id}">
            <button class="icon-voice-action-btn" onclick="startTaskVoiceMessage('${task.id}')" title="Xodimga ovozli xabar yuborish">
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
            </button>
          </div>
        </div>

        ${taskVoicesHtml}

        ${task.address ? `<div class="task-address">📍 ${escapeHtml(task.address)}</div>` : ''}
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}

        <!-- Birlashtirilgan ixcham Mas'ul va Ko'rildi footer paneli -->
        <div class="task-footer-row">
          <div class="task-worker-tag" title="Mas'ul xodim">
            <span>👤</span>
            <span style="font-weight: 600;">${escapeHtml(task.assignedWorkerName || 'Biriktirilmagan')}</span>
          </div>

          <div class="task-seen-pill ${task.seenAt ? 'is-seen' : 'is-unseen'}">
            ${task.seenAt
              ? `<span>👁️ Ko'rildi: ${new Date(task.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`
              : `<span>⚠️ Ko'rilmagan</span>`
            }
          </div>
        </div>

        ${(task.seenResponseText || task.seenResponseVoiceBase64) ? `
          <div class="task-worker-response">
            <span style="font-size: 11px; font-weight: 600; color: #15803D; white-space: nowrap;">💬 Xodim:</span>
            ${task.seenResponseText ? `<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">"${escapeHtml(task.seenResponseText)}"</span>` : ''}
            ${task.seenResponseVoiceBase64 ? `<audio controls src="data:audio/mp4;base64,${task.seenResponseVoiceBase64}" class="compact-audio-player" style="max-width: 130px; height: 26px;"></audio>` : ''}
          </div>
        ` : ''}

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

  let schedules = window.store.schedules.filter(s => s.mayorId === mayor.id)
    .sort((a, b) => (a.scheduledTime || 0) - (b.scheduledTime || 0));

  if (mayorScheduleSearchQuery && mayorScheduleSearchQuery.trim()) {
    const q = mayorScheduleSearchQuery.trim().toLowerCase();
    schedules = schedules.filter(s =>
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.location && s.location.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  const searchHeader = `
    <div class="search-bar-container">
      <input type="text" class="search-input-pill" placeholder="🔍 Rejalarni qidirish..." oninput="onMayorScheduleSearch(this.value)" value="${escapeHtml(mayorScheduleSearchQuery)}">
    </div>
  `;

  if (schedules.length === 0) {
    container.innerHTML = searchHeader + `
      <div class="main-content" style="align-items: center; justify-content: center; color: #94A3B8;">
        Rejalar topilmadi. Yangi reja qo'shish uchun (+) tugmasini bosing.
      </div>
    `;
    return;
  }

  let html = searchHeader + '<div class="main-content">';
  schedules.forEach(s => {
    const timeFormatted = new Date(s.scheduledTime || Date.now()).toLocaleString([], {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const voices = (s.voiceList && Array.isArray(s.voiceList) && s.voiceList.length > 0)
      ? s.voiceList
      : (s.voiceBase64 ? [s.voiceBase64] : []);

    let voicesHtml = '';
    if (voices.length > 0) {
      voicesHtml = `
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px; background: #F8FAFC; padding: 8px 10px; border-radius: 10px; border: 1px solid #E2E8F0;">
          <div style="font-size: 12px; font-weight: bold; color: var(--primary-blue); display: flex; align-items: center; gap: 4px;">
            <span>🎤 Ovozli yozuvlar (${voices.length} ta):</span>
          </div>
          ${voices.map((vBase64, idx) => `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 600; color: #64748B; min-width: 50px;">Ovoz #${idx + 1}:</span>
              <audio controls src="data:audio/mp4;base64,${vBase64}" style="flex: 1; height: 32px;"></audio>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `
      <div class="task-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="badge badge-blue">🗓️ Reja</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: bold; color: var(--primary-blue);">${timeFormatted}</span>
            <button class="icon-btn" style="color: #EF4444; width: 24px; height: 24px; font-size: 13px; background: #FEE2E2; border-radius: 6px;" onclick="deleteMayorSchedule('${s.id}')" title="O'chirish">🗑️</button>
          </div>
        </div>
        <div class="task-title" style="font-size: 15px; margin-top: 4px;">${escapeHtml(s.title || '')}</div>
        ${s.location ? `<div class="task-address">📍 ${escapeHtml(s.location)}</div>` : ''}
        ${s.notes ? `<div class="task-desc">${escapeHtml(s.notes)}</div>` : ''}
        ${voicesHtml}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

async function deleteMayorSchedule(scheduleId) {
  if (!confirm("Ushbu rejani o'chirmoqchimisiz?")) return;
  if (window.firebaseRtdb) {
    await window.firebaseRtdb.ref('schedules/' + scheduleId).remove();
  } else {
    await fetch(FIREBASE_DB_URL + '/schedules/' + scheduleId + '.json', { method: 'DELETE' });
  }
  showToast("Reja o'chirildi!");
}


// Rating calculation for workers (10-point scale: +0.5 per inspected task)
function calculateWorkerStats(worker, allTasks, currentTime = Date.now()) {
  const workerTasks = (allTasks || []).filter(t => t.assignedWorkerId === worker.id);
  
  if (workerTasks.length === 0) {
    return {
      workerId: worker.id,
      score: 0.0,
      totalTasks: 0,
      completedTasks: 0,
      inspectedTasks: 0,
      earlyCompletedTasks: 0,
      lateCompletedTasks: 0,
      overduePendingTasks: 0,
      inProgressTasks: 0,
      daysInactive: 0,
      inactivityPenalty: 0.0,
      gradeText: "Topshiriqsiz (0 ta)",
      earlyStartTasks: 0,
      rank: 0
    };
  }

  let completedCount = 0;
  let inspectedCount = 0;
  let earlyCompletedCount = 0;
  let lateCompletedCount = 0;
  let overduePendingCount = 0;
  let inProgressCount = 0;
  let earlyStartCount = 0;

  workerTasks.forEach(task => {
    const isInspected = task.status === 'INSPECTED_BLUE';
    const isCompleted = task.status === 'COMPLETED_GREEN' || isInspected;
    const finishTime = task.completedAt || task.inspectedAt || task.endDate || Date.now();

    const startedEarly = task.startedAt && task.startedAt <= (task.startDate || 0);
    if (startedEarly) earlyStartCount++;

    if (isInspected) {
      inspectedCount++;
    }

    if (isCompleted) {
      completedCount++;
      if (finishTime <= task.endDate) {
        earlyCompletedCount++;
      } else {
        lateCompletedCount++;
      }
    } else {
      if (task.status === 'IN_PROGRESS_YELLOW') inProgressCount++;
      if (currentTime > (task.endDate || 0)) {
        overduePendingCount++;
      }
    }
  });

  // Ball hisoblash: Har bir hokim tekshirgan topshiriq uchun +0.5 ball
  // Ishni boshlagan (IN_PROGRESS) yoki shunchaki tugatgan (COMPLETED) payti bal berilmaydi
  const baseScore = inspectedCount * 0.5;

  // 1. Oxirgi faollik vaqti (oxirgi kirish yoki topshiriqlar bo'yicha harakat)
  let lastActive = 0;
  if (worker.lastActiveAt && worker.lastActiveAt > 0) {
    lastActive = worker.lastActiveAt;
  }

  workerTasks.forEach(t => {
    const tTime = Math.max(t.completedAt || 0, t.startedAt || 0, t.seenAt || 0);
    if (tTime > lastActive) {
      lastActive = tTime;
    }
  });

  const hasLoggedIn = lastActive > 0;
  let daysInactive = 0;
  let inactivityPenalty = 0.0;

  if (hasLoggedIn) {
    const diffMs = currentTime - lastActive;
    if (diffMs > 0) {
      const rawDays = Math.floor(diffMs / 86400000);
      if (rawDays >= 2) {
        // Faqat 2 kundan boshlab jarima hisoblanadi (maksimal 8 kun / 4.0 ball)
        daysInactive = Math.min(8, rawDays);
        inactivityPenalty = Math.min(4.0, (daysInactive - 1) * 0.5);
      } else if (rawDays === 1) {
        daysInactive = 1;
        inactivityPenalty = 0.0; // Kecha kirgan bo'lsa jarima yo'q
      }
    }
  } else {
    // Yangi xodim bo'lsa, qadimiy createdAt (2024-yil) sababli 731 kunlik asossiz jarima solinmaydi!
    daysInactive = 0;
    inactivityPenalty = 0.0;
  }

  const finalScore = Math.max(0.0, Math.min(10.0, baseScore - inactivityPenalty));
  const roundedScore = Math.round(finalScore * 10) / 10;

  let grade = "Ball to'planmagan (0)";
  if (roundedScore >= 9.0) grade = "O'ta faol (A+)";
  else if (roundedScore >= 7.5) grade = "A'lo (A)";
  else if (roundedScore >= 5.0) grade = "Yaxshi (B)";
  else if (roundedScore >= 2.5) grade = "O'rtacha (C)";
  else if (roundedScore >= 0.5) grade = "Boshlang'ich (D)";

  return {
    workerId: worker.id,
    score: roundedScore,
    totalTasks: workerTasks.length,
    completedTasks: completedCount,
    inspectedTasks: inspectedCount,
    earlyCompletedTasks: earlyCompletedCount,
    lateCompletedTasks: lateCompletedCount,
    overduePendingTasks: overduePendingCount,
    inProgressTasks: inProgressCount,
    daysInactive,
    inactivityPenalty,
    gradeText: grade,
    earlyStartTasks: earlyStartCount,
    hasLoggedIn,
    rank: 0
  };
}

// 3. Ishchilar (Workers) Tab & Leaderboard
async function renderMayorWorkers() {
  const container = document.getElementById('mayor-tab-content');
  const mayor = window.store.currentUser;
  if (!container || !mayor) return;

  let rawWorkers = (window.store.users || []).filter(u => u.role === 'WORKER' && u.mayorId === mayor.id);

  if (rawWorkers.length === 0) {
    try {
      rawWorkers = await window.dbApi.getUsersByRole('WORKER');
      rawWorkers = rawWorkers.filter(u => u.mayorId === mayor.id);
    } catch (e) {
      console.error("Error fetching workers for rating:", e);
    }
  }

  if (mayorWorkerSearchQuery && mayorWorkerSearchQuery.trim()) {
    const q = mayorWorkerSearchQuery.trim().toLowerCase();
    rawWorkers = rawWorkers.filter(w =>
      ((w.fullName || (w.firstName + ' ' + w.lastName))).toLowerCase().includes(q) ||
      ((w.position || '')).toLowerCase().includes(q)
    );
  }

  const searchHeader = `
    <div class="search-bar-container">
      <input type="text" class="search-input-pill" placeholder="🔍 Xodimlarni qidirish (ism, lavozim)..." oninput="onMayorWorkerSearch(this.value)" value="${escapeHtml(mayorWorkerSearchQuery)}">
    </div>
  `;

  if (rawWorkers.length === 0) {
    container.innerHTML = searchHeader + `
      <div class="main-content" style="align-items: center; justify-content: center; color: #94A3B8;">
        Xodimlar topilmadi. Yangi xodim qo'shish uchun (+) tugmasini bosing.
      </div>
    `;
    return;
  }

  // Calculate stats for each worker
  const allTasks = window.store.tasks || [];
  const workersWithStats = rawWorkers.map(w => ({
    worker: w,
    stats: calculateWorkerStats(w, allTasks)
  }));

  // Sort by score descending
  workersWithStats.sort((a, b) => {
    if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
    if (b.stats.inspectedTasks !== a.stats.inspectedTasks) return b.stats.inspectedTasks - a.stats.inspectedTasks;
    if (b.stats.earlyCompletedTasks !== a.stats.earlyCompletedTasks) return b.stats.earlyCompletedTasks - a.stats.earlyCompletedTasks;
    return (a.worker.fullName || '').localeCompare(b.worker.fullName || '');
  });

  workersWithStats.forEach((item, idx) => {
    item.stats.rank = idx + 1;
  });

  let html = searchHeader + '<div class="main-content">';

  // Header Rating Card
  html += `
    <div class="task-card" style="background: var(--navy-dark); color: white; border: none; padding: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: white;">🏆 XODIMLAR REYTINGI</div>
          <div style="font-size: 11px; color: #94A3B8;">Hokim tekshirgan har bir ish uchun +0.5 ball</div>
        </div>
        <div style="background: #1E293B; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; color: #FBBF24;">
          ${rawWorkers.length} nafar xodim
        </div>
      </div>
  `;

  // Top 3 Podium
  if (workersWithStats.length > 0 && workersWithStats[0].stats.score > 0) {
    html += `<div style="display: flex; justify-content: space-around; align-items: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid #334155;">`;
    // 2nd Place
    if (workersWithStats.length >= 2 && workersWithStats[1].stats.score > 0) {
      const s = workersWithStats[1];
      html += `
        <div style="text-align: center;">
          <div style="font-size: 20px;">🥈</div>
          <div style="font-size: 11px; font-weight: bold; color: #CBD5E1; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.worker.firstName || s.worker.fullName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #CBD5E1;">${s.stats.score} ⭐</div>
        </div>
      `;
    }
    // 1st Place
    const f = workersWithStats[0];
    html += `
      <div style="text-align: center;">
        <div style="font-size: 28px;">🥇</div>
        <div style="font-size: 13px; font-weight: 800; color: #FBBF24; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(f.worker.firstName || f.worker.fullName)}</div>
        <div style="font-size: 12px; font-weight: 800; color: #FBBF24;">${f.stats.score} / 10 ⭐</div>
      </div>
    `;
    // 3rd Place
    if (workersWithStats.length >= 3 && workersWithStats[2].stats.score > 0) {
      const t = workersWithStats[2];
      html += `
        <div style="text-align: center;">
          <div style="font-size: 18px;">🥉</div>
          <div style="font-size: 11px; font-weight: bold; color: #CD7F32; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.worker.firstName || t.worker.fullName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #CD7F32;">${t.stats.score} ⭐</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `</div>`; // Close card

  // Workers List
  workersWithStats.forEach(({ worker: w, stats }) => {
    let rankBadge = `#${stats.rank}`;
    if (stats.rank === 1) rankBadge = '🥇';
    else if (stats.rank === 2) rankBadge = '🥈';
    else if (stats.rank === 3) rankBadge = '🥉';

    let scoreBadgeBg = '#E2E8F0';
    let scoreBadgeColor = '#64748B';
    if (stats.totalTasks > 0) {
      if (stats.score >= 7.5) { scoreBadgeBg = '#DCFCE7'; scoreBadgeColor = '#166534'; }
      else if (stats.score >= 5.0) { scoreBadgeBg = '#E0F2FE'; scoreBadgeColor = '#0369A1'; }
      else if (stats.score >= 2.5) { scoreBadgeBg = '#FEF9C3'; scoreBadgeColor = '#854D0E'; }
      else if (stats.score >= 0.5) { scoreBadgeBg = '#F1F5F9'; scoreBadgeColor = '#475569'; }
      else { scoreBadgeBg = '#FEE2E2'; scoreBadgeColor = '#991B1B'; }
    }

    html += `
      <div class="task-card" style="flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-avatar" style="width: 44px; height: 44px; font-size: ${stats.rank <= 3 ? '20px' : '15px'}; font-weight: bold;">
              ${rankBadge}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 15px; color: var(--navy-dark);">${escapeHtml(w.fullName || (w.firstName + ' ' + w.lastName))}</div>
              <div style="font-size: 12px; color: var(--primary-blue); font-weight: 500;">${escapeHtml(w.position || 'Xodim')}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; background: ${scoreBadgeBg}; color: ${scoreBadgeColor}; font-weight: 800; font-size: 12px; padding: 4px 8px; border-radius: 8px;">
              ${stats.totalTasks === 0 ? '0.0 / 10 ⚪' : stats.score + ' / 10 ⭐'}
            </span>
            <div style="font-size: 10px; color: ${scoreBadgeColor}; font-weight: 600; margin-top: 2px;">${stats.gradeText}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 6px 0; border-top: 1px solid #F1F5F9; border-bottom: 1px solid #F1F5F9;">
          <div>
            <span style="color: var(--primary-blue); font-weight: 700;">🔍 Tekshirildi: <b>${stats.inspectedTasks} (+${stats.inspectedTasks * 0.5}⭐)</b></span> &nbsp;
            <span style="color: #15803D;">🚀 Erta: <b>${stats.earlyCompletedTasks}</b></span>
          </div>
          <div>
            <span style="color: #64748B;">⚡ Vaqtida: <b>${stats.earlyStartTasks}</b></span> &nbsp;
            <span style="color: ${stats.lateCompletedTasks > 0 ? 'var(--status-red)' : '#94A3B8'};">⏰ Kechikkan: <b>${stats.lateCompletedTasks}</b></span>
          </div>
        </div>

        ${stats.hasLoggedIn ? (
          stats.daysInactive >= 2 ? `
            <div style="background: #FEF2F2; color: var(--status-red); font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 600;">
              ⚠️ Ilovaga ${stats.daysInactive} kundan beri kirmagan (-${stats.inactivityPenalty} ball jarima)
            </div>
          ` : (stats.daysInactive === 1 ? `
            <div style="background: #FEF9C3; color: #854D0E; font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 600;">
              ℹ️ Kecha kirgan (Bugun hali kirmagan)
            </div>
          ` : `
            <div style="background: #F0FDF4; color: #166534; font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 600;">
              🟢 Bugun ilovada faol bo'lgan
            </div>
          `)
        ) : `
          <div style="background: #F8FAFC; color: #64748B; font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 600;">
            ⚪ Yangi biriktirilgan (Hali ilovaga kirmagan)
          </div>
        `}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
          <div style="font-size: 11px; color: #64748B;">
            📞 ${escapeHtml(w.phone || w.username)} &nbsp;|&nbsp; Login: <span style="color: #0284C7;">${escapeHtml(w.username)}</span>
          </div>
          <button class="btn btn-primary" style="width: auto; padding: 6px 12px; font-size: 12px;" onclick="openChatFromWorkerId('${w.id}')">
            💬 Chat
          </button>
        </div>
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
  if (startInput) startInput.value = now.toISOString().slice(0, 10);
  if (endInput) endInput.value = later.toISOString().slice(0, 10);

  // Reset voice modal state
  deleteTaskModalVoice();
  const voiceContainer = document.getElementById('new-task-voice-container');
  if (voiceContainer) voiceContainer.style.display = 'none';
  const toggleBtn = document.getElementById('btn-toggle-task-voice');
  if (toggleBtn) toggleBtn.innerHTML = '🎤 Ovoz yozish';

  document.getElementById('create-task-modal').classList.add('active');
}

// Modal ichida ovozli topshiriq logikasi
let taskModalVoiceState = {
  isRecording: false,
  mediaRecorder: null,
  stream: null,
  audioChunks: [],
  timerId: null,
  seconds: 0,
  voiceBase64: null,
  voiceDurationSec: 0
};

function toggleTaskCreationVoiceMode() {
  const container = document.getElementById('new-task-voice-container');
  const btn = document.getElementById('btn-toggle-task-voice');
  if (!container) return;
  if (container.style.display === 'none' || !container.style.display) {
    container.style.display = 'block';
    btn.innerHTML = '✕ Bekor qilish';
  } else {
    deleteTaskModalVoice();
    container.style.display = 'none';
    btn.innerHTML = '🎤 Ovoz yozish';
  }
}

async function toggleTaskModalRecording() {
  if (taskModalVoiceState.isRecording) {
    stopTaskModalRecording();
  } else {
    startTaskModalRecording();
  }
}

async function startTaskModalRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    taskModalVoiceState.stream = stream;
    taskModalVoiceState.mediaRecorder = mediaRecorder;
    taskModalVoiceState.audioChunks = [];
    taskModalVoiceState.seconds = 0;
    taskModalVoiceState.isRecording = true;

    const timerEl = document.getElementById('task-modal-rec-timer');
    const btnText = document.getElementById('task-modal-rec-btn-text');
    const recDot = document.getElementById('task-modal-rec-dot');
    if (timerEl) { timerEl.style.display = 'inline'; timerEl.innerText = '00:00'; }
    if (btnText) btnText.innerText = 'To\'xtatish';
    if (recDot) recDot.style.animation = 'pulse-dot 1s infinite alternate';

    taskModalVoiceState.timerId = setInterval(() => {
      taskModalVoiceState.seconds++;
      const m = String(Math.floor(taskModalVoiceState.seconds / 60)).padStart(2, '0');
      const s = String(taskModalVoiceState.seconds % 60).padStart(2, '0');
      if (timerEl) timerEl.innerText = `${m}:${s}`;
    }, 1000);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) taskModalVoiceState.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(taskModalVoiceState.audioChunks, { type: 'audio/mp4' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const player = document.getElementById('task-modal-audio-player');
      const previewBox = document.getElementById('new-task-voice-preview');
      const recorderBox = document.getElementById('new-task-voice-recorder');
      if (player) player.src = audioUrl;
      if (previewBox) previewBox.style.display = 'flex';
      if (recorderBox) recorderBox.style.display = 'none';

      taskModalVoiceState.voiceDurationSec = Math.max(1, taskModalVoiceState.seconds);

      const reader = new FileReader();
      reader.onload = () => {
        taskModalVoiceState.voiceBase64 = reader.result.split(',')[1];
      };
      reader.readAsDataURL(audioBlob);

      if (taskModalVoiceState.stream) {
        taskModalVoiceState.stream.getTracks().forEach(t => t.stop());
      }
    };

    mediaRecorder.start();
  } catch (err) {
    alert("Mikrofon ruxsati olinmadi: " + err.message);
  }
}

function stopTaskModalRecording() {
  if (!taskModalVoiceState.isRecording) return;
  taskModalVoiceState.isRecording = false;
  clearInterval(taskModalVoiceState.timerId);
  const btnText = document.getElementById('task-modal-rec-btn-text');
  if (btnText) btnText.innerText = 'Ovoz yozishni boshlash';
  if (taskModalVoiceState.mediaRecorder && taskModalVoiceState.mediaRecorder.state !== 'inactive') {
    taskModalVoiceState.mediaRecorder.stop();
  }
}

function deleteTaskModalVoice() {
  if (taskModalVoiceState.isRecording) {
    stopTaskModalRecording();
  }
  taskModalVoiceState.voiceBase64 = null;
  taskModalVoiceState.voiceDurationSec = 0;
  taskModalVoiceState.seconds = 0;

  const timerEl = document.getElementById('task-modal-rec-timer');
  const btnText = document.getElementById('task-modal-rec-btn-text');
  const previewBox = document.getElementById('new-task-voice-preview');
  const recorderBox = document.getElementById('new-task-voice-recorder');
  const player = document.getElementById('task-modal-audio-player');

  if (timerEl) { timerEl.style.display = 'none'; timerEl.innerText = '00:00'; }
  if (btnText) btnText.innerText = 'Ovoz yozishni boshlash';
  if (previewBox) previewBox.style.display = 'none';
  if (recorderBox) recorderBox.style.display = 'flex';
  if (player) player.src = '';
}

async function saveNewTask() {
  const mayor = window.store.currentUser;
  let title = document.getElementById('new-task-title').value.trim();
  const workerId = document.getElementById('new-task-worker').value;
  const startVal = document.getElementById('new-task-start').value;
  const endVal = document.getElementById('new-task-end').value;
  const startDate = startVal ? new Date(startVal + 'T00:00:00').getTime() : Date.now();
  const endDate = endVal ? new Date(endVal + 'T23:59:59').getTime() : (Date.now() + 48 * 3600 * 1000);

  // Agar yozilayotgan bo'lsa to'xtatamiz
  if (taskModalVoiceState.isRecording) {
    stopTaskModalRecording();
    await new Promise(r => setTimeout(r, 400));
  }

  const hasVoice = !!taskModalVoiceState.voiceBase64;

  if (!title && !hasVoice) {
    alert("Iltimos, topshiriq matnini kiriting yoki ovozli topshiriq yozing!");
    return;
  }

  if (!title && hasVoice) {
    title = `🎤 Ovozli topshiriq (${taskModalVoiceState.voiceDurationSec}s)`;
  }

  const worker = window.store.users.find(u => u.id === workerId);
  const workerName = worker ? (worker.fullName || (worker.firstName + ' ' + worker.lastName)) : '';

  const task = {
    id: 'task_' + Date.now(),
    title,
    description: '',
    address: '',
    mayorId: mayor.id,
    assignedWorkerId: workerId,
    assignedWorkerName: workerName,
    startDate,
    endDate,
    status: 'PENDING_RED',
    voiceBase64: taskModalVoiceState.voiceBase64 || null,
    voiceDurationSec: taskModalVoiceState.voiceDurationSec || 0,
    createdAt: Date.now()
  };

  await window.dbApi.createTask(task);
  closeModal('create-task-modal');
  deleteTaskModalVoice();
  showToast("Yangi topshiriq biriktirildi!");
}

// Schedule Multi-Voice Recording State
let newScheduleVoices = []; // Array of { id, base64, url, durationSec }
let scheduleVoiceRecorderState = {
  isRecording: false,
  mediaRecorder: null,
  stream: null,
  audioChunks: [],
  timerId: null,
  seconds: 0
};

function resetScheduleVoiceState() {
  if (scheduleVoiceRecorderState.timerId) {
    clearInterval(scheduleVoiceRecorderState.timerId);
    scheduleVoiceRecorderState.timerId = null;
  }
  if (scheduleVoiceRecorderState.stream) {
    scheduleVoiceRecorderState.stream.getTracks().forEach(t => t.stop());
    scheduleVoiceRecorderState.stream = null;
  }
  scheduleVoiceRecorderState.isRecording = false;
  scheduleVoiceRecorderState.mediaRecorder = null;
  scheduleVoiceRecorderState.audioChunks = [];
  scheduleVoiceRecorderState.seconds = 0;

  const timerEl = document.getElementById('schedule-rec-timer');
  const btnText = document.getElementById('schedule-rec-btn-text');
  const recDot = document.getElementById('schedule-rec-dot');
  if (timerEl) { timerEl.style.display = 'none'; timerEl.innerText = '00:00'; }
  if (btnText) btnText.innerText = '🎤 Ovoz yozish (gols)';
  if (recDot) recDot.style.animation = 'none';
}

function renderNewScheduleVoices() {
  const container = document.getElementById('schedule-voices-container');
  const countEl = document.getElementById('schedule-voice-count');
  if (countEl) {
    countEl.innerText = `${newScheduleVoices.length} ta ovoz`;
  }
  if (!container) return;

  if (newScheduleVoices.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = newScheduleVoices.map((v, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 10px;">
      <span style="font-size: 11px; font-weight: bold; color: #1D4ED8; min-width: 65px;">🎤 Ovoz #${idx + 1} (${v.durationSec}s):</span>
      <audio controls src="${v.url || ('data:audio/mp4;base64,' + v.base64)}" style="flex: 1; height: 32px;"></audio>
      <button type="button" onclick="deleteScheduleVoice(${idx})" style="background: #FEE2E2; color: #EF4444; border: none; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: bold; cursor: pointer;" title="O'chirish">✕</button>
    </div>
  `).join('');
}

function deleteScheduleVoice(idx) {
  if (idx >= 0 && idx < newScheduleVoices.length) {
    newScheduleVoices.splice(idx, 1);
    renderNewScheduleVoices();
  }
}

async function toggleScheduleVoiceRecording() {
  if (scheduleVoiceRecorderState.isRecording) {
    stopScheduleVoiceRecording();
  } else {
    startScheduleVoiceRecording();
  }
}

async function startScheduleVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    scheduleVoiceRecorderState.stream = stream;
    scheduleVoiceRecorderState.mediaRecorder = mediaRecorder;
    scheduleVoiceRecorderState.audioChunks = [];
    scheduleVoiceRecorderState.seconds = 0;
    scheduleVoiceRecorderState.isRecording = true;

    const timerEl = document.getElementById('schedule-rec-timer');
    const btnText = document.getElementById('schedule-rec-btn-text');
    const recDot = document.getElementById('schedule-rec-dot');
    if (timerEl) { timerEl.style.display = 'inline'; timerEl.innerText = '00:00'; }
    if (btnText) btnText.innerText = '⏹️ To\'xtatish va qo\'shish';
    if (recDot) recDot.style.animation = 'pulse-dot 1s infinite alternate';

    scheduleVoiceRecorderState.timerId = setInterval(() => {
      scheduleVoiceRecorderState.seconds++;
      const m = String(Math.floor(scheduleVoiceRecorderState.seconds / 60)).padStart(2, '0');
      const s = String(scheduleVoiceRecorderState.seconds % 60).padStart(2, '0');
      if (timerEl) timerEl.innerText = `${m}:${s}`;
    }, 1000);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) scheduleVoiceRecorderState.audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(scheduleVoiceRecorderState.audioChunks, { type: 'audio/mp4' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const durationSec = Math.max(1, scheduleVoiceRecorderState.seconds);

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        newScheduleVoices.push({
          id: Date.now(),
          url: audioUrl,
          base64: base64,
          durationSec: durationSec
        });
        renderNewScheduleVoices();
      };
      reader.readAsDataURL(audioBlob);

      if (scheduleVoiceRecorderState.stream) {
        scheduleVoiceRecorderState.stream.getTracks().forEach(t => t.stop());
        scheduleVoiceRecorderState.stream = null;
      }
      resetScheduleVoiceState();
    };

    mediaRecorder.start(250);
  } catch (err) {
    console.error("Schedule voice recording error:", err);
    alert("Mikrofon ruxsatini yoqing yoki mikrofon ulanmagan!");
    resetScheduleVoiceState();
  }
}

function stopScheduleVoiceRecording() {
  if (scheduleVoiceRecorderState.mediaRecorder && scheduleVoiceRecorderState.mediaRecorder.state !== 'inactive') {
    scheduleVoiceRecorderState.mediaRecorder.stop();
  }
}

function openCreateScheduleModal() {
  const now = new Date();
  const timeInput = document.getElementById('new-schedule-time');
  if (timeInput) timeInput.value = now.toISOString().slice(0, 16);
  const titleInput = document.getElementById('new-schedule-title');
  if (titleInput) titleInput.value = '';
  newScheduleVoices = [];
  resetScheduleVoiceState();
  renderNewScheduleVoices();
  document.getElementById('create-schedule-modal').classList.add('active');
}

async function saveNewSchedule() {
  const mayor = window.store.currentUser;
  const title = (document.getElementById('new-schedule-title')?.value || '').trim();
  const scheduledTime = new Date(document.getElementById('new-schedule-time').value).getTime();

  if (!title && newScheduleVoices.length === 0) {
    alert("Iltimos, reja matnini yozing yoki ovozli xabar (gols) yozib qoldiring!");
    return;
  }

  const voiceList = newScheduleVoices.map(v => v.base64);
  const finalTitle = title || `🎤 Ovozli reja (${voiceList.length} ta ovoz)`;

  const schedule = {
    id: 'sched_' + Date.now(),
    mayorId: mayor.id,
    title: finalTitle,
    location: '',
    notes: '',
    scheduledTime: scheduledTime || Date.now(),
    voiceBase64: voiceList.length > 0 ? voiceList[0] : null,
    voiceList: voiceList,
    createdAt: Date.now()
  };

  await window.dbApi.addSchedule(schedule);
  closeModal('create-schedule-modal');
  newScheduleVoices = [];
  resetScheduleVoiceState();
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

// Topshiriq bo'yicha tezkor ovozli xabar yuborish (Mayor -> Worker Chat)
let currentTaskRecording = null;

async function startTaskVoiceMessage(taskId) {
  const task = (window.store.tasks || []).find(t => t.id === taskId);
  if (!task) return;

  const workerId = task.assignedWorkerId;
  const workerName = task.assignedWorkerName || 'Xodim';
  const taskTitle = task.title || '';

  if (!workerId || workerId === 'undefined' || workerId === 'null') {
    alert("Bu topshiriqqa mas'ul xodim biriktirilmagan!");
    return;
  }

  // Oldingi yozilayotgan bo'lsa to'xtatamiz
  if (currentTaskRecording) {
    cancelTaskVoiceMessage();
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioChunks = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    const container = document.getElementById(`task-voice-box-${taskId}`);
    if (container) {
      container.innerHTML = `
        <div class="task-voice-recording-active" style="display: flex; align-items: center; gap: 6px; background: #FEF2F2; padding: 4px 8px; border-radius: 20px; border: 1px solid #FECACA;">
          <span class="recording-dot" style="display: inline-block; width: 8px; height: 8px; background: #EF4444; border-radius: 50%;"></span>
          <span id="task-rec-time-${taskId}" style="font-size: 11px; font-weight: 700; color: #EF4444;">🔴 0s</span>
          <button class="btn btn-outline" onclick="cancelTaskVoiceMessage()" style="color: #EF4444; border-color: #EF4444; padding: 2px 6px; font-size: 10px; width: auto;" title="Bekor qilish va o'chirish">🗑️ O'chirish</button>
          <button class="btn btn-primary" onclick="sendTaskVoiceMessage('${taskId}')" style="padding: 2px 8px; font-size: 10px; width: auto;" title="Xodimga yuborish">📤 Yuborish</button>
        </div>
      `;
    }

    const startTime = Date.now();
    const timerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const el = document.getElementById(`task-rec-time-${taskId}`);
      if (el) el.innerText = `🔴 ${elapsed}s`;
    }, 1000);

    mediaRecorder.start();

    currentTaskRecording = {
      taskId,
      workerId,
      workerName,
      taskTitle,
      mediaRecorder,
      stream,
      timerId,
      audioChunks,
      startTime
    };
  } catch (err) {
    console.error("Audio recording error:", err);
    alert("Mikrofon ruxsati olinmadi: " + err.message);
  }
}

function cancelTaskVoiceMessage() {
  if (!currentTaskRecording) return;
  const { taskId, mediaRecorder, stream, timerId } = currentTaskRecording;

  clearInterval(timerId);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  showToast("Ovoz o'chirildi");

  const container = document.getElementById(`task-voice-box-${taskId}`);
  if (container) {
    container.innerHTML = `
      <button class="icon-voice-action-btn" onclick="startTaskVoiceMessage('${taskId}')" title="Xodimga ovozli xabar yuborish">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
      </button>
    `;
  }
  currentTaskRecording = null;
}

async function sendTaskVoiceMessage(taskId) {
  if (!currentTaskRecording) return;
  const { workerId, workerName, taskTitle, mediaRecorder, stream, timerId, audioChunks, startTime } = currentTaskRecording;

  clearInterval(timerId);
  showToast("Ovozli xabar yuborilmoqda...");

  mediaRecorder.onstop = async () => {
    try {
      const audioBlob = new Blob(audioChunks, { type: 'audio/mp4' });
      const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const msg = {
          id: 'msg_voice_' + Date.now(),
          senderId: window.store.currentUser.id,
          receiverId: workerId,
          senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
          messageType: 'VOICE',
          mediaBase64: base64,
          audioDurationSec: durationSec,
          textContent: `🎤 Topshiriq: "${taskTitle}"`,
          timestamp: Date.now(),
          isRead: false
        };
        await window.dbApi.sendMessage(msg);

        // Topshiriq kartochkasiga ham ovozni biriktiramiz
        if (taskId && window.dbApi.updateTaskVoice) {
          await window.dbApi.updateTaskVoice(taskId, base64, durationSec);
        }

        showToast(`✅ Ovozli xabar biriktirildi va ${workerName} ga yuborildi!`);
        renderMayorTasks();
      };
      reader.readAsDataURL(audioBlob);
    } catch (e) {
      console.error("Voice send error:", e);
      alert("Ovoz yuborishda xatolik yuz berdi");
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  };

  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  const container = document.getElementById(`task-voice-box-${taskId}`);
  if (container) {
    container.innerHTML = `
      <button class="icon-voice-action-btn" onclick="startTaskVoiceMessage('${taskId}')" title="Xodimga ovozli xabar yuborish">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
      </button>
    `;
  }
  currentTaskRecording = null;
}

// AI Helper Functions for Jarvis integration
window.mayorAiHelpers = {
  openTaskModalWithData: (data) => {
    openCreateTaskModal();
    if (data.title) {
      const el = document.getElementById('new-task-title');
      if (el) el.value = data.title;
    }
    if (data.workerId) {
      const el = document.getElementById('new-task-worker');
      if (el) el.value = data.workerId;
    }
    if (data.startDate) {
      const el = document.getElementById('new-task-start');
      if (el) el.value = data.startDate;
    }
    if (data.endDate) {
      const el = document.getElementById('new-task-end');
      if (el) el.value = data.endDate;
    }
  },
  updateTaskFields: (data) => {
    if (data.title !== undefined) {
      const el = document.getElementById('new-task-title');
      if (el) el.value = data.title;
    }
    if (data.workerId !== undefined) {
      const el = document.getElementById('new-task-worker');
      if (el) el.value = data.workerId;
    }
    if (data.startDate !== undefined) {
      const el = document.getElementById('new-task-start');
      if (el) el.value = data.startDate;
    }
    if (data.endDate !== undefined) {
      const el = document.getElementById('new-task-end');
      if (el) el.value = data.endDate;
    }
  },
  saveCurrentTask: async () => {
    await saveNewTask();
  },
  closeTaskModal: () => {
    closeModal('create-task-modal');
  },
  switchToTab: (tabIdx) => {
    switchMayorTab(tabIdx);
  },
  filterTasksByStatus: (statusIdx) => {
    setTaskFilter(statusIdx);
  },
  searchTasks: (q) => {
    mayorTaskSearchQuery = q;
    renderMayorTasks();
  },
  searchSchedules: (q) => {
    mayorScheduleSearchQuery = q;
    renderMayorSchedules();
  },
  searchWorkers: (q) => {
    mayorWorkerSearchQuery = q;
    renderMayorWorkers();
  }
};
