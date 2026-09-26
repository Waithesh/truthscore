// ═══════════════════════════════════════════════
// TruthScore — script.js
// ═══════════════════════════════════════════════

// ── CONFIG — update SHEETS_URL with your new /exec deployment link ──
// DO NOT change this to truthscore.online until you've pointed that
// domain's DNS at this same Render app (required for /report/{id} pages —
// see the note in backend/server.js). Until then this must stay pointed
// at the Render URL directly or the live scan button on the homepage
// breaks.
const BACKEND_URL   = 'https://truthscore.onrender.com';
const DEMO_VIDEO_ID = 'dQw4w9WgXcQ';
const SHEETS_URL    = 'https://script.google.com/macros/s/AKfycbz_Gm3jeFFj8WzWatTj5CHegqFX1rtbosTsz2jEkMpwyAcZrTmkdNXb6bLMCH1LqmmN/exec';
// PayPal hosted button is now injected directly in index.html

const LS_KEY        = 'ts_email_given'; // localStorage key for returning users (legacy — no longer used to bypass the gate, see note below)

// ── DAILY FREE SCAN LIMIT ──────────────────────────
// 3 full scans/day, no email required. Beyond that, the result stays
// locked and the gate points to Pro instead of offering a free
// unlock-by-email — the old "give an email, unlock forever, free" gate
// meant nobody ever needed to pay. This is tracked per-browser via
// localStorage, so it's not bulletproof (clearing storage or an
// incognito window resets it) — there's no login system to attach a
// real per-person limit to, so this is the honest ceiling of what a
// no-backend-auth app can enforce.
const FREE_DAILY_LIMIT = 3;
const SCAN_COUNT_KEY   = 'ts_scan_count';
const SCAN_DATE_KEY    = 'ts_scan_date';

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Increments today's scan count (resetting it first if the stored date
// isn't today) and returns the new total.
function incrementScanCount() {
  try {
    const today = todayStr();
    const sameDay = localStorage.getItem(SCAN_DATE_KEY) === today;
    const count = (sameDay ? parseInt(localStorage.getItem(SCAN_COUNT_KEY) || '0', 10) : 0) + 1;
    localStorage.setItem(SCAN_DATE_KEY, today);
    localStorage.setItem(SCAN_COUNT_KEY, String(count));
    return count;
  } catch(e) { return 1; } // storage unavailable — fail open rather than block the scan
}

// ── UTILS ────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $q = sel => document.querySelector(sel);

function setText(id, v) { const e = $(id); if (e) e.textContent = v; }
function setHTML(id, v) { const e = $(id); if (e) e.innerHTML   = v; }

function extractVideoId(url) {
  if (!url) return null;
  const pats = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/i,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of pats) { const m = url.match(p); if (m) return m[1]; }
  try {
    const u = new URL(url.includes('://') ? url : 'https://youtube.com/watch?v=' + url);
    return u.searchParams.get('v') || null;
  } catch(e) { return null; }
}

// Send data to Google Sheets via GET (no-cors safe — body is NOT sent in no-cors POST)
function saveToSheets(data) {
  try {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) params.append(k, String(v));
    const url = SHEETS_URL + '?' + params.toString();
    fetch(url, { method: 'GET', mode: 'no-cors' })
      .catch(() => { try { new Image().src = url; } catch(e) {} });
  } catch(e) { console.warn('Sheets:', e); }
}

function hasGivenEmail() {
  try { return !!localStorage.getItem(LS_KEY); } catch(e) { return false; }
}
function rememberEmail(email) {
  try { localStorage.setItem(LS_KEY, email); } catch(e) {}
}

// ── STATE ────────────────────────────────────────
let _score  = null;   // number or null
let _title  = '';
let _report = '';
let _flags  = [];
let _webSources = [];

// ── BOOT ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $('analyzeBtn')?.addEventListener('click',    () => runAnalyze());
  $('videoInput')?.addEventListener('keypress', e  => { if (e.key === 'Enter') runAnalyze(); });
  $('demoBtn')   ?.addEventListener('click',    () => {
    $('videoInput').value = 'https://youtu.be/' + DEMO_VIDEO_ID;
    runAnalyze(DEMO_VIDEO_ID);
  });

  $('shareBtn')?.addEventListener('click', doShare);
  $('copyBtn') ?.addEventListener('click', doCopy);
  $('newBtn')  ?.addEventListener('click', doReset);

  $('unlockBtn') ?.addEventListener('click',    goPro);

  $('proModal')?.addEventListener('click', e => {
    if (e.target === $('proModal')) closeProModal();
  });
});

