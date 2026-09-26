// reportPage.js — server-rendered HTML for a public /report/{videoId} page.
//
// This is intentionally NOT built from index.html's client-side flow (email
// gate, locked-until-unlock score, etc). The whole point of this page is
// that the base result renders with the initial HTML response — no JS
// required — so Google/Bing/AI crawlers see real content instead of a
// gated "?" placeholder. Gate the deeper Pro stuff, never the base score.
const SITE = 'https://truthscore.online';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Only ever allow an http(s) URL into an href. sourceUrl values here come
// from our own domain-matching against Gemini's grounding metadata, so
// the risk is low, but a broken/odd URL should render as plain text
// rather than a dead or unsafe link.
function safeHttpUrl(u) {
  try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null; } catch (e) { return null; }
}

function bandClass(score) {
  if (score >= 75) return { cls: 'ring-green', color: '#22c55e', verdict: 'Likely Legit' };
  if (score >= 45) return { cls: 'ring-amber', color: '#f59e0b', verdict: 'Be Careful' };
  return { cls: 'ring-red', color: '#ff4d4d', verdict: 'HIGH RISK' };
}

const ORIGIN_LABELS = { web: '🌐 Web Research', transcript: '🎙️ Video Transcript', youtube: '📊 YouTube Signals' };
const ORIGIN_ORDER = ['web', 'transcript', 'youtube'];
const DOT_CLASS = { red: 'fd-red', yellow: 'fd-amber', blue: 'fd-amber', green: 'fd-green' };

function flagsHtml(flags) {
  const groups = {};
  (flags || []).forEach(f => {
    const o = f.origin || 'youtube';
    (groups[o] = groups[o] || []).push(f);
  });
  let html = '';
  ORIGIN_ORDER.forEach(origin => {
    const group = groups[origin];
    if (!group || !group.length) return;
    html += `<li class="flags-group-title">${esc(ORIGIN_LABELS[origin] || origin)}</li>`;
    group.forEach(f => {
      const source = f.source && f.source.toLowerCase() !== 'no results found'
        ? (f.sourceUrl && safeHttpUrl(f.sourceUrl)
            ? ` — source: <a href="${esc(safeHttpUrl(f.sourceUrl))}" target="_blank" rel="noopener noreferrer nofollow" style="color:var(--blue)">${esc(f.source)} ↗</a>`
            : ` <span class="flag-source">— source: ${esc(f.source)}</span>`)
        : '';
      html += `<li class="flag-item">
        <div class="flag-dot ${DOT_CLASS[f.type] || 'fd-amber'}"></div>
        <div>
          <div class="flag-text">${esc(f.text)}${source}</div>
          ${f.impact ? `<div style="font-size:.85rem;color:var(--muted);margin-top:.2rem;">${esc(f.impact)}</div>` : ''}
        </div>
      </li>`;
    });
  });
  return html;
}

// Renders the actual pages Gemini's web search visited to produce the
// web-cross-reference flags above — this is what makes "claims $50K/month,
// zero footprint online" a checkable fact instead of a black-box score.
// Omitted entirely if there's nothing to show, rather than showing an
// empty "Sources" card.
function sourcesHtml(webSources) {
  const sources = (webSources || []).filter(s => s && s.url);
  if (!sources.length) return '';
  const items = sources.map(s =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.title || s.url)}</a></li>`
  ).join('');
  return `<div class="sources-card">
    <h2>🔎 Sources Checked</h2>
    <p class="hint">The actual pages our web cross-reference searched to produce the flags above — click through and judge for yourself. See <a href="/methodology.html" style="color:var(--blue)">how scoring works</a>.</p>
    <ul class="sources-list">${items}</ul>
  </div>`;
}

function renderReportPage(summary) {
  const score = Math.round(summary.score);
  const band = bandClass(score);
  const url = `${SITE}/report/${encodeURIComponent(summary.videoId)}`;
  const ogImage = `${SITE}/api/og/${encodeURIComponent(summary.videoId)}`;
  const title = `"${summary.title}" scored ${score}/100 on TruthScore`;
  const description = `${band.verdict} — ${summary.channelTitle} · TruthScore checked this video's engagement, comments, and live web reputation. See the full breakdown free.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | TruthScore</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">

