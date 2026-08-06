(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  root.classList.add('js');

  function readTheme() {
    try {
      return window.localStorage.getItem('simpleecode-theme');
    } catch {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem('simpleecode-theme', theme);
    } catch {
      // The theme still changes for this page when storage is unavailable.
    }
  }

  const savedTheme = readTheme();
  const initialTheme = savedTheme === 'light' ? 'light' : 'dark';

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.dataset.theme = isDark ? 'dark' : 'light';
    themeButton?.setAttribute('aria-pressed', String(isDark));
    themeButton?.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    if (themeColor) themeColor.content = isDark ? '#0e110f' : '#f6f4ef';
  }

  applyTheme(initialTheme);

  themeButton?.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    saveTheme(nextTheme);
    applyTheme(nextTheme);
  });

  const productDemoButtons = [...document.querySelectorAll('[data-product-demo]')];
  const productDemoPanels = [...document.querySelectorAll('[data-product-panel]')];

  function openProductDemo(button) {
    for (const button of productDemoButtons) button.setAttribute('aria-expanded', 'false');
    for (const panel of productDemoPanels) panel.hidden = true;

    const panel = productDemoPanels.find((item) => item.dataset.productPanel === button.dataset.productDemo);
    if (!panel) return;
    button.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }

  for (const button of productDemoButtons) {
    button.addEventListener('click', () => {
      openProductDemo(button);
    });
  }

  if (productDemoButtons[0]) openProductDemo(productDemoButtons[0]);

  const tourStops = [
    {
      name: 'package.json',
      description: 'The project commands, extension metadata, and release setup.',
    },
    {
      name: 'src/extension.ts',
      description: 'The entry point that registers commands and opens the SimpleeCode dashboard.',
    },
    {
      name: 'src/indexing/FileIndex.ts',
      description: 'The local index that finds useful project files and keeps their facts current.',
    },
    {
      name: 'src/rag/verifyAnswer.ts',
      description: 'The checker that compares file and symbol claims with the indexed source.',
    },
  ];
  const tourNextButton = document.querySelector('[data-tour-next]');
  const tourNextLabel = document.querySelector('[data-tour-next-label]');
  const tourNextIcon = document.querySelector('[data-tour-next-icon]');
  const tourPosition = document.querySelector('[data-tour-position]');
  const tourFileName = document.querySelector('[data-tour-file-name]');
  const tourFileDescription = document.querySelector('[data-tour-file-description]');
  const tourPathSteps = [...document.querySelectorAll('[data-tour-step]')];
  let activeTourStop = 1;

  function renderTourStop() {
    const stop = tourStops[activeTourStop];
    if (!stop) return;
    if (tourPosition) tourPosition.textContent = `${activeTourStop + 1} of ${tourStops.length} files`;
    if (tourFileName) tourFileName.textContent = stop.name;
    if (tourFileDescription) tourFileDescription.textContent = stop.description;
    if (tourNextLabel) tourNextLabel.textContent = activeTourStop === tourStops.length - 1 ? 'Restart tour' : 'Next file';
    if (tourNextIcon) tourNextIcon.textContent = activeTourStop === tourStops.length - 1 ? '↻' : '→';
    tourPathSteps.forEach((step, index) => {
      step.classList.toggle('done', index < activeTourStop);
      step.classList.toggle('active', index === activeTourStop);
      step.textContent = index < activeTourStop ? '✓' : String(index + 1);
    });
  }

  tourNextButton?.addEventListener('click', () => {
    activeTourStop = (activeTourStop + 1) % tourStops.length;
    renderTourStop();
  });

  const explainDemoButton = document.querySelector('[data-explain-demo]');
  const explainDemoLabel = document.querySelector('[data-explain-label]');
  const selectionExplanation = document.querySelector('[data-selection-explanation]');

  function setSelectionExplanationOpen(isOpen) {
    if (!explainDemoButton || !selectionExplanation) return;
    explainDemoButton.setAttribute('aria-expanded', String(isOpen));
    if (explainDemoLabel) explainDemoLabel.textContent = isOpen ? 'Hide explanation' : 'Explain selection';
    selectionExplanation.hidden = !isOpen;
  }

  explainDemoButton?.addEventListener('click', () => {
    if (!selectionExplanation) return;
    const isOpen = explainDemoButton.getAttribute('aria-expanded') === 'true';
    setSelectionExplanationOpen(!isOpen);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || selectionExplanation?.hidden !== false) return;
    setSelectionExplanationOpen(false);
    explainDemoButton?.focus();
  });

  const reveals = [...document.querySelectorAll('[data-reveal]')];
  if ('IntersectionObserver' in window && !motionQuery.matches) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    for (const item of reveals) revealObserver.observe(item);
  } else {
    for (const item of reveals) item.classList.add('is-visible');
  }

  const header = document.querySelector('[data-site-header]');
  let scrollFrame = 0;
  function updateScrollState() {
    const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
    root.style.setProperty('--page-progress', progress.toFixed(4));
    header?.classList.toggle('is-scrolled', window.scrollY > 12);
    scrollFrame = 0;
  }

  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateScrollState);
  }, { passive: true });
  updateScrollState();

  const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (precisePointer.matches && !motionQuery.matches) {
    for (const card of document.querySelectorAll('.tilt')) {
      card.addEventListener('pointermove', (event) => {
        const bounds = card.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        card.style.setProperty('--tilt-x', `${(-y * 2.4).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * 3).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    }
  }
})();
