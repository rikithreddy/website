(function () {
  'use strict';

  // ============================================================
  //  Config
  // ============================================================
  const DATA_URL = 'data/paintings.json';

  // ============================================================
  //  State
  // ============================================================
  let data = null;
  let paintings = [];
  let defaults = {};
  let seriesMap = {};
  let collectionsMap = {};

  let state = {
    series: 'all',
    collection: null,
    availableOnly: false,
    sort: 'newest',
    viewMode: localStorage.getItem('viewMode') || 'grid',
  };

  let filtered = [];
  let modalIndex = -1;
  let isModalOpen = false;
  let isFrameView = false;
  let fullImageCache = {};

  // Touch tracking for swipe
  let touchStartX = 0;
  let touchStartY = 0;

  // ============================================================
  //  Boot
  // ============================================================
  async function init() {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error('Could not load paintings.json');
      data = await res.json();
    } catch (e) {
      console.error(e);
      document.getElementById('gallery-grid').innerHTML =
        '<p style="padding:2rem;color:#999">Could not load paintings data. Make sure data/paintings.json exists.</p>';
      return;
    }

    paintings = data.paintings || [];
    defaults = data.defaults || {};
    seriesMap = data.series || {};
    collectionsMap = data.collections || {};

    populateArtistInfo();
    buildHeroStats();
    buildHeroStrip();
    buildSeriesFilters();
    applyFilterSort();
    renderGallery();
    setupEventListeners();
    setupViewToggle();
    setupLazyLoader();
    setupNavbarScroll();
    handleHash();
    document.getElementById('footer-year').textContent = new Date().getFullYear();
  }

  // ============================================================
  //  Artist Info
  // ============================================================
  function populateArtistInfo() {
    const artist = data.artist || {};

    // Nav instagram
    setLinkHref('nav-instagram-link', instagramUrl(artist.instagram));

    // About bio
    const bioEl = document.getElementById('about-bio');
    if (bioEl && artist.bio) {
      bioEl.innerHTML = artist.bio
        .split('\n\n')
        .map(p => `<p>${p.trim()}</p>`)
        .join('');
    }

    // About name
    setTextContent('about-name', artist.name);

    // Instagram handle
    const handle = artist.instagram || '@your_instagram';
    setTextContent('about-instagram-handle', handle);
    setLinkHref('about-instagram-link', instagramUrl(handle));
    setLinkHref('contact-instagram-link', instagramUrl(handle));
    setLinkHref('footer-instagram-link', instagramUrl(handle));

    // Materials list
    const matList = document.getElementById('materials-list');
    if (matList) {
      const items = [
        { label: 'Medium', value: defaults.medium },
        { label: 'Paper', value: defaults.paper },
        { label: 'Colors', value: (defaults.colors || []).join(', ') },
        { label: 'Brand', value: defaults.colorBrand },
      ];
      matList.innerHTML = items.map(i =>
        `<dt>${i.label}</dt><dd>${i.value || '—'}</dd>`
      ).join('');
    }
  }

  function instagramUrl(handle) {
    if (!handle) return 'https://instagram.com';
    const clean = handle.replace(/^@/, '');
    return `https://instagram.com/${clean}`;
  }

  function setLinkHref(id, href) {
    const el = document.getElementById(id);
    if (el) el.href = href;
  }

  function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  }

  // ============================================================
  //  Hero Enhancements
  // ============================================================
  function buildHeroStats() {
    const el = document.getElementById('hero-stats');
    if (!el) return;
    const total = paintings.length;
    const seriesCount = Object.keys(seriesMap).length;
    el.textContent = `${total} original paintings · ${seriesCount} series`;
  }

  function buildHeroStrip() {
    const container = document.getElementById('hero-strip');
    if (!container || !paintings.length) return;

    // Duplicate for seamless infinite loop
    const all = [...paintings, ...paintings];

    const inner = document.createElement('div');
    inner.className = 'hero-strip-inner';
    inner.innerHTML = all.map(p => `
      <div class="hero-strip-thumb" data-id="${p.id}">
        <img src="${p.images.raw}" alt="" loading="lazy" decoding="async">
      </div>`).join('');

    container.appendChild(inner);

    inner.addEventListener('click', e => {
      const thumb = e.target.closest('[data-id]');
      if (thumb) openModal(parseInt(thumb.dataset.id, 10));
    });
  }

  // ============================================================
  //  Series Filters
  // ============================================================
  function buildSeriesFilters() {
    const bar = document.querySelector('.filter-bar');
    if (!bar) return;

    // Detect which series actually have paintings
    const usedSeries = [...new Set(paintings.map(p => p.series))];

    usedSeries.forEach(key => {
      if (!seriesMap[key]) return;
      const btn = document.createElement('button');
      btn.className = 'filter-pill';
      btn.dataset.series = key;
      btn.textContent = seriesMap[key].name;
      bar.appendChild(btn);
    });

  }

  // ============================================================
  //  Filter & Sort
  // ============================================================
  function applyFilterSort() {
    let result = [...paintings];

    if (state.collection) {
      result = result.filter(p => p.collection === state.collection);
    } else if (state.series !== 'all') {
      result = result.filter(p => p.series === state.series);
    }

    if (state.availableOnly) {
      result = result.filter(p => !p.sold);
    }

    switch (state.sort) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      default: // newest
        result.sort((a, b) => b.order - a.order);
    }

    filtered = result;
  }

  function updateCount() {
    const el = document.getElementById('gallery-count');
    if (!el) return;
    const total = paintings.length;
    const shown = filtered.length;
    if (state.collection && collectionsMap[state.collection]) {
      el.innerHTML = `<span>${collectionsMap[state.collection].name} Series &mdash; ${shown} painting${shown !== 1 ? 's' : ''}</span>
        <button class="clear-collection-btn" id="clear-collection-btn" aria-label="Clear series filter">✕ Clear</button>`;
      const btn = document.getElementById('clear-collection-btn');
      if (btn) btn.addEventListener('click', () => {
        state.collection = null;
        document.querySelectorAll('.filter-pill').forEach(p =>
          p.classList.toggle('active', !p.dataset.collection && p.dataset.series === state.series)
        );
        renderGallery(true);
      });
    } else {
      el.textContent = shown === total
        ? `${total} painting${total !== 1 ? 's' : ''}`
        : `Showing ${shown} of ${total} paintings`;
    }
  }

  // ============================================================
  //  Gallery Rendering
  // ============================================================
  function renderGallery(animate) {
    applyFilterSort();
    updateCount();

    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    if (animate) {
      // Fade out existing, then swap
      const existing = grid.querySelectorAll('.gallery-card');
      existing.forEach(c => c.classList.add('card-exit'));
      setTimeout(() => {
        grid.innerHTML = '';
        renderCards(grid);
      }, 220);
    } else {
      grid.innerHTML = '';
      renderCards(grid);
    }
  }

  function renderCards(grid) {
    if (filtered.length === 0) {
      grid.innerHTML = '<p style="padding:2rem;color:var(--color-text-tertiary);font-style:italic;">No paintings match your filter.</p>';
      return;
    }

    filtered.forEach((painting, i) => {
      const card = buildCard(painting, i);
      grid.appendChild(card);
    });

    // Re-observe new images
    setupLazyLoader();
  }

  function buildCard(painting, index) {
    const card = document.createElement('div');
    card.className = 'gallery-card' + (painting.sold ? ' is-sold' : '');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${painting.title}${painting.sold ? ' — Sold' : ''}`);
    card.dataset.id = painting.id;
    card.style.animationDelay = `${index * 35}ms`;
    card.classList.add('card-enter');

    const sym = resolve(painting, 'currencySymbol');
    const priceStr = `${sym}${formatPrice(painting.price)}`;

    card.innerHTML = `
      <div class="card-frame">
        ${painting.sold ? '<div class="sold-ribbon" aria-hidden="true">Sold</div>' : ''}
        <div class="card-image-wrapper">
          <img
            class="card-image"
            src="${svgPlaceholder(painting.aspectRatio)}"
            data-src="${painting.images.raw}"
            alt="${escHtml(painting.title)} — watercolour by ${data.artist.name}"
            width="${Math.round(painting.aspectRatio * 400)}"
            height="400"
            decoding="async"
          >
          <div class="card-overlay" aria-hidden="true">
            ${painting.collection && collectionsMap[painting.collection]
              ? `<span class="overlay-collection">${escHtml(collectionsMap[painting.collection].name)}</span>`
              : ''}
            <p class="overlay-title">${escHtml(painting.title)}</p>
            <p class="overlay-price${painting.sold ? ' is-sold-price' : ''}">${priceStr}</p>
          </div>
        </div>
      </div>
      <div class="card-info-mobile">
        ${painting.collection && collectionsMap[painting.collection]
          ? `<span class="card-collection-tag">${escHtml(collectionsMap[painting.collection].name)}</span>`
          : ''}
        <p class="card-title">${escHtml(painting.title)}</p>
        <p class="card-price${painting.sold ? ' is-sold-price' : ''}">${priceStr}</p>
        ${painting.sold ? '<span class="card-sold-label">Sold</span>' : ''}
      </div>
    `;

    card.addEventListener('click', () => openModal(painting.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(painting.id);
      }
    });

    return card;
  }

  // ============================================================
  //  Lazy Loading
  // ============================================================
  let lazyObserver = null;

  function setupLazyLoader() {
    if (lazyObserver) {
      lazyObserver.disconnect();
    }

    lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const src = img.dataset.src;
        if (!src) return;
        img.src = src;
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded'); // prevent stuck skeleton
        lazyObserver.unobserve(img);
      });
    }, { rootMargin: '200px 0px' });

    document.querySelectorAll('.card-image[data-src]').forEach(img => {
      lazyObserver.observe(img);
    });
  }

  // ============================================================
  //  Modal
  // ============================================================
  function openModal(paintingId) {
    const idx = filtered.findIndex(p => p.id === paintingId);
    if (idx === -1) return;
    modalIndex = idx;
    isFrameView = false;
    renderModal(filtered[idx]);
    showModal();
    updateHash(`painting-${paintingId}`);
  }

  function showModal() {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    isModalOpen = true;
    document.getElementById('modal-close').focus();
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isModalOpen = false;
    clearHash();
  }

  function renderModal(painting) {
    const artist = data.artist || {};
    const sym = resolve(painting, 'currencySymbol');
    const medium = resolve(painting, 'medium') || '';
    const paper = resolve(painting, 'paper') || '';
    const framed = resolve(painting, 'framed');
    const original = resolve(painting, 'original');

    // Image
    const img = document.getElementById('modal-image');
    const skeleton = document.getElementById('modal-image-skeleton');
    img.classList.remove('loaded');
    if (skeleton) skeleton.style.display = '';
    img.alt = `${painting.title} — watercolour painting by ${artist.name}`;
    img.src = painting.images.raw;
    img.onload = () => {
      img.classList.add('loaded');
      if (skeleton) skeleton.style.display = 'none';
    };
    img.onerror = () => img.classList.add('loaded');

    // Frame toggle reset
    const frameBtn = document.getElementById('frame-toggle');
    frameBtn.classList.remove('is-framed');
    frameBtn.setAttribute('aria-pressed', 'false');
    isFrameView = false;

    // Title
    document.getElementById('modal-title').textContent = painting.title;

    // Sold badge
    const badge = document.getElementById('modal-sold-badge');
    badge.classList.toggle('visible', !!painting.sold);

    // Genre series tag
    const seriesEl = document.getElementById('modal-series-tag');
    seriesEl.textContent = (seriesMap[painting.series] || {}).name || painting.series || '';

    // Named collection
    const collectionEl = document.getElementById('modal-collection');
    if (collectionEl) {
      const col = painting.collection && collectionsMap[painting.collection];
      if (col) {
        collectionEl.innerHTML = `
          <div class="modal-collection-info">
            <span class="modal-collection-label">Series</span>
            <span class="modal-collection-name">${escHtml(col.name)}</span>
            <button class="btn-view-series" data-collection="${escHtml(painting.collection)}">View series →</button>
          </div>`;
        collectionEl.querySelector('.btn-view-series').addEventListener('click', () => {
          state.collection = painting.collection;
          state.series = 'all';
          document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
          const colPill = document.querySelector(`.filter-pill[data-collection="${painting.collection}"]`);
          if (colPill) colPill.classList.add('active');
          renderGallery(false);
          closeModal();
          document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' });
        });
      } else {
        collectionEl.innerHTML = '';
      }
    }

    // Description
    document.getElementById('modal-description').textContent = painting.description || '';

    // Specs
    const specsEl = document.getElementById('modal-specs');
    const frameStr = painting.frame
      ? `${painting.frame.width} × ${painting.frame.height} ${painting.frame.unit}`
      : '—';
    const areaStr = painting.paintArea
      ? `${painting.paintArea.width} × ${painting.paintArea.height} ${painting.paintArea.unit}`
      : '—';

    specsEl.innerHTML = [
      ['Medium', medium],
      ['Paper', paper],
      ['Frame', frameStr],
      ['Paint area', areaStr],
      ['Type', [original && 'Original', framed && 'Framed'].filter(Boolean).join(' · ') || '—'],
      painting.technique ? ['Technique', painting.technique] : null,
    ]
      .filter(Boolean)
      .map(([dt, dd]) => `<dt>${dt}</dt><dd>${escHtml(dd)}</dd>`)
      .join('');

    // Price
    const priceEl = document.getElementById('modal-price');
    const priceNoteEl = document.getElementById('modal-price-note');
    priceEl.textContent = `${sym}${formatPrice(painting.price)}`;
    priceEl.className = 'modal-price' + (painting.sold ? ' is-sold' : '');
    priceNoteEl.textContent = painting.sold ? 'This piece has been sold.' : 'Prices include framing.';

    // Inquire button
    const inquireBtn = document.getElementById('modal-inquire');
    if (painting.sold) {
      inquireBtn.textContent = 'Inquire about similar work';
    } else {
      inquireBtn.textContent = 'Inquire about this piece';
    }

    // Nav counter
    updateModalNav();
  }

  function updateModalNav() {
    const countEl = document.getElementById('modal-nav-count');
    if (countEl) {
      countEl.textContent = `${modalIndex + 1} / ${filtered.length}`;
    }
    const prevBtn = document.getElementById('modal-prev');
    const nextBtn = document.getElementById('modal-next');
    if (prevBtn) prevBtn.disabled = modalIndex <= 0;
    if (nextBtn) nextBtn.disabled = modalIndex >= filtered.length - 1;
  }

  function navigateModal(dir) {
    const next = modalIndex + dir;
    if (next < 0 || next >= filtered.length) return;
    modalIndex = next;
    const painting = filtered[modalIndex];
    isFrameView = false;
    renderModal(painting);
    updateHash(`painting-${painting.id}`);
  }

  // Frame toggle
  function toggleFrameView(painting) {
    if (!painting) painting = filtered[modalIndex];
    if (!painting) return;

    const img = document.getElementById('modal-image');
    const btn = document.getElementById('frame-toggle');

    if (isFrameView) {
      // Switch back to raw
      img.classList.remove('loaded');
      img.src = painting.images.raw;
      img.onload = () => img.classList.add('loaded');
      btn.classList.remove('is-framed');
      btn.setAttribute('aria-pressed', 'false');
      isFrameView = false;
    } else {
      // Load full image
      img.classList.remove('loaded');
      const fullSrc = painting.images.full;
      if (fullImageCache[painting.id]) {
        img.src = fullSrc;
        img.classList.add('loaded');
      } else {
        img.src = fullSrc;
        img.onload = () => {
          img.classList.add('loaded');
          fullImageCache[painting.id] = true;
        };
      }
      btn.classList.add('is-framed');
      btn.setAttribute('aria-pressed', 'true');
      isFrameView = true;
    }
  }

  // ============================================================
  //  Inquire & Share
  // ============================================================
  function handleInquire() {
    const artist = data.artist || {};
    window.open('https://instagram.com/' + (artist.instagram || '').replace('@', ''), '_blank');
  }

  async function handleShare() {
    const painting = filtered[modalIndex];
    if (!painting) return;

    const url = `${window.location.origin}${window.location.pathname}#painting-${painting.id}`;
    const text = `"${painting.title}" — watercolour by Rikith Reddy`;

    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch (e) {
        // User cancelled or not supported
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard');
    } catch (e) {
      showToast('Copy this link: ' + url);
    }
  }

  // ============================================================
  //  Toast
  // ============================================================
  let toastTimer = null;

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
  }

  // ============================================================
  //  Event Listeners
  // ============================================================
  function setupEventListeners() {
    // Filter pills (genre + collection)
    document.querySelector('.filter-bar').addEventListener('click', e => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (pill.dataset.collection) {
        state.collection = pill.dataset.collection;
        state.series = 'all';
      } else {
        state.series = pill.dataset.series;
        state.collection = null;
      }
      renderGallery(true);
    });

    // Availability toggle
    const availBtn = document.getElementById('availability-toggle');
    if (availBtn) {
      availBtn.addEventListener('click', () => {
        state.availableOnly = !state.availableOnly;
        availBtn.classList.toggle('active', state.availableOnly);
        availBtn.setAttribute('aria-pressed', String(state.availableOnly));
        renderGallery(true);
      });
    }

    // Sort
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.sort = sortSelect.value;
        renderGallery(true);
      });
    }

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);

    // Backdrop click
    document.getElementById('modal-backdrop').addEventListener('click', e => {
      if (e.target === document.getElementById('modal-backdrop')) closeModal();
    });

    // Modal nav
    document.getElementById('modal-prev').addEventListener('click', () => navigateModal(-1));
    document.getElementById('modal-next').addEventListener('click', () => navigateModal(1));

    // Frame toggle
    document.getElementById('frame-toggle').addEventListener('click', () => {
      toggleFrameView();
    });

    // Inquire
    document.getElementById('modal-inquire').addEventListener('click', handleInquire);

    // Share
    document.getElementById('modal-share').addEventListener('click', handleShare);

    // Keyboard
    document.addEventListener('keydown', handleKeyDown);

    // Touch for swipe in modal
    const modalContainer = document.getElementById('modal-container');
    modalContainer.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    modalContainer.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        navigateModal(dx < 0 ? 1 : -1);
      } else if (dy > 60 && Math.abs(dy) > Math.abs(dx)) {
        closeModal();
      }
    }, { passive: true });

    // Hash change
    window.addEventListener('hashchange', handleHash);

    // Nav smooth scroll
    document.querySelectorAll('[href^="#"]').forEach(link => {
      link.addEventListener('click', e => {
        const href = link.getAttribute('href');
        if (href.startsWith('#painting-')) return; // handled by modal
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function handleKeyDown(e) {
    if (!isModalOpen) return;
    switch (e.key) {
      case 'Escape': closeModal(); break;
      case 'ArrowLeft': navigateModal(-1); break;
      case 'ArrowRight': navigateModal(1); break;
    }
  }

  // ============================================================
  //  Navbar Scroll
  // ============================================================
  function setupNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    const observer = new IntersectionObserver(
      ([entry]) => navbar.classList.toggle('scrolled', !entry.isIntersecting),
      { rootMargin: '-80px 0px 0px 0px' }
    );
    const hero = document.getElementById('hero');
    if (hero) observer.observe(hero);
  }

  // ============================================================
  //  Hash Routing
  // ============================================================
  function handleHash() {
    const hash = window.location.hash.slice(1); // without #

    if (hash.startsWith('painting-')) {
      const id = parseInt(hash.replace('painting-', ''), 10);
      if (!isNaN(id)) {
        // Make sure gallery is rendered first with no filter so the painting is found
        const idx = filtered.findIndex(p => p.id === id);
        if (idx !== -1) {
          openModal(id);
        } else {
          // Reset filters to find the painting
          state.series = 'all';
          state.availableOnly = false;
          document.querySelectorAll('.filter-pill').forEach(p =>
            p.classList.toggle('active', p.dataset.series === 'all')
          );
          applyFilterSort();
          renderGallery(false);
          openModal(id);
        }
      }
    } else if (hash && hash !== 'hero') {
      const target = document.getElementById(hash.split('?')[0]);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    }
  }

  function updateHash(fragment) {
    history.replaceState(null, '', `#${fragment}`);
  }

  function clearHash() {
    history.replaceState(null, '', window.location.pathname);
  }

  // ============================================================
  //  Utilities
  // ============================================================
  function resolve(painting, field) {
    return painting[field] !== undefined ? painting[field] : defaults[field];
  }

  function formatPrice(price) {
    return Number(price).toLocaleString('en-IN');
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function svgPlaceholder(ratio) {
    const w = Math.round((ratio || 0.7) * 400);
    const h = 400;
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'%3E%3C/svg%3E`;
  }

  // ============================================================
  //  View Toggle (list / grid)
  // ============================================================
  function setupViewToggle() {
    const btn = document.getElementById('view-toggle');
    const grid = document.getElementById('gallery-grid');
    if (!btn || !grid) return;

    if (state.viewMode === 'list') {
      grid.classList.add('gallery--list');
      btn.setAttribute('aria-pressed', 'true');
    }

    btn.addEventListener('click', () => {
      state.viewMode = state.viewMode === 'list' ? 'grid' : 'list';
      grid.classList.toggle('gallery--list', state.viewMode === 'list');
      btn.setAttribute('aria-pressed', String(state.viewMode === 'list'));
      localStorage.setItem('viewMode', state.viewMode);
    });
  }

  // ============================================================
  //  Start
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
