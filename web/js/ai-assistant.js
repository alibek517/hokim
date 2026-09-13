// IJRO AI Assistant (Jarvis) for Mayor (Hokim)
// Sun'iy Intellekt Yordamchisi - Ovozli boshqaruv, topshiriq yaratish, tasdiqlash va sahifalarni boshqarish

(function() {
  'use strict';

  let isListening = false;
  let shouldKeepListening = false;
  let isSpeaking = false;
  let isTemporarilyPausedForTts = false;
  let ignoreSpeechUntil = 0;
  let recognition = null;
  let aiState = 'IDLE'; // 'IDLE' | 'DRAFTING_TASK' | 'CONFIRMING_TASK' | 'DRAFTING_SCHEDULE' | 'CONFIRMING_SCHEDULE' | 'DRAFTING_WORKER' | 'CONFIRMING_WORKER'
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
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListening = true;
        updateAiStatus('listening', 'Eshitmoqda...');
      };

      recognition.onresult = (event) => {
        // AI gapirayotganda yoki aks-sado davrida mikrofon quloq solmaydi!
        if (isSpeaking || isTemporarilyPausedForTts || Date.now() < ignoreSpeechUntil) {
          return;
        }

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
        if (event.error === 'not-allowed') {
          shouldKeepListening = false;
          isListening = false;
          stopWatchdog();
          updateAiStatus('idle', 'Kutilmoqda');
        }
      };

      recognition.onend = () => {
        isListening = false;
        // Infinity continuous listening: agar to'xtash buyrug'i berilmagan bo'lsa, zudlik bilan qayta yoqiladi
        if (shouldKeepListening && !isSpeaking) {
          setTimeout(() => {
            if (shouldKeepListening && !isSpeaking) {
              safeStartRecognition();
            }
          }, 80);
        } else if (!shouldKeepListening) {
          updateAiStatus('idle', 'Kutilmoqda');
        }
      };
    } catch (e) {
      console.warn("initSpeechRecognition error:", e);
    }
  }

  // Safe Start Recognition (Handles Chrome/Android state recovery)
  function safeStartRecognition() {
    if (!shouldKeepListening || isSpeaking) return;
    if (!SpeechRecognition) return;

    if (!recognition) {
      initSpeechRecognition();
    }
    if (!recognition) return;

    if (isListening) return;

    try {
      recognition.start();
      isListening = true;
      updateAiStatus('listening', 'Eshitmoqda...');
    } catch (err) {
      if (err && (err.name === 'InvalidStateError' || (err.message && err.message.includes('already started')))) {
        isListening = true;
        updateAiStatus('listening', 'Eshitmoqda...');
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
        initSpeechRecognition();
        if (recognition) {
          recognition.start();
          isListening = true;
          updateAiStatus('listening', 'Eshitmoqda...');
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
      if (shouldKeepListening && !isSpeaking && !isListening) {
        safeStartRecognition();
      }
    }, 800);
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
    ignoreSpeechUntil = Date.now() + 500; // 500ms aks-sado to'xtashini kutish
    if (shouldKeepListening) {
      updateAiStatus('listening', 'Eshitmoqda...');
      setTimeout(() => {
        if (shouldKeepListening && !isSpeaking) {
          safeStartRecognition();
        }
      }, 150);
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

    isTemporarilyPausedForTts = true;
    isSpeaking = true;
    ignoreSpeechUntil = Date.now() + 15000;
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
      fallbackTriggered = true;
      isSpeaking = true;
      ignoreSpeechUntil = Date.now() + 15000;
      updateAiStatus('speaking', 'Gapirmoqda...');
    };

    audio.onended = () => {
      activeAudioPlayer = null;
      finishSpeechCleanup(callback);
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
      finishSpeechCleanup(callback);
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
        finishSpeechCleanup(callback);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.voice = uzVoice;
      utterance.lang = uzVoice.lang || 'uz-UZ';

      utterance.onstart = () => {
        isSpeaking = true;
        ignoreSpeechUntil = Date.now() + 15000;
        updateAiStatus('speaking', 'Gapirmoqda...');
      };

      utterance.onend = () => {
        finishSpeechCleanup(callback);
      };

      utterance.onerror = () => {
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

  // Helper: Find matching worker from storage with suffix stripping
  function findWorkerInSpeech(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const workers = (window.store && window.store.users || []).filter(u => u.role === 'WORKER');

    const stripSuffix = s => s.replace(/(ga|ka|qa|ni|ning|da|dan)$/i, '');
    const tokens = lower.split(/[\s,;:.!?]+/).map(stripSuffix).filter(Boolean);

    for (const w of workers) {
      const fName = (w.firstName || '').toLowerCase().trim();
      const lName = (w.lastName || '').toLowerCase().trim();
      const fullName = (w.fullName || '').toLowerCase().trim();

      if (fName && fName.length > 2 && (lower.includes(fName) || tokens.includes(fName))) return w;
      if (lName && lName.length > 2 && (lower.includes(lName) || tokens.includes(lName))) return w;
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

  // Core NLP Intent Engine (supporting Uzbek & Xorazm dialect + common admin terms)
  function analyzeIntent(rawText) {
    const text = (rawText || '').toLowerCase().trim();

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
      const detectedWorker = findWorkerInSpeech(text);
      const cleanTitle = extractTaskTitle(rawText);
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
        message: "Assalomu alaykum, hurmatli Hokim! Sizga qanday yordam bera olaman?"
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
      'o\'chir', 'ochir', 'tashla', 'tashlab ket', 'net', 'otmena'
    ];
    if (cancelWords.some(w => text === w || text.startsWith(w + ' ') || text.includes(' ' + w))) {
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

    // 8. Sahifalarga o'tish (Navigation - Tab 0, 1, 2, 3)
    // FAQAT sahifa ochish yoki ko'rish so'ralganda
    // Tab 0: Topshiriqlar ("1-pej", "1-page", "birinchi pej", "birinchi sahifa", "topshiriqlar sahifasi", "asosiy sahifa")
    if (/\b(?:1[- ]?(?:pej|peyj|page|sahifa)\w*|birinchi\s+(?:pej|peyj|page|sahifa)\w*|bosh\s+sahifa|asosiy\s+sahifa)\b/i.test(text) ||
        (text.includes('topshiriq') && (text.includes('sahifas') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('och')))) {
      return { intent: 'NAVIGATE', tab: 0, message: "1-sahifa: Topshiriqlar bo'limi ochildi." };
    }

    // Tab 1: Rejalar ("2-pej", "2-page", "ikkinchi pej", "ikkinchi sahifa", "rejalar sahifasi")
    if (/\b(?:2[- ]?(?:pej|peyj|page|sahifa)\w*|ikkinchi\s+(?:pej|peyj|page|sahifa)\w*)\b/i.test(text) ||
        (text.includes('reja') && (text.includes('sahifas') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('och')))) {
      return { intent: 'NAVIGATE', tab: 1, message: "2-sahifa: Rejalar bo'limi ochildi." };
    }

    // Tab 2: Xodimlar va reyting ("3-pej", "3-page", "uchinchi pej", "uchinchi sahifa", "xodimlar sahifasi", "reyting")
    if (/\b(?:3[- ]?(?:pej|peyj|page|sahifa)\w*|uchinchi\s+(?:pej|peyj|page|sahifa)\w*|reyting\w*)\b/i.test(text) ||
        (text.includes('xodim') && (text.includes('sahifas') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('och')))) {
      return { intent: 'NAVIGATE', tab: 2, message: "3-sahifa: Xodimlar va ularning reytingi sahifasiga o'tdik." };
    }

    // Tab 3: Chatlar ("4-pej", "4-page", "to'rtinchi pej", "to'rtinchi sahifa", "chat sahifasi")
    if (/\b(?:4[- ]?(?:pej|peyj|page|sahifa)\w*|to['ʻ`]?rtinchi\s+(?:pej|peyj|page|sahifa)\w*)\b/i.test(text) ||
        (text.includes('chat') && (text.includes('sahifas') || text.includes('pej') || text.includes('page') || text.includes("o't") || text.includes('och')))) {
      return { intent: 'NAVIGATE', tab: 3, message: "4-sahifa: Chatlar bo'limi ochildi." };
    }

    // 9. Filtrlash (Filter)
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

    // 10. Minnatdorchilik va umumiy savollar
    if (text.includes('rahmat') || text.includes('barakalla') || text.includes('balli') || text.includes('tashakkur')) {
      return {
        intent: 'GREETING',
        message: "Arzimaydi, hurmatli Hokim! Sizga xizmat qilishdan doim mamnunman."
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

    // 12. Implitsit (bevosita) topshiriq topshirish: "Yo'lni asfaltlash kerak", "Chiroqlarni tuzatishsin"
    const detectedWorker = findWorkerInSpeech(text);
    const isTaskContext = text.includes('kerak') || text.includes('asfaltlash') || text.includes('tozalash') || text.includes('ta\'mirlash') || text.includes('qurish') || text.includes('qilsin') || text.includes('etsin') || text.includes('biriktir');

    if (detectedWorker || isTaskContext) {
      const cleanTitle = extractTaskTitle(rawText);
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

    // Begona yoki tushunarsiz buyruqlar hech qachon qidiruvga berilmaydi!
    return {
      intent: 'UNKNOWN',
      raw: rawText
    };
  }

  async function handleUserSpeech(userSpeech) {
    const trimmed = (userSpeech || '').trim();
    if (!trimmed) return;

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

    const cleanLower = trimmed.toLowerCase();

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
        const worker = localAction.worker;
        const endStr = localAction.endDate || parseDateFromSpeech(userSpeech);

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

      // 2. Xodimni aniqlash
      const worker = findWorkerInSpeech(userSpeech) || parsed.worker;
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
          const reply = geminiResult.speechReply || "Sizni eshitmoqdaman, hurmatli Hokim!";
          appendAiMessage('jarvis', reply);
          speakText(reply);
          return;
        }
      }
    } catch (e) {
      console.warn("Gemini dispatch error:", e);
    }

    // Noma'lum buyruq: Foydalanuvchi so'raganidek faqat qisqa va aniq javob
    const defaultReply = "Kechirasiz, tushunmadim. Qaytadan ayting.";
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