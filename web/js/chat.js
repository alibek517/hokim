// IJRO Web Realtime Chat Engine
let activeChatPeer = null;
let editingMessageId = null;
let selectedMessage = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function openChat(peer, updateUrl = true) {
  if (!peer) return;
  activeChatPeer = peer;

  const orgPrefix = peer.position ? `[${peer.position}] ` : '';
  const fullName = orgPrefix + (peer.fullName || ((peer.firstName || '') + ' ' + (peer.lastName || '')).trim() || peer.username || 'Foydalanuvchi');
  const roleText = peer.role === 'MAYOR' ? 'Tuman Hokimi' : (peer.position || 'Xodim');

  const nameEl = document.getElementById('chat-header-name') || document.getElementById('chat-peer-name');
  if (nameEl) nameEl.innerText = fullName;

  const roleEl = document.getElementById('chat-header-status') || document.getElementById('chat-peer-role');
  if (roleEl) roleEl.innerText = roleText;

  const avatarEl = document.getElementById('chat-avatar');
  if (avatarEl) avatarEl.innerText = fullName.charAt(0).toUpperCase();

  const callBtn = document.getElementById('chat-header-call-btn');
  if (callBtn) {
    if (peer.phone) {
      callBtn.href = 'tel:' + peer.phone;
      callBtn.style.display = 'inline-flex';
      callBtn.title = (peer.phone) + " ga qo'ng'iroq qilish";
    } else {
      callBtn.style.display = 'none';
    }
  }
  
  showScreen('chat-screen');
  renderChatMessages();

  if (window.store.currentUser && window.dbApi && window.dbApi.markMessagesAsRead) {
    window.dbApi.markMessagesAsRead(window.store.currentUser.id, peer.id);
  }

  if (updateUrl && typeof navigateTo === 'function') {
    navigateTo('/chat?userId=' + encodeURIComponent(peer.id));
  }
}

function closeChat(updateUrl = true) {
  activeChatPeer = null;
  cancelEditing();
  if (updateUrl && typeof navigateTo === 'function') {
    if (window.store.currentUser) {
      if (window.store.currentUser.role === 'MAYOR') navigateTo('/mayor/chats');
      else if (window.store.currentUser.role === 'WORKER') navigateTo('/worker');
      else navigateTo('/admin');
    } else {
      navigateTo('/login');
    }
  } else if (window.store.currentUser) {
    if (window.store.currentUser.role === 'MAYOR') showScreen('mayor-screen');
    else if (window.store.currentUser.role === 'WORKER') showScreen('worker-screen');
    else showScreen('admin-screen');
  }
}

