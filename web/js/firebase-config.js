// IJRO Firebase Realtime Database Integration
const FIREBASE_DB_URL = 'https://hokimlik-default-rtdb.firebaseio.com';

let database = null;
let isConnected = false;

// ============================================================================
// NOTIFICATION AUDIO & BROWSER ALERT ENGINE (Sound notification for Web)
// ============================================================================
let webNotificationAudioCtx = null;

function getAudioContext() {
  try {
    if (!webNotificationAudioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        webNotificationAudioCtx = new AudioContextClass();
      }
    }
    if (webNotificationAudioCtx && webNotificationAudioCtx.state === 'suspended') {
      webNotificationAudioCtx.resume().catch(() => {});
    }
    return webNotificationAudioCtx;
  } catch (e) {
    return null;
  }
}

// Foydalanuvchi birinchi marta ekranga bosganida audio tizimini uyg'otish
function unlockAudioOnGesture() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
window.addEventListener('click', unlockAudioOnGesture, { once: true });
window.addEventListener('touchstart', unlockAudioOnGesture, { once: true });

function playNotificationSound(type = 'default') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'message') {
      // 2 tonli yoqimli xabar signali (F#5 -> A5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now); // F#5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'task') {
      // 3 tonli e'tibor tortuvchi topshiriq signali (E5 -> G#5 -> B5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc1.frequency.setValueAtTime(830.61, now + 0.12); // G#5
      osc1.frequency.setValueAtTime(987.77, now + 0.24); // B5
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);
    } else {
      // Standart chime signali (D5 -> A5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.15); // A5
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {
    console.warn('Notification sound error:', e);
  }
}
window.playNotificationSound = playNotificationSound;

function triggerWebNotification(title, body, type = 'default') {
  // 1. Ovoz chiqarish
  playNotificationSound(type);

  // 2. Sayt ichidagi Toast xabarnomasi
  if (typeof showToast === 'function') {
    showToast(title + (body ? ': ' + body : ''));
  }

  // 3. Brauzer tizim bildirishnomasi (Desktop / Background tab)
  try {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: 'assets/icon-192.png',
        tag: 'ijro-notification-' + Date.now()
      });
    }
  } catch (_) {}
}
window.triggerWebNotification = triggerWebNotification;

// Synchronously restore saved session from localStorage so refresh stays on the exact page
let initialUser = null;
try {
  const savedUserJson = localStorage.getItem('ijro_user');
  if (savedUserJson) {
    const parsed = JSON.parse(savedUserJson);
    if (parsed && parsed.id) {
      initialUser = parsed;
    }
  }
} catch (e) {
  console.warn("Error restoring initial user:", e);
}

// Realtime In-Memory Stores
window.store = {
  users: [],
  tasks: [],
  schedules: [],
  messages: [],
  currentUser: initialUser
};

// Event Subscriptions
const listeners = {
  users: [],
  tasks: [],
  schedules: [],
  messages: [],
  messageAdded: [],
  messageUpdated: [],
  messageRemoved: []
};

function onStoreChange(key, callback) {
  if (listeners[key]) {
    listeners[key].push(callback);
  }
}

function notifyStore(key, data) {
  if (listeners[key]) {
    listeners[key].forEach(fn => fn(data));
  }
}

