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
      updateAiStatus('listening', '🎤 Eshitmoqda...');
      const btn = document.getElementById('ai-mic-btn');
      if (btn) btn.classList.add('active');
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
        const btn = document.getElementById('ai-mic-btn');
        if (btn) btn.classList.remove('active');
      }
    };

    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch (e) {
          isListening = false;
          updateAiStatus('idle', 'Kutilmoqda');
          const btn = document.getElementById('ai-mic-btn');
          if (btn) btn.classList.remove('active');
        }
      } else {
        updateAiStatus('idle', 'Kutilmoqda');
        const btn = document.getElementById('ai-mic-btn');
        if (btn) btn.classList.remove('active');
      }
    };
  }

  // Toggle Voice Listening
  window.toggleAiVoiceListening = function() {
    if (!recognition) {
      initSpeechRecognition();
    }
    if (!recognition) {
      alert("Brauzeringiz ovozli tanib olishni qo'llab-quvvatlamaydi. Iltimos pastdagi maydonga yozing.");
      return;
    }

    if (isListening) {
      isListening = false;
      recognition.stop();
      updateAiStatus('idle', 'Kutilmoqda');
      const btn = document.getElementById('ai-mic-btn');
      if (btn) btn.classList.remove('active');
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn("Recognition start failed:", e);
      }
    }
  };

  // Text-to-Speech (Ovoz bilan gapirish)
  function speakText(text, callback) {
    if (!('speechSynthesis' in window)) {
      if (callback) callback();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'uz-UZ';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const uzVoice = voices.find(v => v.lang.startsWith('uz')) ||
                    voices.find(v => v.lang.startsWith('tr')) ||
                    voices.find(v => v.lang.startsWith('ru'));
    if (uzVoice) utterance.voice = uzVoice;

    utterance.onstart = () => {
      isSpeaking = true;
      updateAiStatus('speaking', '🔊 Gapirmoqda...');
    };

    utterance.onend = () => {
      isSpeaking = false;
      updateAiStatus(isListening ? 'listening' : 'idle', isListening ? '🎤 Eshitmoqda...' : 'Kutilmoqda');
      if (callback) callback();
    };

    utterance.onerror = () => {
      isSpeaking = false;
      updateAiStatus('idle', 'Kutilmoqda');
      if (callback) callback();
    };

    window.speechSynthesis.speak(utterance);
  }

  // UI Updates in Transcript
  function appendAiMessage(role, text) {
    const box = document.getElementById('ai-transcript-box');
    if (!box) return;

    const tempNode = document.getElementById('ai-temp-streaming-msg');
    if (tempNode) tempNode.remove();

    const bubble = document.createElement('div');
    bubble.className = `ai-msg-bubble ${role === 'user' ? 'ai-msg-user' : 'ai-msg-jarvis'}`;
    bubble.innerText = text;
    box.appendChild(bubble);
    box.scrollTop = box.scrollHeight;
  }

  function showTemporaryUserText(text) {
    const box = document.getElementById('ai-transcript-box');
    if (!box) return;

    let tempNode = document.getElementById('ai-temp-streaming-msg');
    if (!tempNode) {
      tempNode = document.createElement('div');
      tempNode.id = 'ai-temp-streaming-msg';
      tempNode.className = 'ai-msg-bubble ai-msg-user';
      tempNode.style.opacity = '0.7';
      box.appendChild(tempNode);
    }
    tempNode.innerText = text + '...';
    box.scrollTop = box.scrollHeight;
  }

  function updateAiStatus(state, label) {
    const badge = document.getElementById('ai-status-badge');
    if (!badge) return;
    badge.className = `ai-status-badge ai-status-${state}`;
    badge.innerText = label;
  }

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

  // Core NLP Intent Engine (supporting Uzbek & Xorazm dialect)
  function analyzeIntent(rawText) {
    const text = rawText.toLowerCase().trim();

    // 1. Tasdiqlash javoblari (Confirmation)
    const confirmWords = ['ha', 'xa', 'ok', 'yaxshi', 'tasdiqlayman', 'tasdiqla', 'yes', 'bo\'ldi', 'boldi', 'to\'g\'ri', 'tugat', 'saqla', 'yubor', 'albatta'];
    if (confirmWords.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w))) {
      return { intent: 'CONFIRM' };
    }

    // 2. Bekor qilish (Cancel)
    const cancelWords = ['yo\'q', 'yoq', 'kerakmas', 'bekor', 'bekor qil', 'to\'xtat', 'o\'chir', 'kerak emas'];
    if (cancelWords.some(w => text === w || text.startsWith(w + ' '))) {
      return { intent: 'CANCEL' };
    }

    // 3. Xatolikni tuzatish (Correction / Xorazm "duzot")
    if (text.includes('xatosi bor') || text.includes('duzot') || text.includes('tuzat') || text.includes('o\'zgartir') || text.includes('emas') || text.includes('o\'rniga')) {
      const worker = findWorkerInSpeech(text);
      const hasDate = text.includes('sentabr') || text.includes('sentyabr') || text.includes('oktabr') || text.includes('oktyabr') || text.includes('noyabr') || text.includes('dekabr') || text.includes('ertaga') || text.includes('bugun');
      return {
        intent: 'CORRECT',
        worker,
        newDate: hasDate ? parseDateFromSpeech(text) : null
      };
    }

    // 4. Sahifalarga o'tish (Navigation)
    if (text.includes('reja') || text.includes('rejalar') || text.includes('rejani och')) {
      return { intent: 'NAVIGATE', tab: 1, message: "Rejalar bo'limi ochildi." };
    }
    if (text.includes('ishchi') || text.includes('xodim') || text.includes('reyting') || text.includes('xodimlarni')) {
      return { intent: 'NAVIGATE', tab: 2, message: "Xodimlar va ularning reytingi sahifasiga o'tdik." };
    }
    if (text.includes('chat') || text.includes('yozishm') || text.includes('xabarlar')) {
      return { intent: 'NAVIGATE', tab: 3, message: "Chatlar bo'limi ochildi." };
    }
    if (text.includes('topshiriq') && (text.includes('ko\'rsat') || text.includes('och') || text.includes('o\'t'))) {
      return { intent: 'NAVIGATE', tab: 0, message: "Topshiriqlar bo'limi ochildi." };
    }

    // 5. Filtrlash (Filter)
    if (text.includes('qizil') || text.includes('boshlanmagan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Boshlanmagan topshiriqlar saralandi." };
    }
    if (text.includes('sariq') || text.includes('jarayonda')) {
      return { intent: 'FILTER_STATUS', statusIdx: 2, message: "Jarayondagi topshiriqlar saralandi." };
    }
    if (text.includes('yashil') || text.includes('bajarilgan') || text.includes('tugatilgan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 3, message: "Bajarilgan topshiriqlar saralandi." };
    }
    if (text.includes('ko\'k') || text.includes('tekshirilgan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 4, message: "Tekshirilgan topshiriqlar saralandi." };
    }
    if (text.includes('kechikkan') || text.includes('muddati o\'tgan')) {
      return { intent: 'FILTER_STATUS', statusIdx: 1, message: "Kechikkan va boshlanmagan topshiriqlar ko'rsatilmoqda." };
    }

    // 6. Yangi topshiriq yaratish (Xorazm "ish ber", "topshiriq ber", "vazifa yukla", "ayt")
    const isCreateCommand = text.includes('ish ber') || text.includes('topshiriq') || text.includes('vazifa') || text.includes('yangi ish') || text.includes('biriktir');
    const detectedWorker = findWorkerInSpeech(text);

    if (isCreateCommand || detectedWorker) {
      let cleanTitle = text
        .replace(/valiga|alisherga|karimga|boburga|jamshidga|xodimga/gi, '')
        .replace(/ish ber|topshiriq ber|yangi topshiriq|vazifa ber|biriktir|qilsin|etsin|tekshirsin|bajarilsin/gi, '')
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

  // Handle Speech / Text Command
  async function handleUserSpeech(userSpeech) {
    appendAiMessage('user', userSpeech);
    updateAiStatus('thinking', '⚡ Qayta ishlanmoqda...');

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

    const action = analyzeIntent(userSpeech);

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
    if (modal) {
      modal.classList.add('active');
      if (!isListening) {
        toggleAiVoiceListening();
      }
    }
  };

  window.closeAiAssistantModal = function() {
    const modal = document.getElementById('ai-assistant-modal');
    if (modal) modal.classList.remove('active');
    if (isListening && recognition) {
      isListening = false;
      recognition.stop();
    }
    if (isSpeaking && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
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