// ── LOADING OVERLAY ───────────────────────────────
function showLoader() {
  if ($('tsOverlay')) return;
  const d = document.createElement('div');
  d.id = 'tsOverlay';
  d.innerHTML = `
<style>
#tsOverlay{position:fixed;inset:0;background:rgba(0,0,0,.93);display:flex;align-items:center;justify-content:center;z-index:99999;animation:tsF .3s}
@keyframes tsF{from{opacity:0}to{opacity:1}}
#tsBox{background:#111;border:1px solid #222;border-radius:18px;padding:2.5rem;max-width:460px;width:90%;text-align:center}
#tsIco{font-size:3rem;margin-bottom:.75rem;animation:tsP 2s infinite;display:inline-block}
@keyframes tsP{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
#tsTtl{font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;color:#f0f0f0;margin-bottom:.35rem}
#tsMsg{color:#777;font-size:.9rem;margin-bottom:1.4rem}
#tsBarW{width:100%;height:7px;background:#1a1a1a;border-radius:4px;overflow:hidden;margin-bottom:1.4rem}
#tsBar{width:0%;height:100%;background:linear-gradient(90deg,#ff3c3c,#ff8080);transition:width .6s ease;border-radius:4px}
#tsInfo{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:.9rem 1.1rem;text-align:left;margin-bottom:1.2rem}
#tsInfo p{margin:0;color:#fcd34d;font-size:.84rem;line-height:1.5}
#tsWBtn{background:transparent;color:#999;border:1px solid #333;border-radius:10px;padding:.6rem 1.2rem;font-family:'Syne',sans-serif;font-weight:600;font-size:.82rem;cursor:pointer;transition:.2s;display:none}
#tsWBtn:hover{background:#1a1a1a;color:#ddd;border-color:#555}
#tsNote{color:#444;font-size:.75rem;margin-top:.5rem;display:none}
</style>
<div id="tsBox">
  <div id="tsIco">🛡️</div>
  <h3 id="tsTtl">Waking up analysis engine…</h3>
  <p  id="tsMsg">Connecting to server…</p>
  <div id="tsBarW"><div id="tsBar"></div></div>
  <div id="tsInfo">
    <p><strong>⚡ Free Tier Notice:</strong> First request wakes the server — takes up to 45 seconds. Subsequent analyses are fast.</p>
  </div>
  <button id="tsWBtn">This taking a while? Join the Pro waitlist →</button>
  <p id="tsNote">Early members get 50% off Pro forever</p>
</div>`;
  document.body.appendChild(d);
  $('tsWBtn').addEventListener('click', () => { hideLoader(); openProModal(); });
  // Only surface the Pro pitch if the wait is genuinely long (>15s) —
  // don't sell to someone who hasn't seen a result yet.
  setTimeout(() => {
    const wb = $('tsWBtn'), wn = $('tsNote');
    if (wb && $('tsOverlay')) { wb.style.display = 'inline-block'; if (wn) wn.style.display = 'block'; }
  }, 15000);

  [
    { t: 0,     msg: 'Connecting to server…',   pct: 8  },
    { t: 5000,  msg: 'Server is waking up…',    pct: 25 },
    { t: 15000, msg: 'Fetching video data…',    pct: 45 },
    { t: 25000, msg: 'Scanning comments…',      pct: 65 },
    { t: 35000, msg: 'Calculating score…',      pct: 82 },
    { t: 43000, msg: 'Almost done…',            pct: 94 },
  ].forEach(s => setTimeout(() => {
    setText('tsMsg', s.msg);
    const b = $('tsBar'); if (b) b.style.width = s.pct + '%';
  }, s.t));
}

function hideLoader() {
  const b = $('tsBar'); if (b) b.style.width = '100%';
  setTimeout(() => $('tsOverlay')?.remove(), 400);
}
window.hideLoader   = hideLoader;
window.openProModal = openProModal;

