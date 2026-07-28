// Cookie helpers
export function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

export function setCookie(name, value, days = 365) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax";
}

// Local YYYY-MM-DD Date
export function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

// Active Streak logic
export function getActiveStreak() {
  const lastDate = getCookie('katas_last_date');
  const streak = parseInt(getCookie('katas_streak') || '0', 10);
  if (!lastDate) return 0;

  const todayStr = getLocalDateString();
  if (lastDate === todayStr) {
    return streak || 1;
  }

  const lastTime = new Date(lastDate + 'T00:00:00').getTime();
  const todayTime = new Date(todayStr + 'T00:00:00').getTime();
  const diffDays = Math.round((todayTime - lastTime) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) {
    return streak;
  } else {
    return 0; // Streak broken if more than 1 day missed
  }
}

export function updateStreak() {
  const todayStr = getLocalDateString();
  const lastDate = getCookie('katas_last_date');
  let currentStreak = parseInt(getCookie('katas_streak') || '0', 10);

  if (!lastDate) {
    currentStreak = 1;
  } else if (lastDate === todayStr) {
    if (currentStreak === 0) currentStreak = 1;
  } else {
    const lastTime = new Date(lastDate + 'T00:00:00').getTime();
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    const diffDays = Math.round((todayTime - lastTime) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
  }

  setCookie('katas_streak', String(currentStreak));
  setCookie('katas_last_date', todayStr);
  return currentStreak;
}

// Level & XP System
const LEVEL_TITLES = [
  { xp: 0, title: 'Code Novice 🥚' },
  { xp: 200, title: 'Byte Brawler 🐣' },
  { xp: 500, title: 'Syntax Samurai ⚔️' },
  { xp: 1000, title: 'Logic Legend 🧠' },
  { xp: 2000, title: 'Binary Boss 👑' },
];

export function getXP() {
  return parseInt(getCookie('katas_xp') || '0', 10);
}

export function addXP(amount) {
  const currentXP = getXP();
  const nextXP = currentXP + amount;
  setCookie('katas_xp', String(nextXP));

  const oldInfo = getLevelInfo(currentXP);
  const newInfo = getLevelInfo(nextXP);

  if (newInfo.level > oldInfo.level) {
    setTimeout(() => {
      triggerLevelUpOverlay(newInfo.level, newInfo.title);
    }, 400);
  }

  return {
    oldXP: currentXP,
    newXP: nextXP,
    leveledUp: newInfo.level > oldInfo.level,
    levelInfo: newInfo,
  };
}

export function getLevelInfo(xp) {
  let currentLvl = 1;
  let currentTitle = LEVEL_TITLES[0].title;
  let prevMilestone = 0;
  let nextMilestone = LEVEL_TITLES[1].xp;

  for (let i = 0; i < LEVEL_TITLES.length; i++) {
    if (xp >= LEVEL_TITLES[i].xp) {
      currentLvl = i + 1;
      currentTitle = LEVEL_TITLES[i].title;
      prevMilestone = LEVEL_TITLES[i].xp;
      nextMilestone = LEVEL_TITLES[i + 1] ? LEVEL_TITLES[i + 1].xp : Infinity;
    } else {
      break;
    }
  }

  return {
    level: currentLvl,
    title: currentTitle,
    prevMilestone,
    nextMilestone,
    xpInLevel: xp - prevMilestone,
    xpNeededForNext: nextMilestone === Infinity ? 1 : nextMilestone - prevMilestone,
  };
}

// Sound FX Synthesis
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSuccessSound() {
  if (getCookie('katas_sound_muted') === 'true') return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.2); // G5

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    console.error('Audio play error:', e);
  }
}

export function playLevelUpSound() {
  if (getCookie('katas_sound_muted') === 'true') return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const duration = 0.14;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * duration);

      gain.gain.setValueAtTime(0.15, now + i * duration);
      gain.gain.exponentialRampToValueAtTime(0.01, now + (i + 1) * duration - 0.02);

      osc.start(now + i * duration);
      osc.stop(now + (i + 1) * duration);
    });
  } catch (e) {
    console.error('Audio play error:', e);
  }
}