// Initialize Firebase
function initFirebase() {
  try {
    if (typeof firebase !== 'undefined') {
      const config = {
        databaseURL: FIREBASE_DB_URL,
        projectId: 'hokimlik'
      };
      
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      
      database = firebase.database();
      window.firebaseRtdb = database;

      // Polyfill setValue on Firebase Database Reference to prevent any runtime exceptions
      try {
        if (firebase.database.Reference && !firebase.database.Reference.prototype.setValue) {
          firebase.database.Reference.prototype.setValue = function(val, onComplete) {
            return this.set(val, onComplete);
          };
        }
      } catch (_) {}

      // Fast initial fetch of users for instant login capability
      fetch(FIREBASE_DB_URL + '/users.json')
        .then(r => r.json())
        .then(val => {
          if (val && (!window.store.users || window.store.users.length === 0)) {
            const list = Object.values(val);
            window.store.users = list;
            notifyStore('users', list);
          }
        })
        .catch(() => {});
      
      database.ref('.info/connected').on('value', snap => {
        isConnected = !!snap.val();
        console.log('Firebase RTDB status:', isConnected ? 'ONLINE' : 'OFFLINE');
      });

      // Track processed IDs to avoid playing sounds on initial data load
      let initialTasksLoaded = false;
      let initialMessagesLoaded = false;
      const seenTaskIds = new Set();
      const seenMessageIds = new Set();

      // 1. Users Listener
      database.ref('users').on('value', snap => {
        const val = snap.val();
        const list = val ? Object.values(val) : [];
        window.store.users = list;
        notifyStore('users', list);
      });

      // 2. Tasks Listener
      database.ref('tasks').on('value', snap => {
        const val = snap.val();
        const list = val ? Object.values(val) : [];

        if (!initialTasksLoaded) {
          list.forEach(t => { if (t && t.id) seenTaskIds.add(t.id); });
          initialTasksLoaded = true;
        } else {
          // Check for newly added or updated tasks that concern current user
          const currentUser = window.store.currentUser;
          if (currentUser) {
            list.forEach(task => {
              if (!task || !task.id) return;
              if (!seenTaskIds.has(task.id)) {
                seenTaskIds.add(task.id);
                // Worker: Yangi topshiriq biriktirildi
                if (currentUser.role === 'WORKER' && task.assignedWorkerId === currentUser.id) {
                  triggerWebNotification("Yangi topshiriq!", task.title || "Sizga yangi topshiriq biriktirildi", 'task');
                }
              }
            });
          }
        }

        window.store.tasks = list;
        notifyStore('tasks', list);
      });

      // 3. Schedules Listener
      database.ref('schedules').on('value', snap => {
        const val = snap.val();
        const list = val ? Object.values(val) : [];
        window.store.schedules = list;
        notifyStore('schedules', list);
      });

      // 4. Messages Listener
      database.ref('messages').on('value', snap => {
        const val = snap.val();
        const list = val ? Object.values(val) : [];
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        if (!initialMessagesLoaded) {
          list.forEach(m => { if (m && m.id) seenMessageIds.add(m.id); });
          initialMessagesLoaded = true;
        }

        window.store.messages = list;
        notifyStore('messages', list);
      });

      database.ref('messages').on('child_added', snap => {
        const msg = snap.val();
        if (msg) {
          if (initialMessagesLoaded && msg.id && !seenMessageIds.has(msg.id)) {
            seenMessageIds.add(msg.id);
            const currentUser = window.store.currentUser;
            // Faqat joriy foydalanuvchiga kelgan xabarlar uchun ovoz chiqarish
            if (currentUser && msg.receiverId === currentUser.id && msg.senderId !== currentUser.id) {
              const preview = msg.messageType === 'VOICE' ? 'Ovozli xabar' :
                              (msg.messageType === 'IMAGE' ? 'Rasm' :
                              (msg.messageType === 'VIDEO' ? 'Video' : (msg.textContent || 'Yangi xabar')));
              triggerWebNotification(msg.senderName || 'Yangi xabar', preview, 'message');
            }
          }
          notifyStore('messageAdded', msg);
        }
      });

      database.ref('messages').on('child_changed', snap => {
        const msg = snap.val();
        if (msg) notifyStore('messageUpdated', msg);
      });

      database.ref('messages').on('child_removed', snap => {
        notifyStore('messageRemoved', snap.key);
      });

      return;
    }
  } catch (err) {
    console.warn('Firebase SDK init failed, falling back to REST/Polling', err);
  }

  // REST Fallback (Polling every 2.5s)
  pollRestDatabase();
}

let restInitialLoaded = false;
const restSeenTaskIds = new Set();
const restSeenMessageIds = new Set();