// ── ANALYZE ───────────────────────────────────────
async function runAnalyze(optId) {
  // Clear any previous error
  const errEl = $('inputError');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

  const raw = optId || ($('videoInput')?.value.trim() || '');
  if (!raw) { showErr('Please paste a YouTube URL or video ID.'); return; }

  const id = extractVideoId(raw) || (raw.length === 11 ? raw : null);
  if (!id)  { showErr('Could not find a video ID — please paste the full YouTube URL.'); return; }

  // Reset state + UI
  _score = null; _title = ''; _report = ''; _flags = []; _webSources = [];
  $('resultSection')?.classList.add('hidden');
  $('emailGate')    ?.classList.remove('hidden');
  $('flagsCard')    ?.classList.add('hidden'); $('sourcesCard') ?.classList.add('hidden');

  const btn = $('analyzeBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing…'; }

  showLoader();

  try {
    const res = await fetch(BACKEND_URL + '/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ videoId: id })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: 'Server error' }));
      throw new Error(errData.message || 'Analysis failed');
    }

    const data = await res.json();
    hideLoader();

    // Give this scan its own public, shareable URL — truthscore.online/report/{id}.
    // pushState BEFORE rendering so the share/copy text built inside
    // renderResults() picks up the new path. This doesn't reload the page
    // (the gated in-page view stays as-is), but a refresh or a pasted link
    // now hits the server-rendered, ungated /report page instead of a bare
    // homepage. Only do this once the domain is actually serving /report
    // (see BACKEND_URL note above) — harmless no-op via history either way,
    // but don't rely on it until then.
    if (window.history?.pushState && data?.video?.videoId) {
      const reportPath = '/report/' + data.video.videoId;
      if (location.pathname !== reportPath) {
        history.pushState({ videoId: data.video.videoId }, '', reportPath);
      }
    }

    renderResults(data);

  } catch(err) {
    hideLoader();
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      showErr('Could not reach the analysis server. It may still be waking up — please wait 30 seconds and try again.');
    } else {
      showErr(err.message || 'Analysis failed. Please try again.');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Analyze →'; }
  }
}

function showErr(msg) {
  const e = $('inputError');
  if (e) { e.textContent = msg; e.classList.remove('hidden'); }
}

