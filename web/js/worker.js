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

  const stats = calculateWorkerStats(worker, window.store.tasks || []);

  let scoreBadgeBg = '#E2E8F0';
  let scoreBadgeColor = '#64748B';
  if (stats.totalTasks > 0) {
    if (stats.score >= 7.5) { scoreBadgeBg = '#DCFCE7'; scoreBadgeColor = '#166534'; }
    else if (stats.score >= 5.0) { scoreBadgeBg = '#E0F2FE'; scoreBadgeColor = '#0369A1'; }
    else if (stats.score >= 2.5) { scoreBadgeBg = '#FEF9C3'; scoreBadgeColor = '#854D0E'; }
    else if (stats.score >= 0.5) { scoreBadgeBg = '#F1F5F9'; scoreBadgeColor = '#475569'; }
    else { scoreBadgeBg = '#FEE2E2'; scoreBadgeColor = '#991B1B'; }
  }

  const statsBox = document.getElementById('worker-stats-box');
  if (statsBox) {
    statsBox.innerHTML = `
      <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
        <div style="background: var(--navy-dark); border-radius: 12px; padding: 14px; color: white;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; color: #94A3B8; font-weight: 600;">SIZNING REYTINGINGIZ</div>
              <div style="font-size: 22px; font-weight: 800; color: white;">${stats.totalTasks === 0 ? '0.0 / 10' : stats.score + ' / 10'}</div>
            </div>
            <div style="background: ${scoreBadgeBg}; color: ${scoreBadgeColor}; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800;">
              ${stats.gradeText}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #334155;">
            <span style="color: #38BDF8; display: inline-flex; align-items: center; gap: 3px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>Tekshirildi: <b>${stats.inspectedTasks} ta (+${stats.inspectedTasks * 0.5})</b>
            </span>
            <span style="color: #4ADE80; display: inline-flex; align-items: center; gap: 3px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5s-5 4.5-5 10c0 3.3 2.2 6 5 6s5-2.7 5-6c0-5.5-5-10-5-10zm0 13c-1.4 0-2.5-1.1-2.5-2.5S10.6 10.5 12 10.5s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z"/></svg>Erta: <b>${stats.earlyCompletedTasks} ta</b>
            </span>
            <span style="color: ${stats.lateCompletedTasks > 0 ? '#F87171' : '#94A3B8'}; display: inline-flex; align-items: center; gap: 3px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Kech: <b>${stats.lateCompletedTasks} ta</b>
            </span>
          </div>
          ${stats.hasLoggedIn ? (
            stats.daysInactive >= 2 ? `
              <div style="margin-top: 8px; background: #450A0A; color: #FCA5A5; font-size: 10px; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>Ilovaga ${stats.daysInactive} kundan beri kirmagansiz (-${stats.inactivityPenalty} ball jarima)
              </div>
            ` : (stats.daysInactive === 1 ? `
              <div style="margin-top: 8px; background: #713F12; color: #FEF08A; font-size: 10px; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>Kecha kirgansiz (Bugungi faollik kutilmoqda)
              </div>
            ` : `
              <div style="margin-top: 8px; background: #14532D; color: #BBF7D0; font-size: 10px; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <span class="badge-dot" style="background: #4ADE80;"></span>Bugun ilovada faol bo'ldingiz
              </div>
            `)
          ) : `
            <div style="margin-top: 8px; background: #334155; color: #CBD5E1; font-size: 10px; padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
              <span class="badge-dot" style="background: #94A3B8;"></span>Yangi biriktirilgan (Hali ilovaga kirmagan)
            </div>
          `}
          <div style="font-size: 10px; color: #94A3B8; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FBBF24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>
            Eslatma: Ball faqat Hokim topshiriqni tekshirib tasdiqlaganida (+0.5 ball) beriladi! Boshlash yoki tugatishning o'ziga ball berilmaydi.
          </div>
        </div>

        <div style="display: flex; justify-content: space-around; width: 100%;">
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: var(--status-red);">${pendingCount}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Boshlanmagan</div>
          </div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: var(--status-yellow);">${inProgressCount}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Jarayonda</div>
          </div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 18px; font-weight: bold; color: var(--status-green);">${completedCount}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Bajarildi</div>
          </div>
        </div>
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
      if (diff > 0) {
        const totalHours = Math.floor(diff / (1000 * 60 * 60));
        const totalMinutes = Math.floor((diff / (1000 * 60)) % 60);
        const days = Math.floor(totalHours / 24);
        const remHours = totalHours % 24;

        let timeStr = '';
        if (days > 0) timeStr = `${days}k ${remHours}s qoldi`;
        else if (remHours > 0) timeStr = `${remHours}s ${totalMinutes}d qoldi`;
        else timeStr = `${totalMinutes} daq qoldi`;

        remainingHtml = `<span>• <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -2px; margin-right: 2px;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>${timeStr}</span>`;
      }
    }

    const dateFormatted = new Date(task.endDate || Date.now()).toLocaleDateString([], {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    // 0. Seen status / confirmation
    let seenStatusHtml = '';
    if (!task.seenAt) {
      seenStatusHtml = `
        <button class="btn btn-primary" style="margin-top: 4px; padding: 8px 12px; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;" onclick="openTaskSeenModal('${task.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>Topshiriqni ko'rdim deb tasdiqlash
        </button>
      `;
    } else {
      const seenTimeStr = new Date(task.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      seenStatusHtml = `
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 6px 10px; font-size: 11.5px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;">
          <span style="font-weight: 600; color: #15803D; display: inline-flex; align-items: center; gap: 4px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>Ko'rdingiz: ${seenTimeStr}
          </span>
          ${task.seenResponseText ? `<span style="color: #475569; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">"${escapeHtml(task.seenResponseText)}"</span>` : ''}
          ${task.seenResponseVoiceBase64 ? `<audio controls src="data:audio/mp4;base64,${task.seenResponseVoiceBase64}" class="compact-audio-player" style="max-width: 120px; height: 26px;"></audio>` : ''}
        </div>
      `;
    }

    // Action button based on state
    let actionBtnHtml = seenStatusHtml;
    if (task.status === 'PENDING_RED') {
      actionBtnHtml += `
        <button class="btn btn-yellow" onclick="workerStartTask('${task.id}')" style="margin-top: 4px; padding: 8px 12px; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Ishni Boshladim
        </button>
      `;
    } else if (task.status === 'IN_PROGRESS_YELLOW') {
      actionBtnHtml += `
        <button class="btn btn-green" onclick="openWorkerCompleteModal('${task.id}')" style="margin-top: 4px; padding: 8px 12px; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>Ishni Tugatdim
        </button>
      `;
    } else if (task.status === 'COMPLETED_GREEN') {
      actionBtnHtml += `
        <div style="background: var(--status-green-bg); color: var(--status-green); padding: 6px 10px; border-radius: 6px; font-weight: 600; font-size: 11.5px; text-align: center; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span class="badge-dot" style="background: var(--status-green);"></span>Ish tugatildi! Hokim tekshiruvi kutilmoqda.
        </div>
      `;
    } else if (task.status === 'INSPECTED_BLUE') {
      actionBtnHtml += `
        <div style="background: var(--status-blue-bg); color: var(--status-blue); padding: 6px 10px; border-radius: 6px; font-weight: 600; font-size: 11.5px; text-align: center; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <span class="badge-dot" style="background: var(--status-blue);"></span>Hokim tekshirdi va tasdiqladi!
        </div>
      `;
    }

    // Worker Completion Note
    let completionNoteHtml = '';
    if (task.completionNotes) {
      completionNoteHtml = `
        <div class="task-completion-note" style="margin-top: 4px; padding: 6px 10px; font-size: 11.5px;">
          <span class="note-label">Siz qoldirgan izoh:</span>
          <div>${escapeHtml(task.completionNotes)}</div>
        </div>
      `;
    }

    const taskVoices = (task.voiceList && Array.isArray(task.voiceList) && task.voiceList.length > 0)
      ? task.voiceList
      : (task.voiceBase64 ? [task.voiceBase64] : []);

    let taskVoicesHtml = '';
    if (taskVoices.length === 1) {
      taskVoicesHtml = `
        <div class="task-audio-pill">
          <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Rahbar ovozi:
          </span>
          <audio controls src="data:audio/mp4;base64,${taskVoices[0]}" class="compact-audio-player"></audio>
        </div>
      `;
    } else if (taskVoices.length > 1) {
      taskVoicesHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
          ${taskVoices.map((vB64, idx) => `
            <div class="task-audio-pill">
              <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Rahbar ovozi #${idx + 1}:
              </span>
              <audio controls src="data:audio/mp4;base64,${vB64}" class="compact-audio-player"></audio>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `
      <div class="task-card">
        <div class="task-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge ${badgeClass}"><span class="badge-dot"></span>${badgeText}</span>
            ${diff <= 0 && !isDone ? '<span class="badge-overdue"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px; margin-right:3px;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>Kechikkan</span>' : ''}
          </div>
          <div class="task-deadline-info">
            <span style="display: inline-flex; align-items: center; gap: 3px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>${dateFormatted}</span>
            ${remainingHtml}
          </div>
        </div>

        <div class="task-title">${escapeHtml(task.title || '')}</div>

        ${taskVoicesHtml}

        ${task.address ? `<div class="task-address"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px; margin-right:3px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>${escapeHtml(task.address)}</div>` : ''}
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        ${window.renderCardMediaGallery ? window.renderCardMediaGallery(task.mediaList) : ''}

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

// Worker Completion Media State
let workerCompleteMediaList = [];

function handleWorkerCompleteMediaPicked(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const processPromises = files.map(file => {
    if (window.processMediaFile) {
      return window.processMediaFile(file);
    }
    return Promise.resolve(null);
  });

  Promise.all(processPromises).then(results => {
    results.forEach(res => {
      if (res) workerCompleteMediaList.push(res);
    });
    if (window.renderModalMediaPreviews) {
      window.renderModalMediaPreviews(workerCompleteMediaList, 'worker-complete-media-preview', 'removeWorkerCompleteMedia');
    }
    event.target.value = '';
  });
}

function removeWorkerCompleteMedia(idx) {
  if (idx >= 0 && idx < workerCompleteMediaList.length) {
    workerCompleteMediaList.splice(idx, 1);
    if (window.renderModalMediaPreviews) {
      window.renderModalMediaPreviews(workerCompleteMediaList, 'worker-complete-media-preview', 'removeWorkerCompleteMedia');
    }
  }
}

window.handleWorkerCompleteMediaPicked = handleWorkerCompleteMediaPicked;
window.removeWorkerCompleteMedia = removeWorkerCompleteMedia;

// Complete task modal
function openWorkerCompleteModal(taskId) {
  completingTaskId = taskId;
  const task = window.store.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('complete-task-title').innerText = task.title || '';
  document.getElementById('complete-task-addr').innerText = 'Manzil: ' + (task.address || '');
  document.getElementById('complete-task-note').value = '';

  workerCompleteMediaList = [];
  if (window.renderModalMediaPreviews) {
    window.renderModalMediaPreviews(workerCompleteMediaList, 'worker-complete-media-preview', 'removeWorkerCompleteMedia');
  }

  document.getElementById('worker-complete-modal').classList.add('active');
}

async function confirmWorkerComplete() {
  if (!completingTaskId) return;
  const worker = window.store.currentUser;
  const task = window.store.tasks.find(t => t.id === completingTaskId);
  const notes = document.getElementById('complete-task-note').value.trim();

  const updates = {
    status: 'COMPLETED_GREEN',
    completionNotes: notes || null,
    completionMediaList: workerCompleteMediaList.length > 0 ? workerCompleteMediaList : null,
    completedAt: Date.now()
  };

  await window.dbApi.updateTask(completingTaskId, updates);

  // Send automatic chat message to Mayor with completion report!
  const mayor = window.store.users.find(u => u.id === (task ? task.mayorId : (worker.mayorId || '')));
  if (mayor) {
    const reportText = notes ? 
      `'${task.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi.\n\nXodim izohi: ${notes}\nManzil: ${task.address || ''}` :
      `'${task.title}' bo'yicha ishlar muvaffaqiyatli yakunlandi va topshirishga tayyor. (Manzil: ${task.address || ''})`;

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

    // Send attached completion media as messages too
    for (const m of workerCompleteMediaList) {
      const mediaMsg = {
        id: 'msg_media_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        senderId: worker.id,
        receiverId: mayor.id,
        senderName: worker.fullName || worker.firstName,
        messageType: m.type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        mediaPath: m.url || null,
        mediaBase64: m.url ? null : (m.base64 && m.base64.startsWith('data:') ? m.base64.split(',')[1] : m.base64),
        textContent: `Topshiriq hisoboti: ${task.title}`,
        timestamp: Date.now(),
        isRead: false
      };
      await window.dbApi.sendMessage(mediaMsg);
    }
  }

  workerCompleteMediaList = [];
  closeModal('worker-complete-modal');
  showToast("Topshiriq tugatildi! Izoh va fayllar Hokimga yuborildi.");
}
window.confirmCompleteTask = confirmWorkerComplete;
window.confirmWorkerComplete = confirmWorkerComplete;

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