function renderChatMessages() {
  if (!activeChatPeer || !window.store.currentUser) return;
  const container = document.getElementById('chat-messages-container');
  if (!container) return;

  const myId = window.store.currentUser.id;
  const peerId = activeChatPeer.id;

  const conversationMessages = window.store.messages.filter(m => 
    (m.senderId === myId && m.receiverId === peerId) ||
    (m.senderId === peerId && m.receiverId === myId)
  ).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (conversationMessages.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94A3B8; margin: auto; font-size: 13px;">Muloqot boshlanmagan. Xabar, rasm yoki ovoz yuboring!</div>';
    return;
  }

  let html = '';
  conversationMessages.forEach(m => {
    const isMe = m.senderId === myId;
    const timeStr = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isRead = m.isRead || m.read;
    const isEdited = m.isEdited || m.edited;

    let contentHtml = '';
    if (m.messageType === 'IMAGE') {
      const src = m.mediaBase64 ? ('data:image/jpeg;base64,' + m.mediaBase64) : (m.mediaPath || '');
      contentHtml = '<img src="' + src + '" style="width: 100%; max-height: 240px; border-radius: 8px; object-fit: cover; margin-bottom: 4px;" onclick="viewFullImage(\'' + src + '\')"/>';
    } else if (m.messageType === 'VIDEO') {
      const src = m.mediaBase64 ? ('data:video/mp4;base64,' + m.mediaBase64) : (m.mediaPath || '');
      contentHtml = '<div style="background: rgba(37,99,235,0.1); border-radius: 8px; padding: 10px; display: flex; align-items: center; gap: 10px; cursor: pointer;" onclick="playVideo(\'' + src + '\')">' +
        '<div style="width: 36px; height: 36px; border-radius: 18px; background: #2563EB; display: flex; align-items: center; justify-content: center; color: white;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>' +
        '<div><div style="font-weight: bold; font-size: 13px; color: #0F172A; display: flex; align-items: center; gap: 4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>Video fayl</div>' +
        '<div style="font-size: 11px; color: #2563EB;">Ko\'rish uchun bosing</div></div></div>';
    } else if (m.messageType === 'VOICE') {
      const src = m.mediaBase64 ? ('data:audio/mp4;base64,' + m.mediaBase64) : (m.mediaPath || '');
      contentHtml = '<div style="display: flex; align-items: center; gap: 10px; padding: 4px;">' +
        '<button class="icon-btn" style="background: #2563EB; color: white; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;" onclick="playAudio(\'' + src + '\', this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>' +
        '<div><div style="font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Ovozli xabar</div>' +
        '<div style="font-size: 11px; color: #2563EB;">' + (m.audioDurationSec || 3) + ' sek</div></div></div>';
    } else {
      contentHtml = '<div>' + escapeHtml(m.textContent || '') + '</div>';
    }

    const singleTickSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    const doubleTickSvg = '<svg width="15" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>';
    const ticksHtml = isMe ? ('<span class="ticks ' + (isRead ? 'read' : '') + '">' + (isRead ? doubleTickSvg : singleTickSvg) + '</span>') : '';
    const editedHtml = isEdited ? '<span class="msg-edited-tag">tahrirlandi</span>' : '';

    html += '<div class="message-bubble ' + (isMe ? 'msg-outgoing' : 'msg-incoming') + '" onclick="onMessageClicked(\'' + m.id + '\')">' +
      contentHtml +
      '<div class="msg-footer">' +
        editedHtml +
        '<span>' + timeStr + '</span>' +
        ticksHtml +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// Sending message (Text, Edit, or Media)
async function sendChatMessage() {
  const input = document.getElementById('chat-text-input');
  const text = input.value.trim();
  if (!text || !activeChatPeer || !window.store.currentUser) return;

  if (editingMessageId) {
    await window.dbApi.editMessage(editingMessageId, text);
    cancelEditing();
    showToast('Xabar tahrirlandi');
  } else {
    const msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderId: window.store.currentUser.id,
      receiverId: activeChatPeer.id,
      senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
      messageType: 'TEXT',
      textContent: text,
      timestamp: Date.now(),
      isRead: false,
      read: false
    };
    await window.dbApi.sendMessage(msg);
  }

  input.value = '';
  input.style.height = '';
}

function onMessageClicked(msgId) {
  const msg = window.store.messages.find(m => m.id === msgId);
  if (!msg) return;
  selectedMessage = msg;

  const isMe = msg.senderId === window.store.currentUser.id;
  const modal = document.getElementById('message-actions-modal');
  const editBtn = document.getElementById('msg-action-edit');
  const deleteBtn = document.getElementById('msg-action-delete');

  if (isMe && msg.messageType === 'TEXT') {
    editBtn.style.display = 'flex';
  } else {
    editBtn.style.display = 'none';
  }

  deleteBtn.innerText = isMe ? "O'chirish (Hamma uchun)" : "Xabarni o'chirish";
  modal.classList.add('active');
}

function startEditingSelectedMessage() {
  if (!selectedMessage) return;
  closeMessageActionsModal();

  editingMessageId = selectedMessage.id;
  const editBar = document.getElementById('edit-preview-bar');
  const editText = document.getElementById('edit-preview-text');
  const input = document.getElementById('chat-text-input');

  editText.innerText = selectedMessage.textContent || '';
  input.value = selectedMessage.textContent || '';
  editBar.classList.add('active');
  input.focus();
}

function cancelEditing() {
  editingMessageId = null;
  const editBar = document.getElementById('edit-preview-bar');
  const input = document.getElementById('chat-text-input');
  if (editBar) editBar.classList.remove('active');
  if (input) {
    input.value = '';
    input.style.height = '';
  }
}

function deleteSelectedMessage() {
  if (!selectedMessage) return;
  const id = selectedMessage.id;
  closeMessageActionsModal();

  if (confirm("Haqiqatan ham bu xabarni o'chirib tashlamoqchimisiz?")) {
    window.dbApi.deleteMessage(id);
    if (editingMessageId === id) cancelEditing();
    showToast("Xabar o'chirildi");
  }
}

function closeMessageActionsModal() {
  const modal = document.getElementById('message-actions-modal');
  if (modal) modal.classList.remove('active');
}

// ─── RTDB Media Chunking & Base64 yuklash (Firebase Storage cheklovisiz) ────
window._chunkedBlobCache = window._chunkedBlobCache || {};

async function saveMediaToFirebaseChunks(file, progressCb) {
  const db = window.firebaseRtdb;
  const mediaId = 'med_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const dataUrl = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const base64Data = dataUrl.split(',')[1];
  const mimeType = file.type || (dataUrl.split(';')[0].split(':')[1]) || 'video/mp4';
  const CHUNK_SIZE = 350000; // 350KB per chunk
  const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

  if (db) {
    await db.ref(`media_chunks/${mediaId}/meta`).set({
      id: mediaId,
      mimeType: mimeType,
      name: file.name || 'media',
      totalChunks: totalChunks,
      size: file.size || base64Data.length,
      createdAt: Date.now()
    });

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await db.ref(`media_chunks/${mediaId}/chunks/${i}`).set(chunk);
      if (typeof progressCb === 'function') progressCb(Math.round(((i + 1) / totalChunks) * 100));
    }
  }

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  window._chunkedBlobCache[mediaId] = blobUrl;

  return { mediaId, mimeType, blobUrl };
}
window.saveMediaToFirebaseChunks = saveMediaToFirebaseChunks;

async function loadChunkedMedia(mediaId, mimeType = 'video/mp4') {
  if (!mediaId) return '';
  if (window._chunkedBlobCache && window._chunkedBlobCache[mediaId]) {
    return window._chunkedBlobCache[mediaId];
  }
  const db = window.firebaseRtdb;
  if (!db) return '';

  try {
    const metaSnap = await db.ref(`media_chunks/${mediaId}/meta`).once('value');
    const meta = metaSnap.val() || {};
    const actualMime = meta.mimeType || mimeType;
    const totalChunks = meta.totalChunks || 1;

    const chunksSnap = await db.ref(`media_chunks/${mediaId}/chunks`).once('value');
    const chunksVal = chunksSnap.val() || {};
    let fullBase64 = '';
    for (let i = 0; i < totalChunks; i++) {
      fullBase64 += (chunksVal[i] || '');
    }

    const byteCharacters = atob(fullBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: actualMime });
    const blobUrl = URL.createObjectURL(blob);
    window._chunkedBlobCache[mediaId] = blobUrl;
    return blobUrl;
  } catch (err) {
    console.warn('loadChunkedMedia error:', err);
    return '';
  }
}
window.loadChunkedMedia = loadChunkedMedia;