<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="TruthScore">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ogImage}">

<link rel="icon" href="/favicon-48x48.png">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0f0f11;--card:#1a1a1f;--text:#f0f0f0;--muted:#a0a0a8;--red:#ff4d4d;--amber:#f59e0b;--green:#22c55e;--blue:#3b82f6;--border:#2a2a35}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
  .container{max-width:700px;margin:0 auto;padding:0 20px}
  header{padding:16px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
  .logo{font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;text-decoration:none;color:var(--text)}
  .logo span{color:var(--amber)}
  .back-link{font-size:0.9rem;color:var(--blue);text-decoration:none;font-weight:500}
  .video-summary{background:var(--card);border-radius:16px;padding:20px;margin:30px 0 25px;border:1px solid var(--border)}
  .video-summary h1{font-family:'Syne',sans-serif;font-size:1.3rem;margin-bottom:8px}
  .video-summary .meta{color:var(--muted);font-size:0.95rem}
  .score-ring{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-family:'Syne',sans-serif;font-weight:800;font-size:1.8rem;border:4px solid var(--border)}
  .ring-green{border-color:var(--green);color:var(--green)}
  .ring-amber{border-color:var(--amber);color:var(--amber)}
  .ring-red{border-color:var(--red);color:var(--red)}
  .verdict{text-align:center;font-family:'Syne',sans-serif;font-weight:700;margin-bottom:25px}
  .mini-stats{display:flex;justify-content:center;gap:25px;flex-wrap:wrap;margin:25px 0}
  .mini-stat{text-align:center}
  .mini-stat-value{font-weight:700;font-size:1.2rem}
  .mini-stat-label{color:var(--muted);font-size:0.85rem}
  .flags-card{background:var(--card);border-radius:16px;padding:25px;margin:25px 0;border:1px solid var(--border)}
  .flags-card h2{font-family:'Syne',sans-serif;margin-bottom:15px;font-size:1.2rem}
  .flags-list{list-style:none}
  .flag-item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)}
  .flag-item:last-child{border-bottom:none}
  .flag-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:6px}
  .fd-red{background:var(--red)} .fd-amber{background:var(--amber)} .fd-green{background:var(--green)}
  .flag-text{font-weight:500}
  .flags-group-title{font-size:0.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin:16px 0 8px;list-style:none}
  .flags-group-title:first-child{margin-top:0}
  .flag-source{color:var(--muted);font-size:0.85rem;font-style:italic}
  .action-buttons{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:25px 0}
  .action-btn{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-size:0.95rem;cursor:pointer}
  .action-btn:hover{background:#252530}
  .pro-card{background:linear-gradient(135deg,#1a1a25,#252535);border-radius:20px;padding:32px 24px;margin:40px 0;border:2px solid var(--amber);text-align:center}
  .pro-card h3{font-family:'Syne',sans-serif;margin-bottom:10px;font-size:1.4rem}
  .price{font-size:2rem;font-family:'Syne',sans-serif;font-weight:800;color:var(--amber);margin:8px 0}
  .paypal-btn-wrap{width:180px;height:46px;margin:0 auto 12px;overflow:hidden;position:relative}
  .paypal-btn-wrap > div{transform:scale(0.6);transform-origin:top left;width:166.7%}
  .sources-card{background:var(--card);border-radius:16px;padding:25px;margin:25px 0;border:1px solid var(--border)}
  .sources-card h2{font-family:'Syne',sans-serif;margin-bottom:6px;font-size:1.1rem}
  .sources-card p.hint{color:var(--muted);font-size:0.85rem;margin-bottom:12px}
  .sources-list{list-style:none}
  .sources-list li{padding:6px 0}
  .sources-list a{color:var(--blue);text-decoration:none;font-size:0.92rem;word-break:break-word}
  .sources-list a:hover{text-decoration:underline}
  footer{text-align:center;color:var(--muted);font-size:0.85rem;padding:30px 0}
  footer a{color:var(--blue)}
</style>
</head>
<body>
<div class="container">
  <header>
    <a href="/" class="logo">Truth<span>Score</span></a>
    <a href="/" class="back-link">Scan another video →</a>
  </header>

  <div class="video-summary">
    <h1>${esc(summary.title)}</h1>
    <p class="meta">${esc(summary.channelTitle)}</p>
    <p class="meta" style="font-size:0.8rem;color:var(--muted);margin-top:4px">Signals used: YouTube ✓  ·  Web check ${summary.webChecked ? '✓' : '—'}  ·  Transcript ${summary.transcriptChecked ? '✓' : '—'}</p>
  </div>

  <div class="score-ring ${band.cls}"><span>${score}%</span></div>
  <p class="verdict" style="color:${band.color}">${esc(band.verdict)}</p>

  <div class="mini-stats">
    <div class="mini-stat"><div class="mini-stat-value">${summary.channelTrustScore ?? '—'}/100</div><div class="mini-stat-label">Channel Trust</div></div>
    <div class="mini-stat"><div class="mini-stat-value">${summary.dislikeRatioPct ?? '—'}%</div><div class="mini-stat-label">Dislike Ratio</div></div>
    <div class="mini-stat"><div class="mini-stat-value">${summary.engagementPct ?? '—'}%</div><div class="mini-stat-label">Engagement</div></div>
  </div>

  <div class="flags-card">
    <h2>Key Red Flags &amp; Insights</h2>
    <ul class="flags-list">${flagsHtml(summary.flags)}</ul>
  </div>

  ${sourcesHtml(summary.webSources)}

  <div class="action-buttons">
    <button class="action-btn" onclick="window.open('https://x.com/intent/tweet?text=' + encodeURIComponent('${esc(title)}\\n\\n' + window.location.href), '_blank', 'noopener,width=560,height=420')">🐦 Share on X</button>
    <button class="action-btn" id="copyBtn">📋 Copy Link</button>
    <a class="action-btn" href="/" style="text-decoration:none;display:inline-block">Analyze Another</a>
  </div>

  <div class="pro-card">
    <h3>⚡ TruthScore Pro</h3>
    <p style="color:var(--muted);margin-bottom:10px">Unlimited scans, live web cross-reference on every video, no email gate.</p>
    <div class="price">$18<span style="font-size:1rem;color:var(--muted);font-weight:400">/month</span></div>
    <div class="paypal-btn-wrap">
      <div id="paypal-container-report"></div>
    </div>
    <p style="font-size:0.8rem;color:var(--muted)">🔒 Secure checkout via PayPal · Cancel anytime</p>
  </div>

  <footer>
    Generated by <a href="/">TruthScore</a> — the free YouTube scam detector. · <a href="/methodology.html">How scoring works</a>
  </footer>
</div>

<script src="https://www.paypal.com/sdk/js?client-id=BAAHVQb6e24ePOj6Gcjx6n8K66OfYZTH76okeWOOtV8G6fUpyG9ZjkPsniOrOhWOJOLDpLzUOj1lvAQ6Sg&components=hosted-buttons&disable-funding=venmo&currency=USD"></script>
<script>
  (function renderPP(){
    var c = document.getElementById('paypal-container-report');
    if (!c) return;
    if (typeof paypal === 'undefined' || !paypal.HostedButtons) { setTimeout(renderPP, 200); return; }
    paypal.HostedButtons({ hostedButtonId: "RJ2LE5FD4KN8C" }).render('#paypal-container-report');
  })();
  document.getElementById('copyBtn')?.addEventListener('click', function () {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.textContent = '✅ Copied!';
      setTimeout(() => { this.textContent = '📋 Copy Link'; }, 2000);
    });
  });
</script>
</body>
</html>`;
}

function renderNotFoundPage(videoId) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Video not found | TruthScore</title>
<meta name="robots" content="noindex">
</head><body style="font-family:sans-serif;background:#0f0f11;color:#f0f0f0;text-align:center;padding:80px 20px">
<h1>Couldn't analyze that video</h1>
<p style="color:#a0a0a8">The video "${esc(videoId)}" was not found, is private, or has been removed.</p>
<p><a href="/" style="color:#3b82f6">← Back to TruthScore</a></p>
</body></html>`;
}

module.exports = { renderReportPage, renderNotFoundPage };
