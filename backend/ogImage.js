// ogImage.js — renders the dynamic "score card" image used as og:image on
// each /report/{videoId} page. Uses @napi-rs/canvas (prebuilt native
// binaries, no system Cairo/build-tools needed — installs cleanly on Render).
//
// If the dependency isn't installed yet (e.g. you deployed this before
// running `npm install`), renderOgImage() returns null instead of crashing,
// and server.js falls back to a static default image so OG previews still
// work — just without the per-video score baked in — until you install it.
let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch (e) {
  console.warn('[ogImage] @napi-rs/canvas not installed — run `npm install` in backend/. Falling back to static OG image for now.');
}

const WIDTH = 1200;
const HEIGHT = 630;

function bandColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 45) return '#f59e0b';
  return '#ff4d4d';
}
function verdictFor(score) {
  if (score >= 75) return 'LIKELY LEGIT';
  if (score >= 45) return 'BE CAREFUL';
  return 'HIGH RISK';
}

// Simple manual word-wrap — canvas has no built-in text wrapping.
function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderOgImage(summary) {
  if (!canvasLib) return null;
  const { createCanvas } = canvasLib;
  const score = Math.round(summary.score);
  const color = bandColor(score);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, '#0f0f11');
  grad.addColorStop(1, '#1a1a25');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Accent border
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);

  // Wordmark
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '700 40px sans-serif';
  ctx.fillText('Truth', 60, 90);
  const truthWidth = ctx.measureText('Truth').width;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('Score', 60 + truthWidth, 90);

  // Score circle
  const cx = 220, cy = 340, r = 150;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#2a2a35';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * (score / 100)));
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '800 90px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(score), cx, cy + 30);
  ctx.font = '600 24px sans-serif';
  ctx.fillStyle = '#a0a0a8';
  ctx.fillText('/ 100', cx, cy + 65);
  ctx.textAlign = 'left';

  // Verdict badge
  ctx.font = '800 28px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(verdictFor(score), cx - 145, cy + 200);

  // Title (wrapped) + channel
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '700 42px sans-serif';
  const titleLines = wrapText(ctx, summary.title || 'YouTube video', 560).slice(0, 3);
  let ty = 200;
  titleLines.forEach(line => { ctx.fillText(line, 480, ty); ty += 54; });

  ctx.fillStyle = '#a0a0a8';
  ctx.font = '500 28px sans-serif';
  ctx.fillText(summary.channelTitle || '', 480, ty + 20);

  return canvas.toBuffer('image/png');
}

module.exports = { renderOgImage };
