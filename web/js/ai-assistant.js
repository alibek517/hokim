// IJRO AI Assistant (Jarvis) for Mayor (Hokim)
// Sun'iy Intellekt Yordamchisi - Ovozli boshqaruv, topshiriq yaratish, tasdiqlash va sahifalarni boshqarish

(function() {
  'use strict';

  let isListening = false;
  let isSpeaking = false;
  let recognition = null;
  let aiState = 'IDLE'; // 'IDLE' | 'CREATING_TASK' | 'CONFIRMING_TASK'
  let draftTask = {
    title: '',
    workerId: '',
    workerName: '',
    startDate: '',
    endDate: ''
  };

  // Check Web Speech Recognition support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Initialize Speech Recognition
  function initSpeechRecognition() {
    if (!SpeechRecognition) {
      console.warn("Brauzeringizda Web Speech Recognition qo'llab-quvvatlanmaydi.");
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'uz-UZ';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening = true;
      updateAiStatus('listening', 'Eshitmoqda...');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const text = (finalTranscript || interim).trim();
      if (text) {
        showTemporaryUserText(text);
      }

      if (finalTranscript.trim()) {
        handleUserSpeech(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error !== 'no-speech') {
        updateAiStatus('idle', 'Kutilmoqda');
        isListening = false;
      }
    };

    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch (e) {
          isListening = false;
          updateAiStatus('idle', 'Kutilmoqda');
        }
      } else {
        updateAiStatus('idle', 'Kutilmoqda');
      }
    };
  }

  // Toggle Voice Listening
  window.toggleAiVoiceListening = function() {
    if (!recognition) {
      initSpeechRecognition();
    }
    if (!recognition) {
      alert("Brauzeringiz ovozli tanib olishni qo'llab-quvvatlamaydi.");
      return;
    }

    if (isListening) {
      isListening = false;
      recognition.stop();
      updateAiStatus('idle', 'Kutilmoqda');
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Recognition start failed:", e);
      }
    }
  };

  let isVoiceEnabled = true;

  // Toggle Voice Output
  window.toggleAiVoiceOutput = function() {
    isVoiceEnabled = !isVoiceEnabled;
    const btn = document.getElementById('ai-voice-toggle-btn');
    if (btn) {
      btn.style.color = isVoiceEnabled ? '#60A5FA' : '#94A3B8';
      btn.title = isVoiceEnabled ? "Ovoz yoqilgan (o'chirish uchun bosing)" : "Ovoz o'chirilgan (yoqish uchun bosing)";
      btn.innerHTML = isVoiceEnabled
        ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>'
        : '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    }
    if (!isVoiceEnabled) {
      if (activeAudioPlayer) {
        try { activeAudioPlayer.pause(); activeAudioPlayer.src = ''; } catch (_) {}
        activeAudioPlayer = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      isSpeaking = false;
    }
  };

  let activeAudioPlayer = null;
  let cachedVoices = [];
  function loadAvailableVoices() {
    if ('speechSynthesis' in window) {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    }
  }
  if ('speechSynthesis' in window) {
    loadAvailableVoices();
    window.speechSynthesis.onvoiceschanged = loadAvailableVoices;
  }

  // Text-to-Speech (Faqat 100% Sof O'zbek tili - ruscha, inglizcha, turkcha butunlay taqiqlangan)
  function speakText(text, callback) {
    if (!isVoiceEnabled) {
      if (callback) callback();
      return;
    }

    if (activeAudioPlayer) {
      try {
        activeAudioPlayer.pause();
        activeAudioPlayer.src = '';
      } catch (_) {}
      activeAudioPlayer = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const cleanText = (text || '').trim();
    if (!cleanText) {
      isSpeaking = false;
      updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
      if (callback) callback();
      return;
    }

    isSpeaking = true;
    updateAiStatus('speaking', 'Gapirmoqda...');

    // 1. Birinchi o'rinda Microsoft Neural O'zbekcha Ovoz (https://hokim.vercel.app/api/tts)
    const baseUrl = (window.location.protocol.startsWith('http') && window.location.hostname.includes('vercel.app'))
      ? '/api/tts'
      : 'https://hokim.vercel.app/api/tts';
    const ttsUrl = baseUrl + '?text=' + encodeURIComponent(cleanText);
    const audio = new Audio();
    activeAudioPlayer = audio;

    let fallbackTriggered = false;
    const triggerLocalFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      try {
        audio.pause();
        audio.src = '';
      } catch (_) {}
      if (activeAudioPlayer === audio) activeAudioPlayer = null;
      speakLocalUzbek(cleanText, callback);
    };

    audio.onplay = () => {
      // Audio o'ynay boshladi - mahalliy fallback butunlay bloklanadi!
      fallbackTriggered = true;
      isSpeaking = true;
      updateAiStatus('speaking', 'Gapirmoqda...');
    };

    audio.onended = () => {
      isSpeaking = false;
      activeAudioPlayer = null;
      updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
      if (callback) callback();
    };

    audio.onerror = (e) => {
      console.warn("Neural TTS server offline/rate-limited, fallback to browser speech...", e);
      triggerLocalFallback();
    };

    try {
      audio.src = ttsUrl;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("audio.play() stream error:", err);
          triggerLocalFallback();
        });
      }
    } catch (err) {
      console.warn("Audio element setup error:", err);
      triggerLocalFallback();
    }
  }

  // Mahalliy O'zbekcha Fallback (Faqat O'zbek tili, begona tillar QAT'IYAN TAQIQLANADI)
  function speakLocalUzbek(text, callback) {
    if (!('speechSynthesis' in window)) {
      isSpeaking = false;
      updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
      if (callback) callback();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const voices = cachedVoices.length > 0 ? cachedVoices : (window.speechSynthesis.getVoices() || []);
      // Qat'iy qoida: Faqat o'zbek tili ovozini topish (uz-UZ, Madina, Sardor, Uzbek)
      const uzVoice = voices.find(v => 
        (v.lang && (v.lang.toLowerCase().startsWith('uz') || v.lang.toLowerCase().includes('uzb'))) ||
        (v.name && (v.name.toLowerCase().includes('uzbek') || v.name.toLowerCase().includes('madina') || v.name.toLowerCase().includes('sardor')))
      );

      // Agar brauzerda sof O'zbekcha ovoz bo'lmasa, hech qachon ingliz/rus erkak ovozida gapirmasin!
      if (!uzVoice) {
        console.warn("Brauzerda sof o'zbekcha TTS ovoz topilmadi. Begona (inglizcha/ruscha) tilda gapirmaslik uchun nutq to'xtatildi.");
        isSpeaking = false;
        updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
        if (callback) callback();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.voice = uzVoice;
      utterance.lang = uzVoice.lang || 'uz-UZ';

      utterance.onstart = () => {
        isSpeaking = true;
        updateAiStatus('speaking', 'Gapirmoqda...');
      };

      utterance.onend = () => {
        isSpeaking = false;
        updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
        if (callback) callback();
      };

      utterance.onerror = () => {
        isSpeaking = false;
        updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
        if (callback) callback();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("speakLocalUzbek error:", e);
      isSpeaking = false;
      updateAiStatus(isListening ? 'listening' : 'idle', isListening ? 'Eshitmoqda...' : 'Kutilmoqda');
      if (callback) callback();
    }
  }

  // UI Updates in Transcript
  // UI Updates in Animated Orb & Caption
  function appendAiMessage(role, text) {
    const caption = document.getElementById('ai-orb-caption');
    if (caption) {
      caption.innerText = text;
    }
  }

  function showTemporaryUserText(text) {
    const caption = document.getElementById('ai-orb-caption');
    if (caption) {
      caption.innerText = `"${text}..."`;
    }
  }

  // ==========================================
  // MATHEMATICAL MORPHING AI ORB CANVAS ENGINE
  // Dumaloq (Circle) -> 5 burchak (Pentagon) -> 8 burchak (Octagon) -> Dumaloq
  // ==========================================
  let orbAnimId = null;
  let currentVisualState = 'idle';

  function getShapeRadius(theta, sides, weight, baseRadius, rotation) {
    if (!sides || sides <= 0 || weight <= 0.01) {
      return baseRadius;
    }
    const seg = (2 * Math.PI) / sides;
    const phi = Math.abs((((theta - rotation) % seg) + seg) % seg - seg / 2);
    const polyR = (baseRadius * Math.cos(seg / 2)) / Math.max(0.1, Math.cos(phi));
    return baseRadius * (1 - weight) + polyR * weight;
  }

  function startOrbAnimation() {
    if (orbAnimId) return;
    const canvas = document.getElementById('ai-orb-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const displaySize = 78;
    canvas.width = Math.round(displaySize * dpr);
    canvas.height = Math.round(displaySize * dpr);
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const baseR = 23;

    // Orbiting particles scaled to 78px
    const particles = [
      { angle: 0, dist: 30, speed: 0.024, size: 1.6, alpha: 0.8 },
      { angle: 1.2, dist: 33, speed: -0.016, size: 1.4, alpha: 0.65 },
      { angle: 2.8, dist: 28, speed: 0.028, size: 1.5, alpha: 0.85 },
      { angle: 4.1, dist: 34, speed: -0.018, size: 1.3, alpha: 0.6 },
      { angle: 5.3, dist: 31, speed: 0.018, size: 1.4, alpha: 0.7 }
    ];

    function render(time) {
      if (!time) time = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, displaySize, displaySize);

      // Morph cycle: 9 seconds total (3s per stage)
      const cycleDuration = 9000;
      const progress = (time % cycleDuration) / cycleDuration;
      const stageVal = progress * 3;
      const stageIndex = Math.floor(stageVal);
      const stageP = stageVal - stageIndex;
      // Smooth cosine easing
      const t = 0.5 - 0.5 * Math.cos(Math.PI * stageP);

      let shapeA = { sides: 0, weight: 0 };   // Circle
      let shapeB = { sides: 5, weight: 0.75 }; // Pentagon

      if (stageIndex === 0) {
        // Circle -> 5-gon (Pentagon)
        shapeA = { sides: 0, weight: 0 };
        shapeB = { sides: 5, weight: 0.75 };
      } else if (stageIndex === 1) {
        // 5-gon -> 8-gon (Octagon)
        shapeA = { sides: 5, weight: 0.75 };
        shapeB = { sides: 8, weight: 0.75 };
      } else {
        // 8-gon -> Circle
        shapeA = { sides: 8, weight: 0.75 };
        shapeB = { sides: 0, weight: 0 };
      }

      // Voice reactive dynamics
      let pulseAmp = 1.0;
      let breathWaveAmp = 0.8;
      let glowColor = 'rgba(99, 102, 241, 0.4)';

      if (isListening) {
        pulseAmp = 1.05 + 0.03 * Math.sin(time * 0.008);
        breathWaveAmp = 1.6;
        glowColor = 'rgba(59, 130, 246, 0.65)';
      } else if (isSpeaking) {
        pulseAmp = 1.08 + 0.05 * Math.sin(time * 0.015) + 0.02 * Math.cos(time * 0.023);
        breathWaveAmp = 2.2;
        glowColor = 'rgba(129, 140, 248, 0.75)';
      } else {
        pulseAmp = 1.0 + 0.02 * Math.sin(time * 0.002);
        breathWaveAmp = 0.8;
      }

      const activeRadius = baseR * pulseAmp;
      const rot = time * 0.0006; // Slow rotation

      // 1. Outer Pulsing Glow Halo
      const haloGrad = ctx.createRadialGradient(cx, cy, activeRadius * 0.5, cx, cy, activeRadius * 1.55);
      haloGrad.addColorStop(0, glowColor);
      haloGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.15)');
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius * 1.55, 0, 2 * Math.PI);
      ctx.fill();

      // 2. Compute 120 points on morphed boundary
      const steps = 120;
      const points = [];
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * 2 * Math.PI;
        const rA = getShapeRadius(theta, shapeA.sides, shapeA.weight, activeRadius, rot);
        const rB = getShapeRadius(theta, shapeB.sides, shapeB.weight, activeRadius, rot);
        const interpolatedR = rA * (1 - t) + rB * t;
        const wave = Math.sin(theta * 4 + time * 0.004) * breathWaveAmp;
        const finalR = interpolatedR + wave;

        points.push({
          x: cx + finalR * Math.cos(theta),
          y: cy + finalR * Math.sin(theta)
        });
      }

      // 3. Morphing shape path
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < steps; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();

      // 4. Fill with Radiant 3D sphere gradient
      const lx = cx - activeRadius * 0.32;
      const ly = cy - activeRadius * 0.30;
      const bodyGrad = ctx.createRadialGradient(lx, ly, activeRadius * 0.05, cx, cy, activeRadius * 1.15);
      bodyGrad.addColorStop(0.00, '#FFFFFF'); // Bright highlight
      bodyGrad.addColorStop(0.18, '#C7D2FE'); // Soft lilac-blue
      bodyGrad.addColorStop(0.48, '#6366F1'); // Vibrant Indigo
      bodyGrad.addColorStop(0.74, '#3B82F6'); // Electric Blue
      bodyGrad.addColorStop(1.00, '#0F172A'); // Deep space edge

      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = 'rgba(99, 102, 241, 0.7)';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 5. Specular highlight sheen overlay on top
      ctx.save();
      ctx.clip();
      const sheenGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, activeRadius * 0.85);
      sheenGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.7)');
      sheenGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.25)');
      sheenGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.0)');
      sheenGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, activeRadius * 0.85, 0, 2 * Math.PI);
      ctx.fill();

      // Curved inner neon rim highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(cx, cy, activeRadius * 0.94, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
      ctx.restore();

      // 6. Perimeter delicate neon accent stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < steps; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(199, 210, 254, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 7. Orbiting celestial motes
      particles.forEach(p => {
        p.angle += p.speed;
        const px = cx + (activeRadius + (p.dist - baseR)) * Math.cos(p.angle);
        const py = cy + (activeRadius + (p.dist - baseR)) * Math.sin(p.angle);

        ctx.fillStyle = `rgba(224, 231, 255, ${p.alpha})`;
        ctx.shadowColor = '#60A5FA';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      orbAnimId = requestAnimationFrame(render);
    }

    orbAnimId = requestAnimationFrame(render);
  }

  function stopOrbAnimation() {
    if (orbAnimId) {
      cancelAnimationFrame(orbAnimId);
      orbAnimId = null;
    }
  }

  function updateAiStatus(state, label) {
    currentVisualState = state || 'idle';
    const textEl = document.getElementById('ai-status-text') || document.getElementById('ai-orb-status-badge');
    if (textEl) {
      textEl.innerText = label;
    }
  }

  window.handleAiOverlayClick = function(event) {
    if (event.target && event.target.id === 'ai-assistant-modal') {
      closeAiAssistantModal();
    }
  };

  // Helper: Extract dates from speech (YYYY-MM-DD)
  function parseDateFromSpeech(text) {
    const lower = text.toLowerCase();
    const now = new Date();

    if (lower.includes('bugun')) {
      return now.toISOString().slice(0, 10);
    }
    if (lower.includes('ertaga') || lower.includes('ertangi')) {
      const d = new Date(now.getTime() + 24 * 3600 * 1000);
      return d.toISOString().slice(0, 10);
    }
    if (lower.includes('indin') || lower.includes('indinga')) {
      const d = new Date(now.getTime() + 48 * 3600 * 1000);
      return d.toISOString().slice(0, 10);
    }

    const monthMap = {
      'yanvar': 0, 'fevral': 1, 'mart': 2, 'aprel': 3, 'may': 4, 'iyun': 5,
      'iyul': 6, 'avgust': 7, 'sentabr': 8, 'sentyabr': 8, 'oktabr': 9, 'oktyabr': 9,
      'noyabr': 10, 'dekabr': 11
    };

    for (const [mName, mIdx] of Object.entries(monthMap)) {
      const regex = new RegExp(`(\\d{1,2})[-–\\s]*${mName}`, 'i');
      const match = lower.match(regex);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = now.getFullYear();
        const d = new Date(year, mIdx, day);
        return d.toISOString().slice(0, 10);
      }
    }

    const defaultLater = new Date(now.getTime() + 48 * 3600 * 1000);
    return defaultLater.toISOString().slice(0, 10);
  }

  // Helper: Find matching worker from storage
  function findWorkerInSpeech(text) {
    const lower = text.toLowerCase();
    const workers = (window.store.users || []).filter(u => u.role === 'WORKER');

    for (const w of workers) {
      const fName = (w.firstName || '').toLowerCase();
      const lName = (w.lastName || '').toLowerCase();
      const fullName = (w.fullName || '').toLowerCase();

      if (fName && fName.length > 2 && lower.includes(fName)) return w;
      if (lName && lName.length > 2 && lower.includes(lName)) return w;
      if (fullName && fullName.length > 2 && lower.includes(fullName)) return w;
    }
    return null;
  }

  // Gemini AI Cloud Integration
  async function callGeminiAssistant(rawText) {
    const apiKey = window.GEMINI_API_KEY || localStorage.getItem('ijro_gemini_api_key');
    if (!apiKey) return null;

    const workers = (window.store && window.store.users || []).filter(u => u.role === 'WORKER').map(u => ({
      id: u.id,
      name: u.fullName || (u.firstName + ' ' + u.lastName),
      position: u.position || 'Mutaxassis'
    }));

    const todayStr = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Siz "IJRO" davlat boshqaruv tizimida tuman/shahar Hokimining shaxsiy sun'iy intellekt yordamchisisiz.
Hokim sizga o'zbek tilida (shu jumladan Xorazm shevasida: "ish ber", "et", "duzot", "ayt", "qilsin") buyruq yoki savol beradi.
Siz faqat va faqat 100% adabiy, hurmatli o'zbek tilida javob berasiz. Ruscha, inglizcha yoki boshqa begona tillar qat'iyan taqiqlangan!
Bugungi sana: ${todayStr}.
Tizimdagi xodimlar ro'yxati: ${JSON.stringify(workers)}.

Hokimning gapi bo'yicha tahlil qiling va FAQAT quyidagi JSON formatida natija qaytaring (hech qanday markdown \`\`\`json tegisiz, toza JSON formatida):
{
  "intent": "CREATE_TASK" | "FILTER_STATUS" | "NAVIGATE" | "CONFIRM" | "CANCEL" | "GREETING" | "SEARCH" | "CHAT",
  "speechReply": "Hokimga aytiladigan o'zbekcha qisqa, madaniyatli va aniq ovozli javob",
  "task": {
    "title": "Topshiriq nomi",
    "workerId": "xodim IDsi",
    "workerName": "Xodim ismi",
    "startDate": "${todayStr}",
    "endDate": "YYYY-MM-DD"
  },
  "statusIdx": 1,
  "tab": 0,
  "query": "qidiruv matni"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { text: `Hokimning gapi: "${rawText}"` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        console.warn("Gemini API status error:", resp.status);
        return null;
      }
      const data = await resp.json();
      const contentText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!contentText) return null;
      const cleanJson = contentText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Gemini API call failed, fallback to local NLP:", e);
      return null;
    }
  }

  // Core NLP Intent Engine (supporting Uzbek & Xorazm dialect + common admin terms)
  function analyzeIntent(rawText) {
    const text = rawText.toLowerCase().trim();

    // 0. To'xtatish va o'zini o'zi yopish (Stop / Dismiss)
    const stopWords = ["to'xta", "toxta", "to'xtat", "toxtat", "jim bo'l", "jim bol", "jim", "bas", "yetadi", "yopil", "yop", "chiq", "stop", "xayr"];
    if (stopWords.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w) || text.includes(' ' + w + ' '))) {
      return {
        intent: 'STOP',
        message: "Tushundim, to'xtadim."
      };
    }

    // 1. Salomlashish va hol-ahvol (Greeting)
    const greetings = ['salom', 'assalomu alaykum', 'assalom', 'qandaysiz', 'qalaysiz', 'charchamang', 'hormang', 'salomatmisiz', 'privet', 'hello'];
    if (greetings.some(g => text === g || text.startsWith(g + ' ') || text.endsWith(' ' + g) || text === g + '!' || text === g + '?')) {
      return {
        intent: 'GREETING',
        message: "Assalomu alaykum, hurmatli Hokim! Sizga qanday yordam bera olaman?"
      };
    }

    // 1. Tasdiqlash javoblari (Confirmation)
    const confirmWords = [
      'ha', 'xa', 'albatta', 'bo\'ldi', 'boldi', 'to\'g\'ri', 'tasdiqlayman', 'tasdiqla',
      'saqla', 'saqlab qo\'y', 'saqlansin', 'yubor', 'tamom', 'tayyor', 'yaxshi',
      'ok', 'yes', 'shunday', 'etdim', 'yetadi', 'da', 'podtverjdayu', 'davay', 'ladno', 'bajarilsin'
    ];
    if (confirmWords.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w) || text.includes(' ' + w + ' '))) {
      return { intent: 'CONFIRM' };
    }

    // 2. Bekor qilish (Cancel)
    const cancelWords = [
      'yo\'q', 'yoq', 'kerakmas', 'kerak emas', 'bekor', 'bekor qil', 'to\'xtat',
      'o\'chir', 'tashla', 'tashlab ket', 'net', 'otmena'
    ];
    if (cancelWords.some(w => text === w || text.startsWith(w + ' ') || text.includes(' ' + w))) {
      return { intent: 'CANCEL' };
    }

    // 3. Xatolikni tuzatish (Correction / Xorazm "duzot")
    if (text.includes('xatosi bor') || text.includes('duzot') || text.includes('tuzat') || text.includes('o\'zgartir') || text.includes('emas') || text.includes('o\'rniga') || text.includes('almashtir')) {
      const worker = findWorkerInSpeech(text);
      const hasDate = text.includes('sentabr') || text.includes('sentyabr') || text.includes('oktabr') || text.includes('oktyabr') || text.includes('noyabr') || text.includes('dekabr') || text.includes('ertaga') || text.includes('bugun');
      return {
        intent: 'CORRECT',
        worker,
        newDate: hasDate ? parseDateFromSpeech(text) : null
      };
    }

    // 4. Sahifalarga o'tish (Navigation)
    if (text.includes('reja') || text.includes('rejalar') || text.includes('rejalani') || text.includes('rejani') || text.includes('plan')) {
      return { intent: 'NAVIGATE', tab: 1, message: "Rejalar bo'limi ochildi." };
    }
    if (text.includes('ishchi') || text.includes('xodim') || text.includes('reyting') || text.includes('ishchilani') || text.includes('xodimlani') || text.includes('sotrudnik')) {
      return { intent: 'NAVIGATE', tab: 2, message: "Xodimlar va ularning reytingi sahifasiga o'tdik." };
    }
    if (text.includes('chat') || text.includes('yozishm') || text.includes('xabar') || text.includes('xabarlar') || text.includes('chatlar')) {
      return { intent: 'NAVIGATE', tab: 3, message: "Chatlar bo'limi ochildi." };
    }
    if ((text.includes('topshiriq') || text.includes('vazifa') || text.includes('ishlar') || text.includes('zadaniya')) && (text.includes('ko\'rsat') || text.includes('och') || text.includes('o\'t') || text.includes('chiqar'))) {
      return { intent: 'NAVIGATE', tab: 0, message: "Topshiriqlar bo'limi ochildi." };
    }

    // 5. Filtrlash (Filter)
    if (text.includes('qizil') || text.includes('boshlanmagan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Boshlanmagan topshiriqlar saralandi." };
    }
    if (text.includes('sariq') || text.includes('jarayonda') || text.includes('ishlanmoqda')) {
      return { intent: 'FILTER_STATUS', statusIdx: 2, message: "Jarayondagi topshiriqlar saralandi." };
    }
    if (text.includes('yashil') || text.includes('bajarilgan') || text.includes('tugatilgan') || text.includes('bitgan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 3, message: "Bajarilgan topshiriqlar saralandi." };
    }
    if (text.includes('ko\'k') || text.includes('tekshirilgan') || text.includes('tasdiqlangan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 4, message: "Tekshirilgan topshiriqlar saralandi." };
    }
    if (text.includes('kechikkan') || text.includes('muddati o\'tgan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Kechikkan va boshlanmagan topshiriqlar ko'rsatilmoqda." };
    }

    // 6. Minnatdorchilik va umumiy savollar
    if (text.includes('rahmat') || text.includes('barakalla') || text.includes('balli') || text.includes('tashakkur')) {
      return {
        intent: 'GREETING',
        message: "Arzimaydi, hurmatli Hokim! Sizga xizmat qilishdan doim mamnunman."
      };
    }
    if (text.includes('kimsan') || text.includes('nima qila olasan') || text.includes('yordam ber')) {
      return {
        intent: 'GREETING',
        message: "Men sizning shaxsiy sun'iy intellekt yordamchingizman. Topshiriq biriktirish, saralash yoki xodimlar reytingini ko'rsatishim mumkin."
      };
    }

    // 7. Yangi topshiriq yaratish (Xorazm "ish ber", "topshiriq ber", "vazifa yukla", "ayt", "qilsin", "etsin")
    const isCreateCommand = text.includes('ish ber') || text.includes('topshiriq') || text.includes('vazifa') || text.includes('yangi ish') || text.includes('biriktir') || text.includes('zadaniya') || text.includes('sozdat') || text.includes('naznachit') || text.includes('buyur');
    const detectedWorker = findWorkerInSpeech(text);

    if (isCreateCommand || detectedWorker) {
      let cleanTitle = text
        .replace(/valiga|alisherga|karimga|boburga|jamshidga|xodimga/gi, '')
        .replace(/ish ber|topshiriq ber|yangi topshiriq|vazifa ber|biriktir|qilsin|etsin|tekshirsin|bajarilsin|zadaniya|naznachit|sozdat/gi, '')
        .replace(/\d{1,2}[-–\s]*(sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust)[gacha]*/gi, '')
        .replace(/bugun|ertaga|indin|gacha/gi, '')
        .trim();

      if (!cleanTitle || cleanTitle.length < 3) {
        cleanTitle = "Topshiriq ijrosini ta'minlash";
      } else {
        cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = parseDateFromSpeech(text);

      return {
        intent: 'CREATE_TASK',
        worker: detectedWorker,
        title: cleanTitle,
        startDate: todayStr,
        endDate: endStr
      };
    }

    return {
      intent: 'SEARCH',
      query: rawText.trim()
    };
  }

  async function handleUserSpeech(userSpeech) {
    appendAiMessage('user', userSpeech);
    updateAiStatus('thinking', 'Qayta ishlanmoqda...');

    // 0. To'xtatish va o'zini o'zi yopish ("to'xta", "toxta", "jim", "bas", "yetadi", "yopil", "stop", "chiq")
    const cleanLower = (userSpeech || '').toLowerCase().trim();
    const stopWords = ["to'xta", "toxta", "to'xtat", "toxtat", "jim bo'l", "jim bol", "jim", "bas", "yetadi", "yopil", "yop", "chiq", "stop", "xayr"];
    if (stopWords.some(w => cleanLower === w || cleanLower.startsWith(w + ' ') || cleanLower.endsWith(' ' + w) || cleanLower.includes(' ' + w + ' '))) {
      aiState = 'IDLE';
      const reply = "Tushundim, to'xtadim.";
      appendAiMessage('jarvis', reply);
      speakText(reply, () => {
        closeAiAssistantModal();
      });
      setTimeout(() => {
        closeAiAssistantModal();
      }, 1200);
      return;
    }

    if (aiState === 'CONFIRMING_TASK') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CONFIRM') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentTask) {
          await window.mayorAiHelpers.saveCurrentTask();
          aiState = 'IDLE';
          const reply = "Topshiriq muvaffaqiyatli saqlandi va xodimga biriktirildi!";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      } else if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeTaskModal) {
          window.mayorAiHelpers.closeTaskModal();
        }
        aiState = 'IDLE';
        const reply = "Topshiriq bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else if (parsed.intent === 'CORRECT') {
        let updatedMsg = "Tuzatildi: ";
        if (parsed.worker) {
          draftTask.workerId = parsed.worker.id;
          draftTask.workerName = parsed.worker.fullName || (parsed.worker.firstName + ' ' + parsed.worker.lastName);
          updatedMsg += `Mas'ul: ${draftTask.workerName}. `;
        }
        if (parsed.newDate) {
          draftTask.endDate = parsed.newDate;
          updatedMsg += `Muddat: ${draftTask.endDate}. `;
        }
        if (window.mayorAiHelpers && window.mayorAiHelpers.updateTaskFields) {
          window.mayorAiHelpers.updateTaskFields({
            workerId: draftTask.workerId,
            endDate: draftTask.endDate
          });
        }
        const reply = `${updatedMsg} Topshiriqni saqlash va biriktirishni tasdiqlaysizmi?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // 1. Agar Gemini API kaliti o'rnatilgan bo'lsa, avvalo Gemini AI orqali aqlli tahlil
    try {
      const geminiResult = await callGeminiAssistant(userSpeech);
      if (geminiResult) {
        if (geminiResult.intent === 'NAVIGATE') {
          if (window.mayorAiHelpers && window.mayorAiHelpers.switchToTab) {
            window.mayorAiHelpers.switchToTab(geminiResult.tab ?? 0);
          }
          const msg = geminiResult.speechReply || "Kerakli sahifa ochildi.";
          appendAiMessage('jarvis', msg);
          speakText(msg);
          return;
        }

        if (geminiResult.intent === 'FILTER_STATUS') {
          if (window.mayorAiHelpers) {
            window.mayorAiHelpers.switchToTab(0);
            window.mayorAiHelpers.filterTasksByStatus(geminiResult.statusIdx ?? 1);
          }
          const msg = geminiResult.speechReply || "Topshiriqlar saralandi.";
          appendAiMessage('jarvis', msg);
          speakText(msg);
          return;
        }

        if (geminiResult.intent === 'CREATE_TASK' && geminiResult.task) {
          let worker = (window.store.users || []).find(u => u.id === geminiResult.task.workerId);
          if (!worker && geminiResult.task.workerName) {
            worker = findWorkerInSpeech(geminiResult.task.workerName);
          }
          const workers = (window.store.users || []).filter(u => u.role === 'WORKER');
          if (!worker && workers.length > 0) worker = workers[0];

          if (!worker) {
            const reply = "Tizimda biriktirish uchun birorta ham xodim topilmadi.";
            appendAiMessage('jarvis', reply);
            speakText(reply);
            return;
          }

          draftTask = {
            title: geminiResult.task.title || "Topshiriq",
            workerId: worker.id,
            workerName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
            startDate: geminiResult.task.startDate || new Date().toISOString().slice(0, 10),
            endDate: geminiResult.task.endDate || new Date(Date.now() + 48*3600*1000).toISOString().slice(0, 10)
          };

          if (window.mayorAiHelpers && window.mayorAiHelpers.openTaskModalWithData) {
            window.mayorAiHelpers.switchToTab(0);
            window.mayorAiHelpers.openTaskModalWithData({
              title: draftTask.title,
              workerId: draftTask.workerId,
              startDate: draftTask.startDate,
              endDate: draftTask.endDate
            });
          }

          aiState = 'CONFIRMING_TASK';
          const promptSpeech = geminiResult.speechReply || `${draftTask.workerName} ga "${draftTask.title}" topshirig'i tayyorlandi. Boshlanish sanasi ${draftTask.startDate}, tugash muddati ${draftTask.endDate}. Bu ishchi reytingiga ta'sir qiladi. Topshiriqni saqlash va biriktirishni tasdiqlaysizmi?`;
          appendAiMessage('jarvis', promptSpeech);
          speakText(promptSpeech);
          return;
        }

        if (geminiResult.intent === 'GREETING' || geminiResult.intent === 'CHAT') {
          const reply = geminiResult.speechReply || "Assalomu alaykum, hurmatli Hokim! Sizga qanday yordam bera olaman?";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }

        if (geminiResult.intent === 'SEARCH') {
          if (window.mayorAiHelpers) {
            window.mayorAiHelpers.searchTasks(geminiResult.query || userSpeech);
          }
          const reply = geminiResult.speechReply || `"${geminiResult.query || userSpeech}" bo'yicha qidiruv natijalari ko'rsatilmoqda.`;
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      }
    } catch (e) {
      console.warn("Gemini intent dispatch error:", e);
    }

    // 2. Mahalliy O'zbekcha Intent Engine Fallback
    const action = analyzeIntent(userSpeech);

    if (action.intent === 'GREETING') {
      appendAiMessage('jarvis', action.message);
      speakText(action.message);
      return;
    }

    if (action.intent === 'NAVIGATE') {
      if (window.mayorAiHelpers && window.mayorAiHelpers.switchToTab) {
        window.mayorAiHelpers.switchToTab(action.tab);
      }
      appendAiMessage('jarvis', action.message);
      speakText(action.message);
      return;
    }

    if (action.intent === 'FILTER_STATUS') {
      if (window.mayorAiHelpers) {
        window.mayorAiHelpers.switchToTab(0);
        window.mayorAiHelpers.filterTasksByStatus(action.statusIdx);
      }
      appendAiMessage('jarvis', action.message);
      speakText(action.message);
      return;
    }

    if (action.intent === 'CREATE_TASK') {
      let worker = action.worker;
      const workers = (window.store.users || []).filter(u => u.role === 'WORKER');

      if (!worker && workers.length > 0) {
        worker = workers[0];
      }

      if (!worker) {
        const reply = "Tizimda biriktirish uchun birorta ham xodim topilmadi. Avval xodim qo'shing.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      draftTask = {
        title: action.title,
        workerId: worker.id,
        workerName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
        startDate: action.startDate,
        endDate: action.endDate
      };

      if (window.mayorAiHelpers && window.mayorAiHelpers.openTaskModalWithData) {
        window.mayorAiHelpers.switchToTab(0);
        window.mayorAiHelpers.openTaskModalWithData({
          title: draftTask.title,
          workerId: draftTask.workerId,
          startDate: draftTask.startDate,
          endDate: draftTask.endDate
        });
      }

      aiState = 'CONFIRMING_TASK';
      const promptSpeech = `${draftTask.workerName} ga "${draftTask.title}" topshirig'i tayyorlandi. Boshlanish sanasi ${draftTask.startDate}, tugash muddati ${draftTask.endDate}. Bu ishchi reytingiga ta'sir qiladi. Topshiriqni saqlash va biriktirishni tasdiqlaysizmi?`;
      appendAiMessage('jarvis', promptSpeech);
      speakText(promptSpeech);
      return;
    }

    if (action.intent === 'SEARCH') {
      if (window.mayorAiHelpers) {
        window.mayorAiHelpers.searchTasks(action.query);
      }
      const reply = `"${action.query}" bo'yicha qidiruv natijalari ko'rsatilmoqda.`;
      appendAiMessage('jarvis', reply);
      speakText(reply);
      return;
    }

    const defaultReply = "Kechirasiz, buyrug'ingizni to'liq tushunmadim. Masalan: 'Alisherga topshiriq ber', 'Rejalarga o't' yoki 'Qizil topshiriqlarni ko'rsat' deb ayting.";
    appendAiMessage('jarvis', defaultReply);
    speakText(defaultReply);
  }

  // Gemini API Key Helpers
  window.setGeminiApiKey = function(key) {
    const cleanKey = (key || '').trim();
    if (cleanKey) {
      localStorage.setItem('ijro_gemini_api_key', cleanKey);
      window.GEMINI_API_KEY = cleanKey;
      if (window.showToast) window.showToast("Gemini API kaliti saqlandi!");
    } else {
      localStorage.removeItem('ijro_gemini_api_key');
      window.GEMINI_API_KEY = '';
      if (window.showToast) window.showToast("Gemini API kaliti o'chirildi.");
    }
  };

  window.promptGeminiApiKey = function() {
    const current = localStorage.getItem('ijro_gemini_api_key') || window.GEMINI_API_KEY || '';
    const key = prompt("Google Gemini API Kalitini kiriting (AI bilan aqlli tahlil va muloqot uchun):", current);
    if (key !== null) {
      window.setGeminiApiKey(key);
    }
  };

  // Modal open / close handlers
  window.toggleAiAssistantModal = function() {
    const modal = document.getElementById('ai-assistant-modal');
    if (!modal) return;

    if (modal.classList.contains('active')) {
      closeAiAssistantModal();
    } else {
      openAiAssistantModal();
    }
  };

  window.openAiAssistantModal = function() {
    const modal = document.getElementById('ai-assistant-modal');
    document.querySelectorAll('.ai-header-btn').forEach(b => b.classList.add('active'));
    if (modal) {
      modal.classList.add('active');
      startOrbAnimation();
      if (!isListening) {
        toggleAiVoiceListening();
      }
    }
  };

  window.closeAiAssistantModal = function() {
    const modal = document.getElementById('ai-assistant-modal');
    document.querySelectorAll('.ai-header-btn').forEach(b => b.classList.remove('active'));
    if (modal) modal.classList.remove('active');
    stopOrbAnimation();
    if (isListening && recognition) {
      isListening = false;
      try { recognition.stop(); } catch(_) {}
    }
    if (activeAudioPlayer) {
      try { activeAudioPlayer.pause(); activeAudioPlayer.src = ''; } catch (_) {}
      activeAudioPlayer = null;
    }
    if (isSpeaking && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
    isSpeaking = false;
    updateAiStatus('idle', 'Kutilmoqda');
  };

  window.sendAiPredefined = function(text) {
    handleUserSpeech(text);
  };

  window.sendAiTextCommand = function() {
    const input = document.getElementById('ai-fallback-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    handleUserSpeech(val);
  };

  // On page load
  window.addEventListener('DOMContentLoaded', () => {
    initSpeechRecognition();
  });

})();