// Task Seen Modal Logic
let acknowledgingTaskId = null;
let seenMediaRecorder = null;
let seenAudioChunks = [];
let seenVoiceBase64 = null;
let seenVoiceDuration = 0;
let seenRecordingTimer = null;
let seenRecordingSeconds = 0;

function openTaskSeenModal(taskId) {
  acknowledgingTaskId = taskId;
  const task = window.store.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('seen-task-title').innerText = task.title || 'Topshiriq';
  document.getElementById('seen-task-address').innerText = task.address ? ('Manzil: ' + task.address) : '';
  document.getElementById('seen-task-text').value = '';

  // Reset voice
  seenVoiceBase64 = null;
  seenVoiceDuration = 0;
  seenAudioChunks = [];
  const statusEl = document.getElementById('seen-voice-status');
  if (statusEl) statusEl.innerText = "Ovoz yozilmagan";
  const previewEl = document.getElementById('seen-voice-preview');
  if (previewEl) { previewEl.style.display = 'none'; previewEl.src = ''; }
  const btnEl = document.getElementById('seen-voice-btn');
  if (btnEl) {
    btnEl.innerText = "Ovoz yozish";
    btnEl.className = "btn btn-outline";
  }
  const delBtn = document.getElementById('seen-voice-del-btn');
  if (delBtn) delBtn.style.display = 'none';

  document.getElementById('task-seen-modal').classList.add('active');
}

