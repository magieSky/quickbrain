// QuickBrain website - small interactions
(function () {
  'use strict';

  // Reveal on scroll using IntersectionObserver, with no-JS / headless fallback.
  function initReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initReveal();
      initAnchors();
      initDemo();
    });
  } else {
    initReveal();
    initAnchors();
    initDemo();
  }
})();
