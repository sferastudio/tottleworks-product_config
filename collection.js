/* Tottle Works – Collection page behaviour (hover image, arrows, filter panel).
   Markup + styling live in Webflow (cl-* classes); this script only wires behaviour.
   Cards expose data-slug / data-order / data-shape / data-material / data-capacity /
   data-location / data-images (newline separated image URLs). */
(function () {
  'use strict';
  function q(r, s) { return r.querySelector(s); }
  function qa(r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); }

  function init() {
    var root = q(document, '[data-cl="root"]');
    if (!root || root.getAttribute('data-cl-ready')) return;
    root.setAttribute('data-cl-ready', '1');

    var cards = qa(root, '[data-cl="card"]');
    var overlay = q(root, '[data-cl="overlay"]');
    var panel = q(root, '[data-cl="panel"]');
    var groupsEl = q(root, '[data-cl="groups"]');
    var countEl = q(root, '[data-cl="count"]');
    var activeEl = q(root, '[data-cl="active"]');
    var emptyEl = q(root, '[data-cl="empty"]');
    var openBtn = q(root, '[data-cl="open"]');

    /* ---- order by CMS sort order (keeps working even if list sort isn't set) ---- */
    if (cards.length) {
      var holder = cards[0].parentNode && cards[0].parentNode.parentNode;
      var items = cards.map(function (c) { return c.parentNode; });
      if (holder && items.every(function (i) { return i.parentNode === holder; })) {
        items.sort(function (a, b) {
          var x = parseFloat(q(a, '[data-cl="card"]').getAttribute('data-order')) || 999;
          var y = parseFloat(q(b, '[data-cl="card"]').getAttribute('data-order')) || 999;
          return x - y;
        });
        items.forEach(function (i) { holder.appendChild(i); });
      }
    }

    /* ---- card links, slides, arrows ---- */
    cards.forEach(function (card) {
      var slug = card.getAttribute('data-slug');
      if (slug) card.setAttribute('href', '/products/' + slug);
      var media = q(card, '[data-cl="media"]');
      var first = q(card, '.cl-img');
      if (!media || !first) return;
      var urls = (card.getAttribute('data-images') || '').split(/\s*\n\s*|\s+(?=https?:)/)
        .map(function (s) { return s.trim(); }).filter(Boolean);
      var slides = [first];
      urls.forEach(function (u) {
        var im = document.createElement('img');
        im.className = 'cl-img';
        im.alt = first.alt || '';
        im.loading = 'lazy';
        im.setAttribute('data-src', u);
        media.appendChild(im);
        slides.push(im);
      });
      if (slides.length < 2) return;
      var idx = 0;
      function load(i) {
        var s = slides[i];
        if (s && !s.getAttribute('src') && s.getAttribute('data-src')) s.src = s.getAttribute('data-src');
      }
      function show(i) {
        idx = (i + slides.length) % slides.length;
        load(idx); load((idx + 1) % slides.length);
        slides.forEach(function (s, k) { s.classList.toggle('is-active', k === idx); });
      }
      function mkArrow(dir) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cl-arrow ' + (dir < 0 ? 'is-prev' : 'is-next');
        b.setAttribute('aria-label', dir < 0 ? 'Previous image' : 'Next image');
        b.textContent = dir < 0 ? '‹' : '›';
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          show(idx + dir);
        });
        media.appendChild(b);
        return b;
      }
      var prev = mkArrow(-1), next = mkArrow(1);
      var canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
      card.addEventListener('mouseenter', function () {
        prev.classList.add('is-show'); next.classList.add('is-show');
        if (canHover && idx === 0) show(1);
      });
      card.addEventListener('mouseleave', function () {
        prev.classList.remove('is-show'); next.classList.remove('is-show');
        if (canHover) show(0);
      });
    });

    /* ---- filters ---- */
    var DEFS = [
      { key: 'shape', attr: 'data-shape', title: 'Shape' },
      { key: 'capacity', attr: 'data-capacity', title: 'Capacity' },
      { key: 'material', attr: 'data-material', title: 'Material' },
      { key: 'location', attr: 'data-location', title: 'Manufacturing location', multi: true }
    ];
    function norm(v) { return (v || '').replace(/\s+/g, ' ').trim().replace(/\bml\b/i, 'mL'); }
    function vals(card, def) {
      var raw = card.getAttribute(def.attr) || '';
      var list = def.multi ? raw.split(/[;,|\n]/) : [raw];
      return list.map(norm).filter(Boolean);
    }
    var state = {};
    DEFS.forEach(function (d) { state[d.key] = {}; });

    function render() {
      groupsEl.innerHTML = '';
      DEFS.forEach(function (def) {
        var seen = [];
        cards.forEach(function (c) {
          vals(c, def).forEach(function (v) { if (seen.indexOf(v) < 0) seen.push(v); });
        });
        if (!seen.length) return;
        seen.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
        var g = document.createElement('div'); g.className = 'cl-group';
        var t = document.createElement('div'); t.className = 'cl-group-title'; t.textContent = def.title;
        g.appendChild(t);
        seen.forEach(function (v) {
          var chip = document.createElement('a');
          chip.href = '#'; chip.className = 'cl-chip' + (state[def.key][v] ? ' is-on' : '');
          chip.textContent = v;
          chip.addEventListener('click', function (e) {
            e.preventDefault();
            if (state[def.key][v]) delete state[def.key][v]; else state[def.key][v] = true;
            chip.classList.toggle('is-on', !!state[def.key][v]);
            apply();
          });
          g.appendChild(chip);
        });
        groupsEl.appendChild(g);
      });
    }

    function apply() {
      var shown = 0, active = 0;
      DEFS.forEach(function (d) { active += Object.keys(state[d.key]).length; });
      cards.forEach(function (c) {
        var ok = DEFS.every(function (d) {
          var sel = Object.keys(state[d.key]);
          if (!sel.length) return true;
          return vals(c, d).some(function (v) { return state[d.key][v]; });
        });
        c.parentNode.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      if (countEl) countEl.textContent = (active ? shown + ' of ' + cards.length : cards.length) + ' tottles';
      if (activeEl) activeEl.textContent = active ? '(' + active + ')' : '';
      if (emptyEl) emptyEl.style.display = shown ? 'none' : 'block';
    }

    function setOpen(on) {
      overlay.classList.toggle('is-open', on);
      panel.classList.toggle('is-open', on);
      document.body.style.overflow = on ? 'hidden' : '';
    }
    openBtn.addEventListener('click', function (e) { e.preventDefault(); setOpen(true); });
    overlay.addEventListener('click', function () { setOpen(false); });
    q(root, '[data-cl="close"]').addEventListener('click', function (e) { e.preventDefault(); setOpen(false); });
    q(root, '[data-cl="apply"]').addEventListener('click', function (e) { e.preventDefault(); setOpen(false); });
    q(root, '[data-cl="clear"]').addEventListener('click', function (e) {
      e.preventDefault();
      DEFS.forEach(function (d) { state[d.key] = {}; });
      render(); apply();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

    render(); apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