// ── RENDER RESULTS ────────────────────────────────
function renderResults(payload) {
  const { video, analysis } = payload;
  const score = Math.round(analysis.score);

  _score = score;
  _title = video.title;

  const dislikePct = (analysis.likeDislikeRatio * 100).toFixed(1);

  // Video summary — always visible
  setText('videoTitle',  video.title);
  setText('channelInfo', video.channelTitle + ' • ' + (video.channelAgeYears || 0) + ' yrs old');

  // Use "est. dislikes" to be honest about the data source
  const votesText = video.dislikeCount != null
    ? video.likeCount.toLocaleString() + ' likes · ' + video.dislikeCount.toLocaleString() + ' est. dislikes'
    : video.likeCount.toLocaleString() + ' likes';
  setHTML('metaInfo', video.viewCount.toLocaleString() + ' views · ' + votesText + ' · ' + video.commentCount.toLocaleString() + ' comments');

  // Honest disclosure of which signals actually ran on THIS scan. Web
  // check and transcript analysis both depend on the Gemini API being
  // configured and succeeding — if either is silently skipped (rate
  // limit, no captions, API down), the score still renders, but it
  // shouldn't LOOK as rigorous as a scan where all three signals fired.
  // See the weighting breakdown at /methodology.html.
  const signalsUsed = [
    'YouTube ✓',
    analysis.webTrustScore     !== undefined ? 'Web check ✓'  : 'Web check —',
    analysis.manipulationScore !== undefined ? 'Transcript ✓' : 'Transcript —'
  ].join('  ·  ');
  setText('signalsNote', 'Signals used: ' + signalsUsed);

  // ── GATED: Score ring shows "?" until email submitted ──
  const ring = $('scoreRing'), num = $('ringNum');
  if (ring && num) {
    num.textContent = '?';
    ring.className  = 'score-ring ring-locked';
  }

  // ── GATED: Mini stats replaced with blur placeholders ──
  const channelTrustEl = $('channelTrust');
  const dislikeRatioEl = $('dislikeRatio');
  const engagementEl   = $('engagement');
  if (channelTrustEl) { channelTrustEl.textContent = '??/100'; channelTrustEl.classList.add('stat-locked'); }
  if (dislikeRatioEl) { dislikeRatioEl.textContent = '?%';     dislikeRatioEl.classList.add('stat-locked'); }
  if (engagementEl)   { engagementEl.textContent   = '?%';     engagementEl.classList.add('stat-locked');   }

  // Store flags and full data for reveal after email
  // Group by origin FIRST (web research / transcript / mechanical YouTube
  // signals), THEN sort by severity within each group. Flattening these
  // together hides which signal actually found what — a Reddit scam report
  // and a YouTube engagement-ratio note are not the same kind of evidence.
  const sorted = [...analysis.flags].sort((a, b) =>
    ({ red: 1, yellow: 2, blue: 3, green: 4 }[a.type] || 5) -
    ({ red: 1, yellow: 2, blue: 3, green: 4 }[b.type] || 5)
  );
  _flags = sorted.map(f => ({
    cls:       f.type === 'red' ? 'fd-red' : (f.type === 'yellow' || f.type === 'blue') ? 'fd-amber' : 'fd-green',
    text:      f.text,
    impact:    f.impact || '',
    source:    f.source || '',
    sourceUrl: f.sourceUrl || '',
    origin:    f.origin || 'youtube'
  }));
  // The actual pages the web cross-reference searched — what makes a flag
  // like "claims $50K/month, zero footprint online" checkable instead of
  // just asserted. See renderFlags() for where these get rendered.
  _webSources = analysis.webSources || [];

  // Store the real values so we can reveal them after unlock
  _realScore       = score;
  _realDislikePct  = dislikePct;
  _realTrust       = Math.round(analysis.channelTrustScore);
  _realEngagement  = (analysis.engagementRatio * 100).toFixed(3);
  _realRingClass   = score >= 75 ? 'ring-green' : score >= 45 ? 'ring-amber' : 'ring-red';
  _realDislikeColor = parseFloat(dislikePct) > 30 ? 'var(--red)'
                    : parseFloat(dislikePct) > 15 ? 'var(--amber)'
                    : 'var(--green)';

  // Build shareable report text (built now, used after unlock)
  const verdict = score >= 75 ? 'Likely Legit' : score >= 45 ? 'Be Careful' : 'HIGH RISK';
  // Build the shareable text report grouped by origin — same structure as
  // the on-page flag list, so the copy/share version does not silently
  // flatten web-research findings back in with mechanical YouTube signals.
  const reportGroups = { web: [], transcript: [], youtube: [] };
  analysis.flags.forEach(f => {
    const o = f.origin || 'youtube';
    (reportGroups[o] || reportGroups.youtube).push(f);
  });
  const reportLabels = { web: 'Web Research', transcript: 'Video Transcript', youtube: 'YouTube Signals' };
  const flagLines = [];
  ['web', 'transcript', 'youtube'].forEach(o => {
    if (!reportGroups[o].length) return;
    flagLines.push(reportLabels[o] + ':');
    reportGroups[o].forEach(f => {
      const src = f.source && f.source.toLowerCase() !== 'no results found' ? ' — source: ' + f.source : '';
      flagLines.push('  • ' + f.text + src);
    });
  });

  _report = [
    '══════════════════════════════',
    '  TruthScore Analysis Report',
    '══════════════════════════════',
    'Title:         ' + video.title,
    'Channel:       ' + video.channelTitle,
    'TruthScore:    ' + score + '% — ' + verdict,
    'Channel Trust: ' + Math.round(analysis.channelTrustScore) + '/100',
    'Dislike Ratio: ' + dislikePct + '%',
    'Engagement:    ' + (analysis.engagementRatio * 100).toFixed(3) + '%',
    '',
    ...flagLines,
    '',
    'Checked at ' + (location.pathname.startsWith('/report/') ? location.href : 'https://truthscore.online')
  ].join('\n');

  // Reset gate UI
  const gs = $('gateStatus');
  if (gs) { gs.textContent = 'Pro removes the daily limit entirely.'; gs.style.color = 'var(--muted)'; }

  // ── Daily free-scan gate ──────────────────────────
  // <= 3 scans today: full reveal, no gate, no email. Beyond that: stays
  // locked, and the gate pushes to Pro instead of a free email-unlock.
  // Pro users (see isProUser()/markProUnlocked() above) bypass this
  // entirely and never see the counter or the gate.
  const scansUsedToday = incrementScanCount();
  const scansLeft      = Math.max(0, FREE_DAILY_LIMIT - scansUsedToday);
  const counterEl       = $('scanCounterNote');

  if (isProUser() || scansUsedToday <= FREE_DAILY_LIMIT) {
    $('emailGate')?.classList.add('hidden');
    revealLockedUI();
    renderFlags();
    if (counterEl) {
      counterEl.textContent = isProUser()
        ? '⚡ Pro — unlimited scans'
        : (scansLeft > 0
            ? scansLeft + ' free scan' + (scansLeft === 1 ? '' : 's') + ' left today'
            : 'That was your last free scan today');
    }
  } else {
    $('emailGate')?.classList.remove('hidden');
    $('flagsCard') ?.classList.add('hidden'); $('sourcesCard') ?.classList.add('hidden');
    if (counterEl) counterEl.textContent = 'Daily free limit reached (' + FREE_DAILY_LIMIT + '/day)';
  }

  $('resultSection')?.classList.remove('hidden');
  window.renderPayPalButton && window.renderPayPalButton('paypal-container-RJ2LE5FD4KN8C'); // container has layout now, safe to render
  window.scrollTo({ top: ($('resultSection')?.offsetTop || 300) - 80, behavior: 'smooth' });
  scheduleProPopup(); // trigger popup 5 sec after results appear
}

