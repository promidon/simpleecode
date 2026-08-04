// SimpleeCode beta feedback receiver.
//
// The extension POSTs { title, body, tester, meta } here. We validate a shared
// secret, then commit a new markdown file to a separately configured private
// feedback repo via the GitHub Contents API.
//
// No secret ships in the extension beyond the shared FEEDBACK_TOKEN (which only
// authorizes creating a feedback file — low blast radius, rotatable).
//
// Env: GITHUB_TOKEN, GITHUB_REPO, FEEDBACK_TOKEN [, GITHUB_BRANCH, FEEDBACK_DIR]

const { timingSafeEqual } = require('crypto');

const MAX_TITLE = 200;
const MAX_BODY = 20000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.FEEDBACK_TOKEN;
  const provided = event.headers['x-simpleecode-token'] || event.headers['X-Simpleecode-Token'];
  if (!secret || !provided || !sameSecret(provided, secret)) {
    return json(401, { ok: false, error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Bad JSON' });
  }

  const title = String(payload.title || '').trim().slice(0, MAX_TITLE);
  const body = String(payload.body || '').trim().slice(0, MAX_BODY);
  if (!title || !body) {
    return json(400, { ok: false, error: 'Title and message are both required.' });
  }
  const tester = String(payload.tester || '').trim().slice(0, 120);
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return json(500, { ok: false, error: 'Server not configured.' });
  }
  const branch = process.env.GITHUB_BRANCH || 'main';
  const dir = (process.env.FEEDBACK_DIR || 'docs/feedback').replace(/\/+$/, '');

  const now = new Date();
  const stamp = fileStamp(now);
  const slug = slugify(title) || 'feedback';
  const path = `${dir}/${slug}--${stamp}.md`;
  const content = buildMarkdown({ title, body, tester, meta, iso: now.toISOString() });

  try {
    const res = await githubPut(repo, token, path, content, branch, `feedback: ${title}`);
    if (!res.ok) {
      return json(502, { ok: false, error: `GitHub error ${res.status}` });
    }
    return json(200, { ok: true, path });
  } catch {
    return json(502, { ok: false, error: 'Could not reach GitHub.' });
  }
};

function sameSecret(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

function buildMarkdown({ title, body, tester, meta, iso }) {
  const fm = [
    '---',
    `title: ${yaml(title)}`,
    `date: ${iso}`,
    `tester: ${yaml(tester || 'anonymous')}`,
    `version: ${yaml(meta.version || 'unknown')}`,
    `os: ${yaml(meta.os || 'unknown')}`,
    `vscode: ${yaml(meta.vscode || 'unknown')}`,
    '---',
    '',
  ].join('\n');
  return `${fm}${body}\n`;
}

// PUT /repos/{repo}/contents/{path}. New file (no sha); a same-minute collision
// is retried with a seconds-suffixed path.
async function githubPut(repo, token, path, content, branch, message, retried) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'simpleecode-feedback',
    },
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(content, 'utf8').toString('base64'),
    }),
  });
  if (res.status === 422 && !retried) {
    const alt = path.replace(/\.md$/, `-${new Date().getSeconds()}.md`);
    return githubPut(repo, token, alt, content, branch, message, true);
  }
  return res;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function fileStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

// Quote YAML scalars that could break the frontmatter.
function yaml(s) {
  const v = String(s);
  return /[:#\n"']/.test(v) ? JSON.stringify(v) : v;
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
