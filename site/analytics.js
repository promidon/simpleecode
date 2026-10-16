(() => {
  const MEASUREMENT_ID = 'G-FKERY938G2';
  const CONSENT_KEY = 'simpleecode-analytics-consent-v1';
  const CONSENT_LIFETIME_SECONDS = 180 * 24 * 60 * 60;
  const CAMPAIGN_VALUE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,63}$/;
  const SCROLL_THRESHOLDS = [25, 50, 75, 90];
  const ALLOWED_CTA_NAMES = new Set([
    'download_vsix',
    'view_source',
    'read_privacy_model',
    'read_changelog',
    'demo_tour',
    'demo_explain',
    'demo_check',
    'tour_next',
    'explain_selection',
  ]);
  const ALLOWED_PLACEMENTS = new Set([
    'hero',
    'product',
    'privacy',
    'install',
    'closing',
    'footer',
    'not_found',
  ]);
  const ALLOWED_DEMOS = new Set(['tour', 'explain', 'check']);

  const pageKind = document.body.dataset.analyticsPage;
  const consentPanel = document.querySelector('[data-analytics-consent]');
  const consentHeading = document.querySelector('#analytics-consent-title');
  const consentCurrent = document.querySelector('[data-analytics-current]');
  const consentAnnouncement = document.querySelector('[data-analytics-announcement]');
  const settingsButton = document.querySelector('[data-analytics-settings]');
  const allowButton = document.querySelector('[data-analytics-allow]');
  const denyButton = document.querySelector('[data-analytics-deny]');
  const closeButton = document.querySelector('[data-analytics-close]');
  const brandLink = document.querySelector('.site-header .brand');
  const consentSize = 'ResizeObserver' in window ? new ResizeObserver(reserveConsentSpace) : null;

  let currentConsent = null;
  let analyticsInitialized = false;
  let interactionsBound = false;
  let panelOpenedManually = false;
  let meaningfulEngagementSent = false;
  let visibleSeconds = 0;
  let visibleTimer = 0;
  let installObserver = null;
  let installTimer = 0;
  let installSectionViewed = false;
  let scrollListening = false;
  const handledScrollThresholds = new Set();
  const startedDemos = new Set();

  function readStoredConsent() {
    try {
      const raw = window.localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !['granted', 'denied'].includes(value.choice) || !Number.isFinite(value.expiresAt)) {
        window.localStorage.removeItem(CONSENT_KEY);
        return null;
      }
      if (value.expiresAt <= Date.now()) {
        window.localStorage.removeItem(CONSENT_KEY);
        return null;
      }
      return value.choice;
    } catch {
      return null;
    }
  }

  function storeConsent(choice) {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify({
        choice,
        expiresAt: Date.now() + CONSENT_LIFETIME_SECONDS * 1_000,
      }));
    } catch {
      // The choice still applies to this page when storage is unavailable.
    }
  }

  function sanitizedUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return `${url.origin}${url.pathname}`;
    } catch {
      return '';
    }
  }

  function campaignParameters() {
    const query = new URLSearchParams(window.location.search);
    const campaign = {};
    const mappings = [
      ['utm_source', 'campaign_source'],
      ['utm_medium', 'campaign_medium'],
      ['utm_campaign', 'campaign_name'],
    ];
    for (const [queryName, fieldName] of mappings) {
      const value = query.get(queryName);
      if (value && CAMPAIGN_VALUE.test(value)) campaign[fieldName] = value;
    }
    return campaign;
  }

  function analyticsAllowed() {
    return currentConsent === 'granted' && analyticsInitialized;
  }

  function googleTag() {
    window.dataLayer.push(arguments);
  }

  function setConsent(command, analyticsStorage) {
    googleTag('consent', command, {
      analytics_storage: analyticsStorage,
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  function sendEvent(name, parameters = {}) {
    if (!analyticsAllowed()) return;
    googleTag('event', name, parameters);
  }

  function sendMeaningfulEngagement() {
    if (meaningfulEngagementSent || !analyticsAllowed() || pageKind !== 'home') return;
    meaningfulEngagementSent = true;
    sendEvent('meaningful_engagement');
  }

  function startVisibleTimer() {
    window.clearInterval(visibleTimer);
    visibleSeconds = 0;
    visibleTimer = window.setInterval(() => {
      if (!analyticsAllowed() || document.visibilityState !== 'visible') return;
      visibleSeconds += 1;
      if (visibleSeconds < 30) return;
      window.clearInterval(visibleTimer);
      visibleTimer = 0;
      sendMeaningfulEngagement();
    }, 1_000);
  }

  function scrollPercent() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
  }

  function markExistingScrollDepth() {
    const current = scrollPercent();
    for (const threshold of SCROLL_THRESHOLDS) {
      if (threshold <= current) handledScrollThresholds.add(threshold);
    }
  }

  function trackScrollDepth() {
    if (!analyticsAllowed()) return;
    const current = scrollPercent();
    for (const threshold of SCROLL_THRESHOLDS) {
      if (current < threshold || handledScrollThresholds.has(threshold)) continue;
      handledScrollThresholds.add(threshold);
      sendEvent('scroll_depth', { scroll_percent: String(threshold) });
      if (threshold === 50) sendMeaningfulEngagement();
    }
  }

  function startScrollTracking() {
    if (pageKind !== 'home') return;
    markExistingScrollDepth();
    if (!scrollListening) {
      window.addEventListener('scroll', trackScrollDepth, { passive: true });
      scrollListening = true;
    }
  }

  function stopInstallTracking() {
    window.clearTimeout(installTimer);
    installTimer = 0;
    installObserver?.disconnect();
    installObserver = null;
  }

  function startInstallTracking() {
    if (pageKind !== 'home' || installSectionViewed || !('IntersectionObserver' in window)) return;
    const installSection = document.querySelector('#install');
    if (!installSection) return;
    stopInstallTracking();
    installObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry || !entry.isIntersecting || entry.intersectionRatio < 0.5) {
        window.clearTimeout(installTimer);
        installTimer = 0;
        return;
      }
      if (installTimer) return;
      installTimer = window.setTimeout(() => {
        installTimer = 0;
        if (!analyticsAllowed() || installSectionViewed) return;
        installSectionViewed = true;
        sendEvent('install_section_view', { placement: 'install' });
        sendMeaningfulEngagement();
        stopInstallTracking();
      }, 1_000);
    }, { threshold: [0.5] });
    installObserver.observe(installSection);
  }

  function trackDemoStart(demoType) {
    if (!ALLOWED_DEMOS.has(demoType) || startedDemos.has(demoType)) return;
    startedDemos.add(demoType);
    sendEvent('demo_start', { demo_type: demoType, placement: 'product' });
    sendMeaningfulEngagement();
  }

  function bindInteractions() {
    if (interactionsBound) return;
    interactionsBound = true;
    for (const element of document.querySelectorAll('[data-analytics-cta]')) {
      element.addEventListener('click', () => {
        if (!analyticsAllowed()) return;
        const ctaName = element.dataset.analyticsCta;
        const placement = element.dataset.analyticsPlacement;
        if (!ALLOWED_CTA_NAMES.has(ctaName) || !ALLOWED_PLACEMENTS.has(placement)) return;
        sendEvent('cta_click', { cta_name: ctaName, placement });
        const demoType = element.dataset.analyticsDemo;
        if (demoType) trackDemoStart(demoType);
        if (ctaName === 'download_vsix') {
          sendEvent('file_download', { cta_name: ctaName, placement });
          sendMeaningfulEngagement();
        }
      });
    }
  }

  function startMeasurement() {
    bindInteractions();
    startVisibleTimer();
    startScrollTracking();
    startInstallTracking();
  }

  function stopMeasurement() {
    window.clearInterval(visibleTimer);
    visibleTimer = 0;
    visibleSeconds = 0;
    stopInstallTracking();
  }

  function clearAnalyticsCookies() {
    const cookieNames = document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0].trim())
      .filter((name) => name === '_ga' || name.startsWith('_ga_'));
    const domains = ['', window.location.hostname, `.${window.location.hostname}`];
    for (const name of cookieNames) {
      for (const domain of domains) {
        const domainPart = domain ? `; Domain=${domain}` : '';
        document.cookie = `${name}=; Max-Age=0; Path=/${domainPart}; SameSite=Lax; Secure`;
      }
    }
  }

  function initializeAnalytics() {
    window[`ga-disable-${MEASUREMENT_ID}`] = false;
    if (analyticsInitialized) {
      setConsent('update', 'granted');
      startMeasurement();
      return;
    }

    window.dataLayer = window.dataLayer || [];
    setConsent('default', 'denied');
    setConsent('update', 'granted');

    const pageLocation = sanitizedUrl(window.location.href);
    const pageReferrer = sanitizedUrl(document.referrer);
    const configuration = {
      ...campaignParameters(),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: CONSENT_LIFETIME_SECONDS,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
      page_location: pageLocation,
      page_title: document.title,
      send_page_view: false,
    };
    if (pageReferrer) configuration.page_referrer = pageReferrer;

    googleTag('config', MEASUREMENT_ID, configuration);
    googleTag('event', 'page_view', {
      page_location: pageLocation,
      page_referrer: pageReferrer,
      page_title: document.title,
    });
    analyticsInitialized = true;
    startMeasurement();

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.dataset.googleAnalytics = 'true';
    document.head.append(script);
  }

  function denyAnalytics() {
    stopMeasurement();
    if (analyticsInitialized) setConsent('update', 'denied');
    window[`ga-disable-${MEASUREMENT_ID}`] = true;
    clearAnalyticsCookies();
    document.querySelector('[data-google-analytics]')?.remove();
  }

  function updateConsentCopy() {
    if (!consentCurrent) return;
    if (currentConsent === 'granted') {
      consentCurrent.hidden = false;
      consentCurrent.textContent = 'Analytics are currently allowed.';
    } else if (currentConsent === 'denied') {
      consentCurrent.hidden = false;
      consentCurrent.textContent = 'Analytics are currently not allowed.';
    } else {
      consentCurrent.hidden = true;
      consentCurrent.textContent = '';
    }
  }

  function reserveConsentSpace() {
    document.documentElement.style.setProperty('--consent-height', `${consentPanel.offsetHeight}px`);
  }

  function showConsentPanel(manual = false) {
    if (!consentPanel) return;
    panelOpenedManually = manual;
    updateConsentCopy();
    closeButton.hidden = currentConsent === null;
    consentPanel.hidden = false;
    // Reserve room under the fixed panel so it never covers focused content (WCAG 2.4.11).
    document.documentElement.classList.add('consent-open');
    reserveConsentSpace();
    consentSize?.observe(consentPanel);
    if (manual) consentHeading?.focus();
  }

  function hideConsentPanel() {
    if (!consentPanel) return;
    const panelHadFocus = consentPanel.contains(document.activeElement);
    consentPanel.hidden = true;
    document.documentElement.classList.remove('consent-open');
    consentSize?.disconnect();
    if (panelOpenedManually) settingsButton?.focus({ preventScroll: true });
    else if (panelHadFocus) brandLink?.focus({ preventScroll: true });
    panelOpenedManually = false;
  }

  function announce(message) {
    if (consentAnnouncement) consentAnnouncement.textContent = message;
  }

  function chooseConsent(choice) {
    currentConsent = choice;
    storeConsent(choice);
    if (choice === 'granted') {
      initializeAnalytics();
      announce('Analytics are now allowed. You can change this in Analytics settings.');
    } else {
      denyAnalytics();
      announce('Analytics are not allowed. No analytics will be sent.');
    }
    updateConsentCopy();
    hideConsentPanel();
  }

  allowButton?.addEventListener('click', () => chooseConsent('granted'));
  denyButton?.addEventListener('click', () => chooseConsent('denied'));
  settingsButton?.addEventListener('click', () => showConsentPanel(true));
  closeButton?.addEventListener('click', hideConsentPanel);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || consentPanel?.hidden !== false || currentConsent === null) return;
    hideConsentPanel();
  });

  if (settingsButton) settingsButton.hidden = false;
  currentConsent = readStoredConsent();
  updateConsentCopy();
  if (currentConsent === 'granted') initializeAnalytics();
  if (window.location.hash === '#analytics-settings') {
    showConsentPanel(true);
  } else if (currentConsent === null) {
    showConsentPanel(false);
  }
})();
