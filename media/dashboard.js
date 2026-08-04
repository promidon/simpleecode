// SimpleeCode dashboard webview script (redesign — docs/design/redesign-plan.md).
// Renders the DashboardState pushed from the extension into a tabbed shell
// (Explain / Tour / Check) and forwards clicks + the ask/check boxes back.
// Shared by the editor-tab panel and the Activity-Bar sidebar view.
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    statusPill: document.getElementById('status-pill'),
    contextBar: document.getElementById('context-bar'),
    explain: document.getElementById('explain-content'),
    facts: document.getElementById('facts-rail'),
    tour: document.getElementById('tour-content'),
    checkResults: document.getElementById('check-results'),
    checkAnswer: document.getElementById('check-answer'),
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: {
      explain: document.getElementById('panel-explain'),
      tour: document.getElementById('panel-tour'),
      check: document.getElementById('panel-check'),
    },
    overflowBtn: document.getElementById('overflow-btn'),
    overflowMenu: document.getElementById('overflow-menu'),
    answerLive: document.getElementById('answer-live'),
    segs: Array.from(document.querySelectorAll('.seg')),
  };

  const savedUi = vscode.getState() || {};
  let lastState = null;
  let activeTab = savedUi.tab || 'tour';

  // --- Tabs -----------------------------------------------------------------
  function selectTab(tab, focus) {
    activeTab = tab;
    for (const t of els.tabs) {
      const on = t.dataset.tab === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) {
        t.focus();
      }
    }
    for (const key of Object.keys(els.panels)) {
      const on = key === tab;
      els.panels[key].classList.toggle('is-active', on);
      els.panels[key].hidden = !on;
    }
    persist();
  }

  els.tabs.forEach((t) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab, false));
    t.addEventListener('keydown', (e) => {
      const i = els.tabs.indexOf(t);
      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        e.preventDefault();
        const next = e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? els.tabs.length - 1
            : e.key === 'ArrowRight'
              ? (i + 1) % els.tabs.length
              : (i - 1 + els.tabs.length) % els.tabs.length;
        selectTab(els.tabs[next].dataset.tab, true);
      }
    });
  });

  // --- Overflow menu --------------------------------------------------------
  function closeMenu(restoreFocus) {
    els.overflowMenu.hidden = true;
    els.overflowBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      els.overflowBtn.focus();
    }
  }
  els.overflowBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = els.overflowMenu.hidden;
    els.overflowMenu.hidden = !open;
    els.overflowBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const first = els.overflowMenu.querySelector('button');
      if (first) {
        first.focus();
      }
    }
  });
  els.overflowMenu.addEventListener('keydown', (e) => {
    const items = Array.from(els.overflowMenu.querySelectorAll('[role="menuitem"]'));
    const current = items.indexOf(document.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') {
      next = (current + 1) % items.length;
    } else if (e.key === 'ArrowUp') {
      next = (current - 1 + items.length) % items.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = items.length - 1;
    }
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu(!els.overflowMenu.hidden);
      closeModal();
      return;
    }
    // Arrow keys step the tour — but not while focus is on a tab (which uses
    // arrows to move between tabs) or inside a text field.
    if (activeTab !== 'tour' || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) {
      return;
    }
    const el = e.target;
    if (el && (el.closest('.tab') || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      return;
    }
    e.preventDefault();
    vscode.postMessage({
      type: 'runCommand',
      command: e.key === 'ArrowRight' ? 'simpleecode.tourNext' : 'simpleecode.tourPrev',
    });
  });

  // --- Depth toggle (reflect the chosen depth; command re-runs the explain) -
  els.segs.forEach((seg) => {
    seg.addEventListener('click', () => {
      els.segs.forEach((s) => {
        const active = s === seg;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  });

  function activeDepth(state) {
    const mode = (state && state.explanationMode) || 'detailed';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }

  function renderDepth(state) {
    const mode = (state && state.explanationMode) || 'detailed';
    els.segs.forEach((seg) => {
      const active = seg.dataset.mode === mode;
      seg.classList.toggle('is-active', active);
      seg.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  // --- Ask box --------------------------------------------------------------
  const askForm = document.getElementById('ask');
  const askInput = document.getElementById('ask-input');
  if (askForm && askInput) {
    askInput.value = savedUi.askText || '';
    askInput.addEventListener('input', persist);
    askForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = askInput.value.trim();
      if (!text) {
        return;
      }
      vscode.postMessage({ type: 'submitPrompt', text });
      persist();
    });
  }

  // --- Check box ------------------------------------------------------------
  const checkRun = document.getElementById('check-run');
  const checkInput = document.getElementById('check-input');
  if (checkRun && checkInput && els.checkResults) {
    checkInput.value = savedUi.checkText || '';
    checkInput.addEventListener('input', persist);
    checkRun.addEventListener('click', () => {
      const text = checkInput.value.trim();
      if (!text) {
        return;
      }
      els.checkResults.innerHTML = '<p class="muted">Checking…</p>';
      vscode.postMessage({ type: 'checkAnswer', text });
    });
  }

  // --- Messages -------------------------------------------------------------
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg && msg.type === 'state') {
      lastState = msg.state;
      render(msg.state);
      persist();
    } else if (msg && msg.type === 'checkResult') {
      renderCheck(msg.result);
    } else if (msg && msg.type === 'feedbackResult') {
      renderFeedbackResult(msg.result);
    }
  });

  function persist() {
    vscode.setState({
      tab: activeTab,
      askText: askInput ? askInput.value : '',
      checkText: checkInput ? checkInput.value : '',
    });
  }

  // --- Delegated clicks -----------------------------------------------------
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }
    if (event.target.closest('[data-feedback-send]')) {
      sendFeedback();
      return;
    }
    if (event.target.closest('[data-preview]')) {
      openReview();
      return;
    }
    if (event.target.closest('[data-feedback]')) {
      closeMenu();
      openFeedback();
      return;
    }
    const link = event.target.closest('a[data-url]');
    if (link) {
      event.preventDefault();
      vscode.postMessage({ type: 'openExternal', url: link.dataset.url });
      return;
    }
    const source = event.target.closest('[data-open-source]');
    if (source) {
      event.preventDefault();
      const n = parseInt(source.dataset.line, 10);
      vscode.postMessage({
        type: 'openSource',
        path: source.dataset.path,
        line: Number.isFinite(n) ? n : undefined,
      });
      return;
    }
    const cancelBtn = event.target.closest('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.textContent = 'Stopping…';
      cancelBtn.disabled = true;
      vscode.postMessage({ type: 'cancelPrompt' });
      return;
    }
    const cmdBtn = event.target.closest('[data-command]');
    if (cmdBtn && !cmdBtn.disabled) {
      if (cmdBtn.closest('.menu')) {
        closeMenu();
      }
      vscode.postMessage({ type: 'runCommand', command: cmdBtn.dataset.command });
      return;
    }
    // Any other click outside the menu closes it.
    if (!event.target.closest('.overflow')) {
      closeMenu();
    }
  });

  // --- Render ---------------------------------------------------------------
  function render(state) {
    renderDepth(state);
    renderStatus(state);
    renderContextBar(state);
    els.explain.innerHTML = explainContent(state);
    els.facts.innerHTML = factsRail(state);
    rememberFactsFold();
    els.tour.innerHTML = tourContent(state);
    if (els.checkAnswer) {
      els.checkAnswer.innerHTML = answerWindow(state, '');
    }
    renderLive(state);
    selectTab(activeTab, false);
  }

  // The shared "explain window" — one source of the answer view, reused under
  // the Explain, Tour, and Check tabs. `emptyHint` fills the space with guidance
  // when no answer has been produced yet (pass '' to render nothing).
  function answerWindow(state, emptyHint) {
    const a = state.answer;
    if (!a) {
      return emptyHint
        ? `<div class="answer-window is-empty"><p class="muted">${esc(emptyHint)}</p></div>`
        : '';
    }
    return `<div class="answer-window">${answerBlock(a, state)}</div>`;
  }

  // Screen-reader announcements for the streaming/verify loop (kept in a stable
  // live region so re-renders don't drop the announcement).
  function renderLive(state) {
    if (!els.answerLive) {
      return;
    }
    const a = state.answer;
    const phase = state.phase || 'idle';
    let text = '';
    if (phase === 'capturing') {
      text = 'Capturing the selected context.';
    } else if (phase === 'indexing') {
      text = 'Indexing workspace files.';
    } else if (phase === 'reviewing') {
      text = 'Waiting for prompt review.';
    } else if (phase === 'sending') {
      text = 'Sending the reviewed prompt.';
    } else if (phase === 'streaming' || (a && !a.done)) {
      text = 'Claude is answering…';
    } else if (phase === 'verifying') {
      text = 'Checking answer claims against local facts.';
    } else if (a && a.done) {
      const v = a.verify;
      text = v
        ? `Answer ready. Limited check: ${v.grounded} grounded, ${v.unverified} unverified. Unrecognized prose remains unchecked.`
        : 'Answer ready.';
    } else if (phase === 'failed') {
      text = 'The last SimpleeCode operation failed.';
    } else if (phase === 'cancelled') {
      text = 'The last SimpleeCode operation was cancelled.';
    }
    if (els.answerLive.textContent !== text) {
      els.answerLive.textContent = text;
    }
  }

  function renderStatus(state) {
    const files = state.index ? state.index.files : 0;
    const acpOk = state.acp && state.acp.available;
    let cls = 'status-pill';
    let text = '';
    const phase = state.phase || 'idle';
    const activeLabels = {
      capturing: 'Capturing context',
      indexing: 'Indexing workspace',
      reviewing: 'Waiting for review',
      sending: 'Sending prompt',
      streaming: 'Claude is answering',
      verifying: 'Checking claims',
      cancelled: 'Cancelled',
      failed: 'Last action failed',
    };
    if (activeLabels[phase]) {
      text = activeLabels[phase];
      cls += phase === 'failed' || phase === 'cancelled' ? ' is-warn' : ' is-ready';
    } else if (files > 0 && acpOk) {
      cls += ' is-ready';
      text = 'Indexed · ACP ready';
    } else if (files > 0) {
      cls += ' is-warn';
      text = 'Indexed · ACP unavailable';
    } else if (acpOk) {
      cls += ' is-warn';
      text = 'ACP ready · not indexed';
    } else {
      cls += ' is-warn';
      text = 'Not indexed';
    }
    els.statusPill.className = cls;
    els.statusPill.textContent = text;
  }

  function renderContextBar(state) {
    if (!state.activeFile) {
      els.contextBar.innerHTML = '<span class="muted">No editor — open a file to explain it.</span>';
      return;
    }
    const sel = state.selection;
    let loc = '';
    if (sel && sel.hasSelection) {
      const inside = sel.parentSymbol ? ` · inside <code>${esc(sel.parentSymbol)}</code>` : '';
      loc = `<span>lines ${sel.startLine}–${sel.endLine}${inside}</span>`;
    } else {
      loc = '<span class="muted">whole file (no selection)</span>';
    }
    els.contextBar.innerHTML =
      `<span class="file-chip">${esc(state.activeFile)}</span>${loc}` +
      '<button class="preview-btn" id="preview-btn" data-preview>' +
      `<span class="preview-ico" aria-hidden="true">${shieldSvg}</span>Review last prompt</button>`;
  }

  const shieldSvg =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // --- Modals (review + feedback share #modal-root) ------------------------
  let lastFocused = null;
  let modalKind = null;
  let pendingFeedback = { title: '', body: '' };

  function openModal(kind, html) {
    const root = document.getElementById('modal-root');
    root.innerHTML = html;
    root.hidden = false;
    modalKind = kind;
    lastFocused = document.activeElement;
    const focusFirst = root.querySelector('input, textarea, [data-modal-close]');
    if (focusFirst) {
      focusFirst.focus();
    }
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root.hidden) {
      return;
    }
    root.hidden = true;
    root.innerHTML = '';
    modalKind = null;
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  function openReview() {
    openModal('review', reviewModalHtml(lastState && lastState.lastPacket));
    const root = document.getElementById('modal-root');
    const closeBtn = root.querySelector('[data-modal-close]');
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  function openFeedback() {
    pendingFeedback = { title: '', body: '' };
    openModal('feedback', feedbackModalHtml('', pendingFeedback));
  }

  function feedbackModalHtml(banner, vals) {
    const t = esc(vals.title || '');
    const b = esc(vals.body || '');
    return (
      '<div class="modal-backdrop" data-modal-close></div>' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="fb-title-h">' +
      '<div class="modal-head">' +
      '<div><h2 id="fb-title-h" class="modal-title">Send feedback</h2>' +
      '<p class="modal-sub">Sends this message, your optional tester name, the SimpleeCode version, operating system, and VS Code version.</p></div>' +
      '<button class="icon-btn modal-x" data-modal-close aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="modal-body">' +
      banner +
      '<label class="fb-label" for="fb-title">Title</label>' +
      `<input class="fb-input" id="fb-title" type="text" value="${t}" placeholder="Short summary" maxlength="200" />` +
      '<label class="fb-label" for="fb-message">Message</label>' +
      `<textarea class="fb-textarea" id="fb-message" rows="6" placeholder="What happened? What did you expect?">${b}</textarea>` +
      '<div class="fb-actions">' +
      '<button class="primary-btn" data-feedback-send><span class="btn-ico" aria-hidden="true">➤</span> Send</button>' +
      '</div></div></div>'
    );
  }

  function sendFeedback() {
    const root = document.getElementById('modal-root');
    const titleEl = root.querySelector('#fb-title');
    const bodyEl = root.querySelector('#fb-message');
    if (!titleEl || !bodyEl) {
      return;
    }
    const title = titleEl.value.trim();
    const body = bodyEl.value.trim();
    if (!title || !body) {
      root.querySelector('.modal-body').insertAdjacentHTML(
        'afterbegin',
        '<div class="fb-banner is-error" role="alert">Please add both a title and a message.</div>',
      );
      return;
    }
    pendingFeedback = { title, body };
    const btn = root.querySelector('[data-feedback-send]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    vscode.postMessage({ type: 'sendFeedback', title, body });
  }

  // Re-render the feedback modal body in place (keeps the saved return-focus
  // target so closing still restores focus to the ⋯ menu that opened it).
  function renderFeedbackResult(result) {
    if (modalKind !== 'feedback') {
      return;
    }
    const root = document.getElementById('modal-root');
    if (result && result.ok) {
      root.innerHTML = feedbackModalHtml(
        '<div class="fb-banner is-ok" role="status">Thank you — that’s really helpful. Sent!</div>',
        { title: '', body: '' },
      );
    } else {
      const err = (result && result.error) || 'Something went wrong. Please try again.';
      root.innerHTML = feedbackModalHtml(
        `<div class="fb-banner is-error" role="alert">${esc(err)}</div>`,
        pendingFeedback,
      );
    }
    const field = root.querySelector('input, textarea');
    if (field) {
      field.focus();
    }
  }

  function reviewModalHtml(p) {
    let inner;
    if (!p) {
      inner =
        '<p class="muted">Nothing has been sent yet. Run an Explain and this will show ' +
        'exactly what left your machine — the task, scope, file, size, and full prompt.</p>';
    } else {
      const rows = [
        ['Task', esc(p.task)],
        ['Privacy scope', esc(p.privacyScope)],
        ['File', p.filePath ? esc(p.filePath) : '—'],
        ['Size', p.byteSize != null ? `${p.byteSize} bytes${p.truncated ? ' (truncated)' : ''}` : '—'],
      ];
      if (p.delivery) {
        rows.push(['Status', esc(p.delivery)]);
      }
      if (p.channel) {
        rows.push(['Delivery', esc(p.channel)]);
      }
      const included = (p.includedSources || []).length
        ? '<p class="modal-preview-label">Included sources</p><ul>' +
          p.includedSources.map((source) => `<li><code>${esc(source)}</code></li>`).join('') +
          '</ul>'
        : '';
      const redactionBanner = (p.redactions && p.redactions.length)
        ? `<div class="redaction-banner">✓ ${p.redactions.map(esc).join(' · ')}</div>`
        : '<div class="redaction-banner is-clear">No secrets detected — nothing redacted.</div>';
      inner =
        `<dl class="modal-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` +
        included +
        redactionBanner +
        '<p class="modal-preview-label">Prompt preview</p>' +
        `<pre class="modal-preview">${esc(p.promptPreview)}</pre>`;
    }
    return (
      '<div class="modal-backdrop" data-modal-close></div>' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head">' +
      `<span class="modal-shield" aria-hidden="true">${shieldSvg}</span>` +
      '<div><h2 id="modal-title" class="modal-title">Last reviewed prompt</h2>' +
      '<p class="modal-sub">This is the complete prompt from the most recent review gate.</p></div>' +
      '<button class="icon-btn modal-x" data-modal-close aria-label="Close">✕</button>' +
      '</div>' +
      `<div class="modal-body">${inner}</div>` +
      '</div>'
    );
  }

  // Keep Tab focus inside an open modal (WCAG 2.4.3 / 2.4.11).
  function trapFocus(e) {
    const root = document.getElementById('modal-root');
    if (root.hidden || e.key !== 'Tab') {
      return;
    }
    const f = root.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!f.length) {
      return;
    }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('keydown', trapFocus);

  // --- Explain panel --------------------------------------------------------
  function explainContent(state) {
    const a = state.answer;
    let body = '';

    if (a) {
      body += answerBlock(a, state);
    } else if (!state.activeFile) {
      return emptyState(
        'Understand this selection',
        'Explanations are grounded in your real files — every claim links back to the exact line so you can verify it in one click.',
      );
    } else if (state.explanation) {
      body += `<div class="explanation">${esc(state.explanation)}</div>`;
    } else {
      return emptyState(
        'Understand this selection',
        'Highlight code in the editor, then Explain — or ask a question below.',
      );
    }

    body += whatsMissing(state);
    body += diagnostics(state);
    return body;
  }

  function answerBlock(a, state) {
    let body =
      '<div class="answer-head"><span class="answer-kicker">' +
      `<span class="answer-dot" aria-hidden="true"></span>Explanation · ${esc(activeDepth(state))}` +
      '</span></div>';
    if (a.html) {
      body += `<div class="answer">${a.html}</div>`;
    } else if (a.text) {
      body += `<div class="answer">${esc(a.text)}</div>`;
    }
    if (!a.done) {
      body +=
        '<div class="streaming-row"><span class="streaming-dots" aria-hidden="true">' +
        '<span></span><span></span><span></span></span>' +
        '<span class="muted">Claude is answering…</span>' +
        '<button type="button" class="btn" data-action="cancel">Stop</button></div>';
    } else if (a.verify) {
      const v = a.verify;
      body += `<p class="check-summary">Limited check: <strong>${v.grounded}</strong> grounded · <strong>${v.unverified}</strong> unverified</p>`;
      body += `<p class="muted">${esc(v.note || 'Unrecognized prose remains unchecked.')}</p>`;
      const claims = v.claims || [];
      const flagged = claims.filter((c) => c.status !== 'grounded');
      if (flagged.length) {
        body += '<ul class="claims">' + flagged.map((c) => claimItem(c, warnBadge)).join('') + '</ul>';
      }
      const sources = dedupeSources(claims.filter((c) => c.status === 'grounded' && c.location));
      if (sources.length) {
        body +=
          '<p class="muted">Jump to source (check it yourself):</p><ul class="claims">' +
          sources.map((c) => `<li>${sourceLink(c.location)}</li>`).join('') +
          '</ul>';
      }
    }
    return body;
  }

  function whatsMissing(state) {
    const gaps = state.contextGaps || [];
    if (!gaps.length) {
      return '';
    }
    const items = gaps.map((g) => `<li>${esc(g)}</li>`).join('');
    return (
      '<section class="card card-warn" aria-label="What is missing from the context">' +
      "<h2>⚠ What's missing</h2>" +
      '<p class="muted">The answer above was built with less than full context. Keep that in mind.</p>' +
      `<ul>${items}</ul></section>`
    );
  }

  // Secondary detail, tucked into a disclosure to keep the surface calm.
  function diagnostics(state) {
    const parts = [];
    // The exact outbound prompt is reviewed in the native pre-send modal and
    // remains available afterward through "Review last prompt."
    const items = state.retrieved || [];
    if (items.length) {
      const rows = items
        .map((r) => `<li><strong>${esc(r.sourceType)}</strong> ${esc(r.path)}<br /><span class="muted">${esc(r.reasonIncluded)}</span></li>`)
        .join('');
      parts.push(card('Retrieved context', `<ul>${rows}</ul>`));
    }
    const links = state.docs || [];
    if (links.length) {
      const rows = links
        .map((l) => `<li><a href="#" data-url="${esc(l.url)}">${esc(l.title)}</a><br /><span class="muted">${esc(l.reason)}</span></li>`)
        .join('');
      parts.push(card('Docs &amp; learning', `<ul class="links">${rows}</ul>`));
    }
    if (!parts.length) {
      return '';
    }
    return (
      '<details class="diagnostics"><summary class="muted">Details — packet, retrieval, docs</summary>' +
      parts.join('') +
      '</details>'
    );
  }

  // --- Facts rail -----------------------------------------------------------
  /**
   * Whether the facts fold is open. Docked in the sidebar the panel is narrow
   * and vertical space is scarce, so the facts start folded and the answer
   * keeps the room; in the wide editor-tab panel they start open. `null` means
   * "not chosen yet" — once the reader toggles it, their choice sticks across
   * re-renders instead of snapping back on the next state update.
   */
  const NARROW_PANEL = 560;
  let factsOpen = null;

  function factsFoldIsOpen() {
    if (factsOpen === null) {
      return window.innerWidth > NARROW_PANEL;
    }
    return factsOpen;
  }

  /** Keep the reader's open/closed choice across re-renders. */
  function rememberFactsFold() {
    const fold = els.facts.querySelector('.facts-fold');
    if (fold) {
      fold.addEventListener('toggle', () => {
        factsOpen = fold.open;
      });
    }
  }

  function factsRail(state) {
    const f = state.facts;
    if (!f) {
      return '';
    }
    let groups = '';
    groups += factGroup('Symbol', `<span class="mono">${esc(f.symbol)}</span>`);
    if (f.kind) {
      groups += factGroup('Kind', f.kindMeaning ? `${esc(f.kind)} — ${esc(f.kindMeaning)}` : esc(f.kind));
    }
    if (f.signature) {
      groups += factGroup('Type / signature', `<span class="mono">${esc(f.signature)}</span>`);
    }
    if (f.plain) {
      groups += factGroup('In plain words', esc(f.plain));
    }
    if (f.definition) {
      groups += factGroup('Defined at', esc(f.definition));
    }
    if (f.callerCount != null) {
      groups += factGroup('Used in', `${f.callerCount} place(s)`);
    }
    if (f.doc) {
      groups += factGroup('Doc comment', esc(f.doc));
    }
    return (
      `<details class="facts-fold"${factsFoldIsOpen() ? ' open' : ''}>` +
      '<summary class="facts-summary">' +
      '<span class="rail-title">Context &amp; facts</span>' +
      `<span class="facts-summary-symbol mono">${esc(f.symbol)}</span>` +
      '</summary>' +
      '<section class="fact-card">' +
      '<div class="fact-card-head"><span class="fact-card-title">Facts</span>' +
      `<span class="fact-symbol mono">${esc(f.symbol)}</span></div>` +
      '<p class="fact-provenance">Pulled from the language server + parser — not the model.</p>' +
      groups +
      '</section>' +
      '</details>'
    );
  }

  function factGroup(label, valueHtml) {
    return (
      '<div class="fact-group">' +
      `<div class="fact-label">${esc(label)}</div>` +
      `<div class="fact-value">${valueHtml}</div></div>`
    );
  }

  // --- Tour panel -----------------------------------------------------------
  function tourContent(state) {
    const t = state.tour;
    if (!t) {
      return emptyState(
        'Codebase tour',
        'A guided, dependency-ordered walk through your project. Deterministic — the graph is real; ask Claude to narrate any step.',
        '<div class="actions"><button class="btn primary" data-command="simpleecode.startTour">Start tour</button></div>',
      );
    }
    const s = t.stop;
    const scope = t.total > t.count ? `top ${t.count} of ${t.total} files` : 'dependency order';

    let head =
      '<div class="tour-head">' +
      '<div class="tour-title-row"><h2 class="panel-title">Codebase tour</h2>' +
      `<span class="tour-step">Step ${t.index + 1} of ${t.count} · ${esc(scope)}</span></div>` +
      '<p class="panel-sub">A guided, dependency-ordered walk through your project. ' +
      'Deterministic — the graph is real; ask Claude to narrate any step.</p>' +
      progressBar(t.index, t.count) +
      '</div>';

    const langTag = s.language ? `<span class="lang-tag">${esc(s.language)}</span>` : '';
    let stepCard =
      '<section class="tour-card">' +
      '<p class="tour-file">' +
      `<a href="#" data-open-source data-path="${esc(s.path)}" data-line="">${esc(s.path)} ↗</a>${langTag}</p>`;
    if (s.summary) {
      stepCard += `<p class="tour-summary">${esc(s.summary)}</p>`;
    }
    stepCard += `<p class="tour-why">${esc(s.reason)}</p>`;
    const rows = [];
    if (s.exposes.length) {
      rows.push(['Exposes', esc(s.exposes.join(', '))]);
    }
    if (s.dependsOn.length) {
      rows.push(['Depends on', esc(s.dependsOn.join(', '))]);
    }
    if (s.dependents.length) {
      rows.push(['Depended on by', esc(s.dependents.join(', '))]);
    }
    if (rows.length) {
      stepCard +=
        '<dl class="tour-graph">' +
        rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${v}</dd>`).join('') +
        '</dl>';
    }
    stepCard += '</section>';

    const controls =
      '<div class="tour-controls">' +
      `<button class="btn" data-command="simpleecode.tourPrev"${t.index === 0 ? ' disabled' : ''}>‹ Previous</button>` +
      `<button class="btn primary" data-command="simpleecode.tourNext"${t.index >= t.count - 1 ? ' disabled' : ''}>Next ›</button>` +
      '<button class="btn" data-command="simpleecode.tourExplain">Explain this step</button>' +
      '<button class="btn ghost tour-end" data-command="simpleecode.endTour">End tour</button>' +
      '</div>' +
      '<p class="tour-hint">← → also step through — every action has a button.</p>';

    const answer = answerWindow(
      state,
      'Press “Explain this step” to see a grounded explanation of this file here.',
    );

    return head + stepCard + controls + answer;
  }

  function progressBar(index, count) {
    let segs = '';
    for (let i = 0; i < count; i++) {
      segs += `<span class="prog-seg${i <= index ? ' is-done' : ''}"></span>`;
    }
    return (
      `<div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${count}" ` +
      `aria-valuenow="${index + 1}" aria-label="Tour progress">${segs}</div>`
    );
  }

  // --- Check panel ----------------------------------------------------------
  function renderCheck(result) {
    if (!els.checkResults) {
      return;
    }
    if (!result || !result.claims || result.claims.length === 0) {
      const note = result && result.note
        ? esc(result.note)
        : 'No checkable claims were detected. The prose remains unchecked.';
      els.checkResults.innerHTML = `<p class="muted">${note}</p>`;
      return;
    }
    const summary =
      `<p class="check-summary">Limited check: <strong>${result.grounded}</strong> grounded · ` +
      `<strong>${result.unverified}</strong> unverified</p>`;
    const items = result.claims
      .map((c) => claimItem(c, c.status === 'grounded' ? okBadge : warnBadge))
      .join('');
    els.checkResults.innerHTML = `${summary}<p class="muted">${esc(result.note)}</p><ul class="claims">${items}</ul>`;
  }

  // --- Shared helpers -------------------------------------------------------
  const okBadge = '<span class="badge ok" aria-label="grounded">✓</span>';
  const warnBadge = '<span class="badge warn" aria-label="unverified">⚠</span>';

  function claimItem(c, badge) {
    const src = c.location ? `<div class="claim-src">${sourceLink(c.location)}</div>` : '';
    return (
      '<li class="claim-row">' +
      badge +
      '<div class="claim-body">' +
      `<div class="claim-main"><strong>${esc(c.kind)}</strong> <code>${esc(c.text)}</code></div>` +
      `<div class="claim-note">${esc(c.note)}</div>` +
      src +
      '</div></li>'
    );
  }

  function sourceLink(loc) {
    const label = loc.line ? `${esc(loc.path)}:${loc.line}` : esc(loc.path);
    return (
      `<a href="#" data-open-source data-path="${esc(loc.path)}" data-line="${loc.line || ''}">↗ ${label}</a>`
    );
  }

  function dedupeSources(claims) {
    const seen = new Set();
    const out = [];
    for (const c of claims) {
      const key = `${c.location.path}:${c.location.line || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }

  function emptyState(title, sub, extra) {
    return (
      '<div class="empty-state">' +
      '<span class="empty-glyph" aria-hidden="true">' +
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="6.25" stroke="currentColor" stroke-width="1.6" />' +
      '<circle cx="10" cy="10" r="2.4" fill="currentColor" />' +
      '<line x1="14.8" y1="14.8" x2="20" y2="20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />' +
      '</svg></span>' +
      `<h2>${esc(title)}</h2><p>${esc(sub)}</p>${extra || ''}</div>`
    );
  }

  function card(title, inner) {
    return `<section class="card"><h2>${title}</h2>${inner}</section>`;
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Restore last tab, then ask for fresh state.
  selectTab(activeTab, false);
  vscode.postMessage({ type: 'ready' });
})();
