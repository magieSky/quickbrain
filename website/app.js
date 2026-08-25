// QuickBrain website - small interactions
(function () {
  'use strict';

  // Reveal on scroll using IntersectionObserver, with no-JS / headless fallback.
  function initReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    els.forEach(function (el, i) { el.style.setProperty('--reveal-delay', (i % 6) * 80 + 'ms'); });
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
    // Fallback: after 1.5s reveal everything still hidden (covers headless / print)
    setTimeout(function () {
      els.forEach(function (el) {
        if (!el.classList.contains('is-visible')) el.classList.add('is-visible');
      });
    }, 1500);
  }

  // Smooth scroll for in-page anchors (browser scroll-behavior handles most,
  // but offset sticky header on click)
  function initAnchors() {
    var headerHeight = 64;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  }


  // ---- How-it-works animated demo (60秒看懂) ----
  function initDemo() {
    var steps = document.querySelectorAll('.demo-step');
    if (!steps.length) return;

    var typedTargets = Array.prototype.slice.call(
      document.querySelectorAll('.demo-search-text[data-typed]')
    );
    var statusDot = document.getElementById('demo-status-dot');
    var statusText = document.getElementById('demo-status-text');
    var serverText = document.getElementById('demo-server');
    var syncCount = document.getElementById('demo-sync-count');
    var lastSync = document.getElementById('demo-last-sync');

    var CYCLE_MS = 5000;
    var typeIdx = 0;
    var typeTimer = null;

    function typeLoop() {
      typedTargets.forEach(function (el) {
        var target = el.getAttribute('data-typed') || '';
        el.textContent = '';
        el.classList.add('is-typing');
      });
      typeIdx = 0;
      if (typeTimer) clearInterval(typeTimer);
      function tick() {
        var done = true;
        typedTargets.forEach(function (el) {
          var target = el.getAttribute('data-typed') || '';
          if (typeIdx <= target.length) {
            el.textContent = target.slice(0, typeIdx);
            done = false;
          }
        });
        typeIdx++;
        if (done) {
          clearInterval(typeTimer);
          typeTimer = null;
          typedTargets.forEach(function (el) { el.classList.remove('is-typing'); });
        }
      }
      typeTimer = setInterval(tick, 70);
    }

    function statusLoop() {
      if (!statusDot || !statusText) return;
      var online = false;
      setTimeout(function () { online = true; paintStatus(); }, CYCLE_MS * 0.35);
      setTimeout(function () { online = false; paintStatus(); }, CYCLE_MS * 0.92);
      paintStatus();
    }

    function paintStatus() {
      if (!statusText) return;
      if (online) {
        statusText.textContent = '已连接 note.bjhzsk.cn';
        statusText.classList.add('is-online');
        if (serverText) serverText.textContent = 'note.bjhzsk.cn';
        if (syncCount) syncCount.textContent = '同步 12 条';
        if (lastSync) lastSync.textContent = '刚刚 · 5 公开 / 7 私密';
      } else {
        statusText.textContent = '未连接';
        statusText.classList.remove('is-online');
        if (serverText) serverText.textContent = '— 待连接 —';
        if (syncCount) syncCount.textContent = '同步 0 条';
        if (lastSync) lastSync.textContent = '等待连接…';
      }
    }

    var demoStarted = false;
    function startDemo() {
      if (demoStarted) return;
      demoStarted = true;
      typeLoop();
      statusLoop();
      setInterval(typeLoop, CYCLE_MS);
    }

    if ('IntersectionObserver' in window) {
      var first = steps[0];
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { startDemo(); io.disconnect(); }
        });
      }, { threshold: 0.2 });
      io.observe(first);
    } else {
      startDemo();
    }
  }

  // Hero title typewriter
  function initTypewriter() {
    var h1 = document.querySelector('.title');
    if (!h1) return;
    // Wrap each character in spans; skip <br>
    var html = '';
    h1.childNodes.forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === 'BR') { html += '<br>'; return; }
      if (node.nodeType === 1 && node.classList && node.classList.contains('grad-text')) {
        html += '<span class="grad-text">';
        for (var i = 0; i < node.textContent.length; i++) {
          html += '<span class="ch">' + node.textContent.charAt(i) + '</span>';
        }
        html += '</span>';
        return;
      }
      var text = node.textContent || '';
      for (var i = 0; i < text.length; i++) {
        html += '<span class="ch">' + text.charAt(i) + '</span>';
      }
    });
    html += '<span class="cursor" id="hero-cursor"></span>';
    h1.innerHTML = html;
    var chars = h1.querySelectorAll('.ch');
    var idx = 0;
    var cursor = h1.querySelector('#hero-cursor');
    function nextChar() {
      if (idx >= chars.length) { if (cursor) cursor.classList.add('out'); return; }
      chars[idx].classList.add('in');
      if (cursor && idx < chars.length) {
        var last = chars[idx];
        var rect = last.getBoundingClientRect();
        var hRect = h1.getBoundingClientRect();
        cursor.style.transform = 'translate(' + (rect.right - hRect.left - 1) + 'px, ' + (rect.top - hRect.top - 1) + 'px)';
      }
      idx++;
      setTimeout(nextChar, 90);
    }
    setTimeout(nextChar, 400);
  }

  // Feature card 3D tilt + reveal-on-hover highlight
  function initTilt() {
    document.querySelectorAll('.feature-card').forEach(function (card) {
      card.classList.add('tilt');
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var dx = (e.clientX - rect.left) / rect.width - 0.5;
        var dy = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (dx * 8) + 'deg) rotateX(' + (-dy * 8) + 'deg) translateY(-3px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  // Scroll progress bar (0% at top, 100% at bottom)
  function initScrollProgress() {
    var bar = document.getElementById('scroll-progress');
    if (!bar) return;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      bar.style.width = pct + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initReveal();
      initAnchors();
      initDemo();
      initTypewriter();
      initTilt();
      initScrollProgress();
    });
  } else {
    initReveal();
    initAnchors();
    initDemo();
    initTypewriter();
    initTilt();
    initScrollProgress();
  }
})();
