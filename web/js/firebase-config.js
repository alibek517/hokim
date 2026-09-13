// IJRO Firebase Realtime Database Integration
const FIREBASE_DB_URL = 'https://hokimlik-default-rtdb.firebaseio.com';

let database = null;
let isConnected = false;

// Realtime In-Memory Stores
window.store = {
  users: [],
  tasks: [],
  schedules: [],
  messages: [],
  currentUser: null
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
        window.store.messages = list;
        notifyStore('messages', list);
      });

      database.ref('messages').on('child_added', snap => {
        const msg = snap.val();
        if (msg) notifyStore('messageAdded', msg);
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
      window.store.tasks = Object.values(tRes);
      notifyStore('tasks', window.store.tasks);
    }
    if (sRes) {
      window.store.schedules = Object.values(sRes);
      notifyStore('schedules', window.store.schedules);
    }
    if (mRes) {
      const list = Object.values(mRes).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
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
