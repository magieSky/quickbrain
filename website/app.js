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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initReveal();
      initAnchors();
    });
  } else {
    initReveal();
    initAnchors();
  }
})();
