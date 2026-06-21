(function () {
  'use strict';

  // ============================================================
  //  Utilities
  // ============================================================

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function statusDot(lastDoneStr) {
    if (!lastDoneStr) return 'red';
    const last = new Date(lastDoneStr + 'T00:00:00');
    const days = daysBetween(last, new Date());
    if (days <= 14) return 'green';
    if (days <= 30) return 'orange';
    return 'red';
  }

  function typeName(raw) {
    return raw.replace(/\s+/g, '-').toLowerCase();
  }

  // ============================================================
  //  Data Loading
  // ============================================================

  const LOG_FILES = [
    'gesture', 'notan', 'portraits', 'one-line-art',
    'live-sketching', 'imaginative', 'monochrome', 'mirror-practice'
  ];

  async function loadAllData() {
    const [summaryText, milestones, notes, affiliatesText, newsletters] = await Promise.all([
      fetch('data/practice-summary.csv').then(r => r.text()),
      fetch('data/milestones.json').then(r => r.json()),
      fetch('data/notes.json').then(r => r.json()),
      fetch('data/affiliates.csv').then(r => r.text()),
      fetch('data/newsletters.json').then(r => r.json()),
    ]);

    const logTexts = await Promise.all(
      LOG_FILES.map(f => fetch(`data/logs/${f}.csv`).then(r => r.text()).catch(() => ''))
    );

    const summary = parseCSV(summaryText);
    const affiliates = parseCSV(affiliatesText);
    const allLogs = logTexts
      .map(t => (t ? parseCSV(t) : []))
      .flat()
      .filter(r => r.Date && r.NumberOfReps);

    return { summary, milestones, notes, affiliates, newsletters, allLogs };
  }

  // ============================================================
  //  Hero
  // ============================================================

  function renderHero(summary) {
    const total = summary.reduce((s, r) => s + parseInt(r.Count || 0), 0);
    const el = document.getElementById('totalReps');
    if (el) el.textContent = total.toLocaleString();
  }

  // ============================================================
  //  Summary Cards
  // ============================================================

  function renderSummaryCards(summary) {
    const grid = document.getElementById('summaryCards');
    if (!grid) return;
    grid.innerHTML = summary.map(row => {
      const dot = statusDot(row.LastDone);
      const lastLabel = row.LastDone ? formatDateDisplay(row.LastDone) : 'Never';
      return `
        <div class="type-card">
          <div class="type-card__header">
            <span class="type-card__name">${row.Name}</span>
            <span class="status-dot status-dot--${dot}" title="${dot}"></span>
          </div>
          <div class="type-card__count">${parseInt(row.Count).toLocaleString()}</div>
          <div class="type-card__last">Last: ${lastLabel}</div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  //  Heatmap
  // ============================================================

  function renderHeatmap(allLogs) {
    const grid = document.getElementById('heatmapGrid');
    const monthsEl = document.getElementById('heatmapMonths');
    const tooltip = document.getElementById('heatmapTooltip');
    if (!grid) return;

    // Build date→reps map
    const repsByDay = {};
    allLogs.forEach(r => {
      const key = r.Date;
      repsByDay[key] = (repsByDay[key] || 0) + parseInt(r.NumberOfReps || 0);
    });

    // Find start: Monday 52 weeks ago
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0
    const endDate = addDays(today, 6 - dayOfWeek); // end of this week (Sunday)
    const startDate = addDays(endDate, -(52 * 7 - 1));

    // Build month labels
    const months = [];
    let cur = new Date(startDate);
    let weekIndex = 0;
    let lastMonth = -1;
    const weekMonthMap = [];

    while (cur <= endDate) {
      const m = cur.getMonth();
      if (m !== lastMonth) {
        months.push({ label: cur.toLocaleDateString('en-GB', { month: 'short' }), week: weekIndex });
        lastMonth = m;
      }
      weekMonthMap.push(cur.getMonth());
      cur = addDays(cur, 7);
      weekIndex++;
    }

    // Render month labels
    if (monthsEl) {
      const totalWeeks = Math.ceil(daysBetween(startDate, endDate) / 7) + 1;
      monthsEl.innerHTML = '';
      months.forEach((m, i) => {
        const nextWeek = months[i + 1] ? months[i + 1].week : totalWeeks;
        const span = document.createElement('span');
        span.className = 'heatmap-month-label';
        span.textContent = m.label;
        span.style.setProperty('--month-weeks', nextWeek - m.week);
        span.style.width = `${(nextWeek - m.week) * 14}px`;
        monthsEl.appendChild(span);
      });
    }

    // Render cells
    grid.innerHTML = '';
    cur = new Date(startDate);
    const maxReps = Math.max(...Object.values(repsByDay), 1);

    while (cur <= endDate) {
      const dateStr = toISO(cur);
      const reps = repsByDay[dateStr] || 0;
      let level = 0;
      if (reps > 0) {
        if (reps <= 2) level = 1;
        else if (reps <= 4) level = 2;
        else if (reps <= 7) level = 3;
        else level = 4;
      }

      const isFuture = cur > today;
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.setAttribute('data-level', isFuture ? '0' : level);
      cell.setAttribute('data-date', dateStr);
      cell.setAttribute('data-reps', reps);

      cell.addEventListener('mouseenter', (e) => {
        const label = reps > 0
          ? `${formatDateDisplay(dateStr)} · ${reps} rep${reps !== 1 ? 's' : ''}`
          : `${formatDateDisplay(dateStr)} · no practice`;
        tooltip.textContent = label;
        tooltip.classList.add('visible');
      });
      cell.addEventListener('mousemove', (e) => {
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top  = (e.clientY - 28) + 'px';
      });
      cell.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });

      grid.appendChild(cell);
      cur = addDays(cur, 1);
    }
  }

  // ============================================================
  //  Bar Chart
  // ============================================================

  function renderBarChart(summary) {
    const canvas = document.getElementById('barChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const sorted = [...summary].sort((a, b) => parseInt(b.Count) - parseInt(a.Count));

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map(r => r.Name),
        datasets: [{
          data: sorted.map(r => parseInt(r.Count)),
          backgroundColor: '#B85C2A',
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.raw} reps`
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#E4DDD6' },
            ticks: { font: { family: 'DM Sans', size: 12 }, color: '#7A6F66' },
            border: { display: false }
          },
          y: {
            grid: { display: false },
            ticks: { font: { family: 'DM Sans', size: 12 }, color: '#1A1714' },
            border: { display: false }
          }
        }
      }
    });

    canvas.parentElement.style.height = `${Math.max(sorted.length * 36, 180)}px`;
  }

  // ============================================================
  //  Milestones
  // ============================================================

  function renderMilestones(milestones, summary) {
    const list = document.getElementById('milestonesList');
    if (!list) return;

    const sorted = [...milestones].sort((a, b) => new Date(b.date) - new Date(a.date));

    const achievedHTML = sorted.map(m => `
      <div class="milestone-item">
        <div class="milestone-item__left">
          <span class="milestone-item__type">${m.type}</span>
          <span class="milestone-item__rep">Rep #${m.milestone}</span>
        </div>
        <span class="milestone-item__date">${formatDateDisplay(m.date)}</span>
        ${m.note ? `<p class="milestone-item__note">&ldquo;${m.note}&rdquo;</p>` : ''}
      </div>
    `).join('');

    // Upcoming milestones
    const thresholds = [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 500];
    const achieved = new Set(milestones.map(m => `${m.type}:${m.milestone}`));

    const upcomingHTML = summary.map(row => {
      const count = parseInt(row.Count);
      const next = thresholds.find(t => t > count);
      if (!next || achieved.has(`${row.Name}:${next}`)) return '';
      return `
        <div class="milestone-item milestone-item--upcoming">
          <div class="milestone-item__left">
            <span class="milestone-item__type">${row.Name}</span>
            <span class="milestone-item__rep">Rep #${next}</span>
          </div>
          <span class="milestone-item__date">${next - count} to go</span>
        </div>
      `;
    }).join('');

    list.innerHTML = achievedHTML + upcomingHTML;
  }

  // ============================================================
  //  Notes
  // ============================================================

  let notesData = [];
  let notesActiveFilter = 'All';

  function renderNotes(notes) {
    notesData = notes;
    const filterEl = document.getElementById('notesFilter');
    const types = ['All', ...new Set(notes.map(n => n.type))];

    if (filterEl) {
      filterEl.innerHTML = types.map(t => `
        <button class="pill ${t === 'All' ? 'active' : ''}" data-type="${t}">${t}</button>
      `).join('');
      filterEl.addEventListener('click', e => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        filterEl.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        notesActiveFilter = btn.dataset.type;
        renderNotesGrid();
      });
    }
    renderNotesGrid();
  }

  function renderNotesGrid() {
    const grid = document.getElementById('notesGrid');
    if (!grid) return;
    const filtered = notesActiveFilter === 'All'
      ? notesData
      : notesData.filter(n => n.type === notesActiveFilter);

    grid.innerHTML = filtered.map(n => `
      <article class="note-card">
        <div class="note-card__top">
          <span class="badge">${n.type}</span>
          <span class="note-card__date">${formatDateDisplay(n.date)}</span>
        </div>
        <span class="note-card__reps">Reps ${n.reps}</span>
        <h3 class="note-card__title">${n.title}</h3>
        <p class="note-card__content">${n.content}</p>
      </article>
    `).join('');
  }

  // ============================================================
  //  About Stats
  // ============================================================

  function renderAboutStats(summary) {
    const el = document.getElementById('aboutStats');
    if (!el) return;

    const total = summary.reduce((s, r) => s + parseInt(r.Count || 0), 0);
    const types = summary.length;
    const mostPracticed = summary.reduce((a, b) => parseInt(a.Count) > parseInt(b.Count) ? a : b);

    el.innerHTML = `
      <div class="stat-row">
        <div class="stat-row__value">${total.toLocaleString()}</div>
        <div class="stat-row__label">Total reps logged</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-row">
        <div class="stat-row__value">${types}</div>
        <div class="stat-row__label">Practice types</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-row">
        <div class="stat-row__value">${mostPracticed.Count}</div>
        <div class="stat-row__label">Most practiced &mdash; ${mostPracticed.Name}</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-row">
        <div class="stat-row__value">2024</div>
        <div class="stat-row__label">Tracking since</div>
      </div>
    `;
  }

  // ============================================================
  //  Resources (Affiliate Links)
  // ============================================================

  let affiliatesData = [];
  let affiliatesActiveFilter = 'All';

  function renderResources(affiliates) {
    affiliatesData = affiliates;
    const filterEl = document.getElementById('affiliateFilter');
    const searchEl = document.getElementById('affiliateSearch');
    const categories = ['All', ...new Set(affiliates.map(a => a.Category))];

    if (filterEl) {
      filterEl.innerHTML = categories.map(c => `
        <button class="pill ${c === 'All' ? 'active' : ''}" data-cat="${c}">${c}</button>
      `).join('');
      filterEl.addEventListener('click', e => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        filterEl.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        affiliatesActiveFilter = btn.dataset.cat;
        renderResourcesGrid();
      });
    }

    if (searchEl) {
      searchEl.addEventListener('input', renderResourcesGrid);
    }

    renderResourcesGrid();
  }

  function renderResourcesGrid() {
    const grid = document.getElementById('resourcesGrid');
    const searchEl = document.getElementById('affiliateSearch');
    if (!grid) return;

    const query = (searchEl ? searchEl.value : '').toLowerCase();
    const filtered = affiliatesData.filter(a => {
      const matchCat = affiliatesActiveFilter === 'All' || a.Category === affiliatesActiveFilter;
      const matchQ = !query ||
        a.Name.toLowerCase().includes(query) ||
        a.Description.toLowerCase().includes(query) ||
        a.Category.toLowerCase().includes(query);
      return matchCat && matchQ;
    });

    if (!filtered.length) {
      grid.innerHTML = '<p class="resource-empty">No resources match your search.</p>';
      return;
    }

    grid.innerHTML = filtered.map(a => `
      <a href="${a.URL}" target="_blank" rel="noopener noreferrer" class="resource-card">
        <div class="resource-card__top">
          <span class="resource-card__name">${a.Name}</span>
          <span class="resource-card__arrow">&rarr;</span>
        </div>
        <span class="badge">${a.Category}</span>
        <p class="resource-card__desc">${a.Description}</p>
      </a>
    `).join('');
  }

  // ============================================================
  //  Letters (Newsletter Archive)
  // ============================================================

  function renderLetters(newsletters) {
    const grid = document.getElementById('lettersGrid');
    if (!grid) return;

    const sorted = [...newsletters].sort((a, b) => b.issue - a.issue);

    grid.innerHTML = sorted.map(n => `
      <a href="${n.url}" target="_blank" rel="noopener" class="letter-card">
        <div class="letter-card__issue">Issue #${n.issue}</div>
        <div class="letter-card__title">${n.title}</div>
        <p class="letter-card__desc">${n.description}</p>
        <div class="letter-card__footer">
          <span class="letter-card__date">${formatDateDisplay(n.date)}</span>
          <span class="letter-card__link">Read &rarr;</span>
        </div>
      </a>
    `).join('');
  }

  // ============================================================
  //  Nav
  // ============================================================

  function initNav() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    if (toggle && links) {
      toggle.addEventListener('click', () => {
        links.classList.toggle('open');
      });
      links.addEventListener('click', e => {
        if (e.target.tagName === 'A') links.classList.remove('open');
      });
    }
  }

  // ============================================================
  //  Init — page-aware rendering
  // ============================================================

  async function init() {
    initNav();

    const page = document.body.dataset.page;

    try {
      if (page === 'dashboard') {
        const [summaryText, logTexts] = await Promise.all([
          fetch('data/practice-summary.csv').then(r => r.text()),
          Promise.all(LOG_FILES.map(f =>
            fetch(`data/logs/${f}.csv`).then(r => r.text()).catch(() => '')
          ))
        ]);
        const summary = parseCSV(summaryText);
        const allLogs = logTexts.map(t => t ? parseCSV(t) : []).flat().filter(r => r.Date && r.NumberOfReps);
        renderHero(summary);
        renderSummaryCards(summary);
        renderHeatmap(allLogs);
        renderBarChart(summary);
      }

      if (page === 'milestones') {
        const [summaryText, milestones] = await Promise.all([
          fetch('data/practice-summary.csv').then(r => r.text()),
          fetch('data/milestones.json').then(r => r.json()),
        ]);
        renderMilestones(milestones, parseCSV(summaryText));
      }

      if (page === 'notes') {
        const notes = await fetch('data/notes.json').then(r => r.json());
        renderNotes(notes);
      }

      if (page === 'about') {
        const summary = await fetch('data/practice-summary.csv').then(r => r.text()).then(parseCSV);
        renderAboutStats(summary);
      }

      if (page === 'resources') {
        const affiliates = await fetch('data/affiliates.csv').then(r => r.text()).then(parseCSV);
        renderResources(affiliates);
      }

      if (page === 'letters') {
        const newsletters = await fetch('data/newsletters.json').then(r => r.json());
        renderLetters(newsletters);
      }

    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