async function handleImagePicked(e) {
  const file = e.target.files[0];
  if (!file || !activeChatPeer || !window.store.currentUser) return;
  e.target.value = '';

  showToast('Rasm yuklanmoqda...');
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const msg = {
      id: 'msg_img_' + Date.now(),
      senderId: window.store.currentUser.id,
      receiverId: activeChatPeer.id,
      senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
      messageType: 'IMAGE',
      mediaPath: null,
      mediaBase64: base64,
      timestamp: Date.now(),
      isRead: false
    };
    await window.dbApi.sendMessage(msg);
    if (typeof playNotificationSound === 'function') playNotificationSound('send');
    showToast('Rasm yuborildi ✓');
  } catch (err) {
    console.error('Rasm yuborishda xatolik:', err);
    showToast('Xatolik: rasm yuborilmadi');
  }
}

async function handleVideoPicked(e) {
  const file = e.target.files[0];
  if (!file || !activeChatPeer || !window.store.currentUser) return;
  e.target.value = '';

  showToast('Video yuklanmoqda... (bir oz kuting)');
  try {
    let uploadFile = file;
    // Katta videolarni brauzerda siqish
    if (file.size > 3 * 1024 * 1024 && typeof compressVideoInBrowser === 'function') {
      try {
        uploadFile = await compressVideoInBrowser(file);
      } catch (_) { uploadFile = file; }
    }

    let mediaPath = null;
    let mediaBase64 = null;

    if (uploadFile.size > 2 * 1024 * 1024) {
      // 2MB dan katta videolarni xavfsiz qismlar (chunks) qilib saqlash
      showToast('Video yuklanmoqda...');
      const chunkRes = await saveMediaToFirebaseChunks(uploadFile, (p) => {
        if (p % 25 === 0) showToast(`Video yuklanmoqda: ${p}%`);
      });
      mediaPath = 'chunk:' + chunkRes.mediaId;
    } else {
      // 2MB dan kichik videolarni to'g'ridan-to'g'ri Base64 saqlash
      mediaBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
    }

    const msg = {
      id: 'msg_vid_' + Date.now(),
      senderId: window.store.currentUser.id,
      receiverId: activeChatPeer.id,
      senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
      messageType: 'VIDEO',
      mediaPath: mediaPath,
      mediaBase64: mediaBase64,
      timestamp: Date.now(),
      isRead: false
    };
    await window.dbApi.sendMessage(msg);
    if (typeof playNotificationSound === 'function') playNotificationSound('send');
    showToast('Video yuborildi ✓');
  } catch (err) {
    console.error('Video yuborishda xatolik:', err);
    showToast('Xatolik: video yuborilmadi. ' + (err.message || ''));
  }
}