async function pollRestDatabase() {
  try {
    const [uRes, tRes, sRes, mRes] = await Promise.all([
      fetch(FIREBASE_DB_URL + '/users.json').then(r => r.json()),
      fetch(FIREBASE_DB_URL + '/tasks.json').then(r => r.json()),
      fetch(FIREBASE_DB_URL + '/schedules.json').then(r => r.json()),
      fetch(FIREBASE_DB_URL + '/messages.json').then(r => r.json())
    ]);

    if (uRes) {
      window.store.users = Object.values(uRes);
      notifyStore('users', window.store.users);
    }
    if (tRes) {
      const taskList = Object.values(tRes);
      if (!restInitialLoaded) {
        taskList.forEach(t => { if (t && t.id) restSeenTaskIds.add(t.id); });
      } else {
        const currentUser = window.store.currentUser;
        if (currentUser && currentUser.role === 'WORKER') {
          taskList.forEach(t => {
            if (t && t.id && !restSeenTaskIds.has(t.id)) {
              restSeenTaskIds.add(t.id);
              if (t.assignedWorkerId === currentUser.id) {
                triggerWebNotification("Yangi topshiriq!", t.title || "Sizga yangi topshiriq biriktirildi", 'task');
              }
            }
          });
        }
      }
      window.store.tasks = taskList;
      notifyStore('tasks', window.store.tasks);
    }
    if (sRes) {
      window.store.schedules = Object.values(sRes);
      notifyStore('schedules', window.store.schedules);
    }
    if (mRes) {
      const list = Object.values(mRes).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
      if (!restInitialLoaded) {
        list.forEach(m => { if (m && m.id) restSeenMessageIds.add(m.id); });
        restInitialLoaded = true;
      } else {
        const currentUser = window.store.currentUser;
        if (currentUser) {
          list.forEach(m => {
            if (m && m.id && !restSeenMessageIds.has(m.id)) {
              restSeenMessageIds.add(m.id);
              if (m.receiverId === currentUser.id && m.senderId !== currentUser.id) {
                const preview = m.messageType === 'VOICE' ? 'Ovozli xabar' :
                                (m.messageType === 'IMAGE' ? 'Rasm' :
                                (m.messageType === 'VIDEO' ? 'Video' : (m.textContent || 'Yangi xabar')));
                triggerWebNotification(m.senderName || 'Yangi xabar', preview, 'message');
              }
            }
          });
        }
      }
      window.store.messages = list;
      notifyStore('messages', list);
    }
  } catch (e) {
    console.warn('REST poll error:', e);
  } finally {
    setTimeout(pollRestDatabase, 2500);
  }
}