function deleteSeenVoiceRecording() {
  if (seenRecordingTimer) clearInterval(seenRecordingTimer);
  if (seenMediaRecorder && seenMediaRecorder.state !== 'inactive') {
    seenMediaRecorder.stop();
  }
  seenVoiceBase64 = null;
  seenVoiceDuration = 0;
  seenAudioChunks = [];

  const btn = document.getElementById('seen-voice-btn');
  const statusEl = document.getElementById('seen-voice-status');
  const preview = document.getElementById('seen-voice-preview');
  const delBtn = document.getElementById('seen-voice-del-btn');

  if (btn) {
    btn.innerText = "Ovoz yozish";
    btn.className = "btn btn-outline";
  }
  if (statusEl) statusEl.innerText = "Ovoz yozilmagan";
  if (preview) {
    preview.style.display = 'none';
    preview.src = '';
  }
  if (delBtn) delBtn.style.display = 'none';
  showToast("Ovoz o'chirildi");
}

async function toggleSeenVoiceRecording() {
  const btn = document.getElementById('seen-voice-btn');
  const statusEl = document.getElementById('seen-voice-status');
  const preview = document.getElementById('seen-voice-preview');
  const delBtn = document.getElementById('seen-voice-del-btn');

  if (seenMediaRecorder && seenMediaRecorder.state === 'recording') {
    // Stop recording
    seenMediaRecorder.stop();
    clearInterval(seenRecordingTimer);
    btn.innerText = "Qayta yozish";
    btn.classList.remove('btn-red');
    btn.classList.add('btn-outline');
    if (delBtn) delBtn.style.display = 'inline-flex';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    seenAudioChunks = [];
    seenMediaRecorder = new MediaRecorder(stream);
    
    seenMediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) seenAudioChunks.push(e.data);
    };

    seenMediaRecorder.onstop = async () => {
      const audioBlob = new Blob(seenAudioChunks, { type: 'audio/mp4' });
      seenVoiceDuration = seenRecordingSeconds;
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        const base64Data = reader.result.split(',')[1];
        seenVoiceBase64 = base64Data;
        if (preview) {
          preview.src = reader.result;
          preview.style.display = 'block';
        }
        if (statusEl) statusEl.innerText = `Yozildi (${seenRecordingSeconds}s)`;
        if (delBtn) delBtn.style.display = 'inline-flex';
      };
      stream.getTracks().forEach(t => t.stop());
    };

    seenMediaRecorder.start();
    seenRecordingSeconds = 0;
    if (statusEl) statusEl.innerText = "Yozilmoqda: 0s";
    btn.innerText = "To'xtatish";
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-red');
    if (delBtn) delBtn.style.display = 'inline-flex';

    seenRecordingTimer = setInterval(() => {
      seenRecordingSeconds++;
      if (statusEl) statusEl.innerText = `Yozilmoqda: ${seenRecordingSeconds}s`;
    }, 1000);

  } catch (err) {
    alert("Mikrofonni yoqish imkoni bo'lmadi: " + err.message);
  }
}

