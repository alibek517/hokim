// IJRO Web Realtime Chat Engine
let activeChatPeer = null;
let editingMessageId = null;
let selectedMessage = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function openChat(peer, updateUrl = true) {
  activeChatPeer = peer;
  document.getElementById('chat-peer-name').innerText = peer.fullName || (peer.firstName + ' ' + peer.lastName);
  document.getElementById('chat-peer-role').innerText = peer.role === 'MAYOR' ? 'Tuman Hokimi' : (peer.position || 'Xodim');
  
  showScreen('chat-screen');
  renderChatMessages();

  if (window.store.currentUser) {
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
        '<div style="width: 36px; height: 36px; border-radius: 18px; background: #2563EB; display: flex; align-items: center; justify-content: center; color: white;">▶</div>' +
        '<div><div style="font-weight: bold; font-size: 13px; color: #0F172A;">🎥 Video fayl</div>' +
        '<div style="font-size: 11px; color: #2563EB;">Ko\'rish uchun bosing</div></div></div>';
    } else if (m.messageType === 'VOICE') {
      const src = m.mediaBase64 ? ('data:audio/mp4;base64,' + m.mediaBase64) : (m.mediaPath || '');
      contentHtml = '<div style="display: flex; align-items: center; gap: 10px; padding: 4px;">' +
        '<button class="icon-btn" style="background: #2563EB; color: white; width: 34px; height: 34px;" onclick="playAudio(\'' + src + '\', this)">▶</button>' +
        '<div><div style="font-weight: bold; font-size: 13px;">🎤 Ovozli xabar</div>' +
        '<div style="font-size: 11px; color: #2563EB;">' + (m.audioDurationSec || 3) + ' sek</div></div></div>';
    } else {
      contentHtml = '<div>' + escapeHtml(m.textContent || '') + '</div>';
    }

    const ticksHtml = isMe ? ('<span class="ticks ' + (isRead ? 'read' : '') + '">' + (isRead ? '✓✓' : '✓') + '</span>') : '';
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
  if (input) input.value = '';
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

function handleImagePicked(e) {
  const file = e.target.files[0];
  if (!file || !activeChatPeer || !window.store.currentUser) return;

  const reader = new FileReader();
  reader.onload = async function() {
    const base64 = reader.result.split(',')[1];
    const msg = {
      id: 'msg_img_' + Date.now(),
      senderId: window.store.currentUser.id,
      receiverId: activeChatPeer.id,
      senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
      messageType: 'IMAGE',
      mediaBase64: base64,
      timestamp: Date.now(),
      isRead: false
    };
    await window.dbApi.sendMessage(msg);
    showToast('Rasm yuborildi');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function handleVideoPicked(e) {
  const file = e.target.files[0];
  if (!file || !activeChatPeer || !window.store.currentUser) return;

  if (file.size > 25 * 1024 * 1024) {
    alert("Video hajmi 25 MB dan kichik bo'lishi lozim");
    return;
  }

  showToast('Video yuklanmoqda...');
  const reader = new FileReader();
  reader.onload = async function() {
    const base64 = reader.result.split(',')[1];
    const msg = {
      id: 'msg_vid_' + Date.now(),
      senderId: window.store.currentUser.id,
      receiverId: activeChatPeer.id,
      senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
      messageType: 'VIDEO',
      mediaBase64: base64,
      timestamp: Date.now(),
      isRead: false
    };
    await window.dbApi.sendMessage(msg);
    showToast('Video yuborildi');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
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
    if (timerEl) timerEl.innerText = '🔴 Yozilmoqda: 0s';

    chatVoiceTimerId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - chatVoiceStartTime) / 1000);
      if (timerEl) timerEl.innerText = `🔴 Yozilmoqda: ${elapsed}s`;
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
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const msg = {
          id: 'msg_voice_' + Date.now(),
          senderId: window.store.currentUser.id,
          receiverId: activeChatPeer.id,
          senderName: window.store.currentUser.fullName || window.store.currentUser.firstName,
          messageType: 'VOICE',
          mediaBase64: base64,
          audioDurationSec: durationSec,
          timestamp: Date.now(),
          isRead: false
        };
        await window.dbApi.sendMessage(msg);
        showToast('Ovozli xabar yuborildi!');
      };
      reader.readAsDataURL(audioBlob);
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
  btn.innerText = '⏸';
  audio.play();
  audio.onended = () => {
    btn.innerText = '▶';
    currentPlayingAudio = null;
  };
}

function playVideo(src) {
  const player = document.getElementById('video-player-modal');
  const video = document.getElementById('full-video-element');
  video.src = src;
  player.classList.add('active');
  video.play();
}

function closeVideoModal() {
  const player = document.getElementById('video-player-modal');
  const video = document.getElementById('full-video-element');
  video.pause();
  video.src = '';
  player.classList.remove('active');
}

function viewFullImage(src) {
  const w = window.open();
  w.document.write('<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="' + src + '" style="max-width:100%;max-height:100%;"></body>');
}

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