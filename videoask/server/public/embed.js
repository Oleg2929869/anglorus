(function () {
  var cfg = window.VIDEOASK_EMBED_CONFIG || {};
  var url = cfg.url;
  if (!url) { console.error('VIDEOASK_EMBED_CONFIG.url is required'); return; }
  var opts = cfg.options || {};

  var css = document.createElement('style');
  css.textContent =
    '.va-fab{position:fixed;z-index:99998;width:88px;height:88px;border-radius:50%;border:3px solid #fff;' +
    'overflow:hidden;cursor:pointer;box-shadow:0 10px 30px rgba(29,42,36,.35);padding:0;background:#1E5B3E;' +
    'transition:transform .15s;animation:va-pop .5s ease,va-glow 2.4s ease-in-out infinite}' +
    '.va-fab:hover{transform:scale(1.06)}' +
    '.va-fab img,.va-fab span{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
    'display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff}' +
    '.va-fab i{position:absolute;bottom:4px;right:4px;width:20px;height:20px;border-radius:50%;' +
    'background:#F0720B;border:2px solid #fff}' +
    '.va-fab.va-bottom-right{right:26px;bottom:26px}' +
    '.va-fab.va-bottom-left{left:26px;bottom:26px}' +
    '.va-fab.va-top-right{right:26px;top:26px}' +
    '.va-fab.va-top-left{left:26px;top:26px}' +
    '.va-overlay{position:fixed;inset:0;z-index:99999;background:rgba(20,30,25,.55);' +
    'backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:16px}' +
    '.va-overlay.va-open{display:flex}' +
    '.va-card{width:min(420px,100%);aspect-ratio:9/16;max-height:calc(100vh - 32px);' +
    'background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(10,20,15,.45);' +
    'animation:va-pop .3s cubic-bezier(.2,.9,.3,1.2)}' +
    '.va-card iframe{width:100%;height:100%;border:0}' +
    '@keyframes va-pop{from{transform:scale(.85);opacity:0}}' +
    '@keyframes va-glow{0%,100%{box-shadow:0 10px 30px rgba(29,42,36,.35),0 0 0 0 rgba(240,114,11,.45)}' +
    '50%{box-shadow:0 10px 30px rgba(29,42,36,.35),0 0 0 16px rgba(240,114,11,0)}}';
  document.head.appendChild(css);

  var fab = document.createElement('button');
  fab.className = 'va-fab va-' + (opts.position || 'bottom-right');
  fab.setAttribute('aria-label', opts.text || 'Открыть видео-форму');
  if (opts.avatarVideo) {
    var vid = document.createElement('video');
    vid.src = opts.avatarVideo + (opts.avatarVideo.indexOf('#') === -1 ? '#t=0.1' : '');
    vid.muted = true; vid.loop = true; vid.autoplay = true;
    vid.setAttribute('playsinline', '');
    vid.style.objectFit = 'cover';
    vid.style.objectPosition = 'center center';
    vid.addEventListener('loadeddata', function () {
      try { vid.currentTime = 0.1; } catch (e) {}
      vid.muted = true;
      vid.play().catch(function () {});
    });
    fab.appendChild(vid);
  } else if (opts.avatar) {
    var img = document.createElement('img');
    img.src = opts.avatar;
    img.alt = '';
    fab.appendChild(img);
  } else {
    var span = document.createElement('span');
    span.textContent = opts.emoji || '💬';
    fab.appendChild(span);
  }
  var badge = document.createElement('i');
  fab.appendChild(badge);
  if (opts.backgroundColor) fab.style.background = opts.backgroundColor;

  var overlay = document.createElement('div');
  overlay.className = 'va-overlay';
  var card = document.createElement('div');
  card.className = 'va-card';
  var frame = document.createElement('iframe');
  frame.src = url;
  frame.setAttribute('allow', 'camera; microphone; autoplay; fullscreen');
  frame.setAttribute('allowfullscreen', '');
  card.appendChild(frame);
  overlay.appendChild(card);

  function open() {
    frame.src = url;
    overlay.classList.add('va-open');
  }
  function close() {
    overlay.classList.remove('va-open');
  }

  fab.addEventListener('click', open);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'va:collapse' || e.data.type === 'va:done') close();
  });

  document.body.appendChild(fab);
  document.body.appendChild(overlay);
})();
