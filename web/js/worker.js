
// Rating calculation for workers (10-point scale)
function calculateWorkerStats(worker, allTasks, currentTime = Date.now()) {
  const workerTasks = (allTasks || []).filter(t => t.assignedWorkerId === worker.id);
  
  if (workerTasks.length === 0) {
    return {
      workerId: worker.id,
      score: 0.0,
      totalTasks: 0,
      completedTasks: 0,
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
  let earlyCompletedCount = 0;
  let lateCompletedCount = 0;
  let overduePendingCount = 0;
  let inProgressCount = 0;
  let earlyStartCount = 0;
  let sumTaskScores = 0.0;

  workerTasks.forEach(task => {
    const isCompleted = task.status === 'COMPLETED_GREEN' || task.status === 'INSPECTED_BLUE';
    const finishTime = task.completedAt || task.inspectedAt || task.endDate || Date.now();
    const allocatedDuration = Math.max(3600000, (task.endDate || 0) - (task.startDate || 0));

    const startedEarly = task.startedAt && task.startedAt <= (task.startDate || 0);
    if (startedEarly) earlyStartCount++;

    if (isCompleted) {
      completedCount++;
      if (finishTime <= task.endDate) {
        earlyCompletedCount++;
        const earlyRatio = Math.min(1.0, Math.max(0.0, (task.endDate - finishTime) / allocatedDuration));
        const bonus = (earlyRatio * 1.0) + (startedEarly ? 0.5 : 0.0);
        sumTaskScores += Math.min(10.0, 8.5 + bonus);
      } else {
        lateCompletedCount++;
        const overdueHours = (finishTime - task.endDate) / 3600000.0;
        sumTaskScores += Math.max(1.5, 5.0 - Math.min(3.5, overdueHours * 0.25));
      }
    } else {
      if (task.status === 'IN_PROGRESS_YELLOW') inProgressCount++;
      if (currentTime > (task.endDate || 0)) {
        overduePendingCount++;
        const overdueDays = (currentTime - task.endDate) / 86400000.0;
        sumTaskScores += Math.max(0.5, 3.0 - Math.min(2.5, overdueDays * 0.5));
      } else {
        if (task.startedAt && task.startedAt <= task.startDate) {
          sumTaskScores += 8.0;
        } else if (currentTime > task.startDate && task.status === 'PENDING_RED') {
          sumTaskScores += 4.5;
        } else {
          sumTaskScores += 7.0;
        }
      }
    }
  });

  const rawAverage = sumTaskScores / workerTasks.length;
  const lastActive = worker.lastActiveAt || worker.createdAt || currentTime;
  const daysInactive = Math.max(0, Math.floor((currentTime - lastActive) / 86400000));
  const inactivityPenalty = daysInactive >= 1 ? Math.min(4.0, daysInactive * 0.5) : 0.0;

  const finalScore = Math.max(0.5, Math.min(10.0, rawAverage - inactivityPenalty));
  const roundedScore = Math.round(finalScore * 10) / 10;

  let grade = "Qoniqarsiz (D)";
  if (roundedScore >= 9.0) grade = "O'ta tezkor (A+)";
  else if (roundedScore >= 8.0) grade = "A'lo (A)";
  else if (roundedScore >= 6.5) grade = "Yaxshi (B)";
  else if (roundedScore >= 5.0) grade = "O'rtacha (C)";

  return {
    workerId: worker.id,
    score: roundedScore,
    totalTasks: workerTasks.length,
    completedTasks: completedCount,
    earlyCompletedTasks: earlyCompletedCount,
    lateCompletedTasks: lateCompletedCount,
    overduePendingTasks: overduePendingCount,
    inProgressTasks: inProgressCount,
    daysInactive,
    inactivityPenalty,
    gradeText: grade,
    earlyStartTasks: earlyStartCount,
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
    if (stats.score >= 8.5) { scoreBadgeBg = '#DCFCE7'; scoreBadgeColor = '#166534'; }
    else if (stats.score >= 6.5) { scoreBadgeBg = '#E0F2FE'; scoreBadgeColor = '#0369A1'; }
    else if (stats.score >= 5.0) { scoreBadgeBg = '#FEF9C3'; scoreBadgeColor = '#854D0E'; }
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
            <span style="color: #4ADE80;">🚀 Erta: <b>${stats.earlyCompletedTasks} ta</b></span>
            <span style="color: #60A5FA;">⚡ Vaqtida: <b>${stats.earlyStartTasks} ta</b></span>
            <span style="color: ${stats.lateCompletedTasks > 0 ? '#F87171' : '#94A3B8'};">⏰ Kech: <b>${stats.lateCompletedTasks} ta</b></span>
          </div>
          ${stats.daysInactive >= 1 ? `
            <div style="margin-top: 8px; background: #450A0A; color: #FCA5A5; font-size: 10px; padding: 4px 8px; border-radius: 6px;">
              ⚠️ Ilovaga ${stats.daysInactive} kun kirmagansiz (-${stats.inactivityPenalty} ball jarima)
            </div>
          ` : ''}
          <div style="font-size: 10px; color: #94A3B8; margin-top: 6px;">
            💡 Eslatma: Ball faqat topshiriqni erta boshlab erta topshirganingizda oshadi!
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

    // 0. Seen status / confirmation
    let seenStatusHtml = '';
    if (!task.seenAt) {
      seenStatusHtml = `
        <button class="btn btn-primary" style="margin-bottom: 8px;" onclick="openTaskSeenModal('${task.id}')">
          👁️ Topshiriqni ko'rdim deb tasdiqlash
        </button>
      `;
    } else {
      const seenTimeStr = new Date(task.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      seenStatusHtml = `
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
          <div style="font-weight: bold; color: #15803D; font-size: 12px;">👁️ Topshiriqni ko'rdingiz: ${seenTimeStr}</div>
          ${task.seenResponseText ? `<div style="font-size: 12px; color: #0F172A; margin-top: 4px;">💬 Javobingiz: "${escapeHtml(task.seenResponseText)}"</div>` : ''}
          ${task.seenResponseVoiceBase64 ? `<audio controls src="data:audio/mp4;base64,${task.seenResponseVoiceBase64}" style="width: 100%; height: 36px; margin-top: 6px;"></audio>` : ''}
        </div>
      `;
    }

    // Action button based on state
    let actionBtnHtml = seenStatusHtml;
    if (task.status === 'PENDING_RED') {
      actionBtnHtml += `
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
  if (btnEl) btnEl.innerText = "🎤 Ovoz yozish";

  document.getElementById('task-seen-modal').classList.add('active');
}

async function toggleSeenVoiceRecording() {
  const btn = document.getElementById('seen-voice-btn');
  const statusEl = document.getElementById('seen-voice-status');
  const preview = document.getElementById('seen-voice-preview');

  if (seenMediaRecorder && seenMediaRecorder.state === 'recording') {
    // Stop recording
    seenMediaRecorder.stop();
    clearInterval(seenRecordingTimer);
    btn.innerText = "🎤 Qayta yozish";
    btn.classList.remove('btn-red');
    btn.classList.add('btn-outline');
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
      };
      stream.getTracks().forEach(t => t.stop());
    };

    seenMediaRecorder.start();
    seenRecordingSeconds = 0;
    if (statusEl) statusEl.innerText = "🔴 Yozilmoqda: 0s";
    btn.innerText = "⏹️ To'xtatish";
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-red');

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