// ── REVEAL LOCKED UI (score + stats) ─────────────
function revealLockedUI() {
  // Reveal score ring
  const ring = $('scoreRing'), num = $('ringNum');
  if (ring && num) {
    num.textContent = _realScore + '%';
    ring.className  = 'score-ring ' + _realRingClass;
  }

  // Reveal stats
  const channelTrustEl = $('channelTrust');
  const dislikeRatioEl = $('dislikeRatio');
  const engagementEl   = $('engagement');

  if (channelTrustEl) {
    channelTrustEl.textContent = _realTrust + '/100';
    channelTrustEl.classList.remove('stat-locked');
  }
  if (dislikeRatioEl) {
    dislikeRatioEl.textContent = _realDislikePct + '%';
    dislikeRatioEl.style.color = _realDislikeColor;
    dislikeRatioEl.classList.remove('stat-locked');
  }
  if (engagementEl) {
    engagementEl.textContent = _realEngagement + '%';
    engagementEl.classList.remove('stat-locked');
  }
}

// ── RENDER FLAGS ──────────────────────────────────
const ORIGIN_LABELS = {
  web:        '🌐 Web Research',
  transcript: '🎙️ Video Transcript',
  youtube:    '📊 YouTube Signals'
};
const ORIGIN_ORDER = ['web', 'transcript', 'youtube'];

// Escapes text before it goes into innerHTML, and only ever allows an
// http(s) URL into an href — flag text/URLs originate from an AI model
// reading web content, which is untrusted input even though it isn't
// directly user-typed. Adding real, clickable hrefs (which is the whole
// point of this feature) makes proper escaping matter more, not less.
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeHttpUrl(u) {
  try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null; } catch(e) { return null; }
}

function renderFlags() {
  const fc = $('flagsCard'), ul = $('flagsList');
  if (!fc || !ul) return;
  ul.innerHTML = '';

  // Group by origin so the user can weigh 'Reddit says this is a scam'
  // separately from 'engagement ratio looks healthy' instead of one
  // undifferentiated list that hides which signal is doing the work.
  const groups = {};
  _flags.forEach(f => {
    const o = f.origin || 'youtube';
    if (!groups[o]) groups[o] = [];
    groups[o].push(f);
  });

  ORIGIN_ORDER.forEach(origin => {
    const group = groups[origin];
    if (!group || !group.length) return;

    const header = document.createElement('li');
    header.className = 'flags-group-title';
    header.textContent = ORIGIN_LABELS[origin] || origin;
    ul.appendChild(header);

    group.forEach(f => {
      const li = document.createElement('li');
      li.className = 'flag-item';
      const safeUrl = f.sourceUrl && safeHttpUrl(f.sourceUrl);
      const sourceHtml = f.source && f.source.toLowerCase() !== 'no results found'
        ? (safeUrl
            ? ` — source: <a href="${escHtml(safeUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escHtml(f.source)} ↗</a>`
            : ` <span class="flag-source">— source: ${escHtml(f.source)}</span>`)
        : '';
      li.innerHTML = `<div class="flag-dot ${f.cls}"></div>
        <div>
          <div class="flag-text">${escHtml(f.text)}${sourceHtml}</div>
          ${f.impact ? `<div style="font-size:.78rem;color:var(--muted);margin-top:.2rem;">${escHtml(f.impact)}</div>` : ''}
        </div>`;
      ul.appendChild(li);
    });
  });

  fc.classList.remove('hidden');
  renderSources();
}

