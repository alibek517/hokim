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
              <div style="font-size: 22px; font-weight: 800; color: white;">${stats.totalTasks === 0 ? '0.0 / 10 ⚪' : stats.score + ' / 10 ⭐'}</div>
            </div>
            <div style="background: ${scoreBadgeBg}; color: ${scoreBadgeColor}; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800;">
              ${stats.gradeText}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #334155;">
            <span style="color: #38BDF8;">🔍 Tekshirildi: <b>${stats.inspectedTasks} ta (+${stats.inspectedTasks * 0.5}⭐)</b></span>
            <span style="color: #4ADE80;">🚀 Erta: <b>${stats.earlyCompletedTasks} ta</b></span>
            <span style="color: ${stats.lateCompletedTasks > 0 ? '#F87171' : '#94A3B8'};">⏰ Kech: <b>${stats.lateCompletedTasks} ta</b></span>
          </div>
          ${stats.hasLoggedIn ? (
            stats.daysInactive >= 2 ? `
              <div style="margin-top: 8px; background: #450A0A; color: #FCA5A5; font-size: 10px; padding: 4px 8px; border-radius: 6px;">
                ⚠️ Ilovaga ${stats.daysInactive} kundan beri kirmagansiz (-${stats.inactivityPenalty} ball jarima)
              </div>
            ` : (stats.daysInactive === 1 ? `
              <div style="margin-top: 8px; background: #713F12; color: #FEF08A; font-size: 10px; padding: 4px 8px; border-radius: 6px;">
                ℹ️ Kecha kirgansiz (Bugungi faollik kutilmoqda)
              </div>
            ` : `
              <div style="margin-top: 8px; background: #14532D; color: #BBF7D0; font-size: 10px; padding: 4px 8px; border-radius: 6px;">
                🟢 Bugun ilovada faol bo'ldingiz
              </div>
            `)
          ) : `
            <div style="margin-top: 8px; background: #334155; color: #CBD5E1; font-size: 10px; padding: 4px 8px; border-radius: 6px;">
              ⚪ Yangi biriktirilgan (Hali ilovaga kirmagan)
            </div>
          `}
          <div style="font-size: 10px; color: #94A3B8; margin-top: 6px;">
            💡 Eslatma: Ball faqat Hokim topshiriqni tekshirib tasdiqlaganida (+0.5 ball) beriladi! Boshlash yoki tugatishning o'ziga ball berilmaydi.
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

        remainingHtml = `<span>• ⏳ ${timeStr}</span>`;
      }
    }

    const dateFormatted = new Date(task.endDate || Date.now()).toLocaleString([], {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // 0. Seen status / confirmation
    let seenStatusHtml = '';
    if (!task.seenAt) {
      seenStatusHtml = `
        <button class="btn btn-primary" style="margin-top: 4px; padding: 8px 12px; font-size: 13px;" onclick="openTaskSeenModal('${task.id}')">
          👁️ Topshiriqni ko'rdim deb tasdiqlash
        </button>
      `;
    } else {
      const seenTimeStr = new Date(task.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      seenStatusHtml = `
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 6px 10px; font-size: 11.5px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;">
          <span style="font-weight: 600; color: #15803D;">👁️ Ko'rdingiz: ${seenTimeStr}</span>
          ${task.seenResponseText ? `<span style="color: #475569; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">💬 "${escapeHtml(task.seenResponseText)}"</span>` : ''}
          ${task.seenResponseVoiceBase64 ? `<audio controls src="data:audio/mp4;base64,${task.seenResponseVoiceBase64}" class="compact-audio-player" style="max-width: 120px; height: 26px;"></audio>` : ''}
        </div>
      `;
    }

    // Action button based on state
    let actionBtnHtml = seenStatusHtml;
    if (task.status === 'PENDING_RED') {
      actionBtnHtml += `
        <button class="btn btn-yellow" onclick="workerStartTask('${task.id}')" style="margin-top: 4px; padding: 8px 12px; font-size: 13px;">
          ▶ Ishni Boshladim (Sariq)
        </button>
      `;
    } else if (task.status === 'IN_PROGRESS_YELLOW') {
      actionBtnHtml += `
        <button class="btn btn-green" onclick="openWorkerCompleteModal('${task.id}')" style="margin-top: 4px; padding: 8px 12px; font-size: 13px;">
          ✓ Ishni Tugatdim (Yashil)
        </button>
      `;
    } else if (task.status === 'COMPLETED_GREEN') {
      actionBtnHtml += `
        <div style="background: var(--status-green-bg); color: var(--status-green); padding: 6px 10px; border-radius: 6px; font-weight: 600; font-size: 11.5px; text-align: center; margin-top: 4px;">
          🟢 Ish tugatildi! Hokim tekshiruvi kutilmoqda.
        </div>
      `;
    } else if (task.status === 'INSPECTED_BLUE') {
      actionBtnHtml += `
        <div style="background: var(--status-blue-bg); color: var(--status-blue); padding: 6px 10px; border-radius: 6px; font-weight: 600; font-size: 11.5px; text-align: center; margin-top: 4px;">
          🔵 Hokim tekshirdi va tasdiqladi!
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
          <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap;">🎤 Rahbar ovozi:</span>
          <audio controls src="data:audio/mp4;base64,${taskVoices[0]}" class="compact-audio-player"></audio>
        </div>
      `;
    } else if (taskVoices.length > 1) {
      taskVoicesHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
          ${taskVoices.map((vB64, idx) => `
            <div class="task-audio-pill">
              <span style="font-size: 11px; font-weight: 600; color: #1D4ED8; white-space: nowrap;">🎤 Rahbar ovozi #${idx + 1}:</span>
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
            ${diff <= 0 && !isDone ? '<span class="badge-overdue">⚠️ Kechikkan</span>' : ''}
          </div>
          <div class="task-deadline-info">
            <span>📅 ${dateFormatted}</span>
            ${remainingHtml}
          </div>
        </div>

        <div class="task-title">${escapeHtml(task.title || '')}</div>

        ${taskVoicesHtml}

        ${task.address ? `<div class="task-address">📍 ${escapeHtml(task.address)}</div>` : ''}
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}

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
  document.getElementById('seen-task-address').innerText = '📍 ' + (task.address || '');
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
    btnEl.innerText = "🎤 Ovoz yozish";
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
    btn.innerText = "🎤 Ovoz yozish";
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
    btn.innerText = "🎤 Qayta yozish";
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
        if (statusEl) statusEl.innerText = `✅ Yozildi (${seenRecordingSeconds}s)`;
        if (delBtn) delBtn.style.display = 'inline-flex';
      };
      stream.getTracks().forEach(t => t.stop());
    };

    seenMediaRecorder.start();
    seenRecordingSeconds = 0;
    if (statusEl) statusEl.innerText = "🔴 Yozilmoqda: 0s";
    btn.innerText = "⏹️ To'xtatish";
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-red');
    if (delBtn) delBtn.style.display = 'inline-flex';

    seenRecordingTimer = setInterval(() => {
      seenRecordingSeconds++;
      if (statusEl) statusEl.innerText = `🔴 Yozilmoqda: ${seenRecordingSeconds}s`;
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
    let chatText = `👁️ Topshiriq ko'rildi: "${task.title}"`;
    if (text) chatText += `\n💬 Javob: ${text}`;

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
        textContent: `🎤 Topshiriq bo'yicha ovozli javob: "${task.title}"`,
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
