/*!
 * Tottle Works 3D configurator — Sfera Studio
 * Mounts into [data-configurator="mount"] on the product template.
 * Reads each tottle's data from data attributes bound to the CMS:
 *   data-name, data-shape, data-height, data-length, data-capacity,
 *   data-model (GLB url), data-label-h, data-label-w (mm),
 *   data-drawing, data-dieline (file urls), data-overcaps, data-colours, data-finishes
 * Leads and shares are sent through the native Webflow form [data-twc-lead],
 * so they flow into the existing Webflow → Zapier → CRM setup.
 * Requires THREE (r147) + OrbitControls + GLTFLoader, loaded by the page loader.
 */
(function () {
  'use strict';
  var THREE = window.THREE;
  var mount = document.querySelector('[data-configurator="mount"]');
  if (!THREE || !mount || mount.__twc) return;
  mount.__twc = true;

  /* ---------------------------------------------------------------- options */
  var CAPS = {
    'flip-top': { name: 'Flip-top', hFrac: 0.2, rFrac: 0.92, ring: 0.45 },
    'disc-top': { name: 'Disc-top', hFrac: 0.15, rFrac: 0.95, ring: 0.18 },
    'tall-overcap': { name: 'Tall overcap', hFrac: 0.34, rFrac: 1.0, ring: null }
  };
  var COLOURS = [
    { name: 'Pure white', hex: '#F3F2EE' },
    { name: 'Bone', hex: '#E6E0D4' },
    { name: 'Sand', hex: '#D3C3A8' },
    { name: 'Stone', hex: '#A9A59D' },
    { name: 'Graphite', hex: '#55555A' },
    { name: 'Charcoal', hex: '#232325' }
  ];
  var CAP_COLOURS = COLOURS.concat([{ name: 'Brushed silver', hex: '#B9BDC2', metal: true }]);
  var FINISHES = {
    gloss: { name: 'Gloss', roughness: 0.2, clearcoat: 1, ccr: 0.06 },
    matte: { name: 'Matte', roughness: 0.68, clearcoat: 0, ccr: 0.5 },
    'soft-touch': { name: 'Soft-touch', roughness: 0.9, clearcoat: 0, ccr: 0.8 }
  };
  var INK_COLOURS = [{ name: 'Black', hex: '#1D1D1F' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Gold foil', hex: '#B8913A' }];

  /* ---------------------------------------------------------------- helpers */
  var d = mount.dataset;
  var num = function (v, fb) { var n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n > 0 ? n : fb; };
  var slug = function (s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var list = function (s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var validEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()); };
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem('twc:' + k)); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem('twc:' + k, JSON.stringify(v)); } catch (e) {} } };

  var T = {
    name: (d.name || 'Tottle').trim(),
    shape: slug(d.shape) || 'oval',
    H: num(d.height, 100), L: num(d.length, 40),
    capacity: (d.capacity || '').trim(),
    model: (d.model || '').trim(),
    labelH: num(d.labelH, 0), labelW: num(d.labelW, 0),
    drawing: (d.drawing || '').trim(), dieline: (d.dieline || '').trim()
  };

  // Overcaps / colours / finishes can be narrowed per tottle from the CMS lists
  var capKeys = Object.keys(CAPS);
  var cmsCaps = list(d.overcaps).map(slug).filter(function (k) { return CAPS[k]; });
  if (cmsCaps.length) capKeys = cmsCaps;
  var finishKeys = Object.keys(FINISHES);
  var cmsFin = list(d.finishes).map(slug).filter(function (k) { return FINISHES[k]; });
  if (cmsFin.length) finishKeys = cmsFin;
  var bodyColours = COLOURS;
  var cmsCol = list(d.colours).map(function (n) { return COLOURS.filter(function (c) { return slug(c.name) === slug(n); })[0]; }).filter(Boolean);
  if (cmsCol.length) bodyColours = cmsCol;

  var state = {
    cap: capKeys[0], finish: finishKeys[0],
    body: bodyColours[0].hex, bodyName: bodyColours[0].name,
    capc: '#232325', capcName: 'Charcoal', capMetal: false,
    text: '', ink: '#1D1D1F',
    art: { x: 0.5, y: 0.42, s: 0.5 }, txt: { x: 0.5, y: 0.8, s: 0.16 }
  };
  // Restore a shared design (#design=...)
  try {
    var m = location.hash.match(/design=([^&]+)/);
    if (m) {
      var saved = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      ['cap', 'finish', 'body', 'bodyName', 'capc', 'capcName', 'capMetal', 'text', 'ink', 'art', 'txt'].forEach(function (k) { if (saved[k] !== undefined) state[k] = saved[k]; });
      if (!CAPS[state.cap]) state.cap = capKeys[0];
      if (!FINISHES[state.finish]) state.finish = finishKeys[0];
    }
  } catch (e) {}
  var artImg = null, selected = 'art';

  /* ---------------------------------------------------------------- styles */
  var css = '' +
    '.twc{--ink:#222;--ink2:#4a4a48;--muted:#8c8c8c;--line:rgba(34,34,34,.18);--panel:#f2f2f2;--bg:#fbfbfb;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,1fr);gap:3rem;align-items:start;color:var(--ink);font-family:"IBM Plex Serif",Georgia,serif;width:100%}' +
    '.twc *{box-sizing:border-box}' +
    '.twc-stage{position:relative;background:var(--panel);aspect-ratio:4/5;max-height:82vh;width:100%;overflow:hidden}' +
    '.twc-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none}' +
    '.twc-stage canvas:active{cursor:grabbing}' +
    '.twc-hint{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);pointer-events:none;transition:opacity .5s}' +
    '.twc-reset{position:absolute;top:14px;right:14px;font:inherit;font-size:11px;letter-spacing:.14em;text-transform:uppercase;background:transparent;border:0;color:var(--ink2);cursor:pointer;padding:6px}' +
    '.twc-loading{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}' +
    '.twc-panel{display:flex;flex-direction:column}' +
    '.twc-group{padding:12px 0;border-top:1px solid var(--line)}' +
    '.twc-group:last-of-type{border-bottom:1px solid var(--line)}' +
    '.twc-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}' +
    '.twc-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}' +
    '.twc-value{font-family:"IBM Plex Sans",sans-serif;font-size:14px;color:var(--ink)}' +
    '.twc-pills{display:flex;flex-wrap:wrap;gap:6px 18px}' +
    '.twc-pill{font:inherit;font-family:"IBM Plex Sans",sans-serif;font-size:14px;background:none;border:0;padding:2px 0;color:var(--ink2);cursor:pointer;border-bottom:1px solid transparent;transition:color .2s,border-color .2s}' +
    '.twc-pill:hover{color:var(--ink)}' +
    '.twc-pill[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--ink)}' +
    '.twc-swatches{display:flex;flex-wrap:wrap;gap:12px;align-items:center}' +
    '.twc-sw{width:26px;height:26px;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}' +
    '.twc-sw::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:1px solid transparent;transition:border-color .2s}' +
    '.twc-sw[aria-pressed="true"]::after{border-color:var(--ink)}' +
    '.twc-custom{position:relative;width:26px;height:26px;border-radius:50%;overflow:hidden;background:conic-gradient(#efefef,#d3c3a8,#55555a,#efefef);box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}' +
    '.twc-custom input{position:absolute;inset:-8px;width:44px;height:44px;opacity:0;cursor:pointer}' +
    '.twc-pad{display:block;width:100%;max-height:160px;object-fit:contain;background:var(--panel);border:1px solid var(--line);touch-action:none;cursor:move}' +
    '.twc-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:8px}' +
    '.twc-link{font:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;background:none;border:0;padding:0;color:var(--ink);cursor:pointer;text-decoration:underline;text-decoration-color:rgba(34,34,34,.3);text-underline-offset:5px}' +
    '.twc-link:hover{text-decoration-color:var(--ink)}' +
    '.twc-link[disabled]{opacity:.35;cursor:default}' +
    '.twc-range{flex:1;min-width:120px;accent-color:#222}' +
    '.twc-input{width:100%;font:inherit;font-size:15px;padding:11px 12px;border:1px solid rgba(34,34,34,.22);background:rgba(255,255,255,.63);color:var(--ink);border-radius:0}' +
    '.twc-input:focus{outline:none;border-color:var(--ink)}' +
    '.twc-actions{display:flex;flex-direction:column;gap:10px;margin-top:16px}' +
    '.twc-btn{font:inherit;font-size:13px;letter-spacing:.04em;text-transform:uppercase;padding:13px;background:#222;color:#fbfbfb;border:1px solid #222;cursor:pointer;width:100%;transition:background .2s,color .2s}' +
    '.twc-btn:hover{background:#fbfbfb;color:#222}' +
    '.twc-btn.is-ghost{background:transparent;color:#222}' +
    '.twc-btn.is-ghost:hover{background:#222;color:#fbfbfb}' +
    '.twc-spec{font-size:13px;color:var(--ink2);margin:0 0 2px}' +
    '.twc-note{font-size:12px;color:var(--muted);margin:0}' +
    '.twc-modal{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(20,20,20,.45)}' +
    '.twc-modal.is-open{display:flex}' +
    '.twc-sheet{background:#fbfbfb;width:100%;max-width:520px;max-height:100%;overflow:auto;padding:32px;font-family:"IBM Plex Serif",Georgia,serif;color:#222}' +
    '.twc-sheet h3{font-family:"IBM Plex Sans",sans-serif;font-weight:500;font-size:26px;line-height:1.1;margin:0 0 8px}' +
    '.twc-sheet p{margin:0;font-size:14px;color:#4a4a48;line-height:1.55}' +
    '.twc-sheet img{display:block;width:100%;margin:20px 0 4px;background:#f2f2f2}' +
    '.twc-stack{display:flex;flex-direction:column;gap:14px;margin-top:20px}' +
    '.twc-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.twc-field label{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8c8c8c;margin-bottom:6px}' +
    '.twc-check{display:flex;gap:10px;font-size:13px;color:#4a4a48;align-items:flex-start}' +
    '.twc-check input{margin-top:3px;accent-color:#222}' +
    '.twc-msg{font-size:13px;color:#4a4a48;min-height:1.3em;margin:0}' +
    '.twc-msg.is-err{color:#9b2c2c}' +
    '.twc-files{display:flex;flex-direction:column;gap:10px;margin-top:4px}' +
    '.twc-files a{color:#222;font-size:14px;text-underline-offset:5px}' +
    '.twc-end{display:flex;justify-content:flex-end;gap:20px;align-items:center;margin-top:6px}' +
    '.twc-linkbox{font-size:12px;word-break:break-all;padding:10px 12px;background:#f2f2f2;color:#4a4a48}' +
    '@media (min-width:992px){.twc-stage{position:sticky;top:0;align-self:start}.twc-panel{max-height:100vh;overflow-y:auto;overflow-x:hidden;padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(34,34,34,.15) transparent}}' +
    '@media (max-width:991px){.twc{grid-template-columns:1fr;gap:0}.twc-stage{position:sticky;top:64px;z-index:2;aspect-ratio:1/1;max-height:56vh}.twc-panel{padding-top:8px}}' +
    '@media (max-width:479px){.twc-two{grid-template-columns:1fr}.twc-sheet{padding:24px}}';
  var styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  /* ---------------------------------------------------------------- markup */
  var hasFiles = !!(T.drawing || T.dieline);
  mount.innerHTML =
    '<div class="twc">' +
      '<div class="twc-stage"><canvas aria-label="3D preview of your ' + esc(T.name) + ' tottle. Drag to rotate, scroll or pinch to zoom." tabindex="0"></canvas>' +
        '<div class="twc-loading">Preparing your tottle</div>' +
        '<button class="twc-reset" type="button">Reset view</button>' +
        '<div class="twc-hint">Drag to rotate · Scroll to zoom</div></div>' +
      '<div class="twc-panel">' +
        group('Overcap', 'cap', '<div class="twc-pills" data-g="cap"></div>') +
        group('Tottle colour', 'body', '<div class="twc-swatches" data-g="body"></div>') +
        group('Overcap colour', 'capc', '<div class="twc-swatches" data-g="capc"></div>') +
        group('Finish', 'finish', '<div class="twc-pills" data-g="finish"></div>') +
        '<div class="twc-group"><div class="twc-head"><span class="twc-label">Your artwork</span><span class="twc-value">Drag to position</span></div>' +
          '<canvas class="twc-pad" aria-label="Print area. Drag your artwork or text to position it."></canvas>' +
          '<div class="twc-row"><button class="twc-link" type="button" data-a="upload">Upload artwork</button>' +
            '<button class="twc-link" type="button" data-a="remove" disabled>Remove</button>' +
            '<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden></div>' +
          '<div class="twc-row"><span class="twc-label">Size</span><input class="twc-range" type="range" min="0.12" max="1.1" step="0.01" aria-label="Artwork size"></div>' +
          '<div class="twc-row"><input class="twc-input" type="text" maxlength="30" placeholder="Add a line of text (optional)" aria-label="Text line">' +
            '<div class="twc-swatches" data-g="ink"></div></div>' +
          '</div>' +
        '<div class="twc-actions">' +
          '<p class="twc-spec" data-spec></p>' +
          '<button class="twc-btn" type="button" data-a="download">Download renderings' + (hasFiles ? ' &amp; technical files' : '') + '</button>' +
          '<button class="twc-btn is-ghost" type="button" data-a="share">Send to a colleague</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    modal('gate',
      '<h3>Your renderings</h3><p>Enter your details to download front, three-quarter and side renderings of your design' + (hasFiles ? ', plus the ' + esc(T.name) + ' technical drawing and dieline' : '') + '.</p>' +
      '<img alt="Preview of your renderings" data-preview>' +
      '<form class="twc-stack" data-form="gate" novalidate>' +
        '<div class="twc-two"><div class="twc-field"><label for="twc-gn">Name</label><input class="twc-input" id="twc-gn" name="name" autocomplete="name"></div>' +
        '<div class="twc-field"><label for="twc-gc">Company</label><input class="twc-input" id="twc-gc" name="company" autocomplete="organization"></div></div>' +
        '<div class="twc-field"><label for="twc-ge">Work email</label><input class="twc-input" id="twc-ge" name="email" type="email" autocomplete="email" required></div>' +
        '<label class="twc-check"><input type="checkbox" name="updates"> Send me occasional updates on new tottles and finishes.</label>' +
        '<p class="twc-msg" role="status"></p>' +
        '<div class="twc-files" data-files hidden></div>' +
        '<div class="twc-end"><button class="twc-link" type="button" data-close>Cancel</button><button class="twc-btn" type="submit" style="width:auto;padding:14px 22px">Download</button></div>' +
      '</form>') +
    modal('share',
      '<h3>Send to a colleague</h3><p>They will receive a link that opens this exact design on the ' + esc(T.name) + ' page.</p>' +
      '<form class="twc-stack" data-form="share" novalidate>' +
        '<div class="twc-two"><div class="twc-field"><label for="twc-sn">Your name</label><input class="twc-input" id="twc-sn" name="name" autocomplete="name"></div>' +
        '<div class="twc-field"><label for="twc-se">Your email</label><input class="twc-input" id="twc-se" name="email" type="email" autocomplete="email"></div></div>' +
        '<div class="twc-field"><label for="twc-st">Colleague emails</label><input class="twc-input" id="twc-st" name="to" placeholder="alex@brand.com, sam@brand.com"></div>' +
        '<div class="twc-field"><label for="twc-sm">Note (optional)</label><textarea class="twc-input" id="twc-sm" name="note" rows="3"></textarea></div>' +
        '<div class="twc-field"><label>Design link</label><div class="twc-linkbox" data-link></div></div>' +
        '<p class="twc-msg" role="status"></p>' +
        '<div class="twc-end"><button class="twc-link" type="button" data-copy>Copy link</button><button class="twc-btn" type="submit" style="width:auto;padding:14px 22px">Send</button></div>' +
      '</form>');

  function group(label, key, inner) {
    return '<div class="twc-group"><div class="twc-head"><span class="twc-label">' + label + '</span><span class="twc-value" data-v="' + key + '"></span></div>' + inner + '</div>';
  }
  function modal(id, inner) {
    return '<div class="twc-modal" data-modal="' + id + '" role="dialog" aria-modal="true"><div class="twc-sheet">' + inner + '</div></div>';
  }
  var $ = function (s) { return mount.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(mount.querySelectorAll(s)); };

  /* ---------------------------------------------------------------- controls UI */
  function pills(key, keys, defs) {
    var el = $('[data-g="' + key + '"]');
    el.innerHTML = keys.map(function (k) { return '<button type="button" class="twc-pill" data-k="' + k + '" aria-pressed="' + (state[key] === k) + '">' + defs[k].name + '</button>'; }).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b) return;
      state[key] = b.getAttribute('data-k');
      $$('[data-g="' + key + '"] [data-k]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      onChange(key);
    });
  }
  function swatches(key, cols, onPick, custom) {
    var el = $('[data-g="' + key + '"]');
    var cur = function () { return key === 'body' ? state.body : key === 'capc' ? state.capc : state.ink; };
    el.innerHTML = cols.map(function (c, i) { return '<button type="button" class="twc-sw" data-i="' + i + '" title="' + c.name + '" aria-label="' + c.name + '" aria-pressed="' + (c.hex.toLowerCase() === cur().toLowerCase()) + '" style="background:' + c.hex + '"></button>'; }).join('') +
      (custom ? '<label class="twc-custom" title="Custom colour"><input type="color" aria-label="Custom colour" value="' + cur() + '"></label>' : '');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return;
      $$('[data-g="' + key + '"] [data-i]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      onPick(cols[+b.getAttribute('data-i')]);
    });
    if (custom) el.querySelector('input').addEventListener('input', function (e) {
      $$('[data-g="' + key + '"] [data-i]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      onPick({ name: 'Custom ' + e.target.value.toUpperCase(), hex: e.target.value });
    });
  }
  pills('cap', capKeys, CAPS);
  pills('finish', finishKeys, FINISHES);
  swatches('body', bodyColours, function (c) { state.body = c.hex; state.bodyName = c.name; onChange('colour'); }, true);
  swatches('capc', CAP_COLOURS, function (c) { state.capc = c.hex; state.capcName = c.name; state.capMetal = !!c.metal; onChange('colour'); }, true);
  swatches('ink', INK_COLOURS, function (c) { state.ink = c.hex; drawLabel(); }, false);

  /* ---------------------------------------------------------------- scene */
  var canvas = $('.twc-stage canvas');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    $('.twc-loading').textContent = '3D preview is not supported on this device';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  var controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minPolarAngle = 0.4; controls.maxPolarAngle = 1.62;

  (function studio() {
    var pm = new THREE.PMREMGenerator(renderer);
    var env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x8f8f8c, side: THREE.BackSide })));
    var panel = function (w, h, x, y, z, k) { var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(k), side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); };
    panel(6, 10, -7, 3, 4, 5.5); panel(5, 8, 7, 2, 3, 3); panel(10, 3, 0, 9, 0, 3.5); panel(4, 8, 0, 2, -8, 1.8);
    scene.environment = pm.fromScene(env, 0.04).texture;
  })();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8f8c, 0.3));
  var key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-4, 10, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 8; key.shadow.bias = -0.0005;
  scene.add(key);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  var lin = function (hex) { return new THREE.Color(hex).convertSRGBToLinear(); };
  var bodyMat = new THREE.MeshPhysicalMaterial({ color: lin(state.body) });
  var capMat = new THREE.MeshPhysicalMaterial({ color: lin(state.capc) });
  var ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
  var labelCanvas = document.createElement('canvas');
  var labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.encoding = THREE.sRGBEncoding; labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  var labelMat = new THREE.MeshPhysicalMaterial({ map: labelTex, transparent: true, opacity: 0, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, roughness: 0.45, clearcoat: 0 });

  // Real-world scale: 1 unit = 30mm
  var U = 1 / 30;
  var shapeDepth = { oval: 0.62, flat: 0.42, round: 1, dome: 1, square: 0.9 }[T.shape] || 0.62;
  var product = new THREE.Group(); scene.add(product);
  var parts = { body: null, cap: null, label: null, model: null };
  var labelSpec = { aspect: 2 };

  function bodyProfile(r, h, neck) {
    var dome = T.shape === 'dome' ? 0.35 : 0.16;
    var c = new THREE.SplineCurve([
      new THREE.Vector2(neck, 0.02 * h), new THREE.Vector2(neck + (r - neck) * 0.45, 0.06 * h), new THREE.Vector2(r * 0.94, 0.16 * h),
      new THREE.Vector2(r, 0.26 * h), new THREE.Vector2(r, h * (1 - dome)), new THREE.Vector2(r * 0.9, h * (1 - dome * 0.35)),
      new THREE.Vector2(r * 0.55, h * 0.995), new THREE.Vector2(0.001, h)
    ]);
    return [new THREE.Vector2(0.001, 0), new THREE.Vector2(neck, 0)].concat(c.getPoints(100));
  }
  function capProfile(rB, rT, h) {
    return [[0.001, 0], [rB - 0.04, 0], [rB - 0.01, 0.012], [rB, 0.045], [rT, h - 0.05], [rT - 0.012, h - 0.012], [rT - 0.05, h], [0.001, h]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
  }
  function disposeGroup(g) { if (!g) return; product.remove(g); g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }

  function buildProcedural() {
    disposeGroup(parts.body); disposeGroup(parts.cap);
    var C = CAPS[state.cap];
    var H = T.H * U, r = (T.L / 2) * U;
    var capH = H * C.hFrac, bodyH = H - capH, capR = r * C.rFrac * (state.cap === 'tall-overcap' ? 1 : 0.94);
    var neck = Math.max(capR * 0.86, r * 0.5);

    var body = new THREE.Group();
    var bm = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile(r, bodyH, neck), 128), bodyMat);
    bm.castShadow = true; body.add(bm);
    // Label area: CMS size if provided, else the straight wall of the body
    var lh = T.labelH ? Math.min(T.labelH * U, bodyH * 0.8) : bodyH * 0.5;
    var ly0 = 0.26 * bodyH + Math.max(0, (bodyH * (state.cap ? 0.58 : 0.58) - lh) / 2);
    var phi = Math.PI * 0.9;
    var arc = T.labelW ? T.labelW * U : r * phi * (1 + (1 / shapeDepth - 1) * 0.15);
    labelSpec = { aspect: arc / lh };
    var lm = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(r * 1.004, ly0), new THREE.Vector2(r * 1.004, ly0 + lh)], 96, -phi / 2, phi), labelMat);
    body.add(lm);
    body.scale.set(1, 1, shapeDepth);
    body.position.y = capH - 0.02;
    product.add(body); parts.body = body;

    var cap = new THREE.Group();
    var rT = state.cap === 'disc-top' ? capR * 0.98 : capR * 0.97;
    var cm = new THREE.Mesh(new THREE.LatheGeometry(capProfile(capR, rT, capH), 96), capMat);
    cm.castShadow = true; cap.add(cm);
    if (C.ring !== null) {
      var ry = capH * C.ring;
      var ring = new THREE.Mesh(new THREE.TorusGeometry(capR - (capR - rT) * (ry / capH) + 0.002, 0.006, 8, 96), ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = ry; cap.add(ring);
    }
    cap.scale.set(1, 1, Math.max(shapeDepth, 0.55));
    product.add(cap); parts.cap = cap;
    frame(H);
  }

  // Optional: supplied 3D model. Naming convention for the 3D partner:
  // meshes containing "cap" get the overcap material, "label" gets the artwork, everything else the body material.
  function loadModel(url) {
    if (!THREE.GLTFLoader) return buildProcedural();
    new THREE.GLTFLoader().load(url, function (gltf) {
      var g = gltf.scene, hasLabel = false;
      g.traverse(function (o) {
        if (!o.isMesh) return;
        var n = (o.name || '').toLowerCase();
        o.castShadow = true;
        if (n.indexOf('label') > -1) { o.material = labelMat; hasLabel = true; }
        else if (n.indexOf('cap') > -1) o.material = capMat;
        else o.material = bodyMat;
      });
      var box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
      var s = (T.H * U) / (size.y || 1);
      g.scale.setScalar(s);
      box.setFromObject(g);
      g.position.y -= box.min.y; g.position.x -= (box.min.x + box.max.x) / 2; g.position.z -= (box.min.z + box.max.z) / 2;
      disposeGroup(parts.body); disposeGroup(parts.cap);
      product.add(g); parts.model = g;
      labelSpec = { aspect: T.labelW && T.labelH ? T.labelW / T.labelH : 2 };
      if (!hasLabel) $('.twc-group:nth-of-type(5) .twc-value').textContent = 'Label area not set on this model';
      sizeLabel(); drawLabel(); frame(T.H * U); ready();
    }, undefined, function () { buildProcedural(); sizeLabel(); drawLabel(); ready(); });
  }

  var HOME = new THREE.Vector3(), TARGET = new THREE.Vector3();
  function frame(H) {
    var dist = (H * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    TARGET.set(0, H * 0.5, 0);
    HOME.set(0, H * 0.62, dist);
    camera.position.copy(HOME); controls.target.copy(TARGET);
    controls.minDistance = dist * 0.55; controls.maxDistance = dist * 1.6;
    var b = H * 1.4;
    Object.assign(key.shadow.camera, { left: -b, right: b, top: b, bottom: -b, near: 0.5, far: 40 });
    key.shadow.camera.updateProjectionMatrix();
  }
  function applyMaterials(instant) {
    var F = FINISHES[state.finish];
    bodyMat.roughness = F.roughness; bodyMat.clearcoat = F.clearcoat; bodyMat.clearcoatRoughness = F.ccr;
    capMat.metalness = state.capMetal ? 1 : 0;
    capMat.roughness = state.capMetal ? 0.3 : Math.min(F.roughness + 0.08, 0.9);
    capMat.clearcoat = state.capMetal ? 0 : F.clearcoat * 0.6;
    labelMat.roughness = F.roughness;
    bodyMat.needsUpdate = capMat.needsUpdate = labelMat.needsUpdate = true;
    if (instant) { bodyMat.color.copy(lin(state.body)); capMat.color.copy(lin(state.capc)); }
  }

  /* ---------------------------------------------------------------- artwork */
  var pad = $('.twc-pad'), range = $('.twc-range'), textIn = $('.twc-panel .twc-input');
  function sizeLabel() {
    labelCanvas.width = 1600; labelCanvas.height = Math.max(200, Math.round(1600 / labelSpec.aspect));
    var maxH = 160;
    var w = pad.clientWidth || 360;
    var h = Math.round(w / labelSpec.aspect);
    if (h > maxH) { h = maxH; w = Math.round(h * labelSpec.aspect); }
    pad.width = w * 2; pad.height = h * 2;
    pad.style.width = w + 'px'; pad.style.height = h + 'px';
    labelTex.needsUpdate = true;
  }
  function box(kind, W, H, ctx) {
    if (kind === 'art') {
      if (!artImg) return null;
      var h = state.art.s * H, w = h * ((artImg.naturalWidth || 1) / (artImg.naturalHeight || 1));
      if (w > W * 1.2) { w = W * 1.2; h = w / ((artImg.naturalWidth || 1) / (artImg.naturalHeight || 1)); }
      return { x: state.art.x * W - w / 2, y: state.art.y * H - h / 2, w: w, h: h };
    }
    if (!state.text) return null;
    var fs = state.txt.s * H;
    ctx.font = '400 ' + fs + 'px "IBM Plex Serif", Georgia, serif';
    var tw = ctx.measureText(state.text).width;
    return { x: state.txt.x * W - tw / 2, y: state.txt.y * H - fs / 2, w: tw, h: fs };
  }
  function paint(ctx, W, H) {
    var a = box('art', W, H, ctx);
    if (a) ctx.drawImage(artImg, a.x, a.y, a.w, a.h);
    var t = box('text', W, H, ctx);
    if (t) { ctx.fillStyle = state.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(state.text, state.txt.x * W, state.txt.y * H); }
  }
  function drawLabel() {
    var lc = labelCanvas.getContext('2d');
    lc.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    paint(lc, labelCanvas.width, labelCanvas.height);
    var hasContent = !!(artImg || (state.text && state.text.trim()));
    if (labelMat.opacity !== (hasContent ? 1 : 0)) { labelMat.opacity = hasContent ? 1 : 0; labelMat.needsUpdate = true; }
    labelTex.needsUpdate = true;
    var p = pad.getContext('2d'), W = pad.width, H = pad.height;
    p.clearRect(0, 0, W, H);
    p.fillStyle = state.body; p.fillRect(0, 0, W, H);
    paint(p, W, H);
    p.setLineDash([8, 8]); p.lineWidth = 2; p.strokeStyle = 'rgba(120,120,116,.6)'; p.strokeRect(5, 5, W - 10, H - 10);
    var b = box(selected, W, H, p);
    if (b) { p.setLineDash([]); p.strokeStyle = '#222'; p.lineWidth = 2; p.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); }
    range.value = state[selected === 'art' ? 'art' : 'txt'].s;
    $('[data-a="remove"]').disabled = !artImg;
  }
  var drag = null;
  pad.addEventListener('pointerdown', function (e) {
    var r = pad.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * pad.width, py = (e.clientY - r.top) / r.height * pad.height;
    var ctx = pad.getContext('2d');
    var hit = ['text', 'art'].filter(function (k) { var b = box(k, pad.width, pad.height, ctx); return b && px >= b.x - 12 && px <= b.x + b.w + 12 && py >= b.y - 12 && py <= b.y + b.h + 12; })[0];
    if (!hit) return;
    selected = hit;
    var o = state[hit === 'art' ? 'art' : 'txt'];
    drag = { o: o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, w: r.width, h: r.height };
    pad.setPointerCapture(e.pointerId); drawLabel();
  });
  pad.addEventListener('pointermove', function (e) {
    if (!drag) return;
    drag.o.x = Math.min(1, Math.max(0, drag.ox + (e.clientX - drag.sx) / drag.w));
    drag.o.y = Math.min(1, Math.max(0, drag.oy + (e.clientY - drag.sy) / drag.h));
    drawLabel();
  });
  pad.addEventListener('pointerup', function () { drag = null; });
  range.addEventListener('input', function () { state[selected === 'art' ? 'art' : 'txt'].s = +range.value; drawLabel(); });
  var fileIn = $('input[type="file"]');
  $('[data-a="upload"]').addEventListener('click', function () { fileIn.click(); });
  fileIn.addEventListener('change', function () {
    var f = fileIn.files[0]; if (!f) return;
    if (f.size > 15 * 1024 * 1024) { alert('Please choose an image under 15 MB.'); return; }
    var rd = new FileReader();
    rd.onload = function () { var im = new Image(); im.onload = function () { artImg = im; selected = 'art'; drawLabel(); }; im.src = rd.result; };
    rd.readAsDataURL(f); fileIn.value = '';
  });
  $('[data-a="remove"]').addEventListener('click', function () { artImg = null; selected = 'text'; drawLabel(); });
  textIn.value = state.text;
  textIn.addEventListener('input', function () { state.text = textIn.value; selected = 'text'; drawLabel(); });

  /* ---------------------------------------------------------------- state → UI */
  var specLine = function () {
    return T.name + (T.capacity ? ' ' + T.capacity : '') + ' · ' + CAPS[state.cap].name + ' · ' + state.bodyName + ' with ' + state.capcName.toLowerCase() + ' overcap · ' + FINISHES[state.finish].name;
  };
  function updateLabels() {
    $('[data-v="cap"]').textContent = CAPS[state.cap].name;
    $('[data-v="finish"]').textContent = FINISHES[state.finish].name;
    $('[data-v="body"]').textContent = state.bodyName;
    $('[data-v="capc"]').textContent = state.capcName;
    $('[data-spec]').textContent = specLine();
  }
  var pop = 0;
  function onChange(what) {
    if (what === 'cap' && !parts.model) { buildProcedural(); sizeLabel(); drawLabel(); pop = 1; }
    if (what === 'finish' || what === 'colour') applyMaterials(false);
    if (what === 'colour') drawLabel();
    updateLabels();
  }

  /* ---------------------------------------------------------------- render loop */
  var lastInteract = -1e9, t0 = performance.now(), exporting = false, visible = true, hint = $('.twc-hint');
  controls.addEventListener('start', function () { lastInteract = performance.now(); hint.style.opacity = 0; });
  controls.addEventListener('change', function () { lastInteract = performance.now(); });
  $('.twc-reset').addEventListener('click', function () { camera.position.copy(HOME); controls.target.copy(TARGET); lastInteract = -1e9; });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (exporting || !visible) return;
    resize();
    bodyMat.color.lerp(lin(state.body), 0.15);
    capMat.color.lerp(lin(state.capc), 0.15);
    if (pop > 0) { pop = Math.max(0, pop - 0.07); var k = 1 - 0.05 * Math.sin(pop * Math.PI); product.scale.set(1 / k, k, 1 / k); }
    var idle = now - lastInteract > 4000 && !reduceMotion;
    var target = idle ? Math.sin((now - t0) / 2600) * 0.4 : product.rotation.y;
    product.rotation.y += (target - product.rotation.y) * 0.04;
    controls.update();
    renderer.render(scene, camera);
  }
  function ready() { var l = $('.twc-loading'); if (l) l.remove(); }

  /* ---------------------------------------------------------------- renderings */
  function renderSheet() {
    exporting = true;
    var keep = { pos: camera.position.clone(), rot: product.rotation.y, aspect: camera.aspect, w: canvas.clientWidth, h: canvas.clientHeight, scale: product.scale.clone(), pr: renderer.getPixelRatio() };
    bodyMat.color.copy(lin(state.body)); capMat.color.copy(lin(state.capc)); product.scale.set(1, 1, 1);
    var TW = 800, TH = 1000, M = 60, sheet = document.createElement('canvas');
    sheet.width = TW * 3 + M * 4; sheet.height = TH + 300;
    var sc = sheet.getContext('2d');
    sc.fillStyle = '#fbfbfb'; sc.fillRect(0, 0, sheet.width, sheet.height);
    renderer.setPixelRatio(1); renderer.setSize(TW, TH, false);
    camera.aspect = TW / TH; camera.updateProjectionMatrix();
    [['Front', 0], ['Three-quarter', -0.75], ['Side', -Math.PI / 2 + 0.12]].forEach(function (v, i) {
      product.rotation.y = v[1];
      camera.position.copy(HOME); camera.lookAt(TARGET);
      renderer.render(scene, camera);
      var x = M + i * (TW + M);
      sc.fillStyle = '#f2f2f2'; sc.fillRect(x, 150, TW, TH);
      sc.drawImage(renderer.domElement, x, 150, TW, TH);
      sc.fillStyle = '#8c8c8c'; sc.font = '400 20px "IBM Plex Serif", Georgia, serif'; sc.textAlign = 'left';
      sc.fillText('(0' + (i + 1) + ') ' + v[0].toUpperCase(), x, TH + 195);
    });
    sc.textAlign = 'left'; sc.fillStyle = '#222';
    sc.font = '400 52px "IBM Plex Serif", Georgia, serif'; sc.fillText(T.name, M, 92);
    sc.fillStyle = '#4a4a48'; sc.font = '400 22px "IBM Plex Sans", Arial, sans-serif'; sc.fillText(specLine().replace(T.name + (T.capacity ? ' ' + T.capacity : '') + ' · ', (T.capacity ? T.capacity + ' · ' : '')), M, 128);
    sc.fillStyle = '#8c8c8c'; sc.font = '400 18px "IBM Plex Serif", Georgia, serif';
    sc.fillText('TOTTLE WORKS · Concept rendering for discussion. Final colour and decoration are confirmed at sampling.', M, TH + 255);
    renderer.setPixelRatio(keep.pr); renderer.setSize(keep.w, keep.h, false);
    camera.aspect = keep.aspect; camera.updateProjectionMatrix();
    camera.position.copy(keep.pos); product.rotation.y = keep.rot; product.scale.copy(keep.scale);
    exporting = false;
    return sheet;
  }
  function saveBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* ---------------------------------------------------------------- share link */
  function designCode() {
    var s = { cap: state.cap, finish: state.finish, body: state.body, bodyName: state.bodyName, capc: state.capc, capcName: state.capcName, capMetal: state.capMetal, text: state.text, ink: state.ink, art: state.art, txt: state.txt };
    return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(s)))));
  }
  var designUrl = function () { return location.href.split('#')[0] + '#design=' + designCode(); };

  /* ---------------------------------------------------------------- leads (native Webflow form → Zapier → CRM) */
  function sendLead(fields) {
    var form = document.querySelector('[data-twc-lead] form') || document.querySelector('form[data-twc-lead]');
    if (!form) return false;
    var base = { 'Lead type': '', Name: '', Email: '', Company: '', Updates: '', Tottle: T.name, Design: specLine(), 'Design link': designUrl(), Colleagues: '', Note: '', Page: location.href.split('#')[0] };
    Object.keys(fields).forEach(function (k) { base[k] = fields[k]; });
    Object.keys(base).forEach(function (k) {
      var el = form.querySelector('[name="' + k + '"]');
      if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = k; el.setAttribute('data-name', k); form.appendChild(el); }
      el.value = base[k];
    });
    if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return true;
  }

  /* ---------------------------------------------------------------- modals */
  function open(id) { var m = $('[data-modal="' + id + '"]'); m.classList.add('is-open'); setTimeout(function () { var f = m.querySelector('input'); if (f) f.focus(); }, 30); }
  function close(m) { m.classList.remove('is-open'); }
  $$('.twc-modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-close')) close(m); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.twc-modal.is-open').forEach(close); });
  var say = function (form, text, err) { var p = form.querySelector('.twc-msg'); p.textContent = text; p.classList.toggle('is-err', !!err); };

  var lead = store.get('lead') || {};
  ['gate', 'share'].forEach(function (f) {
    var form = $('[data-form="' + f + '"]');
    if (lead.name && form.name) form.name.value = lead.name;
    if (lead.email && form.email) form.email.value = lead.email;
    if (lead.company && form.company) form.company.value = lead.company;
  });

  var sheetCanvas = null;
  $('[data-a="download"]').addEventListener('click', function () {
    sheetCanvas = renderSheet();
    $('[data-preview]').src = sheetCanvas.toDataURL('image/jpeg', 0.82);
    say($('[data-form="gate"]'), '');
    open('gate');
  });
  $('[data-form="gate"]').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, email = f.email.value.trim();
    if (!validEmail(email)) return say(f, 'Please enter a valid work email to continue.', true);
    lead = { name: f.name.value.trim(), email: email, company: f.company.value.trim() };
    store.set('lead', lead);
    sendLead({ 'Lead type': 'Download', Name: lead.name, Email: lead.email, Company: lead.company, Updates: f.updates.checked ? 'Yes' : 'No' });
    sheetCanvas.toBlob(function (blob) { saveBlob(blob, slug(T.name) + '-tottle-renderings.png'); }, 'image/png');
    var files = f.querySelector('[data-files]');
    var links = [];
    if (T.drawing) links.push('<a href="' + esc(T.drawing) + '" target="_blank" rel="noopener" download>Technical drawing ↓</a>');
    if (T.dieline) links.push('<a href="' + esc(T.dieline) + '" target="_blank" rel="noopener" download>Dieline for artwork ↓</a>');
    if (links.length) { files.innerHTML = links.join(''); files.hidden = false; }
    say(f, 'Thank you. Your renderings are downloading' + (links.length ? '. Your technical files are ready below.' : '.'));
  });

  $('[data-a="share"]').addEventListener('click', function () {
    $('[data-link]').textContent = designUrl();
    say($('[data-form="share"]'), '');
    open('share');
  });
  $('[data-copy]').addEventListener('click', function () {
    var f = $('[data-form="share"]');
    if (navigator.clipboard) navigator.clipboard.writeText(designUrl()).then(function () { say(f, 'Link copied.'); }, function () { say(f, 'Select the link above to copy it.'); });
    else say(f, 'Select the link above to copy it.');
  });
  $('[data-form="share"]').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, email = f.email.value.trim();
    var to = f.to.value.split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!validEmail(email)) return say(f, 'Please add your email so your colleague knows who it is from.', true);
    if (!to.length || !to.every(validEmail)) return say(f, 'Please add at least one valid colleague email.', true);
    if (to.length > 5) return say(f, 'You can send to up to five colleagues at a time.', true);
    lead = { name: f.name.value.trim(), email: email, company: lead.company || '' };
    store.set('lead', lead);
    var ok = sendLead({ 'Lead type': 'Share', Name: lead.name, Email: email, Company: lead.company, Colleagues: to.join(', '), Note: f.note.value.trim() });
    say(f, ok ? 'Sent. ' + (to.length > 1 ? 'Your colleagues' : 'Your colleague') + ' will receive the design link shortly.' : 'Copy the link above to share it for now.', !ok);
  });

  /* ---------------------------------------------------------------- init */
  applyMaterials(true);
  updateLabels();
  if (T.model) { buildProcedural(); loadModel(T.model); } else { buildProcedural(); ready(); }
  sizeLabel(); drawLabel();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLabel);
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { sizeLabel(); drawLabel(); }, 120); });
  requestAnimationFrame(loop);
  window.TottleConfigurator = { state: state, tottle: T, renderSheet: renderSheet, designUrl: designUrl };
})();