function openAttachChoiceModal() {
  const modal = document.getElementById('attach-choice-modal');
  if (modal) modal.classList.add('active');
}

let chatVoiceStream = null;
let chatVoiceRecorder = null;
let chatVoiceChunks = [];
let chatVoiceTimerId = null;
let chatVoiceStartTime = 0;

async function startChatVoiceRecording() {
  if (!activeChatPeer || !window.store.currentUser) return;
  try {
    chatVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chatVoiceChunks = [];
    chatVoiceRecorder = new MediaRecorder(chatVoiceStream);

    chatVoiceRecorder.ondataavailable = e => {
      if (e.data.size > 0) chatVoiceChunks.push(e.data);
    };

    chatVoiceStartTime = Date.now();

    const normalBar = document.getElementById('chat-normal-input-bar');
    const recBar = document.getElementById('chat-recording-bar');
    const timerEl = document.getElementById('chat-recording-timer');

    if (normalBar) normalBar.style.display = 'none';
    if (recBar) recBar.style.display = 'flex';
    if (timerEl) timerEl.innerText = 'Yozilmoqda: 0s';

    chatVoiceTimerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - chatVoiceStartTime) / 1000);
      if (timerEl) timerEl.innerText = `Yozilmoqda: ${elapsed}s`;
    }, 1000);

    chatVoiceRecorder.start();
  } catch (err) {
    console.error("Mic error:", err);
    alert("Mikrofondan foydalanishga ruxsat berilmadi: " + err.message);
  }
}

function cancelChatVoiceRecording() {
  if (chatVoiceTimerId) clearInterval(chatVoiceTimerId);
  if (chatVoiceRecorder && chatVoiceRecorder.state !== 'inactive') {
    chatVoiceRecorder.stop();
  }
  if (chatVoiceStream) {
    chatVoiceStream.getTracks().forEach(t => t.stop());
    chatVoiceStream = null;
  }
  chatVoiceChunks = [];

  const normalBar = document.getElementById('chat-normal-input-bar');
  const recBar = document.getElementById('chat-recording-bar');
  if (normalBar) normalBar.style.display = 'flex';
  if (recBar) recBar.style.display = 'none';

  showToast("Ovoz o'chirildi");
}

