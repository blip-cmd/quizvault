/* =============================================
   QuizVault — Core Application Logic
   ============================================= */

(function () {
  'use strict';

  // ==================== State ====================
  const state = {
    quizzes: JSON.parse(localStorage.getItem('qv_quizzes') || '[]'),
    currentQuiz: null,
    currentIndex: 0,
    answers: [],
    explanationVisible: [],
    shuffleQuestions: JSON.parse(localStorage.getItem('qv_shuffle') || 'false'),
    shuffleAnswers: JSON.parse(localStorage.getItem('qv_shuffleAnswers') || 'false'),
    showExplanation: JSON.parse(localStorage.getItem('qv_showExplanation') || 'true'),
    theme: localStorage.getItem('qv_theme') || 'dark',
    showJumper: false,
    view: 'home',
    aiApiKey: localStorage.getItem('qv_aiApiKey') || '',
    customAIPrompt: localStorage.getItem('qv_customAIPrompt') || "Provide a brief, deeper explanation for the following question from the subject '{subject}'. The user chose an incorrect answer or wants more detail. Question: '{question}'",
    aiExplanations: {} // Cache: { questionIndex: HTML }
  };

  // ==================== Theme ====================
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('qv_theme', state.theme);
    applyTheme();
    render();
  }
  applyTheme();

  // ==================== Progress Persistence ====================
  function saveProgress() {
    if (!state.currentQuiz) { localStorage.removeItem('qv_progress'); return; }
    localStorage.setItem('qv_progress', JSON.stringify({
      quizId: state.currentQuiz.id,
      currentIndex: state.currentIndex,
      answers: state.answers,
      explanationVisible: state.explanationVisible,
      questionOrder: state.currentQuiz.questions.map(q => q.question),
    }));
  }
  function loadProgress() {
    const saved = localStorage.getItem('qv_progress');
    if (!saved) return false;
    try {
      const p = JSON.parse(saved);
      const quiz = state.quizzes.find(q => q.id === p.quizId);
      if (!quiz) { localStorage.removeItem('qv_progress'); return false; }
      // Restore quiz with saved question order
      const orderedQuestions = p.questionOrder.map(qText =>
        quiz.questions.find(q => q.question === qText)
      ).filter(Boolean);
      if (orderedQuestions.length !== quiz.questions.length) { localStorage.removeItem('qv_progress'); return false; }
      state.currentQuiz = { ...quiz, questions: orderedQuestions };
      state.currentIndex = p.currentIndex;
      state.answers = p.answers;
      state.explanationVisible = p.explanationVisible || new Array(quiz.questions.length).fill(false);
      return true;
    } catch { localStorage.removeItem('qv_progress'); return false; }
  }

  // ==================== Preload Built-in Quiz ====================
  const BUILTIN_QUIZ_ID = 'dcit405-mock2-builtin';
  function preloadBuiltinQuiz() {
    // Only preload if not already in library
    if (state.quizzes.some(q => q.id === BUILTIN_QUIZ_ID)) return;
    fetch('/quizzes/dcit405-mock2.json')
      .then(r => r.json())
      .then(data => {
        const quiz = {
          id: BUILTIN_QUIZ_ID,
          title: data.title || 'DCIT405 — Mock Exam 2',
          questions: data.questions.map(q => ({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation || '',
          })),
          attempts: 0,
          bestScore: null,
          createdAt: new Date().toISOString(),
        };
        state.quizzes.unshift(quiz);
        saveQuizzes();
        render();
        showToast(`"${quiz.title}" loaded — ${quiz.questions.length} questions!`, 'success');
      })
      .catch(() => { /* offline or file not found — skip silently */ });
  }

  // ==================== Toast System ====================
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const icons = { offline: '📡', online: '✅', success: '✅', info: 'ℹ️', error: '❌' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span class="toast__icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Online/Offline detection
  window.addEventListener('online', () => showToast('You\'re back online!', 'online'));
  window.addEventListener('offline', () => showToast('You\'re offline — quizzes still work!', 'offline', 4000));

  // ==================== Service Worker ====================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service worker registered');
      // Check for updates periodically
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch(err => console.log('SW registration failed:', err));
  }

  function showUpdateBanner() {
    const existing = document.getElementById('update-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>🔄 A new version is available.</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn--primary" style="padding:8px 14px;font-size:0.78rem;" onclick="location.reload()">Refresh</button>
        <button class="btn btn--secondary" style="padding:8px 14px;font-size:0.78rem;" onclick="this.closest('.update-banner').remove()">Later</button>
      </div>
    `;
    document.body.prepend(banner);
  }

  // ==================== Utility ====================
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const iconColors = ['purple', 'teal', 'orange', 'yellow'];
  const iconEmojis = ['📘', '🧠', '⚡', '🎯', '📐', '💡', '🔬', '📊', '🌐', '🔑'];

  function getQuizIcon(index) {
    return iconEmojis[index % iconEmojis.length];
  }

  function getQuizColor(index) {
    return iconColors[index % iconColors.length];
  }

  function saveQuizzes() {
    localStorage.setItem('qv_quizzes', JSON.stringify(state.quizzes));
  }

  // ==================== Rendering ====================
  function render() {
    const app = document.getElementById('app');
    const bottomNav = document.getElementById('bottom-nav');

    // Show/hide bottom nav based on view
    if (state.view === 'quiz' || state.view === 'results') {
      bottomNav.style.display = 'none';
    } else {
      bottomNav.style.display = 'flex';
    }

    // Update nav active state
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === state.view);
    });

    switch (state.view) {
      case 'home': renderHome(app); break;
      case 'quiz': renderQuiz(app); break;
      case 'results': renderResults(app); break;
      case 'prompts': renderPrompts(app); break;
      case 'settings': renderSettings(app); break;
    }
  }

  // ==================== Home View ====================
  function renderHome(app) {
    const totalQuestions = state.quizzes.reduce((sum, q) => sum + q.questions.length, 0);
    const totalAttempts = state.quizzes.reduce((sum, q) => sum + (q.attempts || 0), 0);
    const bestScores = state.quizzes.filter(q => q.bestScore != null);
    const avgScore = bestScores.length
      ? Math.round(bestScores.reduce((s, q) => s + q.bestScore, 0) / bestScores.length)
      : 0;

    let quizListHtml = '';
    if (state.quizzes.length === 0) {
      quizListHtml = `
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <div class="empty-state__title">No quizzes yet</div>
          <div class="empty-state__text">Import a quiz using JSON or check the Prompts tab to format your documents.</div>
          <button class="btn btn--primary" onclick="QuizVault.openImport()">＋ Import Quiz</button>
        </div>`;
    } else {
      quizListHtml = state.quizzes.map((quiz, i) => `
        <div class="quiz-item" onclick="QuizVault.startQuiz('${quiz.id}')">
          <div class="quiz-item__icon quiz-item__icon--${getQuizColor(i)}">${getQuizIcon(i)}</div>
          <div class="quiz-item__info">
            <div class="quiz-item__name">${escapeHtml(quiz.title)}</div>
            <div class="quiz-item__meta">${quiz.questions.length} questions${quiz.bestScore != null ? ` · Best: ${quiz.bestScore}%` : ''}</div>
          </div>
          <button class="quiz-item__delete" onclick="event.stopPropagation(); QuizVault.deleteQuiz('${quiz.id}')" title="Delete quiz">🗑️</button>
          <span class="quiz-item__arrow">›</span>
        </div>
      `).join('');
    }

    app.innerHTML = `
      <div class="view active" id="view-home">
        <div class="header">
          <div class="header__brand">
            <div class="header__logo">Q</div>
            <div class="header__title">QuizVault</div>
          </div>
          <div class="header__actions">
            <button class="btn-icon" onclick="QuizVault.openImport()" title="Import Quiz" id="btn-import">＋</button>
          </div>
        </div>

        <div class="hero">
          <span class="hero__emoji">🧠</span>
          <h1 class="hero__title">Practice Smarter</h1>
          <p class="hero__sub">Import your study material, quiz yourself anywhere — even offline.</p>
        </div>

        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-card__value">${state.quizzes.length}</div>
            <div class="stat-card__label">Quizzes</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__value">${totalQuestions}</div>
            <div class="stat-card__label">Questions</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__value">${avgScore}%</div>
            <div class="stat-card__label">Avg Score</div>
          </div>
        </div>

        ${state.quizzes.length > 0 ? '<div class="section-title">Your Quizzes</div>' : ''}
        <div class="quiz-list">${quizListHtml}</div>
      </div>
    `;
  }

  // ==================== Quiz Player ====================
  function renderQuiz(app) {
    const quiz = state.currentQuiz;
    if (!quiz) return navigateTo('home');

    const q = quiz.questions[state.currentIndex];
    const total = quiz.questions.length;
    const progress = ((state.currentIndex) / total) * 100;
    const answered = state.answers[state.currentIndex];
    const isAnswered = answered != null;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    const optionsHtml = q.options.map((opt, i) => {
      let cls = 'option';
      if (isAnswered) {
        if (i === q.correctIndex) cls += ' correct';
        else if (i === answered && i !== q.correctIndex) cls += ' incorrect';
        else cls += ' dimmed';
      } else {
        // Not answered yet
      }
      return `
        <div class="${cls}" onclick="${isAnswered ? '' : `QuizVault.answer(${i})`}" role="button" tabindex="0" id="option-${i}">
          <div class="option__marker">${isAnswered ? (i === q.correctIndex ? '✓' : (i === answered ? '✗' : letters[i])) : letters[i]}</div>
          <div class="option__text">${escapeHtml(opt)}</div>
        </div>
      `;
    }).join('');

    // Explanation logic: auto-show on wrong answer, button-reveal on correct
    let explanationHtml = '';
    if (isAnswered && q.explanation && state.showExplanation) {
      const isCorrect = answered === q.correctIndex;
      const isVisible = !isCorrect || state.explanationVisible[state.currentIndex];
      if (isVisible) {
        
        let deepExplanationHtml = '';
        const cachedAI = state.aiExplanations[state.currentIndex];
        if (cachedAI) {
          deepExplanationHtml = `
            <div class="explanation__ai">
              <div class="explanation__ai-label">🤖 AI Deep Dive</div>
              <div class="explanation__text">${cachedAI}</div>
            </div>`;
        } else {
          deepExplanationHtml = `
            <div style="margin-top:12px;text-align:right;">
              <button class="btn btn--secondary" style="font-size:0.75rem;padding:6px 12px;" onclick="QuizVault.fetchAIExplanation(this)" id="btn-explain-deeper">🤖 Explain Deeper</button>
            </div>`;
        }

        explanationHtml = `
          <div class="explanation">
            <div class="explanation__label">💡 Explanation</div>
            <div class="explanation__text">${escapeHtml(q.explanation)}</div>
            ${deepExplanationHtml}
          </div>
        `;
      } else {
        explanationHtml = `
          <div style="text-align:center;margin-bottom:16px;">
            <button class="btn btn--secondary" onclick="QuizVault.toggleExplanationVisible()" id="btn-show-explanation">💡 Show Explanation</button>
          </div>
        `;
      }
    }

    const isLast = state.currentIndex >= total - 1;
    const answeredCount = state.answers.filter(a => a != null).length;

    // Question jumper grid
    let jumperHtml = '';
    if (state.showJumper) {
      const dots = quiz.questions.map((_, i) => {
        let cls = 'jumper__dot';
        if (i === state.currentIndex) cls += ' jumper__dot--current';
        else if (state.answers[i] != null && state.answers[i] === quiz.questions[i].correctIndex) cls += ' jumper__dot--correct';
        else if (state.answers[i] != null) cls += ' jumper__dot--wrong';
        return `<button class="${cls}" onclick="QuizVault.jumpTo(${i})">${i + 1}</button>`;
      }).join('');
      jumperHtml = `
        <div class="jumper">
          <div class="jumper__header">
            <span class="jumper__title">Jump to Question</span>
            <span style="font-size:0.75rem;color:var(--text-secondary);">${answeredCount}/${total} answered</span>
          </div>
          <div class="jumper__grid">${dots}</div>
        </div>
      `;
    }

    app.innerHTML = `
      <div class="view active" id="view-quiz">
        <div class="quiz-header">
          <button class="quiz-header__back" onclick="QuizVault.exitQuiz()" title="Exit quiz">←</button>
          <div class="quiz-header__info">
            <div class="quiz-header__title">${escapeHtml(quiz.title)}</div>
            <div class="quiz-header__progress-text">${state.currentIndex + 1} of ${total} · ${answeredCount} answered</div>
          </div>
          <button class="btn-icon" onclick="QuizVault.toggleJumper()" title="Jump to question" id="btn-jumper" style="font-size:0.85rem;">#</button>
        </div>

        ${jumperHtml}

        <div class="progress-bar">
          <div class="progress-bar__fill" style="width: ${progress}%"></div>
        </div>

        <div class="question-card">
          <div class="question-card__number">Question ${state.currentIndex + 1}</div>
          <div class="question-card__text">${escapeHtml(q.question)}</div>
        </div>

        <div class="options-list">${optionsHtml}</div>

        ${explanationHtml}

        ${isAnswered ? `
          <div class="quiz-actions">
            ${isLast
              ? `<button class="btn btn--success btn--full btn--lg" onclick="QuizVault.showResults()">View Results 🎉</button>`
              : `<button class="btn btn--primary btn--full btn--lg" onclick="QuizVault.next()">Next Question →</button>`
            }
          </div>
        ` : ''}
      </div>
    `;
  }

  // ==================== Results ====================
  function renderResults(app) {
    const quiz = state.currentQuiz;
    if (!quiz) return navigateTo('home');

    const total = quiz.questions.length;
    const correct = state.answers.reduce((sum, a, i) => sum + (a === quiz.questions[i].correctIndex ? 1 : 0), 0);
    const pct = Math.round((correct / total) * 100);

    // Save stats
    const origQuiz = state.quizzes.find(q => q.id === quiz.id);
    if (origQuiz) {
      origQuiz.attempts = (origQuiz.attempts || 0) + 1;
      origQuiz.bestScore = Math.max(origQuiz.bestScore || 0, pct);
      origQuiz.lastPlayed = new Date().toISOString();
      saveQuizzes();
    }

    const circumference = 2 * Math.PI * 58;
    const offset = circumference - (pct / 100) * circumference;
    const strokeColor = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)';

    let emoji, title, subtitle;
    if (pct >= 90) { emoji = '🏆'; title = 'Outstanding!'; subtitle = 'You absolutely crushed it!'; }
    else if (pct >= 70) { emoji = '🌟'; title = 'Great Job!'; subtitle = 'Solid performance — keep going!'; }
    else if (pct >= 50) { emoji = '💪'; title = 'Not Bad!'; subtitle = 'You\'re getting there. Review and retry!'; }
    else { emoji = '📚'; title = 'Keep Studying!'; subtitle = 'Review the material and try again.'; }

    app.innerHTML = `
      <div class="view active" id="view-results">
        <div class="results">
          <div style="font-size: 3rem; margin-bottom: 16px;">${emoji}</div>
          
          <div class="results__circle">
            <svg viewBox="0 0 140 140">
              <circle class="results__circle-bg" cx="70" cy="70" r="58"/>
              <circle class="results__circle-fill" cx="70" cy="70" r="58"
                stroke="${strokeColor}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference}"
                id="result-circle"/>
            </svg>
            <div class="results__score-text">
              <div class="results__percentage" style="color: ${strokeColor}">${pct}%</div>
              <div class="results__fraction">${correct}/${total}</div>
            </div>
          </div>

          <h2 class="results__title">${title}</h2>
          <p class="results__subtitle">${subtitle}</p>

          <div class="results__actions">
            <button class="btn btn--primary btn--full btn--lg" onclick="QuizVault.retryQuiz()">🔄 Try Again</button>
            <button class="btn btn--secondary btn--full" onclick="QuizVault.navigateTo('home')">← Back to Library</button>
          </div>
        </div>
      </div>
    `;

    // Animate circle
    requestAnimationFrame(() => {
      setTimeout(() => {
        const circle = document.getElementById('result-circle');
        if (circle) circle.style.strokeDashoffset = offset;
      }, 100);
    });
  }

  // ==================== Prompts View ====================
  function renderPrompts(app) {
    const prompts = [
      {
        title: '📋 Multiple Choice Quiz',
        desc: 'Best for course notes, textbooks, and study guides.',
        prompt: `Convert the following document into a JSON quiz format. 

Rules:
- Create multiple-choice questions with 4 options each
- Include the correct answer index (0-based)
- Add a brief explanation for each answer
- Cover all key concepts from the document

Output this EXACT JSON structure:
{
  "title": "Quiz Title Here",
  "questions": [
    {
      "question": "What is...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation of why this is correct."
    }
  ]
}

IMPORTANT: Output ONLY valid JSON, no markdown, no code fences.

--- DOCUMENT START ---
[Paste your document here]
--- DOCUMENT END ---`
      },
      {
        title: '📑 True/False Quiz',
        desc: 'Quick recall questions from your material.',
        prompt: `Convert the following document into a True/False quiz in JSON format.

Rules:
- Create True/False questions covering key facts
- Use only 2 options: "True" and "False"
- correctIndex: 0 for True, 1 for False
- Include clear explanations

Output this EXACT JSON:
{
  "title": "True/False: Topic Name",
  "questions": [
    {
      "question": "Statement to evaluate...",
      "options": ["True", "False"],
      "correctIndex": 0,
      "explanation": "Why this is true/false."
    }
  ]
}

IMPORTANT: Output ONLY valid JSON, no markdown, no code fences.

--- DOCUMENT START ---
[Paste your document here]
--- DOCUMENT END ---`
      },
      {
        title: '🎯 Exam-Style Deep Questions',
        desc: 'Higher-order thinking questions for exam prep.',
        prompt: `Analyze the following document and create challenging exam-style questions in JSON format.

Rules:
- Create questions that test understanding, not just recall
- Include application, analysis, and evaluation questions
- Use 4 options with plausible distractors
- Write detailed explanations referencing source material
- Aim for 15-25 questions

Output this EXACT JSON:
{
  "title": "Exam Prep: Topic Name",
  "questions": [
    {
      "question": "Which of the following best explains...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 2,
      "explanation": "Detailed explanation with context."
    }
  ]
}

IMPORTANT: Output ONLY valid JSON, no markdown, no code fences.

--- DOCUMENT START ---
[Paste your document here]
--- DOCUMENT END ---`
      }
    ];

    app.innerHTML = `
      <div class="view active" id="view-prompts">
        <div class="header">
          <div class="header__brand">
            <div class="header__logo">Q</div>
            <div class="header__title">QuizVault</div>
          </div>
        </div>

        <div class="prompt-guide">
          <div class="prompt-guide__header">
            <h2 class="prompt-guide__title">✨ AI Prompt Templates</h2>
            <p class="prompt-guide__desc">Copy a prompt, paste your document into it, then feed it to ChatGPT/Claude/Gemini. Paste the JSON output into the Import screen.</p>
          </div>

          ${prompts.map(p => `
            <div class="prompt-card">
              <div class="prompt-card__header">
                <div class="prompt-card__title">${p.title}</div>
                <button class="btn-copy" onclick="QuizVault.copyPrompt(this)">Copy</button>
              </div>
              <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:10px;">${p.desc}</p>
              <div class="prompt-card__content">${escapeHtml(p.prompt)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==================== Settings View ====================
  function renderSettings(app) {
    app.innerHTML = `
      <div class="view active" id="view-settings">
        <div class="header">
          <div class="header__brand">
            <div class="header__logo">Q</div>
            <div class="header__title">QuizVault</div>
          </div>
        </div>

        <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:20px;">⚙️ Settings</h2>

        <div class="settings-group">
          <div class="section-title">Appearance</div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">${state.theme === 'dark' ? '🌙' : '☀️'}</span>
              <span class="settings-item__label">${state.theme === 'dark' ? 'Dark' : 'Light'} Theme</span>
            </div>
            <button class="toggle ${state.theme === 'light' ? 'active' : ''}" 
                    onclick="QuizVault.toggleTheme()" id="toggle-theme"></button>
          </div>
        </div>

        <div class="settings-group">
          <div class="section-title">Quiz Behavior</div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">🔀</span>
              <span class="settings-item__label">Shuffle Questions</span>
            </div>
            <button class="toggle ${state.shuffleQuestions ? 'active' : ''}" 
                    onclick="QuizVault.toggleShuffle()" id="toggle-shuffle"></button>
          </div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">🔀</span>
              <span class="settings-item__label">Shuffle Answer Options</span>
            </div>
            <button class="toggle ${state.shuffleAnswers ? 'active' : ''}" 
                    onclick="QuizVault.toggleShuffleAnswers()" id="toggle-shuffle-answers"></button>
          </div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">💡</span>
              <span class="settings-item__label">Show Explanations</span>
            </div>
            <button class="toggle ${state.showExplanation ? 'active' : ''}" 
                    onclick="QuizVault.toggleExplanation()" id="toggle-explanation"></button>
          </div>
        </div>

        <div class="settings-group">
          <div class="section-title">AI Integration (Gemini)</div>
          <div class="settings-item" style="flex-direction:column;align-items:stretch;gap:12px;">
            <div>
              <label class="form-label" for="api-key-input">Gemini API Key (Stored Locally)</label>
              <input type="text" id="api-key-input" placeholder="AIzaSy..." value="${escapeHtml(state.aiApiKey)}" onchange="QuizVault.updateApiKey(this.value)" />
            </div>
            <div>
              <label class="form-label" for="ai-prompt-input">Default Prompt Template</label>
              <textarea id="ai-prompt-input" style="min-height:80px;font-family:var(--font);" onchange="QuizVault.updateAIPrompt(this.value)">${escapeHtml(state.customAIPrompt)}</textarea>
              <p style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Variables: <code>{subject}</code>, <code>{question}</code></p>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="section-title">Data</div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">📦</span>
              <span class="settings-item__label">Export All Quizzes</span>
            </div>
            <button class="btn-copy" onclick="QuizVault.exportAll()">Export</button>
          </div>
          <div class="settings-item">
            <div class="settings-item__info">
              <span class="settings-item__icon">🗑️</span>
              <span class="settings-item__label">Delete All Data</span>
            </div>
            <button class="btn-copy" style="background:var(--error-bg);color:var(--error);border-color:rgba(255,107,107,0.25);" 
                    onclick="QuizVault.clearAll()">Clear</button>
          </div>
        </div>

        <div style="text-align:center;padding:24px 0;">
          <p style="font-size:0.75rem;color:var(--text-muted);">QuizVault v1.2 — Built for learning on the go.</p>
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">Works 100% offline after first visit.</p>
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:10px;">Copyright &copy; 2026 Blip. All rights reserved.</p>
        </div>
      </div>
    `;
  }

  // ==================== Navigation ====================
  function navigateTo(view) {
    state.view = view;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==================== Import Modal ====================
  function openImport() {
    const overlay = document.getElementById('import-modal');
    overlay.classList.add('active');
  }

  function closeImport() {
    const overlay = document.getElementById('import-modal');
    overlay.classList.remove('active');
  }

  function switchTab(tab) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
  }

  function importJSON() {
    const textarea = document.getElementById('json-input');
    const raw = textarea.value.trim();
    if (!raw) return showToast('Please paste your quiz JSON.', 'error');

    try {
      // Try to extract JSON from markdown code fences if present
      let jsonStr = raw;
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();

      const data = JSON.parse(jsonStr);
      if (!validateQuiz(data)) return;

      const quiz = {
        id: uid(),
        title: data.title || 'Untitled Quiz',
        questions: data.questions.map(q => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation || '',
        })),
        attempts: 0,
        bestScore: null,
        createdAt: new Date().toISOString(),
      };

      state.quizzes.push(quiz);
      saveQuizzes();
      closeImport();
      textarea.value = '';
      navigateTo('home');
      showToast(`"${quiz.title}" imported — ${quiz.questions.length} questions!`, 'success');
    } catch (e) {
      showToast('Invalid JSON format. Check your data.', 'error');
      console.error(e);
    }
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('json-input').value = e.target.result;
      switchTab('json');
      showToast('File loaded! Click Import to add the quiz.', 'info');
    };
    reader.readAsText(file);
  }

  function validateQuiz(data) {
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      showToast('JSON must have a "questions" array.', 'error');
      return false;
    }
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length < 2) {
        showToast(`Question ${i + 1} is missing required fields.`, 'error');
        return false;
      }
      if (q.correctIndex == null || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        showToast(`Question ${i + 1} has an invalid correctIndex.`, 'error');
        return false;
      }
    }
    return true;
  }

  // ==================== Quiz Actions ====================
  function startQuiz(id) {
    const quiz = state.quizzes.find(q => q.id === id);
    if (!quiz) return;

    let preppedQuestions = [...quiz.questions];
    if (state.shuffleQuestions) preppedQuestions = shuffleArray(preppedQuestions);

    // Map options to handle correct answer index mapping 
    preppedQuestions = preppedQuestions.map(q => {
      let mappedOptions = q.options.map((opt, idx) => ({ originalIndex: idx, text: opt }));
      if (state.shuffleAnswers) {
        mappedOptions = shuffleArray(mappedOptions);
      }
      return { 
        ...q, 
        options: mappedOptions.map(m => m.text), // Text for rendering
        correctIndex: mappedOptions.findIndex(o => o.originalIndex === q.correctIndex) // Overwrite with new mapped Index
      };
    });

    state.currentQuiz = {
      ...quiz,
      questions: preppedQuestions,
    };
    state.currentIndex = 0;
    state.answers = new Array(preppedQuestions.length).fill(null);
    state.explanationVisible = new Array(preppedQuestions.length).fill(false);
    state.aiExplanations = {};
    state.showJumper = false;
    saveProgress();
    navigateTo('quiz');
  }

  function answer(optionIndex) {
    state.answers[state.currentIndex] = optionIndex;
    saveProgress();
    render();
  }

  function next() {
    if (state.currentIndex < state.currentQuiz.questions.length - 1) {
      state.currentIndex++;
      state.showJumper = false;
      saveProgress();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function jumpTo(index) {
    if (index < 0 || index >= state.currentQuiz.questions.length) return;
    state.currentIndex = index;
    state.showJumper = false;
    saveProgress();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleJumper() {
    state.showJumper = !state.showJumper;
    render();
  }

  function showResults() {
    localStorage.removeItem('qv_progress');
    navigateTo('results');
  }

  function retryQuiz() {
    if (!state.currentQuiz) return navigateTo('home');
    startQuiz(state.currentQuiz.id);
  }

  function exitQuiz() {
    if (state.answers.some(a => a !== null)) {
      if (!confirm('Exit quiz? Progress is saved — you can resume later.')) return;
    }
    state.currentQuiz = null;
    navigateTo('home');
  }

  function deleteQuiz(id) {
    if (!confirm('Delete this quiz?')) return;
    state.quizzes = state.quizzes.filter(q => q.id !== id);
    saveQuizzes();
    render();
    showToast('Quiz deleted.', 'info');
  }

  // ==================== Settings Actions ====================
  function toggleShuffle() {
    state.shuffleQuestions = !state.shuffleQuestions;
    localStorage.setItem('qv_shuffle', JSON.stringify(state.shuffleQuestions));
    render();
  }

  function toggleShuffleAnswers() {
    state.shuffleAnswers = !state.shuffleAnswers;
    localStorage.setItem('qv_shuffleAnswers', JSON.stringify(state.shuffleAnswers));
    render();
  }

  function updateApiKey(val) {
    state.aiApiKey = val.trim();
    localStorage.setItem('qv_aiApiKey', state.aiApiKey);
    showToast('API Key saved securely.', 'success');
  }

  function updateAIPrompt(val) {
    state.customAIPrompt = val;
    localStorage.setItem('qv_customAIPrompt', state.customAIPrompt);
    showToast('Prompt template updated.', 'success');
  }

  function toggleExplanation() {
    state.showExplanation = !state.showExplanation;
    localStorage.setItem('qv_showExplanation', JSON.stringify(state.showExplanation));
    render();
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(state.quizzes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quizvault-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Quizzes exported!', 'success');
  }

  function clearAll() {
    if (!confirm('This will delete ALL quizzes and data. Are you sure?')) return;
    state.quizzes = [];
    saveQuizzes();
    localStorage.removeItem('qv_shuffle');
    localStorage.removeItem('qv_showExplanation');
    state.shuffleQuestions = false;
    state.showExplanation = true;
    navigateTo('home');
    showToast('All data cleared.', 'info');
  }

  function copyPrompt(btn) {
    const content = btn.closest('.prompt-card').querySelector('.prompt-card__content').textContent;
    navigator.clipboard.writeText(content).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
      showToast('Prompt copied to clipboard!', 'success');
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
      showToast('Prompt copied!', 'success');
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==================== Drop Zone ====================
  function setupDropZone() {
    document.addEventListener('click', (e) => {
      const dropZone = e.target.closest('.drop-zone');
      if (dropZone) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        input.onchange = (ev) => importFile(ev.target.files[0]);
        input.click();
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dz = document.querySelector('.drop-zone');
      if (dz) dz.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (e) => {
      const dz = document.querySelector('.drop-zone');
      if (dz) dz.classList.remove('drag-over');
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const dz = document.querySelector('.drop-zone');
      if (dz) dz.classList.remove('drag-over');
      if (e.dataTransfer.files.length) importFile(e.dataTransfer.files[0]);
    });
  }

  // ==================== Keyboard Support ====================
  document.addEventListener('keydown', (e) => {
    if (state.view === 'quiz' && !state.answers[state.currentIndex]) {
      const q = state.currentQuiz?.questions[state.currentIndex];
      if (!q) return;
      const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
      const idx = keyMap[e.key.toLowerCase()];
      if (idx != null && idx < q.options.length) {
        answer(idx);
      }
    }
    if (state.view === 'quiz' && state.answers[state.currentIndex] != null) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state.currentIndex < state.currentQuiz.questions.length - 1) next();
        else showResults();
      }
    }
  });

  // ==================== Bottom Nav Handlers ====================
  document.addEventListener('DOMContentLoaded', () => {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.view));
    });

    // Import modal overlay click to close
    document.getElementById('import-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'import-modal') closeImport();
    });

    setupDropZone();
    preloadBuiltinQuiz();

    // Restore in-progress quiz if any
    if (loadProgress()) {
      state.view = 'quiz';
      showToast('Resuming your quiz from where you left off!', 'info');
    }

    render();

    // Show online status on load
    if (!navigator.onLine) {
      showToast('You\'re offline — quizzes still work!', 'offline', 3000);
    }
  });

  // ==================== AI Actions ====================
  async function fetchAIExplanation(btn) {
    if (!state.aiApiKey) return showToast('Please add your Gemini API key in Settings first.', 'error');
    
    btn.disabled = true;
    btn.textContent = '🤖 Thinking...';
    
    const quiz = state.currentQuiz;
    const q = quiz.questions[state.currentIndex];
    const promptStr = state.customAIPrompt
      .replace('{subject}', quiz.title)
      .replace('{question}', q.question);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.aiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptStr }] }]
        })
      });

      if (!response.ok) throw new Error('API Request Failed');
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
      
      // Parse basic markdown strictly for the cached result
      const parsedText = escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '<br><br>');
        
      state.aiExplanations[state.currentIndex] = parsedText;
      render();
    } catch (e) {
      console.error(e);
      showToast('Failed to reach AI. Check API Key or connectivity.', 'error');
      btn.disabled = false;
      btn.textContent = '🤖 Explain Deeper';
    }
  }

  // ==================== Explanation Toggle ====================
  function toggleExplanationVisible() {
    state.explanationVisible[state.currentIndex] = true;
    render();
  }

  // ==================== Public API ====================
  window.QuizVault = {
    navigateTo,
    openImport,
    closeImport,
    switchTab,
    importJSON,
    startQuiz,
    answer,
    next,
    jumpTo,
    toggleJumper,
    showResults,
    retryQuiz,
    exitQuiz,
    deleteQuiz,
    toggleShuffle,
    toggleShuffleAnswers,
    updateApiKey,
    updateAIPrompt,
    fetchAIExplanation,
    toggleExplanation,
    toggleExplanationVisible,
    toggleTheme,
    exportAll,
    clearAll,
    copyPrompt,
  };

})();
