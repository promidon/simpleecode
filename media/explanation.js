// Shared prepared-workspace controller. The extension host owns all requests.
window.createExplanationView = function (vscode, selectTab, renderAnswer) {
  const $ = id => document.getElementById(id);
  const workspace = $('explain-workspace');
  const inspector = $('explanation-inspector');
  const presentation = vscode.getState()?.explanationPresentation;
  let restored = false;
  let state, inspected, returnFocus, returnScroll = 0, timer, sourceKey, optionsKey, editing = false, lastTurnCount = 0;
  const goalInput = () => document.querySelector('input[name="explanation-goal"]:checked');
  const setGoal = value => { const radio = document.querySelector(`input[name="explanation-goal"][value="${value}"]`); if (radio) { radio.checked = true; } };
  const LANGUAGES = { swift: 'Swift', typescript: 'TypeScript', typescriptreact: 'TypeScript', javascript: 'JavaScript', javascriptreact: 'JavaScript', python: 'Python', go: 'Go', rust: 'Rust', java: 'Java', ruby: 'Ruby' };
  function savePresentation() {
    if (!restored) { return; }
    vscode.setState({ ...vscode.getState(), explanationPresentation: {
      session: state?.draft?.session, scroll: inspector.hidden ? workspace.scrollTop : returnScroll,
      codeOpen: $('captured-details').open,
    } });
  }
  workspace.addEventListener('scroll', savePresentation, { passive: true });
  $('captured-details').addEventListener('toggle', savePresentation);
  const descriptions = {
    understand: 'Learn its purpose, steps, inputs, and result.',
    connections: 'Follow the relationships supported by your permitted context.',
    investigate: 'Compare observations, possible causes, and checks you can try.',
  };
  const post = message => vscode.postMessage({ type: 'explanation', message });
  // Plain-language wording for raw ids; scope labels come from the host.
  const STATUS = { sending: 'Sending…', streaming: 'Answering…', done: 'Answered', cancelled: 'Stopped', failed: 'Failed', 'handed-off': 'Handed off to your chat' };
  let scopeLabels = {};
  const scopeLabel = scope => scopeLabels[scope] || String(scope).replaceAll('_', ' ');
  const text = (id, value) => { if ($(id).textContent !== value) { $(id).textContent = value; } };
  function options() {
    return { goal: goalInput()?.value || 'understand', question: $('explanation-question').value, guidance: $('explanation-guidance').value };
  }
  function valid() {
    const invalid = options().guidance.length > 2000;
    $('guidance-error').hidden = !invalid;
    $('explanation-guidance').setAttribute('aria-invalid', String(invalid));
    return !invalid;
  }
  function edit() {
    clearTimeout(timer);
    $('explanation-send').disabled = true; $('inspect-prepared').disabled = true;
    if (valid()) { timer = setTimeout(() => { timer = undefined; post({ action: 'options', options: options() }); }, 250); }
  }
  ['explanation-goal', 'explanation-question', 'explanation-guidance'].forEach(id => $(id).addEventListener('input', edit));
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-explanation]');
    if (target) {
      clearTimeout(timer); timer = undefined;
      if (target.closest('#source-menu')) { $('source-menu').open = false; $('source-menu').querySelector('summary').focus(); }
      if (target.dataset.explanation === 'new') { editing = false; }
      post({ action: target.dataset.explanation });
    }
    const pill = event.target.closest('[data-guidance]');
    if (pill) {
      const field = $('explanation-guidance');
      field.value = field.value.trim() ? field.value.trim().replace(/[.;]?$/, '. ') + pill.dataset.guidance : pill.dataset.guidance;
      edit();
    }
  });
  $('source-menu').addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('source-menu').open) { event.stopPropagation(); $('source-menu').open = false; $('source-menu').querySelector('summary').focus(); }
  });
  $('setup-edit').addEventListener('click', () => {
    editing = !editing;
    if (state) { renderSetup(); }
    if (editing) { goalInput()?.focus(); }
  });
  $('save-guidance').addEventListener('click', () => { if (valid()) { post({ action: 'saveGuidance', text: options().guidance }); } });
  $('confirm-guidance').addEventListener('click', () => post({ action: 'saveGuidance', text: state.pendingGuidance, confirmed: true }));
  $('explanation-send').addEventListener('click', () => {
    if (!valid() || !state.prepared) { return; }
    $('explanation-send').disabled = true;
    post({ action: state.prepared.delivery === 'agent' ? 'send' : 'handoff', revision: state.prepared.draft.revision });
  });
  $('followup-form').addEventListener('submit', event => {
    event.preventDefault();
    const question = $('followup-question').value.trim();
    if (question) { post({ action: 'followup', question, nextAction: 'send' }); }
  });
  $('review-followup').addEventListener('click', () => {
    const question = $('followup-question').value.trim();
    if (question) { post({ action: 'followup', question, nextAction: 'review' }); }
  });
  $('inspect-prepared').addEventListener('click', inspectPrepared);
  $('inspector-back').addEventListener('click', closeInspector);
  $('inspector-copy').addEventListener('click', () => {
    // Historical inspection copies the frozen displayed text, not a newer draft.
    if (inspected && inspected.current) { post({ action: 'copy', revision: inspected.request.draft.revision }); }
    else if (inspected) { post({ action: 'copyTurn', turnId: inspected.id }); }
  });
  $('inspector-send').addEventListener('click', () => {
    if (!inspected || !inspected.current || state.prepared !== inspected.request) { return; }
    post({ action: inspected.request.delivery === 'agent' ? 'send' : 'handoff', revision: inspected.request.draft.revision, approved: true });
    closeInspector();
  });
  function closeInspector() {
    inspector.hidden = true; workspace.hidden = false; inspected = undefined;
    workspace.scrollTop = returnScroll;
    if (returnFocus && returnFocus.isConnected) { returnFocus.focus({ preventScroll: true }); }
  }
  function inspectPrepared() {
    if (state && state.prepared) { openInspector({ current: true, request: state.prepared }); }
  }
  function openInspector(item) {
    if (inspector.hidden) { returnFocus = document.activeElement; returnScroll = workspace.scrollTop; }
    inspected = item; selectTab('explain', false);
    workspace.hidden = true; inspector.hidden = false;
    const p = item.request, e = p.envelope;
    text('inspector-title', item.current ? 'What will be sent' : 'What was sent / handed off');
    text('inspector-summary', [
      item.current ? 'Prepared — not sent.' : 'Status: ' + (STATUS[item.status] || item.status),
      e.channel, 'Scope: ' + scopeLabel(e.privacyScope), 'Complete prompt: ' + e.totalBytes + ' bytes',
      'Sources: ' + e.includedSources.join(', '),
      e.redactions.length ? e.redactions.join('\n') : 'No redactions reported. Detection is not a guarantee that all sensitive text was removed.',
      e.truncated ? 'Some source content was truncated.' : '',
      ...p.gaps,
    ].filter(Boolean).join('\n'));
    text('inspector-prompt', e.prompt);
    text('inspector-status', '');
    $('complete-prompt').open = false;
    $('inspector-send').hidden = !(item.current && state.phase === 'reviewing');
    text('inspector-send', p.delivery === 'agent' ? 'Approve and send' : 'Approve external handoff');
    const history = $('inspector-history'); history.replaceChildren();
    const earlier = state.turns.filter(t => p.retainedTurnIds?.includes(t.id));
    if (earlier.length) {
      const note = document.createElement('p');
      note.textContent = 'These earlier turns were retained in the agent conversation for this request. They are not part of the current prompt text shown above.';
      history.append(note);
      earlier.forEach(t => {
        const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
        summary.textContent = 'Earlier request · ' + (STATUS[t.status] || t.status);
        pre.textContent = t.request.envelope.prompt + '\n\nAgent response (not verified evidence):\n' + t.text;
        details.append(summary, pre); history.append(details);
      });
    }
    $('inspector-back').focus({ preventScroll: true });
  }
  /** Is a request on screen (sending, printing, or answered)? Failed/stopped reopens setup for Retry. */
  function answering() {
    const last = state.turns.at(-1);
    return Boolean(last) && ['sending', 'streaming', 'done'].includes(state.phase) && last.status !== 'failed' && last.status !== 'cancelled';
  }
  /** As soon as you press Explain, setup folds into a one-line bar pinned at the top; Edit reopens it. */
  function renderSetup() {
    const answered = answering();
    const collapsed = answered && !editing;
    $('setup-card').hidden = collapsed;
    $('setup-summary').hidden = !answered;
    $('explain-pinned').classList.toggle('is-pinned', collapsed);
    $('setup-edit').setAttribute('aria-expanded', String(!collapsed));
    text('setup-edit', collapsed ? 'Edit' : 'Done');
    const o = options(), source = state.draft?.source;
    const lines = source ? (source.focus === 'selection' ? ` ${source.startLine}–${source.endLine}` : ' (whole file)') : '';
    text('setup-summary-text', [goalInput()?.nextElementSibling?.textContent, o.guidance.trim() || 'No guidance', source ? source.label + lines : ''].filter(Boolean).join(' · '));
    const reason = answered && editing && state.phase === 'done' ? 'Change the goal, question, or guidance to explain again, or ask a follow-up below.' : '';
    $('send-reason').hidden = !reason;
    text('send-reason', reason);
  }
  /**
   * Chat scrolling: a new answer starts just under the pinned bars and grows downward, so you
   * read from its first line. The newest turn gets a viewport-high minimum so it can sit at the top.
   */
  function newestTurn() { return $('explain-content').lastElementChild; }
  /** How much of the scroller's top the pinned bars cover, measured rather than derived from CSS. */
  function pinnedCover() {
    return $('explain-pinned').getBoundingClientRect().bottom - workspace.getBoundingClientRect().top;
  }
  function sizeNewestTurn() {
    const turn = newestTurn();
    for (const article of $('explain-content').children) { if (article !== turn) { article.style.minHeight = ''; } }
    if (turn) { turn.style.minHeight = Math.max(0, workspace.clientHeight - pinnedCover() - 24) + 'px'; }
  }
  function showNewestTurn() {
    const turn = newestTurn();
    if (!turn) { return; }
    sizeNewestTurn();
    workspace.scrollTop += turn.getBoundingClientRect().top - workspace.getBoundingClientRect().top - pinnedCover() - 8;
  }
  /** "↓ Latest" when the newest answer's text continues below the visible area. */
  function updateLatest() {
    const body = newestTurn()?.querySelector('.turn-answer');
    const below = body ? body.getBoundingClientRect().bottom - workspace.getBoundingClientRect().bottom : 0;
    $('jump-latest').hidden = !(below > 16) || !inspector.hidden;
  }
  $('jump-latest').addEventListener('click', () => {
    const body = newestTurn()?.querySelector('.turn-answer');
    if (!body) { return; }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('vscode-reduce-motion');
    const top = workspace.scrollTop + body.getBoundingClientRect().bottom - workspace.getBoundingClientRect().bottom + 24;
    workspace.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  });
  workspace.addEventListener('scroll', updateLatest, { passive: true });
  if ('ResizeObserver' in window) { new ResizeObserver(() => { sizeNewestTurn(); updateLatest(); }).observe(workspace); }

  window.addEventListener('message', event => {
    if (event.data?.type === 'explanationError') { text('explanation-notice', event.data.error); }
  });
  return {
    inspectPrepared,
    render(snapshot) {
      state = snapshot.experience;
      scopeLabels = snapshot.labels?.scopes || {};
      if (!state) { return; }
      const d = state.draft, p = state.prepared;
      const nextSourceKey = d ? d.source.uri + ':' + d.source.version + ':' + d.session : '';
      if (sourceKey !== nextSourceKey) {
        sourceKey = nextSourceKey;
        if (d && (restored || presentation?.session !== d.session)) { selectTab('explain', false); }
      }
      const nextOptionsKey = d ? JSON.stringify(d.options) : '';
      if (nextOptionsKey !== optionsKey && !timer) {
        optionsKey = nextOptionsKey;
        const value = d?.options || { goal: 'understand', question: '', guidance: state.savedGuidance || '' };
        if (!$('explanation-goal').contains(document.activeElement)) { setGoal(value.goal); }
        for (const [key, id] of [['question', 'explanation-question'], ['guidance', 'explanation-guidance']]) {
          if (document.activeElement !== $(id)) { $(id).value = value[key]; }
        }
      }
      text('goal-description', descriptions[options().goal]);
      const language = LANGUAGES[snapshot.languageId];
      $('guidance-language').hidden = !language;
      if (language) { $('guidance-language').dataset.guidance = `I’m new to ${language}`; text('guidance-language', `New to ${language}`); }
      text('captured-code', snapshot.selection?.selectedText || 'Choose code in your editor.');
      $('source-change').hidden = !state.sourceChanged;
      text('guidance-notice', state.guidanceNotice || '');
      $('save-guidance').textContent = state.savedGuidance ? 'Update my saved default' : 'Save as my default';
      $('remove-guidance').hidden = !state.savedGuidance;
      $('guidance-confirmation').hidden = state.pendingGuidance === undefined;
      text('safe-guidance', state.pendingGuidance || '');
      const sources = p ? p.envelope.includedSources.length : 0;
      text('sharing-summary', p
        ? [p.envelope.channel, scopeLabel(p.envelope.privacyScope), sources + (sources === 1 ? ' source' : ' sources'), p.envelope.redactions.length ? 'sensitive lines hidden' : ''].filter(Boolean).join(' · ')
        : state.phase === 'preparing' ? 'Preparing permitted context locally…' : 'Choose code in your editor to prepare an explanation.');
      const notes = p ? [...p.gaps, ...p.envelope.redactions] : [];
      text('preparation-gaps', notes.join('\n'));
      $('gaps-details').hidden = !notes.length;
      text('gaps-summary', notes.length === 1 ? '1 note about what the answer can see' : notes.length + ' notes about what the answer can see');
      $('context-settings').hidden = !p?.gaps.some(gap => gap.includes('privacy scope'));
      text('explanation-notice', state.error || state.notice || '');
      const copyNotice = state.notice || state.guidanceNotice || '';
      if (/copied/i.test(copyNotice)) { text('inspector-status', copyNotice); }
      const busy = ['preparing', 'sending', 'streaming'].includes(state.phase);
      // The composer's Stop covers a printing answer; this one covers preparing.
      const printing = ['sending', 'streaming'].includes(state.phase);
      $('explanation-stop').hidden = state.phase !== 'preparing';
      $('composer-stop').hidden = !printing;
      $('followup-send').hidden = printing;
      $('followup-question').disabled = printing;
      $('followup-question').placeholder = printing ? 'Ask a follow-up when this finishes' : '';
      const matches = d && JSON.stringify(options()) === JSON.stringify(d.options);
      $('explanation-send').disabled = !p || busy || !valid() || !matches || !!timer || state.phase === 'done';
      $('inspect-prepared').disabled = !p || !!timer || !matches;
      text('explanation-send', p?.delivery === 'clipboard' ? 'Copy prompt and open chat' : p?.delivery === 'command' ? 'Request external handoff' : state.phase === 'failed' || state.phase === 'cancelled' ? 'Retry explanation' : 'Explain');
      if (inspected?.current && inspected.request.draft.revision !== p?.draft.revision) { closeInspector(); }
      if (state.phase === 'reviewing' && (inspector.hidden || inspected?.request.draft.revision !== p?.draft.revision)) { inspectPrepared(); }
      if (inspected?.current && p) { inspected.request = p; $('inspector-send').hidden = state.phase !== 'reviewing'; }
      text('local-explanation', p?.localExplanation ? 'Local code explanation\n\n' + p.localExplanation : '');
      $('local-explanation-details').hidden = !p?.localExplanation;
      const answers = $('explain-content');
      const ids = new Set(state.turns.map(t => String(t.id)));
      Array.from(answers.children).forEach(el => { if (!ids.has(el.dataset.turn)) { el.remove(); } });
      state.turns.forEach(turn => {
        let article = answers.querySelector('[data-turn="' + turn.id + '"]');
        if (!article) {
          article = document.createElement('article'); article.dataset.turn = String(turn.id);
          const heading = document.createElement('h2'), button = document.createElement('button'), body = document.createElement('div'), status = document.createElement('p');
          heading.textContent = turn.goalLabel + ' · ' + turn.request.draft.source.label;
          heading.className = 'turn-title';
          button.className = 'link-btn'; button.textContent = 'What was sent'; button.addEventListener('click', () => openInspector(state.turns.find(t => t.id === turn.id)));
          body.className = 'turn-answer'; status.className = 'turn-status';
          const meta = document.createElement('div'); meta.className = 'turn-meta'; meta.append(status, button);
          article.append(heading, meta, body); answers.append(article);
        }
        const body = article.querySelector('.turn-answer'), html = renderAnswer(turn, snapshot);
        if (body.dataset.rendered !== html) { body.innerHTML = html; body.dataset.rendered = html; }
        article.querySelector('.turn-status').textContent = turn.detail || STATUS[turn.status] || turn.status;
      });
      // Chat composer: shown once this explanation has a turn; disabled with Stop while printing.
      // Depends only on turns: hiding it even for one render would drop focus from Stop.
      $('followup-form').hidden = !state.turns.length || (d !== undefined && !state.turns.some(t => t.session === d.session));
      const newTurn = state.turns.length > lastTurnCount;
      if (newTurn) {
        editing = false;
        // Facts fold away with setup; dashboard.js records the choice from the toggle event.
        const facts = $('facts-rail').querySelector('details');
        if (facts && facts.open) { facts.open = false; facts.dispatchEvent(new Event('toggle')); }
      }
      lastTurnCount = state.turns.length;
      renderSetup();
      if (newTurn && restored) { showNewestTurn(); }
      updateLatest();
      if (!restored) {
        if (presentation && d && presentation.session === d.session) {
          $('captured-details').open = !!presentation.codeOpen;
          workspace.scrollTop = Math.max(0, Number(presentation.scroll) || 0);
        }
        restored = true;
      }
    },
  };
};