async function sendChatVoiceRecording() {
  if (!chatVoiceRecorder || !activeChatPeer || !window.store.currentUser) return;

  if (chatVoiceTimerId) clearInterval(chatVoiceTimerId);
  const durationSec = Math.max(1, Math.round((Date.now() - chatVoiceStartTime) / 1000));
  showToast("Ovozli xabar yuborilmoqda...");

  chatVoiceRecorder.onstop = async () => {
    try {
      const audioBlob = new Blob(chatVoiceChunks, { type: 'audio/mp4' });
      // Direct base64 conversion - avoid Firebase Storage CORS and missing bucket errors
      const mediaBase64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(audioBlob);
      });

      const msg = {
        id: 'msg_voice_' + Date.now(),
        senderId: window.store.currentUser.id,
        receiverId: activeChatPeer.id,
        senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
        messageType: 'VOICE',
        mediaPath: null,
        mediaBase64: mediaBase64,
        audioDurationSec: durationSec,
        timestamp: Date.now(),
        isRead: false
      };
      await window.dbApi.sendMessage(msg);
      if (typeof playNotificationSound === 'function') playNotificationSound('send');
      showToast('Ovozli xabar yuborildi!');
    } catch (e) {
      console.error("Chat voice send error:", e);
      alert("Ovoz yuborishda xatolik yuz berdi");
    } finally {
      if (chatVoiceStream) {
        chatVoiceStream.getTracks().forEach(t => t.stop());
        chatVoiceStream = null;
      }
    }
  };

  if (chatVoiceRecorder.state !== 'inactive') {
    chatVoiceRecorder.stop();
  }

  const normalBar = document.getElementById('chat-normal-input-bar');
  const recBar = document.getElementById('chat-recording-bar');
  if (normalBar) normalBar.style.display = 'flex';
  if (recBar) recBar.style.display = 'none';
}

// Legacy alias for compatibility
function toggleVoiceRecording() {
  startChatVoiceRecording();
}

let currentPlayingAudio = null;
function playAudio(src, btn) {
  if (currentPlayingAudio) {
    currentPlayingAudio.pause();
    currentPlayingAudio = null;
  }
  const audio = new Audio(src);
  currentPlayingAudio = audio;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  audio.play();
  audio.onended = () => {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    currentPlayingAudio = null;
  };
}

async function playVideo(src) {
  const player = document.getElementById('video-player-modal');
  const video = document.getElementById('full-video-element');
  if (!player || !video) return;

  let finalSrc = src;
  if (src && src.startsWith('chunk:')) {
    const mediaId = src.replace('chunk:', '');
    if (typeof showToast === 'function') showToast('Video yuklanmoqda...');
    if (typeof loadChunkedMedia === 'function') {
      finalSrc = await loadChunkedMedia(mediaId);
    }
  }

  if (!finalSrc) {
    if (typeof showToast === 'function') showToast('Videoni ochishda xatolik yuz berdi');
    return;
  }

  video.src = finalSrc;
  player.classList.add('active');
  video.play().catch(e => console.warn('Video playback warning:', e));
}

function closeVideoModal() {
  const player = document.getElementById('video-player-modal');
  const video = document.getElementById('full-video-element');
  if (video) {
    video.pause();
    video.src = '';
  }
  if (player) {
    player.classList.remove('active');
  }
}
window.playVideo = playVideo;
window.closeVideoModal = closeVideoModal;

function openImageViewer(src) {
  const modal = document.getElementById('image-viewer-modal');
  const img = document.getElementById('full-image-element');
  if (modal && img) {
    img.src = src;
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeImageViewerModal() {
  const modal = document.getElementById('image-viewer-modal');
  const img = document.getElementById('full-image-element');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  if (img) img.src = '';
}

function viewFullImage(src) {
  openImageViewer(src);
}

window.openImageViewer = openImageViewer;
window.closeImageViewerModal = closeImageViewerModal;

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.onStoreChange('messages', () => {
  if (activeChatPeer) {
    renderChatMessages();
    window.dbApi.markMessagesAsRead(window.store.currentUser.id, activeChatPeer.id);
  }
});

window.openChat = openChat;
window.closeChat = closeChat;
window.goBackFromChat = closeChat;