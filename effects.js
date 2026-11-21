/* Progressive motion. Learning state and scoring remain owned by app.js. */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const palette = ['#a890e5', '#d6c4f7', '#f1d18c', '#bfd6e9', '#e7b9c7', '#c5b2e3'];
  let previousScene = '';
  let previousFeedback = false;
  let sceneVersion = 0;
  let refreshFrame = 0;
  let pointerFrame = 0;
  let pointerTarget = null;
  let revealObserver = null;
  let particles = null;
  let previousProgress = 0;
  let wordTimer = null;

  function rotateWords() {
    clearInterval(wordTimer);
    wordTimer = null;
    const card = document.querySelector('.orbit-word-primary');
    if (!card || motion.matches || document.hidden) return;
    const data = window.LingoData;
    let index = Math.max(0, data.order.indexOf(card.dataset.lang));
    wordTimer = setInterval(() => {
      if (!card.isConnected) { clearInterval(wordTimer); wordTimer = null; return; }
      if (card.matches(':hover') || document.activeElement === card || document.hidden) return;
      index = (index + 1) % data.order.length;
      const lang = data.order[index];
      const greeting = card.querySelector('[data-orbit-greeting]');
      const language = card.querySelector('[data-word-language]');
      greeting.textContent = data.languages[lang].greeting;
      greeting.lang = lang;
      greeting.classList.remove('word-changing');
      void greeting.offsetWidth;
      greeting.classList.add('word-changing');
      language.textContent = data.ui[document.documentElement.lang].languageNames[lang];
      const flag = document.querySelector(`.catalog-card[data-lang="${lang}"] .flag-svg`);
      const oldFlag = card.querySelector('.flag-svg');
      if (flag && oldFlag) oldFlag.replaceWith(flag.cloneNode(true));
      card.dataset.lang = lang;
    }, 4800);
  }

  function clearParticles() {
    particles?.remove();
    particles = null;
    document.querySelectorAll('.fx-tap').forEach(node => node.remove());
  }

  function animateNumbers() {
    document.querySelectorAll('.stats-row b, .progress-stats b, .result-stats b').forEach(node => {
      const original = node.textContent;
      const match = original.match(/^(\+?)(\d+)(.*)$/);
      if (!match || Number(match[2]) === 0) return;
      const amount = Number(match[2]);
      const start = performance.now();
      node.setAttribute('aria-label', original);
      function tick(now) {
        if (!node.isConnected) return;
        if (motion.matches || document.hidden) { node.textContent = original; return; }
        const fraction = Math.min(1, (now - start) / 650);
        const eased = 1 - Math.pow(1 - fraction, 3);
        node.textContent = match[1] + Math.round(amount * eased) + match[3];
        if (fraction < 1) requestAnimationFrame(tick);
        else node.textContent = original;
      }
      requestAnimationFrame(tick);
    });
  }

  function animateProgress() {
    const bar = document.querySelector('.exercise-progress > i');
    if (!bar) { previousProgress = 0; return; }
    const percentage = Number.parseFloat(bar.style.width) || 0;
    if (percentage > previousProgress && percentage - previousProgress <= 15 && bar.animate) {
      bar.animate([{width: previousProgress + '%'}, {width: percentage + '%'}], {
        duration: 400,
        easing: 'cubic-bezier(.22, 1, .36, 1)'
      });
    }
    previousProgress = percentage;
  }

  function layer() {
    if (!particles?.isConnected) {
      particles = document.createElement('div');
      particles.className = 'fx-layer';
      particles.setAttribute('aria-hidden', 'true');
      document.body.append(particles);
    }
    return particles;
  }

  function sparkle(element) {
    if (motion.matches || document.hidden || !element) return;
    const bounds = element.getBoundingClientRect();
    const x = Math.min(innerWidth - 28, bounds.right - 22);
    const y = Math.max(30, bounds.top + bounds.height / 2);
    const parent = layer();
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const distance = 28 + Math.random() * 44;
      const piece = document.createElement('i');
      piece.className = 'fx-spark';
      piece.style.cssText = `--spark-left:${x}px;--spark-top:${y}px;--spark-x:${Math.cos(angle) * distance}px;--spark-y:${Math.sin(angle) * distance}px;--spark-size:${5 + Math.random() * 7}px;--spark-color:${palette[i % palette.length]};`;
      parent.append(piece);
      piece.addEventListener('animationend', () => piece.remove(), {once: true});
    }
  }

  function celebrate() {
    if (motion.matches || document.hidden) return;
    const parent = layer();
    const count = innerWidth < 600 ? 36 : 64;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.className = 'fx-confetti';
      piece.style.cssText = `--confetti-left:${Math.random() * 100}%;--confetti-size:${6 + Math.random() * 7}px;--confetti-color:${palette[i % palette.length]};--confetti-drift:${(Math.random() - .5) * 180}px;--confetti-spin:${(Math.random() - .5) * 850}deg;--confetti-delay:${Math.random() * .4}s;--confetti-duration:${1.7 + Math.random() * .9}s;`;
      parent.append(piece);
      piece.addEventListener('animationend', () => piece.remove(), {once: true});
    }
  }

  function identifyScene() {
    const exercise = document.querySelector('.exercise-main');
    if (exercise) return 'question:' + document.querySelector('.exercise-header > span')?.textContent;
    const result = document.querySelector('.lesson-result');
    if (result) return 'result:' + result.dataset.passed;
    const flow = document.querySelector('.flow-content');
    if (flow) return 'flow:' + flow.querySelector('h1')?.textContent;
    const study = document.querySelector('.study-page');
    if (study) return 'study:' + document.querySelector('.exercise-header > span')?.textContent;
    const title = document.querySelector('.page-heading h1')?.textContent || document.querySelector('.hero-copy h1')?.textContent || '';
    return document.documentElement.lang + ':' + title;
  }

  function refresh() {
    refreshFrame = 0;
    document.body.dataset.effects = 'ready';
    rotateWords();
    revealObserver?.disconnect();
    if (motion.matches) {
      document.querySelectorAll('.reveal-target').forEach(node => node.classList.add('is-visible'));
      clearParticles();
      return;
    }
    const scene = identifyScene();
    if (scene !== previousScene) {
      previousScene = scene;
      sceneVersion++;
      clearParticles();
      const content = document.querySelector('.welcome-page, .dashboard-page, .flow-content, .exercise-main, .lesson-result, .study-page, .main-content');
      content?.classList.add('scene-enter');
      animateNumbers();
      const cards = document.querySelectorAll('.language-section .language-card, .steps-strip .step-item, .unit-list > .unit-card, .practice-grid > .practice-card, .achievement-grid > .achievement');
      if ('IntersectionObserver' in window) {
        revealObserver = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              revealObserver.unobserve(entry.target);
            }
          }
        }, {threshold: .05, rootMargin: '0px 0px 20px 0px'});
        cards.forEach((card, index) => {
          card.classList.add('reveal-target');
          card.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 45}ms`);
          revealObserver.observe(card);
        });
      }
      if (document.querySelector('.lesson-result[data-passed="true"]')) {
        const version = sceneVersion;
        setTimeout(() => { if (version === sceneVersion) celebrate(); }, 180);
      }
    }
    const feedback = document.querySelector('.answer-feedback.success');
    if (feedback && !previousFeedback) sparkle(document.querySelector('.correct-option') || feedback);
    previousFeedback = !!feedback;
    animateProgress();
    document.body.dataset.effects = 'ready';
  }

  function resetPointer(target) {
    if (!target?.isConnected) return;
    target.classList.remove('is-tilting');
    target.style.removeProperty('--tilt-x');
    target.style.removeProperty('--tilt-y');
    target.style.removeProperty('--pointer-x');
    target.style.removeProperty('--pointer-y');
    target.style.removeProperty('--scene-x');
    target.style.removeProperty('--scene-y');
  }

  // One delegated pointer listener avoids attaching handlers to every rendered card.
  document.addEventListener('pointermove', event => {
    if (motion.matches || !finePointer.matches) return;
    const target = event.target.closest?.('.language-card, .practice-card, .welcome-hero');
    if (target !== pointerTarget) {
      resetPointer(pointerTarget);
      pointerTarget = target;
    }
    if (!target || pointerFrame) return;
    const {clientX, clientY} = event;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!target.isConnected || target !== pointerTarget) return;
      const bounds = target.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      target.style.setProperty('--pointer-x', `${x}px`);
      target.style.setProperty('--pointer-y', `${y}px`);
      if (target.classList.contains('welcome-hero')) {
        target.style.setProperty('--scene-x', `${(x / bounds.width - .5) * 10}px`);
        target.style.setProperty('--scene-y', `${(y / bounds.height - .5) * 8}px`);
      }
      if (!target.classList.contains('welcome-hero')) {
        target.classList.add('is-tilting');
        target.style.setProperty('--tilt-x', `${(y / bounds.height - .5) * -5}deg`);
        target.style.setProperty('--tilt-y', `${(x / bounds.width - .5) * 5}deg`);
      }
    });
  }, {passive: true});
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) {
      resetPointer(pointerTarget);
      pointerTarget = null;
    }
  }, {passive: true});

  document.addEventListener('click', event => {
    if (motion.matches) return;
    const button = event.target.closest?.('.btn, .language-card, .answer-option, .practice-card, .nav-item');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const bounds = button.getBoundingClientRect();
    const size = Math.max(bounds.width, bounds.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'fx-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const keyboard = event.detail === 0;
    const x = keyboard ? bounds.width / 2 : event.clientX - bounds.left;
    const y = keyboard ? bounds.height / 2 : event.clientY - bounds.top;
    ripple.style.cssText = `--ripple-size:${size}px;--ripple-left:${x - size / 2}px;--ripple-top:${y - size / 2}px;`;
    // Keep the ripple visible when app.js replaces an answer button immediately.
    const surface = document.createElement('span');
    surface.className = 'fx-tap' + (button.classList.contains('primary') ? ' primary' : '');
    surface.setAttribute('aria-hidden', 'true');
    surface.style.cssText = `left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px;border-radius:${getComputedStyle(button).borderRadius};`;
    surface.append(ripple);
    document.body.append(surface);
    ripple.addEventListener('animationend', () => surface.remove(), {once: true});
  }, {capture: true});

  const observer = new MutationObserver(() => {
    if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
  });
  observer.observe(app, {childList: true});
  motion.addEventListener('change', () => {
    resetPointer(pointerTarget);
    if (motion.matches) document.getAnimations().forEach(animation => animation.cancel());
    previousScene = '';
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearParticles(); clearInterval(wordTimer); wordTimer = null; }
    else rotateWords();
  });
  refresh();
})();