// Confetti Particle System
export function triggerConfetti() {
  const canvas = document.createElement('canvas');
  canvas.className = 'gamified-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const resizeHandler = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);

  const colors = ['#87ff72', '#25c946', '#fca2cf', '#fb72bd', '#fffdd0', '#f45c5c', '#85d7ff'];
  const particles = [];

  const particleCount = 100;
  for (let i = 0; i < particleCount; i++) {
    const isLeft = Math.random() < 0.5;
    particles.push({
      x: isLeft ? 0 : width,
      y: height,
      vx: (isLeft ? 1 : -1) * (Math.random() * 8 + 4),
      vy: -(Math.random() * 12 + 10),
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 6,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    });
  }

  function update() {
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4;
      p.vx *= 0.98;
      p.rotation += p.rotationSpeed;
      if (p.y > height + 20) {
        p.opacity = 0;
      } else {
        p.opacity -= 0.005;
      }

      if (p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (alive) {
      requestAnimationFrame(update);
    } else {
      window.removeEventListener('resize', resizeHandler);
      canvas.remove();
    }
  }

  requestAnimationFrame(update);
}

// Toast Notification
export function showSuccessToast(message) {
  const existing = document.querySelector('.gamified-toast-container');
  if (existing) existing.remove();

  const container = document.createElement('div');
  container.className = 'gamified-toast-container';

  const emoji = document.createElement('span');
  emoji.className = 'gamified-toast-emoji';
  emoji.textContent = '✨';

  const text = document.createElement('div');
  text.className = 'gamified-toast-text';
  text.innerHTML = message;

  container.append(emoji, text);
  document.body.appendChild(container);

  setTimeout(() => {
    container.classList.add('is-fadeout');
    container.addEventListener('transitionend', () => container.remove());
  }, 3500);
}

// Level Up Modal Overlay
export function triggerLevelUpOverlay(level, title) {
  playLevelUpSound();
  triggerConfetti();
  // Trigger a second wave of confetti for extra celebration!
  setTimeout(triggerConfetti, 300);

  const overlay = document.createElement('div');
  overlay.className = 'gamified-levelup-overlay';

  const modal = document.createElement('div');
  modal.className = 'gamified-levelup-modal';

  const star = document.createElement('div');
  star.className = 'gamified-levelup-star';
  star.textContent = '🌟';

  const heading = document.createElement('h2');
  heading.className = 'gamified-levelup-heading';
  heading.textContent = 'LEVEL UP!';

  const sub = document.createElement('p');
  sub.className = 'gamified-levelup-sub';
  sub.innerHTML = `You have advanced to <strong>Level ${level}</strong>!<br><span class="gamified-lvl-title">${title}</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn gamified-levelup-btn';
  closeBtn.textContent = 'Awesome!';
  closeBtn.addEventListener('click', () => {
    overlay.classList.add('is-fadeout');
    overlay.addEventListener('transitionend', () => overlay.remove());
  });

  modal.append(star, heading, sub, closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// UI Dashboard Component
export function createGamifiedDashboard(lessonConfig = null) {
  const root = document.createElement('div');
  root.className = 'gamified-dashboard';

  const statsLeft = document.createElement('div');
  statsLeft.className = 'gamified-stats-left';

  // Streak section
  const streakVal = getActiveStreak();
  const streakSec = document.createElement('div');
  streakSec.className = `gamified-streak-sec ${streakVal > 0 ? 'is-active' : ''}`;
  streakSec.title = streakVal > 0 ? `${streakVal} days active streak!` : 'No active streak today yet. Solve a puzzle to start your streak!';

  const streakIcon = document.createElement('span');
  streakIcon.className = 'gamified-streak-icon';
  streakIcon.textContent = '🔥';

  const streakText = document.createElement('span');
  streakText.className = 'gamified-streak-text';
  streakText.innerHTML = `Streak: <strong>${streakVal} day${streakVal === 1 ? '' : 's'}</strong>`;

  streakSec.append(streakIcon, streakText);
  statsLeft.appendChild(streakSec);

  // Level section
  const xp = getXP();
  const lvlInfo = getLevelInfo(xp);

  const lvlSec = document.createElement('div');
  lvlSec.className = 'gamified-level-sec';

  const lvlText = document.createElement('div');
  lvlText.className = 'gamified-level-text';
  lvlText.innerHTML = `Level ${lvlInfo.level}: <span class="gamified-title-span">${lvlInfo.title}</span>`;

  // XP Progress Bar container
  const progressContainer = document.createElement('div');
  progressContainer.className = 'gamified-progress-container';
  progressContainer.title = lvlInfo.nextMilestone === Infinity
    ? `Total XP: ${xp} (Max Level Reached!)`
    : `XP: ${lvlInfo.xpInLevel} / ${lvlInfo.xpNeededForNext} (Total: ${xp} XP, ${lvlInfo.nextMilestone - xp} XP to next level)`;

  const progressBar = document.createElement('div');
  progressBar.className = 'gamified-progress-bar';

  const progressPercent = lvlInfo.nextMilestone === Infinity
    ? 100
    : (lvlInfo.xpInLevel / lvlInfo.xpNeededForNext) * 100;
  progressBar.style.width = `${progressPercent}%`;

  progressContainer.appendChild(progressBar);
  lvlSec.append(lvlText, progressContainer);
  statsLeft.appendChild(lvlSec);

  // Lesson title context if inside a lesson
  const lessonContext = document.createElement('div');
  lessonContext.className = 'gamified-lesson-context';
  if (lessonConfig && lessonConfig.title) {
    lessonContext.textContent = `📚 ${lessonConfig.title}`;
  } else {
    lessonContext.textContent = `🚀 Leet-style practice platform`;
  }

  // Right side controls (sound mute)
  const controlsRight = document.createElement('div');
  controlsRight.className = 'gamified-controls-right';

  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'gamified-sound-btn';

  const isMuted = getCookie('katas_sound_muted') === 'true';
  soundBtn.textContent = isMuted ? '🔇' : '🔊';
  soundBtn.title = isMuted ? 'Unmute retro chimes' : 'Mute retro chimes';

  soundBtn.addEventListener('click', () => {
    const mutedNow = getCookie('katas_sound_muted') === 'true';
    setCookie('katas_sound_muted', mutedNow ? 'false' : 'true');
    soundBtn.textContent = mutedNow ? '🔊' : '🔇';
    soundBtn.title = mutedNow ? 'Mute retro chimes' : 'Unmute retro chimes';
    // Play a test chime if unmuting
    if (mutedNow) {
      setTimeout(playSuccessSound, 50);
    }
  });

  controlsRight.appendChild(soundBtn);
  root.append(statsLeft, lessonContext, controlsRight);

  return root;
}