// Renders the "Sources Checked" list under the flags card — the real
// pages Gemini's web search visited, not a model-written guess at a
// domain name. Omitted entirely (not shown empty) when there's nothing
// to link to.
function renderSources() {
  const card = $('sourcesCard'), ul = $('sourcesList');
  if (!card || !ul) return;
  const sources = (_webSources || []).filter(s => s && s.url);
  if (!sources.length) { card.classList.add('hidden'); return; }
  ul.innerHTML = '';
  sources.forEach(s => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    a.textContent = s.title || s.url;
    li.appendChild(a);
    ul.appendChild(li);
  });
  card.classList.remove('hidden');
}

// ── DAILY LIMIT → GO PRO ──────────────────────────
// Replaces the old unlockReport() email-gate handler. Scrolls to the
// pricing section (or opens the waitlist modal as a fallback if that
// section isn't on the page for some reason).
function goPro() {
  const pricing = document.getElementById('pricing');
  if (pricing) pricing.scrollIntoView({ behavior: 'smooth' });
  else openProModal();
}
window.goPro = goPro;

// ── ACTION BUTTONS ────────────────────────────────
function doShare() {
  if (_score === null) { showErr('Analyze a video first — then you can share it!'); return; }
  const risk = _score >= 75 ? '✅ Looks Legit' : _score >= 45 ? '⚠️ Suspicious' : '🚨 HIGH RISK';
  // Link to this specific report (public, no email needed to view) rather
  // than the bare homepage — that's the whole point of giving each scan
  // its own URL.
  const link = location.pathname.startsWith('/report/') ? location.href : 'https://truthscore.online';
  const text = `"${_title}" scored ${_score}% on TruthScore — ${risk}\n\nSee the full report:\n${link}`;
  window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(text), '_blank', 'noopener,width=560,height=420');
}

function doCopy() {
  if (!_report) { showErr('Analyze a video first — then you can copy the report!'); return; }
  const btn  = $('copyBtn');
  const orig = btn?.textContent || '📋 Copy Report';
  const ok   = () => { if (btn) { btn.textContent = '✅ Copied!'; setTimeout(() => btn.textContent = orig, 2500); } };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(_report).then(ok).catch(() => fbCopy(ok));
  } else { fbCopy(ok); }
}
function fbCopy(cb) {
  const ta = document.createElement('textarea');
  ta.value = _report; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); cb(); } catch(e) {}
  document.body.removeChild(ta);
}

