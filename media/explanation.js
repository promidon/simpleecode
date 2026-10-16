// Shared prepared-workspace controller. The extension host owns all requests.
window.createExplanationView = function (vscode, selectTab, renderAnswer) {
  const $ = id => document.getElementById(id);
  const workspace = $('explain-workspace');
  const inspector = $('explanation-inspector');
  const presentation = vscode.getState()?.explanationPresentation;
  let restored = false;
  let state, inspected, returnFocus, returnScroll = 0, timer, sourceKey, optionsKey;
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
  const text = (id, value) => { if ($(id).textContent !== value) { $(id).textContent = value; } };
  function options() {
    return { goal: $('explanation-goal').value, question: $('explanation-question').value, guidance: $('explanation-guidance').value };
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
    if (target) { clearTimeout(timer); timer = undefined; post({ action: target.dataset.explanation }); }
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
      item.current ? 'Prepared — not sent.' : 'Status: ' + item.status,
      e.channel, 'Scope: ' + e.privacyScope.replaceAll('_', ' '), 'Complete prompt: ' + e.totalBytes + ' bytes',
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
        summary.textContent = 'Earlier request ' + t.id + ' · ' + t.status;
        pre.textContent = t.request.envelope.prompt + '\n\nAgent response (not verified evidence):\n' + t.text;
        details.append(summary, pre); history.append(details);
      });
    }
    $('inspector-back').focus({ preventScroll: true });
  }
  window.addEventListener('message', event => {
    if (event.data?.type === 'explanationError') { text('explanation-notice', event.data.error); }
  });
  return {
    inspectPrepared,
    render(snapshot) {
      state = snapshot.experience;
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
        for (const [key, id] of [['goal', 'explanation-goal'], ['question', 'explanation-question'], ['guidance', 'explanation-guidance']]) {
          if (document.activeElement !== $(id)) { $(id).value = value[key]; }
        }
      }
      text('goal-description', descriptions[$('explanation-goal').value]);
      text('captured-code', snapshot.selection?.selectedText || 'Choose code in your editor.');
      $('source-change').hidden = !state.sourceChanged;
      text('guidance-notice', state.guidanceNotice || '');
      $('save-guidance').textContent = state.savedGuidance ? 'Update my saved default' : 'Save as my default';
      $('remove-guidance').hidden = !state.savedGuidance;
      $('guidance-confirmation').hidden = state.pendingGuidance === undefined;
      text('safe-guidance', state.pendingGuidance || '');
      text('sharing-summary', p ? 'Destination: ' + p.envelope.channel + '. Context: ' + p.envelope.privacyScope.replaceAll('_', ' ') + '. ' + p.envelope.includedSources.length + ' source(s).' : state.phase === 'preparing' ? 'Preparing permitted context locally…' : 'Choose code to prepare an explanation.');
      text('preparation-gaps', p ? [...p.gaps, ...p.envelope.redactions].join('\n') : '');
      $('context-settings').hidden = !p?.gaps.some(gap => gap.includes('privacy scope'));
      text('explanation-notice', state.error || state.notice || '');
      const copyNotice = state.notice || state.guidanceNotice || '';
      if (/copied/i.test(copyNotice)) { text('inspector-status', copyNotice); }
      const busy = ['preparing', 'sending', 'streaming'].includes(state.phase);
      $('explanation-stop').hidden = !busy;
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
          const heading = document.createElement('h2'), button = document.createElement('button'), body = document.createElement('div'), status = document.createElement('p'), stop = document.createElement('button');
          heading.textContent = turn.goalLabel + ' · ' + turn.request.draft.source.label;
          button.className = 'btn'; button.textContent = 'What was sent'; button.addEventListener('click', () => openInspector(state.turns.find(t => t.id === turn.id)));
          body.className = 'turn-answer'; status.className = 'turn-status muted';
          // Stop lives outside the streamed markup so it keeps focus while text arrives.
          stop.className = 'btn turn-stop'; stop.textContent = 'Stop'; stop.dataset.explanation = 'cancel';
          article.append(heading, button, status, body, stop); answers.append(article);
        }
        const body = article.querySelector('.turn-answer'), html = renderAnswer(turn, snapshot);
        if (body.dataset.rendered !== html) { body.innerHTML = html; body.dataset.rendered = html; }
        article.querySelector('.turn-status').textContent = turn.detail || turn.status;
        article.querySelector('.turn-stop').hidden = !['sending', 'streaming'].includes(turn.status);
      });
      $('followup-form').hidden = busy || !state.turns.some(t => t.session === d?.session && t.status === 'done') || !p;
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
