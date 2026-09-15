// IJRO AI Assistant (Jarvis) for Mayor (Hokim)
// Sun'iy Intellekt Yordamchisi - Ovozli boshqaruv, topshiriq yaratish, tasdiqlash va sahifalarni boshqarish

(function() {
  'use strict';

  let isListening = false;
  let shouldKeepListening = false;
  let isSpeaking = false;
  let isTemporarilyPausedForTts = false;
  let ignoreSpeechUntil = 0;
  let currentSpeakingText = '';
  let recognition = null;
  let lastHeartbeatTime = Date.now();
  let aiState = 'IDLE'; // 'IDLE' | 'DRAFTING_TASK' | 'CONFIRMING_TASK' | 'DISAMBIGUATING_WORKER' | 'CONFIRMING_DELETE_TASK' | 'DISAMBIGUATING_DELETE_TASK' | 'CONFIRMING_BROADCAST' | 'DRAFTING_SCHEDULE' | 'CONFIRMING_SCHEDULE' | 'DRAFTING_WORKER' | 'CONFIRMING_WORKER'
  let pendingAmbiguousWorkers = [];
  let pendingDraftTask = null;
  let pendingDeleteTasks = [];
  let pendingDeleteSingleTask = null;
  let pendingBroadcastData = null;

  // Device & Platform Detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Helper: Normalize Uzbek speech, converting various apostrophes (‘, ’, ʻ, ʼ, `, ´) to standard ASCII '
  function normalizeUzbekSpeech(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .replace(/[\u02BB\u02BC\u2018\u2019\u0060\u00B4]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // iOS Safari / WebKit Audio Priming
  let sharedTtsAudio = null;
  let isAudioUnlocked = false;

  function primeAudioForIOS() {
    if (!sharedTtsAudio) {
      sharedTtsAudio = new Audio();
    }
    if (!isAudioUnlocked) {
      // 0.1s silent WAV to unlock the web audio/media stack on iOS
      sharedTtsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const p = sharedTtsAudio.play();
      if (p !== undefined) {
        p.then(() => {
          sharedTtsAudio.pause();
          sharedTtsAudio.currentTime = 0;
          isAudioUnlocked = true;
          console.log("[Audio] iOS Safari audio engine primed/unlocked.");
        }).catch(() => {});
      }
    }
  }

  try {
    window.addEventListener('touchstart', primeAudioForIOS, { once: true, passive: true });
    window.addEventListener('click', primeAudioForIOS, { once: true, passive: true });
  } catch (_) {}

  // Helper: AI nutqini darhol to'xtatish (Barge-in / Interruption)
  function stopSpeaking() {
    if (activeAudioPlayer) {
      try {
        activeAudioPlayer.pause();
        activeAudioPlayer.currentTime = 0;
        activeAudioPlayer.src = '';
      } catch (_) {}
      activeAudioPlayer = null;
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    isSpeaking = false;
    isTemporarilyPausedForTts = false;
    ignoreSpeechUntil = 0;
    currentSpeakingText = '';
    updateAiStatus('listening', 'Eshitmoqda...');
  }
  window.stopAiSpeaking = stopSpeaking;

  // Helper: Dinamikdan chiqqan o'zining aks-sadosimi yoki haqiqiy foydalanuvchi nutqimi?
  function isEchoOfCurrentSpeech(recognizedText, spokenText) {
    if (!spokenText || !recognizedText) return false;

    const cleanRec = recognizedText.toLowerCase().replace(/[^a-zа-яўқғҳ0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
    const cleanSpoken = spokenText.toLowerCase().replace(/[^a-zа-яўқғҳ0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanRec || !cleanSpoken) return false;

    // To'xtatish yoki buyruq so'zlari bo'lsa, bu QAT'IYAN aks-sado emas, foydalanuvchi buyrug'i
    if (/to['`]?xta|jim|shosh|yo['`]?q|bo['`]?ldi|kut|yetar|boshqa|toxta|toxtat/i.test(cleanRec)) {
      return false;
    }

    // Agar tanilgan so'z to'liq AI hozir aytayotgan gapning qismi bo'lsa (dinamikdan mikrofonga o'tgan echo)
    if (cleanSpoken.includes(cleanRec)) {
      return true;
    }

    return false;
  }
  let draftTask = {
    title: '',
    workerId: '',
    workerName: '',
    startDate: '',
    endDate: ''
  };
  let draftSchedule = {
    title: '',
    time: ''
  };
  let draftWorker = {
    fullName: '',
    position: '',
    username: '',
    password: ''
  };

  // Check Web Speech Recognition support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Initialize Speech Recognition
  function initSpeechRecognition() {
    if (!SpeechRecognition) {
      console.warn("Brauzeringizda Web Speech Recognition qo'llab-quvvatlanmaydi.");
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = 'uz-UZ';
      // On iOS Safari / WebKit, continuous: true causes immediate engine termination or failure.
      // Setting continuous = !isIOS and auto-restarting in onend delivers seamless, flawless continuous speech on iPhone/iPad.
      recognition.continuous = !isIOS;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListening = true;
        lastHeartbeatTime = Date.now();
        if (!isSpeaking) {
          updateAiStatus('listening', 'Eshitmoqda...');
        }
      };

      recognition.onspeechstart = () => {
        lastHeartbeatTime = Date.now();
        if (isSpeaking) {
          console.log("[AI] Foydalanuvchi gapira boshladi -> AI darhol jim bo'ldi");
          stopSpeaking();
        }
      };

      recognition.onaudiostart = () => {
        lastHeartbeatTime = Date.now();
      };

      recognition.onsoundstart = () => {
        lastHeartbeatTime = Date.now();
        if (isSpeaking) {
          stopSpeaking();
        }
      };

      recognition.onresult = (event) => {
        lastHeartbeatTime = Date.now();
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
        if (!text) return;

        // Foydalanuvchi gapirayotganda AI QAT'IYAN jim bo'ladi:
        if (isSpeaking) {
          stopSpeaking();
        }

        // 1. "30224", "30.00.24", "00.24", "00:24" kabi shovqin va fantom raqamlarni butunlay bloklash
        if (text.includes('30224') || text.includes('30.00.24') || text.includes('00.24') || text.includes('00:24') || /^[\d\s.:\-_/]+$/.test(text)) {
          return;
        }

        // 2. Birorta ham harfi bo'lmagan shovqin
        if (!/[a-zA-Zа-яА-ЯўқғҳЎҚҒҲ]/.test(text)) {
          return;
        }

        // Shovqin filtri 2: 2 tadan kam harfli shovqin
        const lettersOnly = text.replace(/[^a-zA-Zа-яА-ЯўқғҳЎҚҒҲ]/g, '').toLowerCase();
        if (lettersOnly.length < 2 && lettersOnly !== 'ha' && lettersOnly !== 'xa' && lettersOnly !== 'yo' && lettersOnly !== 'no') {
          return;
        }

        if (text) {
          showTemporaryUserText(text);
        }

        if (finalTranscript.trim()) {
          handleUserSpeech(finalTranscript.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === 'language-not-supported') {
          if (recognition && recognition.lang === 'uz-UZ') {
            console.log("Fallback recognition language to device locale:", navigator.language);
            recognition.lang = navigator.language || '';
            if (shouldKeepListening) {
              setTimeout(safeStartRecognition, 100);
            }
            return;
          }
        }
        if (event.error === 'not-allowed') {
          isListening = false;
          updateAiStatus('idle', 'Mikrofon ruxsati berilmadi');
          return;
        }
        if (shouldKeepListening) {
          setTimeout(() => {
            if (shouldKeepListening && !isListening) {
              safeStartRecognition();
            }
          }, 150);
        }
      };

      recognition.onend = () => {
        isListening = false;
        // Infinity continuous listening: agar to'xtash buyrug'i berilmagan bo'lsa, zudlik bilan qayta yoqiladi
        if (shouldKeepListening) {
          setTimeout(() => {
            if (shouldKeepListening) {
              safeStartRecognition();
            }
          }, isIOS ? 50 : 80);
        } else {
          updateAiStatus('idle', 'Kutilmoqda');
        }
      };
    } catch (e) {
      console.warn("initSpeechRecognition error:", e);
    }
  }

  // Safe Start Recognition (Handles Chrome/Android state recovery)
  function safeStartRecognition() {
    if (!shouldKeepListening) return;
    if (!SpeechRecognition) return;

    if (!recognition) {
      initSpeechRecognition();
    }
    if (!recognition) return;

    if (isListening) return;

    try {
      recognition.start();
      isListening = true;
      if (!isSpeaking) {
        updateAiStatus('listening', 'Eshitmoqda...');
      }
    } catch (err) {
      if (err && (err.name === 'InvalidStateError' || (err.message && err.message.includes('already started')))) {
        isListening = true;
        if (!isSpeaking) {
          updateAiStatus('listening', 'Eshitmoqda...');
        }
        return;
      }
      console.warn("safeStartRecognition failed, recreating SpeechRecognition instance:", err);
      try {
        if (recognition) {
          recognition.onstart = null;
          recognition.onresult = null;
          recognition.onerror = null;
          recognition.onend = null;
          try { recognition.abort(); } catch (_) {}
        }
      } catch (_) {}
      recognition = null;
      initSpeechRecognition();
      try {
        if (recognition) {
          recognition.start();
          isListening = true;
          if (!isSpeaking) {
            updateAiStatus('listening', 'Eshitmoqda...');
          }
        }
      } catch (e2) {
        console.warn("Re-initialized SpeechRecognition start error:", e2);
      }
    }
  }

  // Watchdog Timer for 100% Infinity Continuous Listening
  let watchdogTimer = null;
  function startWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (!shouldKeepListening) return;
      if (!isListening) {
        safeStartRecognition();
      } else if (!isSpeaking && (Date.now() - lastHeartbeatTime > 6500)) {
        // Agar 6.5 soniyadan beri hech qanday signal kelmagan bo'lsa va recognition muzlab qolgan bo'lsa
        console.log("[AI Watchdog] Recognition muzlab qolgan bo'lishi mumkin, yangilanmoqda...");
        try { if (recognition) recognition.stop(); } catch (_) {}
        isListening = false;
        lastHeartbeatTime = Date.now();
        setTimeout(() => {
          if (shouldKeepListening) safeStartRecognition();
        }, 120);
      }
    }, 1000);
  }

  function stopWatchdog() {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function startListening() {
    shouldKeepListening = true;
    safeStartRecognition();
    startWatchdog();
  }

  function stopListening() {
    shouldKeepListening = false;
    stopWatchdog();
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch (_) {}
    }
    isListening = false;
    updateAiStatus('idle', 'Kutilmoqda');
  }

  // Toggle Voice Listening
  window.toggleAiVoiceListening = function() {
    if (isListening || shouldKeepListening) {
      stopListening();
    } else {
      startListening();
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

  // Helper: finish speech and restore recognition cleanly after echo dissipation
  function finishSpeechCleanup(callback) {
    isSpeaking = false;
    isTemporarilyPausedForTts = false;
    ignoreSpeechUntil = 0;
    currentSpeakingText = '';
    lastHeartbeatTime = Date.now();

    // Audio ijrosi tugagach, brauzer mikrofon oqimini yangilash uchun recognition ni toza qayta ishga tushirish
    try {
      if (recognition) {
        recognition.stop();
      }
    } catch (_) {}
    isListening = false;

    if (shouldKeepListening) {
      updateAiStatus('listening', 'Eshitmoqda...');
      setTimeout(() => {
        if (shouldKeepListening) {
          safeStartRecognition();
        }
      }, 120);
    } else {
      updateAiStatus('idle', 'Kutilmoqda');
    }
    if (callback) callback();
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
        activeAudioPlayer.currentTime = 0;
        activeAudioPlayer.src = '';
      } catch (_) {}
      activeAudioPlayer = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const cleanText = (text || '').trim();
    if (!cleanText) {
      finishSpeechCleanup(callback);
      return;
    }

    isSpeaking = true;
    currentSpeakingText = cleanText;
    updateAiStatus('speaking', 'Gapirmoqda...');

    // Muhim: Foydalanuvchi gapirsa eshitish uchun recognition faol qoladi (Barge-in)
    if (shouldKeepListening && !isListening) {
      safeStartRecognition();
    }

    // 1. Microsoft Neural O'zbekcha ovoz: blob orqali (HTML/500 javob audio.src ni buzmasin)
    if (!sharedTtsAudio) {
      sharedTtsAudio = new Audio();
    }
    const audio = sharedTtsAudio;
    activeAudioPlayer = audio;

    let fallbackTriggered = false;
    const triggerLocalFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      try {
        audio.pause();
        if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        audio.removeAttribute('src');
        audio.load();
      } catch (_) {}
      if (activeAudioPlayer === audio) activeAudioPlayer = null;
      speakLocalUzbek(cleanText, callback);
    };

    audio.onplay = () => {
      fallbackTriggered = true;
      isSpeaking = true;
      currentSpeakingText = cleanText;
      updateAiStatus('speaking', 'Gapirmoqda...');
      if (shouldKeepListening && !isListening) {
        safeStartRecognition();
      }
    };

    audio.onended = () => {
      try {
        if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      } catch (_) {}
      activeAudioPlayer = null;
      finishSpeechCleanup(callback);
    };

    audio.onerror = () => {
      triggerLocalFallback();
    };

    playNeuralTts(cleanText, audio).catch(() => triggerLocalFallback());
  }

  async function fetchTtsAudioBlob(text) {
    const q = '?text=' + encodeURIComponent(text);
    const urls = [
      '/api/tts' + q,
      window.location.origin + '/api/tts' + q,
      'https://ijro-nine.vercel.app/api/tts' + q
    ];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (ctype.includes('text/html') || ctype.includes('text/plain') || ctype.includes('application/json')) {
          continue;
        }
        const blob = await res.blob();
        if (blob && blob.size > 100) return blob;
      } catch (_) {}
    }
    return null;
  }

  async function playNeuralTts(text, audio) {
    const blob = await fetchTtsAudioBlob(text);
    if (!blob) throw new Error('tts-unavailable');
    const objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    try {
      await audio.play();
    } catch (err) {
      try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      throw err;
    }
  }

  // Mahalliy O'zbekcha Fallback (Faqat O'zbek tili, inglizcha butunlay taqiqlangan)
  function speakLocalUzbek(text, callback) {
    if (!('speechSynthesis' in window)) {
      finishSpeechCleanup(callback);
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const voices = cachedVoices.length > 0 ? cachedVoices : (window.speechSynthesis.getVoices() || []);
      // Faqat va faqat o'zbek tili ovozini topish (uz-UZ, Madina, Sardor, Uzbek)
      let selectedVoice = voices.find(v => 
        (v.lang && (v.lang.toLowerCase().startsWith('uz') || v.lang.toLowerCase().includes('uzb'))) ||
        (v.name && (v.name.toLowerCase().includes('uzbek') || v.name.toLowerCase().includes('madina') || v.name.toLowerCase().includes('sardor')))
      );

      // Inglizcha, ruscha yoki boshqa tillardagi ovoz QAT'IYAN TAQIQLANGAN:
      if (!selectedVoice) {
        console.log("[TTS] Brauzerda sof o'zbekcha ovoz topilmadi, inglizcha ovoz bloklandi.");
        finishSpeechCleanup(callback);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || 'uz-UZ';
      } else {
        utterance.lang = 'uz-UZ';
      }

      utterance.onstart = () => {
        isSpeaking = true;
        currentSpeakingText = text;
        updateAiStatus('speaking', 'Gapirmoqda...');
        if (shouldKeepListening && !isListening) {
          safeStartRecognition();
        }
      };

      utterance.onend = () => {
        finishSpeechCleanup(callback);
      };

      utterance.onerror = (e) => {
        console.warn("speechSynthesis utterance error:", e);
        finishSpeechCleanup(callback);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("speakLocalUzbek error:", e);
      finishSpeechCleanup(callback);
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

  // Helper: Extract task title cleanly from Hokim speech (handling refinement & Uzbek/Xorazm speech)
  function extractTaskTitle(rawText) {
    if (!rawText) return "Topshiriq ijrosini ta'minlash";

    // Split into sentences if user refined their speech
    const phrases = rawText.split(/[.!?]+/);
    let candidatePhrase = "";
    for (let i = phrases.length - 1; i >= 0; i--) {
      const pClean = phrases[i].trim();
      if (pClean.length > 3 && !/^(yangi topshiriq|topshiriq yarat|ha|yoq|tasdiqlayman)$/i.test(pClean)) {
        candidatePhrase = pClean;
        break;
      }
    }
    if (!candidatePhrase) candidatePhrase = rawText;

    let title = candidatePhrase;
    title = title.replace(/\b(?:yangi\s+)?(?:topshiriq|vazifa|ish)\s+(?:yarat(?:ish)?|ber(?:ish)?|yukla(?:sh)?)\b/gi, '');
    title = title.replace(/\byangi\s+topshiriq\b|\btopshiriq\s+yarat\b|\bvazifa\s+ber\b|\bish\s+ber\b/gi, '');
    title = title.replace(/\biltimos\b|\bmenga\b|\bbizga\b|\bshu\s+topshiriqni\b|\btopshiriq\s+u\s+topshiriq\s+bo['ʻ`]?ladi\b|\bqayerni\??\b/gi, '');
    title = title.replace(/\b[A-Za-z'ʻ‘’]+ga\s+(?:biriktir|topshir|ber|yukla)\b/gi, '');
    title = title.replace(/\b\d{1,2}[-–\s]*(?:chi|nchi)?\s*(?:sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust)[a-z]*\b/gi, '');
    title = title.replace(/\b(?:bugun|ertaga|indin|juma|shanba|yakshanba|dushanba|seshanba|chorshanba|payshanba)\b/gi, '');
    title = title.replace(/\b(?:gacha|kuni|boshlansin|tugasin)\b/gi, '');
    title = title.replace(/\b(?:kerak|qilsin|etsin|bo['ʻ`]?lsin|boldin|bajarilsin)\b/gi, '');
    title = title.replace(/[,;:.!?]/g, ' ').replace(/\s+/g, ' ').trim();

    if (!title || title.length < 3) {
      title = "Topshiriq ijrosini ta'minlash";
    } else {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    return title;
  }

  // Helper: Extract dates from speech (YYYY-MM-DD)
  function parseDateFromSpeech(text) {
    const lower = (text || '').toLowerCase();
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

    // Days of week in Uzbek
    const daysOfWeek = {
      'yakshanba': 0, 'dushanba': 1, 'seshanba': 2, 'chorshanba': 3,
      'payshanba': 4, 'juma': 5, 'shanba': 6
    };
    for (const [dayName, targetDay] of Object.entries(daysOfWeek)) {
      if (lower.includes(dayName)) {
        const currentDay = now.getDay();
        let diff = targetDay - currentDay;
        if (diff <= 0) diff += 7; // Kelgusi hafta kuni
        const d = new Date(now.getTime() + diff * 24 * 3600 * 1000);
        return d.toISOString().slice(0, 10);
      }
    }

    const monthMap = {
      'yanvar': 0, 'fevral': 1, 'mart': 2, 'aprel': 3, 'may': 4, 'iyun': 5,
      'iyul': 6, 'avgust': 7, 'sentabr': 8, 'sentyabr': 8, 'oktabr': 9, 'oktyabr': 9,
      'noyabr': 10, 'dekabr': 11
    };

    for (const [mName, mIdx] of Object.entries(monthMap)) {
      const regex = new RegExp(`(\\d{1,2})[-–\\s]*(?:chi|nchi)?\\s*${mName}`, 'i');
      const match = lower.match(regex);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = now.getFullYear();
        const d = new Date(year, mIdx, day);
        return d.toISOString().slice(0, 10);
      }
      const revRegex = new RegExp(`${mName}(?:ning|da|i)?\\s*(\\d{1,2})`, 'i');
      const revMatch = lower.match(revRegex);
      if (revMatch) {
        const day = parseInt(revMatch[1], 10);
        const year = now.getFullYear();
        const d = new Date(year, mIdx, day);
        return d.toISOString().slice(0, 10);
      }
    }

    const defaultLater = new Date(now.getTime() + 48 * 3600 * 1000);
    return defaultLater.toISOString().slice(0, 10);
  }

  // Helper: Extract date and time from speech for datetime-local input (YYYY-MM-DDTHH:MM)
  function parseDateTimeFromSpeech(text) {
    const lower = (text || '').toLowerCase();
    const dateStr = parseDateFromSpeech(text);
    let hours = 10;
    let minutes = 0;
    const timeMatch = lower.match(/(?:soat\s*)(\d{1,2})(?:[:.-](\d{2}))?\s*(?:da|ga|da\b|ga\b)?/i) ||
                      lower.match(/\b(\d{1,2})[:.](\d{2})\s*(?:da|ga)?\b/i);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      if (h >= 0 && h <= 23) {
        hours = h;
        if (timeMatch[2]) {
          minutes = parseInt(timeMatch[2], 10);
        }
      }
    }
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${dateStr}T${hh}:${mm}`;
  }

  // Helper: O'zbek tili morfologik qo'shimchalarini tozalash va o'zaklarni ajratish (-ga, -ka, -ni, -ning, -ov, -ev, -xon, -jon, -bek)
  function getUzbekWordStems(rawWord) {
    if (!rawWord) return [];
    const norm = normalizeUzbekSpeech(rawWord);
    if (!norm || norm.length < 2) return [];

    const clean = norm.replace(/[^a-z0-9']/gi, ' ');
    const tokens = clean.split(/\s+/).filter(t => t.length >= 2);
    const stems = new Set();

    for (const t of tokens) {
      stems.add(t);
      stems.add(t.replace(/'/g, ''));

      // Grammatik qo'shimchalar: -ga, -ka, -qa, -ni, -ning, -da, -dan, -mi, -chi, -xon, -jon, -bek, -boy, -aka
      const suffixes = [
        /^(.*?)(akaga|akani|akada|akadan|aka)$/,
        /^(.*?)(jonga|jonni|jonda|jondan|jon)$/,
        /^(.*?)(bekka|bekni|bekda|bekdan|bek)$/,
        /^(.*?)(xonga|xonni|xonda|xondan|xon)$/,
        /^(.*?)(boyga|boyni|boy)$/,
        /^(.*?)(larga|larni|larning|larda|lardan|lar)$/,
        /^(.*?)(ga|ka|qa|ni|ning|da|dan)$/,
        /^(.*?)(mi|chi)$/
      ];

      for (const regex of suffixes) {
        const m = t.match(regex);
        if (m && m[1] && m[1].length >= 3) {
          stems.add(m[1]);
          stems.add(m[1].replace(/'/g, ''));
        }
      }

      // Familiyalar: -ov, -ova, -ev, -eva o'zaklari (masalan: Yo'ldoshev -> Yo'ldosh, Xolmuradov -> Xolmurad)
      const surnameMatch = t.match(/^(.*?)(ov|ova|ev|eva)(ga|ka|qa|ni|ning|da|dan|mi)?$/);
      if (surnameMatch && surnameMatch[1] && surnameMatch[1].length >= 3) {
        stems.add(surnameMatch[1]);
        stems.add(surnameMatch[1].replace(/'/g, ''));
        stems.add(surnameMatch[1] + surnameMatch[2]);
        stems.add((surnameMatch[1] + surnameMatch[2]).replace(/'/g, ''));
      }
    }

    return Array.from(stems).filter(s => s.length >= 3);
  }

  // Mukammal xodimlarni qidirish (Ism, familiya, to'liq ism, tashkilot va bir nechta mos kelganda Ambiguity aniqlash)
  function findWorkersInSpeech(text) {
    if (!text) return null;
    const lower = normalizeUzbekSpeech(text);
    const speechStems = getUzbekWordStems(lower);
    if (speechStems.length === 0) return null;

    const workers = (window.store && window.store.users || []).filter(u => u.role === 'WORKER');
    if (workers.length === 0) return null;

    const scoredWorkers = [];

    for (const w of workers) {
      const fName = normalizeUzbekSpeech(w.firstName || '');
      const lName = normalizeUzbekSpeech(w.lastName || '');
      const fullName = normalizeUzbekSpeech(w.fullName || '');
      const pos = normalizeUzbekSpeech(w.position || '');

      const fStems = getUzbekWordStems(fName);
      const lStems = getUzbekWordStems(lName);
      const fullStems = getUzbekWordStems(fullName);
      const posStems = getUzbekWordStems(pos);

      let score = 0;
      let matchedTerm = '';

      // 1. To'liq ism aniq uchrasa (masalan: "Xolmuradov Jalil" yoki "Yo'ldoshev Murod")
      if (fullName && fullName.length > 4 && (lower.includes(fullName) || lower.replace(/'/g, '').includes(fullName.replace(/'/g, '')))) {
        score += 30;
        matchedTerm = fullName;
      }

      // 2. Familiya mos kelsa (masalan: "Xolmuradovga" yoki "Yo'ldoshevga")
      for (const ls of lStems) {
        if (speechStems.includes(ls) || lower.includes(ls)) {
          score += 15;
          if (!matchedTerm) matchedTerm = ls;
          break;
        }
      }

      // 3. Ism mos kelsa (masalan: "Jalilga" yoki "Murodga")
      for (const fs of fStems) {
        if (speechStems.includes(fs) || lower.includes(fs)) {
          score += 10;
          if (!matchedTerm) matchedTerm = fs;
          break;
        }
      }

      // 4. To'liq ismning alohida bo'laklari mos kelsa
      for (const fws of fullStems) {
        if (speechStems.includes(fws) && !fStems.includes(fws) && !lStems.includes(fws)) {
          score += 8;
          if (!matchedTerm) matchedTerm = fws;
          break;
        }
      }

      // 5. Tashkilot yoki lavozim mos kelsa (masalan: "Toza hududga", "Obodonlashtirishga")
      for (const ps of posStems) {
        if (speechStems.includes(ps)) {
          score += 7;
          if (!matchedTerm) matchedTerm = ps;
          break;
        }
      }

      if (score > 0) {
        scoredWorkers.push({ worker: w, score, matchedTerm });
      }
    }

    if (scoredWorkers.length === 0) return null;

    scoredWorkers.sort((a, b) => b.score - a.score);
    const topScore = scoredWorkers[0].score;

    // Agar eng yuqori ballni olgan faqat 1 ta xodim bo'lsa (yoki birortasida familiya+ism ikkalasi ham bo'lsa):
    const topMatches = scoredWorkers.filter(sw => sw.score === topScore);

    if (topMatches.length === 1) {
      return { match: topMatches[0].worker };
    }

    // Agar bir xil ismli bir nechta xodim bo'lsa (masalan ikkita "Murod" bo'lsa):
    const ambiguousWorkers = topMatches.map(tm => tm.worker);
    const commonName = topMatches[0].matchedTerm || 'xodim';
    return {
      ambiguous: ambiguousWorkers,
      commonName: commonName
    };
  }

  // Bir nechta xodim chiqqanda aniqlashtiruvchi savol tuzish: "Qaysi Murodga? Yo'ldoshevmi yoki Karimovmi?"
  function formatWorkerDisambiguationQuestion(workers, commonName) {
    const nameCap = commonName ? (commonName.charAt(0).toUpperCase() + commonName.slice(1)) : 'xodim';
    const labels = workers.map(w => {
      // Har bir xodimning ajratib turuvchi familiyasini topish
      let lName = (w.lastName || '').trim();
      if (!lName && w.fullName) {
        const parts = w.fullName.trim().split(/\s+/);
        if (parts.length > 1) lName = parts[0];
      }
      if (lName && lName.toLowerCase() !== commonName.toLowerCase()) {
        const cleanL = lName.charAt(0).toUpperCase() + lName.slice(1);
        return cleanL + 'mi';
      }
      // Agar familiyalar ham bir xil bo'lsa, tashkilot/lavozimini aytamiz
      const pos = w.position ? `[${w.position}] ` : '';
      return (pos + (w.fullName || w.firstName)) + 'mi';
    });

    if (labels.length === 2) {
      return `Qaysi ${nameCap}ga? ${labels[0]} yoki ${labels[1]}?`;
    } else {
      const last = labels.pop();
      return `Qaysi ${nameCap}ga? ${labels.join(', ')} yoki ${last}?`;
    }
  }

  // Ambiguity savoliga berilgan javobni tahlil qilib, kerakli xodimni topish
  function resolveAmbiguousWorker(text, workers) {
    if (!text || !Array.isArray(workers) || workers.length === 0) return null;
    const lower = normalizeUzbekSpeech(text);
    const stems = getUzbekWordStems(lower);

    // 1. Tartib bo'yicha: "birinchisiga", "1", "ikkinchisiga", "2"
    if (lower.includes('birinchi') || lower.includes('1-chi') || lower.includes('1 chi') || /\b1\b/.test(lower)) {
      return workers[0];
    }
    if (lower.includes('ikkinchi') || lower.includes('2-chi') || lower.includes('2 chi') || /\b2\b/.test(lower)) {
      return workers[1] || workers[0];
    }
    if (lower.includes('uchinchi') || lower.includes('3-chi') || lower.includes('3 chi') || /\b3\b/.test(lower)) {
      return workers[2] || workers[0];
    }

    // 2. Familiya, ism, lavozim/tashkilot bo'yicha qidirish
    let bestWorker = null;
    let maxScore = 0;

    for (const w of workers) {
      let score = 0;
      const lName = normalizeUzbekSpeech(w.lastName || '');
      const fName = normalizeUzbekSpeech(w.firstName || '');
      const fullName = normalizeUzbekSpeech(w.fullName || '');
      const pos = normalizeUzbekSpeech(w.position || '');

      const wStems = [
        ...getUzbekWordStems(lName),
        ...getUzbekWordStems(fName),
        ...getUzbekWordStems(fullName),
        ...getUzbekWordStems(pos)
      ];

      for (const s of stems) {
        if (wStems.includes(s)) {
          score += 10;
        } else if (lName.includes(s) || lower.includes(lName)) {
          score += 8;
        } else if (pos.includes(s) || lower.includes(pos)) {
          score += 6;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestWorker = w;
      }
    }

    return maxScore > 0 ? bestWorker : null;
  }

  // Backward compatible helper
  function findWorkerInSpeech(text) {
    const res = findWorkersInSpeech(text);
    if (!res) return null;
    return res.match || (res.ambiguous ? res.ambiguous[0] : null);
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
  "intent": "CREATE_TASK" | "FILTER_STATUS" | "NAVIGATE" | "CLEAR_SEARCH" | "CONFIRM" | "CANCEL" | "GREETING" | "SEARCH" | "CHAT",
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
}

MUHIM QOIDALAR:
1. CLEAR_SEARCH: Agar Hokim "inputni tozala", "qidiruvni tozala", "tozala", "o'chir", "inputni bo'shat" desa -> intent: "CLEAR_SEARCH", speechReply: "Qidiruv maydoni tozalandi."
2. NAVIGATE: Agar Hokim "1-pej" / "birinchi page" (topshiriqlar - tab 0), "2-pej" (rejalar - tab 1), "3-pej" (xodimlar - tab 2), "4-pej" (chatlar - tab 3) desa -> intent: "NAVIGATE", tab: 0..3.
3. SEARCH: FAQAT VA FAQAT Hokim "qidir", "izla", "top" so'zlarini aytgandagina SEARCH intentini tanlang!
4. Agar Hokim tizimga aloqasiz narsa aytsa (masalan "videoni och", "qayerdasan" yoki tasodifiy gaplar) HECH QACHON "SEARCH" qilmang! Intent: "CHAT" bo'lsin va o'zbekcha tushuntiring.`;

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

  // Helper: Find matching tasks by title, worker name, or keyword
  function findMatchingTasks(query) {
    const mayor = window.store?.currentUser;
    const tasks = (window.store?.tasks || []).filter(t => !mayor || t.mayorId === mayor.id);
    if (!query || query === 'oxirgi' || query === 'shu' || query === 'oxirgisini') {
      return tasks.length > 0 ? [tasks[0]] : [];
    }
    const cleanQ = query.toLowerCase().trim();
    // 1. Direct or partial title match
    let matches = tasks.filter(t => t.title && t.title.toLowerCase().includes(cleanQ));
    if (matches.length > 0) return matches;

    // 2. Word tokens match (e.g. "asfaltlash", "ta'mirlash", "yo'llarni", "ichki")
    const words = cleanQ.split(/\s+/).filter(w => w.length >= 3 && !['topshiriq', 'vazifa', 'kerak', 'bilan', 'uchun'].includes(w));
    if (words.length > 0) {
      matches = tasks.filter(t => {
        const titleLower = (t.title || '').toLowerCase();
        return words.some(w => titleLower.includes(w));
      });
      if (matches.length > 0) return matches;
    }

    // 3. Worker name match
    matches = tasks.filter(t => t.assignedWorkerName && t.assignedWorkerName.toLowerCase().includes(cleanQ));
    return matches;
  }

  // Helper: Play voice audio if task contains audio
  function playTaskAudioIfPresent(task, callback) {
    const audioSrc = (task.voiceList && Array.isArray(task.voiceList) && task.voiceList.length > 0)
      ? task.voiceList[0]
      : (task.voiceBase64 || task.audioUrl || task.voicePath);

    if (audioSrc) {
      try {
        if (activeAudioPlayer) {
          activeAudioPlayer.pause();
          activeAudioPlayer.src = '';
        }
        activeAudioPlayer = new Audio(audioSrc);
        activeAudioPlayer.onended = () => {
          if (callback) callback(true);
        };
        activeAudioPlayer.onerror = () => {
          if (callback) callback(false);
        };
        const p = activeAudioPlayer.play();
        if (p !== undefined) {
          p.catch(() => {
            if (callback) callback(false);
          });
        }
        return true;
      } catch (e) {
        console.warn("Audio play error:", e);
      }
    }
    return false;
  }

  // Core NLP Intent Engine (supporting Uzbek & Xorazm dialect + common admin terms)
  function analyzeIntent(rawText) {
    const text = normalizeUzbekSpeech(rawText);

    // 0. To'xtatish va o'zini o'zi yopish (Stop / Dismiss)
    const stopWords = ["to'xta", "toxta", "to'xtat", "toxtat", "jim bo'l", "jim bol", "jim", "bas", "yetadi", "yopil", "stop", "xayr"];
    if (stopWords.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w) || text.includes(' ' + w + ' '))) {
      return {
        intent: 'STOP',
        message: "Tushundim, to'xtadim."
      };
    }

    // 0.1. Oynalarni yopish / Orqaga (Close Modals)
    if (text.includes('modalni yop') || text.includes('oynani yop') || text.includes('oynani bekor') || text.includes('orqaga') || text.includes('yopib qoy') || text.includes('yopib qo\'y') || text === 'yop' || text === 'chiqish') {
      return {
        intent: 'CLOSE_MODAL',
        message: "Oyna yopildi."
      };
    }

    // 0.2. Qidiruv / Inputni tozalash
    const isClearCmd = (
      text.includes('inputni tozala') ||
      text.includes('inputni ochir') ||
      text.includes('inputni o\'chir') ||
      text.includes('inputni boshat') ||
      text.includes('inputni bo\'shat') ||
      text.includes('inputni toza') ||
      text.includes('qidiruvni tozala') ||
      text.includes('qidiruvni ochir') ||
      text.includes('qidiruvni o\'chir') ||
      text.includes('qidiruvni bekor') ||
      text.includes('qidiruvni toza') ||
      text.includes('qidiruvni tashla') ||
      text.includes('qidiruv tozala') ||
      text.includes('qidiruv ochir') ||
      text.includes('qidiruvni olib tashla') ||
      text === 'tozala' ||
      text === 'tozalagin' ||
      text === 'toza qil' ||
      text === 'tozalash' ||
      text === 'ochir inputni' ||
      text === 'o\'chir inputni'
    );
    if (isClearCmd) {
      return {
        intent: 'CLEAR_SEARCH',
        message: "Qidiruv maydoni tozalandi."
      };
    }

    // 0.3. Topshiriqni tekshirish va qabul qilish (Inspect / Accept completed task)
    if (text.includes('tekshir') || text.includes('qabul qil') || text.includes('tasdiqla') || text.includes('tekshirdim')) {
      if (!text.includes('saqla') && !text.includes('yarat') && !text.includes('reja')) {
        return {
          intent: 'INSPECT_TASK',
          message: "Topshiriq tekshirilmoqda..."
        };
      }
    }

    // 0.4. Chatni ochish (Open Chat with worker)
    if (text.includes('chat') || text.includes('xabar') || text.includes('yozish')) {
      const worker = findWorkerInSpeech(text);
      if (worker || text.includes('chatni och') || text.includes('chatga o\'t')) {
        return {
          intent: 'OPEN_CHAT',
          worker: worker,
          message: worker ? `${worker.fullName || (worker.firstName + ' ' + worker.lastName)} bilan chat ochilmoqda...` : "Chatlar bo'limi ochildi."
        };
      }
    }

    // 0.5. Topshiriqni o'chirish (Delete Task)
    const isDeleteWord = /\b(?:o['ʻ`]?chir(?:ib)?(?:\s+tashla)?|olib\s+tashla|delete|yo['ʻ`]?qot)\b/i.test(text);
    const hasTaskContext = (
      text.includes('topshiriq') || text.includes('vazifa') || text.includes('ishni') ||
      text.includes('asfaltlash') || text.includes('ta\'mirlash') || text.includes('qurish') ||
      text.includes('barchasini') || text.includes('hammasini') || text.includes('shu') || text.includes('oxirgi')
    );
    if (isDeleteWord && hasTaskContext && !text.includes('qidiruv') && !text.includes('input') && !text.includes('maydon')) {
      let q = rawText
        .replace(/\b(?:shu|ushbu|oxirgi|barcha|hamma)?\s*(?:topshiriq(?:ni|ini|larni)?|vazifa(?:ni|ini|larni)?)\b/gi, '')
        .replace(/\b(?:o['ʻ`]?chir(?:ib)?(?:\s+tashla)?|olib\s+tashla|delete|yo['ʻ`]?qot)\b/gi, '')
        .replace(/\b(?:ni|ning|da|deb)\b/gi, '')
        .trim();
      return {
        intent: 'DELETE_TASK',
        query: q,
        raw: rawText
      };
    }

    // 0.6. Ommaviy Xabarnoma / E'lon yuborish (Broadcast Message / Chat 2)
    const isBroadcast = (
      (
        (text.includes('xodim') || text.includes('ishchi') || text.includes('hamma') || text.includes('barcha') || text.includes('ommaviy')) &&
        (text.includes("e'lon") || text.includes('elon') || text.includes('xabarnoma') || text.includes('majlis') || text.includes("yig'ilish") || text.includes('xabar yubor') || text.includes("xabar jo'nat"))
      ) ||
      text.startsWith("e'lon yubor") || text.startsWith("elon yubor") || text.startsWith("ommaviy e'lon") || text.startsWith("ommaviy xabar")
    );
    if (isBroadcast) {
      let org = 'all';
      const users = window.store?.users || [];
      for (const u of users) {
        if (u.position && text.includes(u.position.toLowerCase())) {
          org = u.position;
          break;
        }
      }
      let content = rawText
        .replace(/.*?(?:deb\s+e['ʻ`]?lon\s+yubor|deb\s+xabar\s+yubor|deb\s+ayt|e['ʻ`]?lon\s+yubor:?|elon\s+yubor:?|ommaviy\s+xabar:?|xabarnoma\s+yubor:?)/i, '')
        .trim();
      if (!content || content.length < 3) {
        content = rawText
          .replace(/\b(?:barcha|hamma)\s+(?:xodimlarga|ishchilarga|mas['ʻ`]?ullarga)?\b/gi, '')
          .replace(/\b(?:deb)?\s+(?:e['ʻ`]?lon|xabar|xabarnoma)\s+(?:yubor(?:ish)?|jo['ʻ`]?nat(?:ish)?)\b/gi, '')
          .trim();
      }
      return {
        intent: 'BROADCAST_MESSAGE',
        targetOrg: org,
        text: content || "Barcha mas'ullar bugun tuman hokimligiga majlisga yetib kelsin."
      };
    }

    // 1. Yangi topshiriq yaratish (Create Task - MUST BE CHECKED BEFORE NAVIGATE)
    const isExplicitTaskCreate = (
      text.includes('yangi topshiriq') ||
      text.includes('topshiriq yarat') ||
      text.includes('topshiriq ber') ||
      text.includes('topshiriq qo\'sh') ||
      text.includes('topshiriq qosh') ||
      text.includes('vazifa ber') ||
      text.includes('vazifa yarat') ||
      text.includes('yangi vazifa') ||
      text.includes('plyusni bos') ||
      text.includes('plyus bos') ||
      text.includes('ish ber') ||
      text.includes('zadaniya sozdat')
    );
    if (isExplicitTaskCreate) {
      const workerRes = findWorkersInSpeech(text);
      const cleanTitle = extractTaskTitle(rawText);
      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = parseDateFromSpeech(text);
      return {
        intent: 'CREATE_TASK',
        worker: workerRes?.match || null,
        ambiguousWorkers: workerRes?.ambiguous || null,
        commonName: workerRes?.commonName || '',
        title: cleanTitle,
        startDate: todayStr,
        endDate: endStr
      };
    }

    // 2. Yangi reja tuzish (Create Schedule)
    const isExplicitScheduleCreate = (
      text.includes('yangi reja') ||
      text.includes('reja tuz') ||
      text.includes('reja yarat') ||
      text.includes('reja qo\'sh') ||
      text.includes('reja qosh') ||
      text.includes('uchrashuv belgil') ||
      text.includes('kun tartibi') ||
      text.includes('reja kirit')
    );
    if (isExplicitScheduleCreate) {
      let title = text.replace(/\b(?:yangi\s+)?(?:reja|uchrashuv)\s+(?:tuz(?:ish)?|yarat(?:ish)?|qo['ʻ`]?sh(?:ish)?|belgil(?:ash)?|kirit(?:ish)?)\b/gi, '')
                      .replace(/\byangi reja\b|\breja tuz\b|\breja qo['ʻ`]?sh\b/gi, '')
                      .trim();
      const dt = parseDateTimeFromSpeech(text);
      return {
        intent: 'CREATE_SCHEDULE',
        title: title ? (title.charAt(0).toUpperCase() + title.slice(1)) : '',
        time: dt
      };
    }

    // 3. Yangi xodim qo'shish (Create Worker)
    const isExplicitWorkerCreate = (
      text.includes('yangi xodim') ||
      text.includes('xodim qo\'sh') ||
      text.includes('xodim qosh') ||
      text.includes('ishchi qo\'sh') ||
      text.includes('ishchi qosh') ||
      text.includes('xodim yarat') ||
      text.includes('ishchi ol')
    );
    if (isExplicitWorkerCreate) {
      return {
        intent: 'CREATE_WORKER'
      };
    }

    // 4. Salomlashish va hol-ahvol (Greeting)
    const greetings = ['salom', 'assalomu alaykum', 'assalom', 'qandaysiz', 'qalaysiz', 'charchamang', 'hormang', 'salomatmisiz', 'privet', 'hello'];
    if (greetings.some(g => text === g || text.startsWith(g + ' ') || text.endsWith(' ' + g) || text === g + '!' || text === g + '?')) {
      return {
        intent: 'GREETING',
        message: "Assalomu alaykum! Sizga qanday yordam bera olaman?"
      };
    }

    // 5. Tasdiqlash javoblari (Confirmation)
    const confirmWords = [
      'ha', 'xa', 'albatta', 'bo\'ldi', 'boldi', 'to\'g\'ri', 'tasdiqlayman', 'tasdiqla',
      'saqla', 'saqlab qo\'y', 'saqlansin', 'yubor', 'tamom', 'tayyor', 'yaxshi',
      'ok', 'yes', 'shunday', 'etdim', 'yetadi', 'da', 'podtverjdayu', 'davay', 'ladno', 'bajarilsin'
    ];
    if (confirmWords.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w) || text.includes(' ' + w + ' '))) {
      return { intent: 'CONFIRM' };
    }

    // 6. Bekor qilish (Cancel)
    const cancelWords = [
      'yo\'q', 'yoq', 'no', 'kerakmas', 'kerak emas', 'bekor', 'bekor qil',
      'to\'xtat', 'toxtat', 'net', 'otmena'
    ];
    if (cancelWords.some(w => text === w || text === w + '!' || text.startsWith(w + ' ') || text.endsWith(' ' + w))) {
      return { intent: 'CANCEL' };
    }

    // 7. Xatolikni tuzatish (Correction / Xorazm "duzot")
    if (text.includes('xatosi bor') || text.includes('duzot') || text.includes('tuzat') || text.includes('o\'zgartir') || text.includes('emas') || text.includes('o\'rniga') || text.includes('almashtir') || text.includes('xato qilding') || text.includes('xato qilibsan')) {
      const worker = findWorkerInSpeech(text);
      const hasDate = text.includes('sentabr') || text.includes('sentyabr') || text.includes('oktabr') || text.includes('oktyabr') || text.includes('noyabr') || text.includes('dekabr') || text.includes('ertaga') || text.includes('bugun') || text.includes('juma') || text.includes('shanba');
      return {
        intent: 'CORRECT',
        worker,
        newDate: hasDate ? parseDateFromSpeech(text) : null
      };
    }

    // 8.0 Barcha topshiriqlarni chiqarish / ko'rsatish
    const isShowAllTasks = (
      text.includes('barcha topshiriq') ||
      text.includes('hamma topshiriq') ||
      text.includes('barcha vazifa') ||
      text.includes('hamma vazifa') ||
      text.includes('topshiriqlarni chiqar') ||
      text.includes('topshiriqni chiqar') ||
      text.includes('topshiriqlarni korsat') ||
      text.includes("topshiriqlarni ko'rsat") ||
      text.includes('hammasini chiqar') ||
      text.includes('hammasini korsat') ||
      text.includes("hammasini ko'rsat") ||
      text.includes('barchasini chiqar') ||
      text.includes('barchasini korsat') ||
      text.includes("barchasini ko'rsat") ||
      text === 'hammasi' ||
      text === 'barchasi' ||
      text === 'barcha'
    );
    if (isShowAllTasks) {
      return {
        intent: 'FILTER_STATUS',
        statusIdx: 0,
        message: "Barcha topshiriqlar ro'yxati ochildi."
      };
    }

    // 8. Sahifalarga o'tish (Navigation - Tab 0, 1, 2, 3)
    // Tab 0: Topshiriqlar ("1-pej", "1-page", "birinchi sahifa", "topshiriqlar", "topshiriqqa o't", "asosiy sahifa")
    const isNavTab0 = (
      /\b(?:1[- ]?(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|birinchi\s+(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|bosh\s+sahifa|asosiy\s+sahifa|glavniy)\b/i.test(text) ||
      (
        (text.includes('topshiriq') || text.includes('vazifa')) &&
        (text.includes('sahifa') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('ot') || text.includes('och') || text.includes('chiqar') || text.includes("ko'rsat") || text.includes('korsat') || text.includes('bolim') || text.includes("bo'lim") || text === 'topshiriqlar' || text === 'topshiriq' || text === 'vazifalar' || text === 'vazifa' || text.includes('topshiriqqa') || text.includes('topshiriqlarga'))
      )
    );
    if (isNavTab0) {
      return { intent: 'NAVIGATE', tab: 0, message: "1-sahifa: Topshiriqlar bo'limi ochildi." };
    }

    // Tab 1: Rejalar ("2-pej", "2-page", "ikkinchi sahifa", "rejalar", "rejalarga o't", "kalendar")
    const isNavTab1 = (
      /\b(?:2[- ]?(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|ikkinchi\s+(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*)\b/i.test(text) ||
      (
        text.includes('reja') &&
        (text.includes('sahifa') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('ot') || text.includes('och') || text.includes('chiqar') || text.includes("ko'rsat") || text.includes('korsat') || text.includes('bolim') || text.includes("bo'lim") || text === 'rejalar' || text === 'reja' || text === 'rejalarim' || text.includes('rejalarga') || text.includes('rejaga'))
      ) ||
      text === 'kalendar' || text.includes('kalendarga') || text.includes('kalendarni')
    );
    if (isNavTab1) {
      return { intent: 'NAVIGATE', tab: 1, message: "2-sahifa: Rejalar bo'limi ochildi." };
    }

    // Tab 2: Xodimlar va reyting ("3-pej", "3-page", "uchinchi sahifa", "xodimlar", "xodimlarga o't", "reyting")
    const isNavTab2 = (
      /\b(?:3[- ]?(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|uchinchi\s+(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|reyting\w*)\b/i.test(text) ||
      (
        (text.includes('xodim') || text.includes('ishchi')) &&
        (text.includes('sahifa') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('ot') || text.includes('och') || text.includes('chiqar') || text.includes("ko'rsat") || text.includes('korsat') || text.includes('bolim') || text.includes("bo'lim") || text === 'xodimlar' || text === 'ishchilar' || text.includes('xodimlarga') || text.includes('ishchilarga'))
      )
    );
    if (isNavTab2) {
      return { intent: 'NAVIGATE', tab: 2, message: "3-sahifa: Xodimlar va ularning reytingi sahifasiga o'tdik." };
    }

    // Tab 3: Chatlar ("4-pej", "4-page", "to'rtinchi sahifa", "chatlar", "chatga o't", "xabarlar")
    const isNavTab3 = (
      /\b(?:4[- ]?(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*|to['`]?rtinchi\s+(?:pej|peyj|page|sahifa|vkladka|bolim|bo'lim)\w*)\b/i.test(text) ||
      (
        (text.includes('chat') || text.includes('xabar') || text.includes('yozishma')) &&
        (text.includes('sahifa') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('ot') || text.includes('och') || text.includes('chiqar') || text.includes("ko'rsat") || text.includes('korsat') || text.includes('bolim') || text.includes("bo'lim") || text === 'chatlar' || text === 'chat' || text === 'yozishmalar' || text === 'xabarlar' || text.includes('chatga') || text.includes('chatlarga'))
      )
    );
    if (isNavTab3) {
      return { intent: 'NAVIGATE', tab: 3, message: "4-sahifa: Chatlar bo'limi ochildi." };
    }

    // 9. Filtrlash (Filter)
    // 0: Barchasi
    if (
      text.includes('barchasini och') || text.includes('barchasini ko\'rsat') || 
      text.includes('hamma topshiriq') || text.includes('barcha topshiriq') ||
      text === 'barchasi' || text === 'hammasi' || text === 'barcha' || text === 'barchasini' || text === 'hammasini'
    ) {
      return { intent: 'FILTER_STATUS', statusIdx: 0, message: "Barcha topshiriqlar ro'yxati ochildi." };
    }
    // 1: Boshlanmagan (Qizil / Kutilmoqda)
    if (
      text.includes('boshlanmagan') || text.includes('boshlanmaganlar') || text.includes('kutilayotgan') || 
      text.includes('bajarilmagan') || text.includes('qizil')
    ) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Boshlanmagan topshiriqlar ochildi." };
    }
    // 2: Jarayonda (Sariq / Ishlanmoqda)
    if (
      text.includes('jarayon') || text.includes('jarayondagi') || text.includes('jarayondagilar') || 
      text.includes('ishlanmoqda') || text.includes('ishlanayotgan') || text.includes('sariq')
    ) {
      return { intent: 'FILTER_STATUS', statusIdx: 2, message: "Jarayondagi topshiriqlar ochildi." };
    }
    // 3: Bajarilgan (Yashil / Tugatilgan)
    if (
      text.includes('bajarilgan') || text.includes('bajarilganlar') || text.includes('tugatilgan') || 
      text.includes('bitgan') || text.includes('yashil')
    ) {
      return { intent: 'FILTER_STATUS', statusIdx: 3, message: "Bajarilgan topshiriqlar ochildi." };
    }
    // 4: Tekshirilgan (Ko'k / Tasdiqlangan)
    if (
      text.includes('tekshirilgan') || text.includes('tekshirilganlar') || text.includes('tasdiqlangan') || 
      text.includes('ko\'k') || text.includes('tekshirilganlarni')
    ) {
      return { intent: 'FILTER_STATUS', statusIdx: 4, message: "Tekshirilgan topshiriqlar ochildi." };
    }
    // Kechikkan / Muddati o'tgan
    if (text.includes('kechikkan') || text.includes('muddati o\'tgan') || text.includes('kechikkanlar')) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Kechikkan va boshlanmagan topshiriqlar ko'rsatilmoqda." };
    }

    // 10. Minnatdorchilik va umumiy savollar
    if (text.includes('rahmat') || text.includes('barakalla') || text.includes('balli') || text.includes('tashakkur')) {
      return {
        intent: 'GREETING',
        message: "Arzimaydi! Xizmat qilishdan doim mamnunman."
      };
    }
    if (text.includes('kimsan') || text.includes('nima qila olasan') || text.includes('yordam ber')) {
      return {
        intent: 'GREETING',
        message: "Men sizning shaxsiy sun'iy intellekt yordamchingizman. Topshiriq yaratish, rejalarni belgilash, xodimlar qo'shish yoki chatlarni ochishim mumkin."
      };
    }

    // 11. Qidiruv (Search) - FAQAT VA FAQAT foydalanuvchi "qidir", "izla", "top" deb buyurgandagina!
    const isSearchWord = /\b(?:qidir|qidirgin|izla|izlagin|top|topib ber)\b/i.test(text);
    if (isSearchWord && !text.includes('tozala') && !text.includes('o\'chir') && !text.includes('ochir') && !text.includes('bekor')) {
      const searchMatch = text.match(/\b(?:qidir|qidirgin|izla|izlagin|top|topib ber)\s+(.*)/i) || text.match(/(.*)\s+(?:qidir|qidirgin|izla|izlagin|top|topib ber)\b/i);
      if (searchMatch) {
        let q = (searchMatch[1] || '').replace(/ni\b|ning\b|da\b|deb\b|haqida\b/gi, '').trim();
        if (q.length >= 2 && !q.includes('sahifa') && !q.includes('pej') && !q.includes('page')) {
          return {
            intent: 'SEARCH',
            query: q
          };
        }
      }
    }

    // 12. Implitsit (bevosita) topshiriq topshirish: "Yo'lni asfaltlash kerak", "Jalilga biriktir", "Murodga ber"
    const workerRes = findWorkersInSpeech(text);
    const detectedWorker = workerRes?.match || null;
    const ambiguousWorkers = workerRes?.ambiguous || null;
    const commonName = workerRes?.commonName || '';
    const isTaskContext = text.includes('kerak') || text.includes('asfaltlash') || text.includes('tozalash') || text.includes('ta\'mirlash') || text.includes('qurish') || text.includes('qilsin') || text.includes('etsin') || text.includes('biriktir') || text.includes('topshir') || text.includes('vazifa');

    if (detectedWorker || ambiguousWorkers || isTaskContext) {
      const cleanTitle = extractTaskTitle(rawText);
      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = parseDateFromSpeech(text);

      return {
        intent: 'CREATE_TASK',
        worker: detectedWorker,
        ambiguousWorkers: ambiguousWorkers,
        commonName: commonName,
        title: cleanTitle,
        startDate: todayStr,
        endDate: endStr
      };
    }

    // Begona yoki tushunarsiz buyruqlar hech qachon qidiruvga berilmaydi!
    return {
      intent: 'UNKNOWN',
      raw: rawText
    };
  }

  let lastProcessedSpeech = '';
  let lastProcessedTime = 0;

  async function handleUserSpeech(userSpeech) {
    const trimmed = (userSpeech || '').trim();
    if (!trimmed) return;

    const now = Date.now();
    if (trimmed.toLowerCase() === lastProcessedSpeech && (now - lastProcessedTime) < 1200) {
      return;
    }
    lastProcessedSpeech = trimmed.toLowerCase();
    lastProcessedTime = now;

    // 1. Shovqin va "30224" sonlarini butunlay bloklash
    if (trimmed.includes('30224') || trimmed.includes('30.00.24') || trimmed.includes('00.24') || trimmed.includes('00:24') || /^[\d\s.:\-_/]+$/.test(trimmed)) {
      console.log("handleUserSpeech: Blocked 30224 noise sequence:", trimmed);
      return;
    }

    if (!/[a-zA-Zа-яА-ЯўқғҳЎҚҒҲ]/.test(trimmed)) {
      return;
    }

    appendAiMessage('user', userSpeech);
    updateAiStatus('thinking', 'Qayta ishlanmoqda...');

    const normText = normalizeUzbekSpeech(trimmed);
    const cleanLower = normText;

    // 0. To'xtatish va o'zini o'zi yopish ("to'xta", "toxta", "jim", "bas", "yetadi", "yopil", "stop", "chiq")
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

    // Har qanday sahifada (rejada, topshiriqda, ishchilarda yoki chatda) turib berilgan buyruqlarni tahlil qilish
    const localAction = analyzeIntent(userSpeech);

    const isTopLevelAction = (
      localAction.intent === 'CLOSE_MODAL' ||
      localAction.intent === 'CLEAR_SEARCH' ||
      localAction.intent === 'INSPECT_TASK' ||
      localAction.intent === 'OPEN_CHAT' ||
      localAction.intent === 'CREATE_TASK' ||
      localAction.intent === 'CREATE_SCHEDULE' ||
      localAction.intent === 'CREATE_WORKER' ||
      localAction.intent === 'NAVIGATE' ||
      localAction.intent === 'FILTER_STATUS' ||
      localAction.intent === 'SEARCH'
    );

    // Agar foydalanuvchi qaysidir modal yoki sahifada bo'lsa-da, yangi buyruq aytsa (masalan: rejada turib "topshiriq yarat" desa)
    // eskirgan drafting holatidan darhol chiqib, to'g'ridan-to'g'ri yangi sahifa va modalga o'tadi!
    if (isTopLevelAction && (aiState === 'IDLE' || aiState.startsWith('DRAFTING_') || localAction.intent === 'CREATE_TASK' || localAction.intent === 'CREATE_SCHEDULE' || localAction.intent === 'CREATE_WORKER' || localAction.intent === 'NAVIGATE' || localAction.intent === 'CLOSE_MODAL')) {
      if (aiState !== 'IDLE' && window.mayorAiHelpers && window.mayorAiHelpers.closeAllModals) {
        window.mayorAiHelpers.closeAllModals();
      }
      aiState = 'IDLE';

      if (localAction.intent === 'CLOSE_MODAL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeAllModals) {
          window.mayorAiHelpers.closeAllModals();
        }
        const reply = "Barcha ochiq oynalar yopildi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (localAction.intent === 'CLEAR_SEARCH') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.clearSearch) {
          window.mayorAiHelpers.clearSearch();
        }
        const reply = "Qidiruv maydoni tozalandi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (localAction.intent === 'INSPECT_TASK') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.inspectCompletedTask) {
          const inspected = await window.mayorAiHelpers.inspectCompletedTask();
          if (inspected) {
            const reply = "Bajarilgan topshiriq muvaffaqiyatli tekshirildi va qabul qilindi!";
            appendAiMessage('jarvis', reply);
            speakText(reply);
            return;
          } else {
            const reply = "Hozirda tekshirish uchun topshirilgan yangi hisobotlar mavjud emas.";
            appendAiMessage('jarvis', reply);
            speakText(reply);
            return;
          }
        }
      }

      if (localAction.intent === 'OPEN_CHAT') {
        if (localAction.worker && window.mayorAiHelpers && window.mayorAiHelpers.openChatForWorker) {
          window.mayorAiHelpers.openChatForWorker(localAction.worker.id);
          const reply = `${localAction.worker.fullName || (localAction.worker.firstName + ' ' + localAction.worker.lastName)} bilan chat ochildi.`;
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        } else {
          if (window.mayorAiHelpers && window.mayorAiHelpers.switchToTab) {
            window.mayorAiHelpers.switchToTab(3);
          }
          const reply = "Chatlar bo'limi ochildi. Qaysi xodim bilan xabarlashamiz?";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      }

      if (localAction.intent === 'CREATE_SCHEDULE') {
        const timeStr = localAction.time || parseDateTimeFromSpeech(userSpeech);
        const titleStr = localAction.title || "Yangi reja";

        if (window.mayorAiHelpers && window.mayorAiHelpers.openScheduleModalWithData) {
          window.mayorAiHelpers.openScheduleModalWithData({
            title: titleStr,
            time: timeStr
          });
        }

        draftSchedule = {
          title: titleStr,
          time: timeStr
        };

        if (localAction.title) {
          aiState = 'CONFIRMING_SCHEDULE';
          const reply = `"${draftSchedule.title}" rejasi kiritildi. Vaqti: ${draftSchedule.time}. Saqlashni tasdiqlaysizmi?`;
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        } else {
          aiState = 'DRAFTING_SCHEDULE';
          const reply = "Reja tuzish oynasi ochildi. Ichiga nimalarni yozamiz? Reja nomi va vaqtini ayting.";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      }

      if (localAction.intent === 'CREATE_WORKER') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.openWorkerModalWithData) {
          window.mayorAiHelpers.openWorkerModalWithData({});
        }
        draftWorker = { fullName: '', position: '', username: '', password: '' };
        aiState = 'DRAFTING_WORKER';
        const reply = "Yangi xodim qo'shish oynasi ochildi. Xodimning ism-familiyasi va lavozimini ayting.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (localAction.intent === 'CREATE_TASK') {
        const todayStr = new Date().toISOString().slice(0, 10);
        const endStr = localAction.endDate || parseDateFromSpeech(userSpeech);

        // Ikkita yoki undan ortiq bir xil ismli xodim aniqlanganda (masalan ikkita "Murod" bo'lsa):
        if (localAction.ambiguousWorkers && localAction.ambiguousWorkers.length > 1) {
          aiState = 'DISAMBIGUATING_WORKER';
          pendingAmbiguousWorkers = localAction.ambiguousWorkers;
          pendingDraftTask = {
            title: localAction.title || "Topshiriq ijrosini ta'minlash",
            startDate: todayStr,
            endDate: endStr
          };
          if (window.mayorAiHelpers && window.mayorAiHelpers.openTaskModalWithData) {
            window.mayorAiHelpers.openTaskModalWithData({
              title: pendingDraftTask.title,
              startDate: todayStr,
              endDate: endStr
            });
          }
          const question = formatWorkerDisambiguationQuestion(localAction.ambiguousWorkers, localAction.commonName);
          appendAiMessage('jarvis', question);
          speakText(question);
          return;
        }

        const worker = localAction.worker;

        if (window.mayorAiHelpers && window.mayorAiHelpers.openTaskModalWithData) {
          window.mayorAiHelpers.openTaskModalWithData({
            title: localAction.title,
            workerId: worker ? worker.id : null,
            startDate: todayStr,
            endDate: endStr
          });
        }

        if (worker && localAction.title && localAction.title !== "Topshiriq ijrosini ta'minlash") {
          draftTask = {
            title: localAction.title,
            workerId: worker.id,
            workerName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
            startDate: todayStr,
            endDate: endStr
          };
          aiState = 'CONFIRMING_TASK';
          const promptSpeech = `${draftTask.workerName} ga "${draftTask.title}" topshirig'i tayyorlandi. Muddati: ${draftTask.endDate}. Topshiriqni tasdiqlaysizmi?`;
          appendAiMessage('jarvis', promptSpeech);
          speakText(promptSpeech);
          return;
        } else {
          draftTask = {
            title: (localAction.title && localAction.title !== "Topshiriq ijrosini ta'minlash") ? localAction.title : '',
            workerId: worker ? worker.id : '',
            workerName: worker ? (worker.fullName || (worker.firstName + ' ' + worker.lastName)) : '',
            startDate: todayStr,
            endDate: endStr || ''
          };
          aiState = 'DRAFTING_TASK';
          const promptSpeech = draftTask.title
            ? `Topshiriq: "${draftTask.title}". Ushbu topshiriqni qaysi xodimga biriktiramiz va muddati qachongacha?`
            : "Topshiriq yaratish oynasi ochildi. Ichiga nimalarni yozamiz? Topshiriq mazmuni va mas'ul xodimni ayting.";
          appendAiMessage('jarvis', promptSpeech);
          speakText(promptSpeech);
          return;
        }
      }

      if (localAction.intent === 'NAVIGATE') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.switchToTab) {
          window.mayorAiHelpers.switchToTab(localAction.tab);
        }
        appendAiMessage('jarvis', localAction.message);
        speakText(localAction.message);
        return;
      }

      if (localAction.intent === 'FILTER_STATUS') {
        if (window.mayorAiHelpers) {
          window.mayorAiHelpers.switchToTab(0);
          window.mayorAiHelpers.filterTasksByStatus(localAction.statusIdx);
        }
        appendAiMessage('jarvis', localAction.message);
        speakText(localAction.message);
        return;
      }

      if (localAction.intent === 'SEARCH') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.searchTasks) {
          window.mayorAiHelpers.searchTasks(localAction.query);
        }
        const reply = `"${localAction.query}" bo'yicha qidiruv natijalari ko'rsatilmoqda.`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (localAction.intent === 'DELETE_TASK') {
        const matches = findMatchingTasks(localAction.query);
        if (matches.length === 0) {
          const reply = localAction.query 
            ? `"${localAction.query}" bo'yicha hech qanday topshiriq topilmadi.`
            : "O'chirish uchun birorta ham topshiriq topilmadi.";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }

        if (matches.length === 1) {
          const task = matches[0];
          pendingDeleteSingleTask = task;
          pendingDeleteTasks = [task];
          aiState = 'CONFIRMING_DELETE_TASK';

          const endFormatted = task.endDate ? new Date(task.endDate).toLocaleDateString() : "belgilanmagan";
          const workerInfo = task.assignedWorkerName || "xodim";

          const hasAudio = playTaskAudioIfPresent(task, (played) => {
            const followUp = "Topshiriqdagi ovozli xabarni eshitdingiz. Shu topshiriqni o'chirishni tasdiqlaysizmi?";
            appendAiMessage('jarvis', followUp);
            speakText(followUp);
          });

          if (hasAudio) {
            const intro = `${workerInfo} ga biriktirilgan "${task.title}" topshirig'i. Muddati: ${endFormatted}. Topshiriqdagi ovozli xabar qo'yilmoqda...`;
            appendAiMessage('jarvis', intro);
            speakText(intro);
          } else {
            const prompt = `${workerInfo} ga biriktirilgan "${task.title}" topshirig'i. Muddati: ${endFormatted}. Ushbu topshiriqni o'chirishni tasdiqlaysizmi?`;
            appendAiMessage('jarvis', prompt);
            speakText(prompt);
          }
          return;
        }

        // Bir nechta topshiriq topildi (masalan 3 ta xodimga biriktirilgan 3 ta topshiriq):
        pendingDeleteTasks = matches;
        aiState = 'DISAMBIGUATING_DELETE_TASK';

        const workerListStr = matches.map((t, i) => `${i + 1}) ${t.assignedWorkerName || 'Xodim'}`).join(', ');
        const reply = `"${matches[0].title}" bo'yicha ${matches.length} ta topshiriq topildi: ${workerListStr}. Barchasini o'chirishni xohlaysizmi yoki ma'lum bir xodimnikinimi?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (localAction.intent === 'BROADCAST_MESSAGE') {
        const users = window.store?.users || [];
        const workers = users.filter(u => {
          const role = (u.role || '').toUpperCase();
          return role === 'WORKER' || role === 'ISHCHI' || (!role && u.id && !u.id.startsWith('mayor') && !u.id.startsWith('admin'));
        });
        const targetCount = (localAction.targetOrg && localAction.targetOrg !== 'all')
          ? workers.filter(w => (w.position || '').toLowerCase().includes(localAction.targetOrg.toLowerCase())).length
          : workers.length;

        if (window.mayorAiHelpers && window.mayorAiHelpers.openBroadcastWithData) {
          window.mayorAiHelpers.openBroadcastWithData({
            text: localAction.text,
            org: localAction.targetOrg || 'all',
            selectAll: true
          });
        }

        pendingBroadcastData = {
          text: localAction.text,
          targetOrg: localAction.targetOrg || 'all',
          count: targetCount
        };
        aiState = 'CONFIRMING_BROADCAST';

        const orgPrompt = (localAction.targetOrg && localAction.targetOrg !== 'all')
          ? `"${localAction.targetOrg}" tashkilotidagi ${targetCount} ta xodimga`
          : `barcha ${targetCount} ta xodimga`;
        const reply = `${orgPrompt} "${localAction.text}" deb e'lon yuborishni tasdiqlaysizmi?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // A.-3. CONFIRMING_DELETE_TASK bosqichi
    if (aiState === 'CONFIRMING_DELETE_TASK') {
      const parsed = analyzeIntent(userSpeech);
      if (parsed.intent === 'CONFIRM' || userSpeech.includes('o\'chir') || userSpeech.includes('ha') || userSpeech.includes('tasdiq')) {
        if (activeAudioPlayer) {
          try { activeAudioPlayer.pause(); activeAudioPlayer.src = ''; } catch (_) {}
          activeAudioPlayer = null;
        }
        if (pendingDeleteSingleTask && window.mayorAiHelpers && window.mayorAiHelpers.deleteTaskById) {
          await window.mayorAiHelpers.deleteTaskById(pendingDeleteSingleTask.id);
        }
        aiState = 'IDLE';
        pendingDeleteSingleTask = null;
        pendingDeleteTasks = [];
        const reply = "Topshiriq muvaffaqiyatli o'chirildi! Keyingi topshiriqqa tayyorman.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else if (parsed.intent === 'CANCEL') {
        if (activeAudioPlayer) {
          try { activeAudioPlayer.pause(); activeAudioPlayer.src = ''; } catch (_) {}
          activeAudioPlayer = null;
        }
        aiState = 'IDLE';
        pendingDeleteSingleTask = null;
        pendingDeleteTasks = [];
        const reply = "Topshiriqni o'chirish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        const reply = "Topshiriqni o'chirishni tasdiqlaysizmi? 'Ha' yoki 'Yo'q' deb javob bering.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // A.-2. DISAMBIGUATING_DELETE_TASK bosqichi (bir xil sarlavhali bir nechta topshiriq bo'lsa)
    if (aiState === 'DISAMBIGUATING_DELETE_TASK') {
      const parsed = analyzeIntent(userSpeech);
      const isAll = userSpeech.includes('barchasi') || userSpeech.includes('hammasi') || userSpeech.includes('barchasini') || userSpeech.includes('hammasini');

      if (isAll || (parsed.intent === 'CONFIRM' && userSpeech.includes('o\'chir'))) {
        if (window.mayorAiHelpers && window.mayorAiHelpers.deleteTaskById) {
          for (const t of pendingDeleteTasks) {
            await window.mayorAiHelpers.deleteTaskById(t.id);
          }
        }
        const count = pendingDeleteTasks.length;
        aiState = 'IDLE';
        pendingDeleteTasks = [];
        pendingDeleteSingleTask = null;
        const reply = `Barcha ${count} ta topshiriq muvaffaqiyatli o'chirildi!`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (parsed.intent === 'CANCEL') {
        aiState = 'IDLE';
        pendingDeleteTasks = [];
        pendingDeleteSingleTask = null;
        const reply = "Topshiriqlarni o'chirish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      // Foydalanuvchi ma'lum bir xodimni aytsa
      const chosenWorker = findWorkerInSpeech(userSpeech);
      if (chosenWorker) {
        const chosenTask = pendingDeleteTasks.find(t => 
          t.assignedWorkerId === chosenWorker.id || 
          (t.assignedWorkerName && t.assignedWorkerName.toLowerCase().includes((chosenWorker.fullName || chosenWorker.firstName).toLowerCase()))
        );
        if (chosenTask) {
          pendingDeleteSingleTask = chosenTask;
          aiState = 'CONFIRMING_DELETE_TASK';
          const endFormatted = chosenTask.endDate ? new Date(chosenTask.endDate).toLocaleDateString() : "belgilanmagan";

          const hasAudio = playTaskAudioIfPresent(chosenTask, (played) => {
            const followUp = "Topshiriqdagi ovozli xabarni eshitdingiz. Shu topshiriqni o'chirishni tasdiqlaysizmi?";
            appendAiMessage('jarvis', followUp);
            speakText(followUp);
          });

          if (hasAudio) {
            const intro = `${chosenTask.assignedWorkerName} ga biriktirilgan topshiriq ovozli xabari qo'yilmoqda...`;
            appendAiMessage('jarvis', intro);
            speakText(intro);
          } else {
            const prompt = `${chosenTask.assignedWorkerName} ga biriktirilgan "${chosenTask.title}" topshirig'ini o'chirishni tasdiqlaysizmi?`;
            appendAiMessage('jarvis', prompt);
            speakText(prompt);
          }
          return;
        }
      }

      const reply = "Iltimos, aniqroq ayting: barchasini o'chiramizmi yoki aynan qaysi xodimnikini?";
      appendAiMessage('jarvis', reply);
      speakText(reply);
      return;
    }

    // A.-1. CONFIRMING_BROADCAST bosqichi
    if (aiState === 'CONFIRMING_BROADCAST') {
      const parsed = analyzeIntent(userSpeech);
      if (parsed.intent === 'CONFIRM' || userSpeech.includes('yubor') || userSpeech.includes('ha') || userSpeech.includes('tasdiq')) {
        if (pendingBroadcastData && window.mayorAiHelpers && window.mayorAiHelpers.sendBroadcastDirectly) {
          await window.mayorAiHelpers.sendBroadcastDirectly({
            text: pendingBroadcastData.text,
            org: pendingBroadcastData.targetOrg
          });
        }
        const count = pendingBroadcastData?.count || "barcha";
        aiState = 'IDLE';
        pendingBroadcastData = null;
        if (window.closeBroadcastModal) window.closeBroadcastModal();
        const reply = `Ommaviy e'lon ${count} ta xodimga muvaffaqiyatli yuborildi!`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else if (parsed.intent === 'CANCEL') {
        aiState = 'IDLE';
        pendingBroadcastData = null;
        if (window.closeBroadcastModal) window.closeBroadcastModal();
        const reply = "E'lon yuborish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        const reply = "E'lonni yuborishni tasdiqlaysizmi? 'Ha' yoki 'Bekor qil' deb ayting.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // A.0. DISAMBIGUATING_WORKER bosqichi: "Qaysi Murodga? Yo'ldoshevmi yoki Karimovmi?"
    if (aiState === 'DISAMBIGUATING_WORKER') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeTaskModal) {
          window.mayorAiHelpers.closeTaskModal();
        }
        aiState = 'IDLE';
        pendingAmbiguousWorkers = [];
        pendingDraftTask = null;
        const reply = "Topshiriq bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      const chosen = resolveAmbiguousWorker(userSpeech, pendingAmbiguousWorkers);
      if (chosen) {
        draftTask = {
          title: pendingDraftTask?.title || "Topshiriq ijrosini ta'minlash",
          workerId: chosen.id,
          workerName: chosen.fullName || (chosen.firstName + ' ' + chosen.lastName),
          startDate: pendingDraftTask?.startDate || new Date().toISOString().slice(0, 10),
          endDate: pendingDraftTask?.endDate || parseDateFromSpeech('ertaga')
        };
        aiState = 'CONFIRMING_TASK';
        pendingAmbiguousWorkers = [];
        pendingDraftTask = null;

        if (window.mayorAiHelpers && window.mayorAiHelpers.updateTaskFields) {
          window.mayorAiHelpers.updateTaskFields({
            workerId: draftTask.workerId,
            title: draftTask.title,
            endDate: draftTask.endDate
          });
        }

        const orgTag = chosen.position ? ` [${chosen.position}]` : '';
        const reply = `${chosen.fullName}${orgTag} ga "${draftTask.title}" topshirig'i tayyorlandi. Muddati: ${draftTask.endDate}. Topshiriqni tasdiqlaysizmi?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        const question = formatWorkerDisambiguationQuestion(pendingAmbiguousWorkers, 'xodim');
        appendAiMessage('jarvis', "Iltimos, aniqroq ayting: " + question);
        speakText("Iltimos, aniqroq ayting: " + question);
        return;
      }
    }

    // A. CONFIRMING_TASK bosqichi
    if (aiState === 'CONFIRMING_TASK') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CONFIRM') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentTask) {
          await window.mayorAiHelpers.saveCurrentTask();
          aiState = 'IDLE';
          const reply = `Topshiriq muvaffaqiyatli saqlandi va ${draftTask.workerName || 'xodim'}ga biriktirildi! Keyingi topshiriqqa tayyorman.`;
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      } else if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeTaskModal) {
          window.mayorAiHelpers.closeTaskModal();
        }
        aiState = 'IDLE';
        const reply = "Topshiriq bekor qilindi. Boshqa buyruq bormi?";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else if (parsed.intent === 'CORRECT' || parsed.worker || parsed.newDate) {
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
      } else {
        // Agar foydalanuvchi "ha/tasdiq" demasdan yangi buyruq aytsa yoki gapini davom ettirsa:
        // Avvalgi to'liq topshiriqni avtomatik saqlaymiz va yangi buyruqqa o'tamiz
        if (draftTask.title && draftTask.workerId && window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentTask) {
          try { await window.mayorAiHelpers.saveCurrentTask(); } catch (_) {}
        }
        aiState = 'IDLE';
      }
    }

    // B. DRAFTING_TASK bosqichi
    if (aiState === 'DRAFTING_TASK') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeTaskModal) {
          window.mayorAiHelpers.closeTaskModal();
        }
        aiState = 'IDLE';
        const reply = "Topshiriq bekor qilindi. Boshqa qanday vazifa bajaramiz?";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      // 1. Agar topshiriq sarlavhasi hali kiritilmagan bo'lsa, nutqdan sarlavhani olamiz
      if (!draftTask.title || draftTask.title === "Topshiriq ijrosini ta'minlash") {
        const titleCandidate = extractTaskTitle(userSpeech);
        if (titleCandidate && titleCandidate.length > 2) {
          draftTask.title = titleCandidate;
        }
      }

      // 2. Xodimni aniqlash (Ambiguity tekshiruvi)
      const workerRes = findWorkersInSpeech(userSpeech);
      if (workerRes?.ambiguous && workerRes.ambiguous.length > 1) {
        aiState = 'DISAMBIGUATING_WORKER';
        pendingAmbiguousWorkers = workerRes.ambiguous;
        pendingDraftTask = { ...draftTask };
        const question = formatWorkerDisambiguationQuestion(workerRes.ambiguous, workerRes.commonName);
        appendAiMessage('jarvis', question);
        speakText(question);
        return;
      }
      const worker = workerRes?.match || parsed.worker;
      if (worker) {
        draftTask.workerId = worker.id;
        draftTask.workerName = worker.fullName || (worker.firstName + ' ' + worker.lastName);
      }

      // 3. Muddatni aniqlash
      const date = parseDateFromSpeech(userSpeech);
      if (date) {
        draftTask.endDate = date;
      }

      // Agar xodim nomini topolmasa, lekin foydalanuvchi "istagan xodim", "birinchisiga", "o'zing tanla", "bo'ldi" desa
      if (cleanLower.includes('kirgizmay') || cleanLower.includes('bo\'sh') || cleanLower.includes('bosh qoldir') || cleanLower.includes('o\'zing tanla') || cleanLower.includes('istagan')) {
        if (!draftTask.workerId) {
          const workers = (window.store && window.store.users || []).filter(u => u.role === 'WORKER');
          if (workers.length > 0) {
            draftTask.workerId = workers[0].id;
            draftTask.workerName = workers[0].fullName || (workers[0].firstName + ' ' + workers[0].lastName);
          }
        }
        if (!draftTask.endDate) {
          draftTask.endDate = parseDateFromSpeech('ertaga');
        }
      }

      // Modal maydonlarini yangilaymiz
      if (window.mayorAiHelpers && window.mayorAiHelpers.updateTaskFields) {
        window.mayorAiHelpers.updateTaskFields({
          title: draftTask.title,
          workerId: draftTask.workerId,
          endDate: draftTask.endDate
        });
      }

      if (draftTask.title && draftTask.workerId) {
        if (!draftTask.endDate) {
          draftTask.endDate = parseDateFromSpeech('ertaga');
          if (window.mayorAiHelpers && window.mayorAiHelpers.updateTaskFields) {
            window.mayorAiHelpers.updateTaskFields({ endDate: draftTask.endDate });
          }
        }
        aiState = 'CONFIRMING_TASK';
        const reply = `"${draftTask.title}" topshirig'i ${draftTask.workerName}ga tayyorlandi. Muddati: ${draftTask.endDate}. Topshiriqni saqlashni tasdiqlaysizmi?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else if (draftTask.title && !draftTask.workerId) {
        const reply = `Topshiriq: "${draftTask.title}". Ushbu topshiriqni qaysi xodimga biriktiramiz?`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        const reply = "Topshiriq mazmuni va mas'ul xodimni ayting.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // C. CONFIRMING_SCHEDULE bosqichi
    if (aiState === 'CONFIRMING_SCHEDULE') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CONFIRM') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentSchedule) {
          await window.mayorAiHelpers.saveCurrentSchedule();
          aiState = 'IDLE';
          const reply = "Yangi reja muvaffaqiyatli saqlandi! Yana qanday buyrug'ingiz bor?";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      } else if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeScheduleModal) {
          window.mayorAiHelpers.closeScheduleModal();
        }
        aiState = 'IDLE';
        const reply = "Reja tuzish bekor qilindi. Boshqa buyruq bormi?";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        if (draftSchedule.title && window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentSchedule) {
          try { await window.mayorAiHelpers.saveCurrentSchedule(); } catch (_) {}
        }
        aiState = 'IDLE';
      }
    }

    // D. DRAFTING_SCHEDULE bosqichi
    if (aiState === 'DRAFTING_SCHEDULE') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeScheduleModal) {
          window.mayorAiHelpers.closeScheduleModal();
        }
        aiState = 'IDLE';
        const reply = "Reja tuzish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      if (!draftSchedule.title) {
        let t = userSpeech.replace(/\b(?:reja|uchrashuv|soat|da|ga|kuni|ertaga|bugun)\b/gi, '').trim();
        draftSchedule.title = t ? (t.charAt(0).toUpperCase() + t.slice(1)) : "Muhim uchrashuv";
      }
      const dt = parseDateTimeFromSpeech(userSpeech);
      draftSchedule.time = dt;

      if (window.mayorAiHelpers && window.mayorAiHelpers.updateScheduleFields) {
        window.mayorAiHelpers.updateScheduleFields({
          title: draftSchedule.title,
          time: draftSchedule.time
        });
      }

      aiState = 'CONFIRMING_SCHEDULE';
      const reply = `"${draftSchedule.title}" rejasi kiritildi. Vaqti: ${draftSchedule.time}. Ushbu rejani saqlashni tasdiqlaysizmi?`;
      appendAiMessage('jarvis', reply);
      speakText(reply);
      return;
    }

    // E. CONFIRMING_WORKER bosqichi
    if (aiState === 'CONFIRMING_WORKER') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CONFIRM') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentWorker) {
          await window.mayorAiHelpers.saveCurrentWorker();
          aiState = 'IDLE';
          const reply = `"${draftWorker.fullName}" tizimga xodim sifatida muvaffaqiyatli qo'shildi! Keyingi buyruqqa tayyorman.`;
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      } else if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeWorkerModal) {
          window.mayorAiHelpers.closeWorkerModal();
        }
        aiState = 'IDLE';
        const reply = "Yangi xodim qo'shish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      } else {
        if (draftWorker.fullName && window.mayorAiHelpers && window.mayorAiHelpers.saveCurrentWorker) {
          try { await window.mayorAiHelpers.saveCurrentWorker(); } catch (_) {}
        }
        aiState = 'IDLE';
      }
    }

    // F. DRAFTING_WORKER bosqichi
    if (aiState === 'DRAFTING_WORKER') {
      const parsed = analyzeIntent(userSpeech);

      if (parsed.intent === 'CANCEL') {
        if (window.mayorAiHelpers && window.mayorAiHelpers.closeWorkerModal) {
          window.mayorAiHelpers.closeWorkerModal();
        }
        aiState = 'IDLE';
        const reply = "Yangi xodim qo'shish bekor qilindi.";
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }

      // Xodim ismi va lavozimini ajratish
      let name = userSpeech.replace(/\b(?:yangi\s+)?(?:xodim|ishchi|qo['ʻ`]?sh|qosh|yarat|lavozimi|mutaxassis|boshliq)\b/gi, '').trim();
      if (name.length > 2) {
        draftWorker.fullName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else {
        draftWorker.fullName = "Yangi Mutaxassis";
      }

      let position = "Yetakchi mutaxassis";
      if (cleanLower.includes('boshliq') || cleanLower.includes('rahbar')) position = "Bo'lim boshlig'i";
      else if (cleanLower.includes('muhandis')) position = "Bosh muhandis";
      else if (cleanLower.includes('inspektor')) position = "Bosh inspektor";
      else if (cleanLower.includes('iqtisodchi')) position = "Iqtisodchi";

      draftWorker.position = position;
      draftWorker.username = 'xodim_' + Math.floor(1000 + Math.random() * 9000);
      draftWorker.password = 'ijro' + Math.floor(100 + Math.random() * 900);

      if (window.mayorAiHelpers && window.mayorAiHelpers.updateWorkerFields) {
        window.mayorAiHelpers.updateWorkerFields({
          fullName: draftWorker.fullName,
          position: draftWorker.position,
          username: draftWorker.username,
          password: draftWorker.password
        });
      }

      aiState = 'CONFIRMING_WORKER';
      const reply = `"${draftWorker.fullName}" (${draftWorker.position}) kiritildi. Tizimga xodim sifatida qo'shishni tasdiqlaysizmi?`;
      appendAiMessage('jarvis', reply);
      speakText(reply);
      return;
    }

    if (localAction.intent === 'GREETING') {
      appendAiMessage('jarvis', localAction.message);
      speakText(localAction.message);
      return;
    }

    // 2. Agar mahalliy tahlil UNKNOWN bo'lsa, Gemini API ga murojaat qilamiz
    try {
      const geminiResult = await callGeminiAssistant(userSpeech);
      if (geminiResult) {
        // "Hurmatli hokim" prefiksini Gemini javobidan olib tashlaymiz
        if (geminiResult.speechReply) {
          geminiResult.speechReply = geminiResult.speechReply
            .replace(/^(?:hurmatli\s+hokim[!,.]?\s*)+/i, '')
            .trim() || geminiResult.speechReply;
        }

        if (geminiResult.intent === 'CLEAR_SEARCH') {
          if (window.mayorAiHelpers && window.mayorAiHelpers.clearSearch) {
            window.mayorAiHelpers.clearSearch();
          }
          const msg = geminiResult.speechReply || "Qidiruv maydoni tozalandi.";
          appendAiMessage('jarvis', msg);
          speakText(msg);
          return;
        }

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
            const sIdx = (geminiResult.statusIdx != null) ? geminiResult.statusIdx : 1;
            window.mayorAiHelpers.filterTasksByStatus(sIdx);
          }
          let msg = geminiResult.speechReply || "Topshiriqlar saralandi.";
          appendAiMessage('jarvis', msg);
          speakText(msg);
          return;
        }

        if (geminiResult.intent === 'CREATE_TASK' && geminiResult.task) {
          let worker = (window.store.users || []).find(u => u.id === geminiResult.task.workerId);
          if (!worker && geminiResult.task.workerName) {
            worker = findWorkerInSpeech(geminiResult.task.workerName);
          }

          const cleanTitle = geminiResult.task.title || extractTaskTitle(userSpeech);
          const todayStr = new Date().toISOString().slice(0, 10);
          const endStr = geminiResult.task.endDate || parseDateFromSpeech(userSpeech);

          if (window.mayorAiHelpers && window.mayorAiHelpers.openTaskModalWithData) {
            window.mayorAiHelpers.openTaskModalWithData({
              title: cleanTitle,
              workerId: worker ? worker.id : null,
              startDate: todayStr,
              endDate: endStr
            });
          }

          if (worker) {
            draftTask = {
              title: cleanTitle,
              workerId: worker.id,
              workerName: worker.fullName || (worker.firstName + ' ' + worker.lastName),
              startDate: todayStr,
              endDate: endStr
            };
            aiState = 'CONFIRMING_TASK';
            const promptSpeech = geminiResult.speechReply || `${draftTask.workerName} ga "${draftTask.title}" topshirig'i tayyorlandi. Muddati: ${draftTask.endDate}. Topshiriqni tasdiqlaysizmi?`;
            appendAiMessage('jarvis', promptSpeech);
            speakText(promptSpeech);
            return;
          } else {
            draftTask = {
              title: cleanTitle,
              workerId: '',
              workerName: '',
              startDate: todayStr,
              endDate: ''
            };
            aiState = 'DRAFTING_TASK';
            const promptSpeech = `Topshiriq ochildi. Ichiga nimalarni yozamiz? Topshiriq mazmuni va mas'ul xodimni ayting.`;
            appendAiMessage('jarvis', promptSpeech);
            speakText(promptSpeech);
            return;
          }
        }

        if (geminiResult.intent === 'SEARCH') {
          const hasSearchWord = /\b(?:qidir|izla|top)\b/i.test(cleanLower);
          if (hasSearchWord && geminiResult.query && geminiResult.query.trim()) {
            if (window.mayorAiHelpers && window.mayorAiHelpers.searchTasks) {
              window.mayorAiHelpers.searchTasks(geminiResult.query.trim());
            }
            const reply = geminiResult.speechReply || `"${geminiResult.query}" bo'yicha qidiruv natijalari ko'rsatilmoqda.`;
            appendAiMessage('jarvis', reply);
            speakText(reply);
            return;
          }
        }

        if (geminiResult.intent === 'GREETING' || geminiResult.intent === 'CHAT' || geminiResult.speechReply) {
          const reply = geminiResult.speechReply || "Buyrug'ingizni ayting, darhol bajaraman.";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      }
    } catch (e) {
      console.warn("Gemini dispatch error:", e);
    }

    // Agar buyruq aniqlanmagan bo'lsa: HECH QACHON "Kechirasiz, tushunmadim" deb qotib qolmasin!
    // 1. Ishchi ismini qidirish:
    const matchedWorker = findWorkerInSpeech(normText);
    if (matchedWorker) {
      if (window.mayorAiHelpers && window.mayorAiHelpers.openChatForWorker) {
        window.mayorAiHelpers.openChatForWorker(matchedWorker.id);
      }
      const reply = `${matchedWorker.fullName || (matchedWorker.firstName + ' ' + matchedWorker.lastName)} bilan muloqot ochildi.`;
      appendAiMessage('jarvis', reply);
      speakText(reply);
      return;
    }

    // 2. Topshiriqlar orasidan qidirish:
    if (window.mayorAiHelpers && window.mayorAiHelpers.searchTasks && normText.length >= 3) {
      const tasks = window.store?.tasks || [];
      const foundTask = tasks.find(t => t.title && normalizeUzbekSpeech(t.title).includes(normText));
      if (foundTask) {
        window.mayorAiHelpers.searchTasks(normText);
        const reply = `"${foundTask.title}" topshirig'i topildi.`;
        appendAiMessage('jarvis', reply);
        speakText(reply);
        return;
      }
    }

    // 3. Doimiy tayyorlik va faol javob:
    const defaultReply = "Topshiriq, reja, xodimlar yoki chatlar bo'yicha buyrug'ingizni ayting, darhol bajaraman.";
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
    primeAudioForIOS();
    const modal = document.getElementById('ai-assistant-modal');
    if (modal) modal.classList.add('active');
    document.querySelectorAll('.ai-header-btn').forEach(b => {
      b.classList.add('active');
      const label = b.querySelector('span');
      if (label) label.innerText = "AI to'xtatish";
    });
    startOrbAnimation();
    startListening();
  };

  window.closeAiAssistantModal = function() {
    const modal = document.getElementById('ai-assistant-modal');
    if (modal) modal.classList.remove('active');
    document.querySelectorAll('.ai-header-btn').forEach(b => {
      b.classList.remove('active');
      const label = b.querySelector('span');
      if (label) label.innerText = "AI Yordamchi";
    });
    stopOrbAnimation();
    stopListening();
    if (activeAudioPlayer) {
      try { activeAudioPlayer.pause(); activeAudioPlayer.src = ''; } catch (_) {}
      activeAudioPlayer = null;
    }
    if (isSpeaking && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
    isSpeaking = false;
    isTemporarilyPausedForTts = false;
    aiState = 'IDLE';
    updateAiStatus('idle', 'Kutilmoqda');
  };

  window.sendAiPredefined = function(text) {
    primeAudioForIOS();
    handleUserSpeech(text);
  };

  window.sendAiTextCommand = function() {
    primeAudioForIOS();
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