function doReset() {
  _score = null; _title = ''; _report = ''; _flags = []; _webSources = [];
  $('resultSection')?.classList.add('hidden');
  $('emailGate')    ?.classList.remove('hidden');
  $('flagsCard')    ?.classList.add('hidden'); $('sourcesCard') ?.classList.add('hidden');
  const v = $('videoInput'); if (v) { v.value = ''; v.focus(); }
  if (window.history?.pushState && location.pathname.startsWith('/report/')) {
    history.pushState({}, '', '/');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── PRO MODAL ─────────────────────────────────────
function openProModal() {
  const modal = $('proModal'); if (!modal) return;
  modal.classList.add('open');
  const mf = $('modalForm'), ms = $('modalSuccess');
  if (mf) mf.style.display = '';
  if (ms) ms.style.display = 'none';
  const ps = $('proStatus');
  if (ps) { ps.textContent = 'No spam. We only email you when we launch.'; ps.style.color = 'var(--muted)'; }
  const sb = $('proSubmitBtn');
  if (sb) { sb.disabled = false; sb.textContent = 'Secure My Spot — Free'; }
  setTimeout(() => $('proEmail')?.focus(), 100);
}
function closeProModal() { $('proModal')?.classList.remove('open'); }

async function submitProWaitlist() {
  const name  = $('proName') ?.value.trim() || '';
  const email = $('proEmail')?.value.trim() || '';
  const st    = $('proStatus');
  const sb    = $('proSubmitBtn');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (st) { st.textContent = '⚠️ Please enter a valid email address.'; st.style.color = '#fca5a5'; }
    $('proEmail')?.focus();
    return;
  }
  if (sb) { sb.disabled = true; sb.textContent = 'Saving…'; }
  if (st) { st.textContent = 'Saving…'; st.style.color = 'var(--muted)'; }

  saveToSheets({ type: 'pro_waitlist', name, email, timestamp: new Date().toISOString() });

  const mf = $('modalForm'), ms = $('modalSuccess');
  if (mf) mf.style.display = 'none';
  if (ms) ms.style.display = 'block';
  if (sb) { sb.disabled = false; sb.textContent = 'Secure My Spot — Free'; }
}

// Expose all globals needed by HTML onclick attributes
window.openProModal      = openProModal;
window.closeProModal     = closeProModal;
window.submitProWaitlist = submitProWaitlist;

// ── PRO UPGRADE POPUP ─────────────────────────────
// Appears 5 seconds after results load
// Never shows again within 24 hours
// Never shows if user is already Pro

const POPUP_KEY        = 'ts_popup_dismissed'; // localStorage key
const POPUP_COOLDOWN   = 24 * 60 * 60 * 1000; // 24 hours in ms
const PRO_KEY          = 'ts_is_pro';          // set this when user pays

function shouldShowProPopup() {
  // Never show to Pro members
  try { if (localStorage.getItem(PRO_KEY)) return false; } catch(e) {}
  // Check cooldown — don't show if dismissed within 24 hours
  try {
    const dismissed = localStorage.getItem(POPUP_KEY);
    if (dismissed && Date.now() - parseInt(dismissed) < POPUP_COOLDOWN) return false;
  } catch(e) {}
  return true;
}

function isProUser() {
  try { return !!localStorage.getItem(PRO_KEY); } catch(e) { return false; }
}

// ── PAYMENT CONFIRMATION → UNLOCK ──────────────────
// Called from index.html's PayPal onApprove callback the moment a
// checkout completes.
//
// HONEST LIMITATION, stated plainly rather than buried: this is a
// client-side flag only. There is no backend endpoint verifying PayPal's
// webhook/subscription status, so nothing stops someone from opening
// devtools and running localStorage.setItem('ts_is_pro','1') to get Pro
// for free forever — same limitation as the daily counter, but worse,
// because it's the actual paywall this time. The correct fix is a PayPal
// webhook hitting a backend endpoint that issues a verified token; that's
// a real (if fairly small) backend feature, not a one-line patch, and
// hasn't been built yet. Shipping this client-side confirmation now closes
// the more urgent bug — a PAYING customer being blocked — while leaving
// this bypass as a known, disclosed gap rather than a silent one.
function markProUnlocked(paypalData) {
  try { localStorage.setItem(PRO_KEY, '1'); } catch(e) {}
  $('proPopup') && ($('proPopup').style.display = 'none');
  closeProModal();
  // If the gate is currently showing (daily limit hit), immediately
  // reveal the report that was locked, so the payment they just made is
  // rewarded on the same page instead of requiring a re-scan.
  if (!$('emailGate')?.classList.contains('hidden')) {
    $('emailGate')?.classList.add('hidden');
    revealLockedUI();
    renderFlags();
    const counterEl = $('scanCounterNote');
    if (counterEl) counterEl.textContent = '⚡ Pro — unlimited scans';
  }
}
window.markProUnlocked = markProUnlocked;

function showProPopup() {
  if (!shouldShowProPopup()) return;
  const popup = $('proPopup');
  if (!popup) return;
  popup.style.display = 'flex';
}

function closeProPopup() {
  const popup = $('proPopup');
  if (popup) popup.style.display = 'none';
  // Record dismissal time so it won't show again for 24 hours
  try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch(e) {}
}
window.closeProPopup = closeProPopup;

// Call this after results render — hooked into renderResults below
function scheduleProPopup() {
  if (!shouldShowProPopup()) return;
  setTimeout(showProPopup, 5000); // 5 seconds after results appear
}
window.scheduleProPopup = scheduleProPopup;