async function confirmTaskSeen() {
  if (!acknowledgingTaskId) return;
  const task = window.store.tasks.find(t => t.id === acknowledgingTaskId);
  if (!task) return;

  const now = Date.now();
  const text = document.getElementById('seen-task-text').value.trim();
  const worker = window.store.currentUser;

  // Update in Firebase & local
  const updates = {
    seenAt: now,
    seenResponseText: text || null,
    seenResponseVoiceBase64: seenVoiceBase64 || null,
    seenResponseVoiceDuration: seenVoiceDuration || 0
  };

  task.seenAt = now;
  task.seenResponseText = text || null;
  task.seenResponseVoiceBase64 = seenVoiceBase64 || null;
  task.seenResponseVoiceDuration = seenVoiceDuration || 0;

  try {
    if (window.firebaseRtdb) {
      await window.firebaseRtdb.ref(`tasks/${task.id}`).update(updates);
    }
  } catch (e) {
    console.warn("RTDB update error:", e);
  }

  // Also send message to Mayor in Chat
  if (task.mayorId && worker) {
    let chatText = `Topshiriq ko'rildi: "${task.title}"`;
    if (text) chatText += `\nJavob: ${text}`;

    const textMsg = {
      id: 'msg_' + Date.now(),
      senderId: worker.id,
      receiverId: task.mayorId,
      senderName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
      messageType: 'TEXT',
      textContent: chatText,
      timestamp: now,
      isRead: false
    };

    window.store.messages.push(textMsg);
    if (window.firebaseRtdb) {
      window.firebaseRtdb.ref(`messages/${textMsg.id}`).set(textMsg);
    }

    if (seenVoiceBase64) {
      const voiceMsg = {
        id: 'msg_' + (Date.now() + 1),
        senderId: worker.id,
        receiverId: task.mayorId,
        senderName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
        messageType: 'VOICE',
        textContent: `Topshiriq bo'yicha ovozli javob: "${task.title}"`,
        mediaBase64: seenVoiceBase64,
        audioDurationSec: seenVoiceDuration,
        timestamp: now + 1,
        isRead: false
      };
      window.store.messages.push(voiceMsg);
      if (window.firebaseRtdb) {
        window.firebaseRtdb.ref(`messages/${voiceMsg.id}`).set(voiceMsg);
      }
    }
  }

  closeModal('task-seen-modal');
  showToast("Topshiriq ko'rildi deb tasdiqlandi va Hokimga yetkazildi!");
  renderWorkerTasks();
}