// Database API Methods
const dbApi = {
  async updateTaskStatus(taskId, newStatus, notes) {
    const now = Date.now();
    const updates = { status: newStatus };
    if (newStatus === 'IN_PROGRESS_YELLOW') updates.startedAt = now;
    if (newStatus === 'COMPLETED_GREEN') {
      updates.completedAt = now;
      if (notes) updates.completionNotes = notes;
    }
    if (newStatus === 'INSPECTED_BLUE') updates.inspectedAt = now;

    if (database) {
      await database.ref('tasks/' + taskId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/tasks/' + taskId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async updateTaskVoice(taskId, voiceBase64, voiceDurationSec) {
    const localTask = (window.store.tasks || []).find(t => t.id === taskId);
    let voiceList = [];
    if (localTask) {
      if (Array.isArray(localTask.voiceList) && localTask.voiceList.length > 0) {
        voiceList = [...localTask.voiceList];
      } else if (localTask.voiceBase64) {
        voiceList = [localTask.voiceBase64];
      }
      if (voiceBase64) {
        voiceList.push(voiceBase64);
      }
      localTask.voiceList = voiceList;
      localTask.voiceBase64 = voiceList[0] || voiceBase64;
      localTask.voiceDurationSec = voiceDurationSec || localTask.voiceDurationSec || 0;
    } else {
      voiceList = voiceBase64 ? [voiceBase64] : [];
    }

    const updates = {
      voiceBase64: voiceList[0] || voiceBase64,
      voiceList: voiceList,
      voiceDurationSec: voiceDurationSec || 0
    };

    if (database) {
      await database.ref('tasks/' + taskId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/tasks/' + taskId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async createTask(task) {
    const id = task.id || ('task_' + Date.now());
    task.id = id;
    if (task.voiceBase64 && (!task.voiceList || task.voiceList.length === 0)) {
      task.voiceList = [task.voiceBase64];
    }
    if (database) {
      await database.ref('tasks/' + id).set(task);
    } else {
      await fetch(FIREBASE_DB_URL + '/tasks/' + id + '.json', {
        method: 'PUT',
        body: JSON.stringify(task),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return task;
  },

  async deleteTask(taskId) {
    if (!taskId) return;
    if (database) {
      await database.ref('tasks/' + taskId).remove();
    } else {
      await fetch(FIREBASE_DB_URL + '/tasks/' + taskId + '.json', { method: 'DELETE' });
    }
    if (window.store && window.store.tasks) {
      window.store.tasks = window.store.tasks.filter(t => t.id !== taskId);
    }
  },

  async updateTask(taskId, updates) {
    if (!taskId || !updates) return;
    if (database) {
      await database.ref('tasks/' + taskId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/tasks/' + taskId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (window.store && window.store.tasks) {
      const idx = window.store.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        window.store.tasks[idx] = { ...window.store.tasks[idx], ...updates };
      }
    }
  },

  async updateSchedule(scheduleId, updates) {
    if (!scheduleId || !updates) return;
    if (database) {
      await database.ref('schedules/' + scheduleId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/schedules/' + scheduleId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (window.store && window.store.schedules) {
      const idx = window.store.schedules.findIndex(s => s.id === scheduleId);
      if (idx !== -1) {
        window.store.schedules[idx] = { ...window.store.schedules[idx], ...updates };
      }
    }
  },

  async addSchedule(schedule) {
    const id = schedule.id || ('sched_' + Date.now());
    schedule.id = id;
    if (database) {
      await database.ref('schedules/' + id).set(schedule);
    } else {
      await fetch(FIREBASE_DB_URL + '/schedules/' + id + '.json', {
        method: 'PUT',
        body: JSON.stringify(schedule),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return schedule;
  },

  async deleteSchedule(scheduleId) {
    if (database) {
      await database.ref('schedules/' + scheduleId).remove();
    } else {
      await fetch(FIREBASE_DB_URL + '/schedules/' + scheduleId + '.json', {
        method: 'DELETE'
      });
    }
    if (window.store && window.store.schedules) {
      window.store.schedules = window.store.schedules.filter(s => s.id !== scheduleId);
    }
  },

  async addUser(worker) {
    const id = worker.id || ('worker_' + Date.now());
    worker.id = id;
    if (database) {
      await database.ref('users/' + id).set(worker);
    } else {
      await fetch(FIREBASE_DB_URL + '/users/' + id + '.json', {
        method: 'PUT',
        body: JSON.stringify(worker),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return worker;
  },

  async updateUser(userId, updates) {
    if (!userId || !updates) return;
    if (database) {
      await database.ref('users/' + userId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/users/' + userId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Synchronize local in-memory store
    if (window.store && window.store.users) {
      const idx = window.store.users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        window.store.users[idx] = { ...window.store.users[idx], ...updates };
      }
    }
    if (window.store && window.store.currentUser && window.store.currentUser.id === userId) {
      window.store.currentUser = { ...window.store.currentUser, ...updates };
      localStorage.setItem('ijro_user', JSON.stringify(window.store.currentUser));
    }
  },

  async sendMessage(msg) {
    const id = msg.id || ('msg_' + Date.now());
    msg.id = id;
    if (database) {
      await database.ref('messages/' + id).set(msg);
    } else {
      await fetch(FIREBASE_DB_URL + '/messages/' + id + '.json', {
        method: 'PUT',
        body: JSON.stringify(msg),
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return msg;
  },

  async editMessage(msgId, newText) {
    const updates = {
      textContent: newText,
      isEdited: true,
      edited: true,
      editedAt: Date.now()
    };
    if (database) {
      await database.ref('messages/' + msgId).update(updates);
    } else {
      await fetch(FIREBASE_DB_URL + '/messages/' + msgId + '.json', {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  async deleteMessage(msgId) {
    if (database) {
      await database.ref('messages/' + msgId).remove();
    } else {
      await fetch(FIREBASE_DB_URL + '/messages/' + msgId + '.json', {
        method: 'DELETE'
      });
    }
  },

  async markMessagesAsRead(currentUserId, peerId) {
    const unread = window.store.messages.filter(m => 
      m.senderId === peerId && m.receiverId === currentUserId && !m.isRead && !m.read
    );
    const now = Date.now();
    for (const msg of unread) {
      const updates = { isRead: true, read: true, readAt: now };
      if (database) {
        database.ref('messages/' + msg.id).update(updates);
      } else {
        fetch(FIREBASE_DB_URL + '/messages/' + msg.id + '.json', {
          method: 'PATCH',
          body: JSON.stringify(updates),
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
};

window.dbApi = dbApi;
window.initFirebase = initFirebase;
window.onStoreChange = onStoreChange;
