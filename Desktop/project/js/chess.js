let _acTimer = null;
    function showAcToast() {
      const el = document.getElementById('ac-toast');
      if (!el) return;
      clearTimeout(_acTimer);
      el.classList.remove('hide');
      el.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
      _acTimer = setTimeout(() => {
        el.classList.add('hide');
        el.classList.remove('show');
        setTimeout(() => { el.style.display = 'none'; el.classList.remove('hide'); }, 250);
      }, 2000);
    }
    document.addEventListener('contextmenu', e => { e.preventDefault(); showAcToast(); });
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey, shift = e.shiftKey, c = e.key.toUpperCase();
      if (
        e.key === 'F12' ||
        (ctrl && shift && (c === 'I' || c === 'J' || c === 'C')) ||
        (ctrl && c === 'U')
      ) { e.preventDefault(); e.stopPropagation(); showAcToast(); }
      // Block browser zoom keys: Ctrl+Plus, Ctrl+Minus, Ctrl+0
      if (ctrl && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0' || e.key === 'NumpadAdd' || e.key === 'NumpadSubtract')) {
        e.preventDefault();
      }
    }, true);
    // Block all scroll/wheel except Shift+Scroll (used for board zoom)
    document.addEventListener('wheel', e => {
      e.preventDefault();
    }, { passive: false });

(function() {
    const ctrl = localStorage.getItem('hub_control');
    const isMobile = ctrl === 'mobile' || (!ctrl && window.matchMedia('(pointer: coarse)').matches);
    document.getElementById('hint').innerHTML = isMobile
      ? 'Drag to rotate &nbsp;·&nbsp; Pinch to zoom'
      : 'Shift + Drag to rotate &nbsp;·&nbsp; Shift + Scroll to zoom';
  })();

// ── Stars ─────────────────────────────────────────────────────────────────────
const sc  = document.getElementById('stars');
const sct = sc.getContext('2d');
const STARS = Array.from({length:160}, () => ({
  x: Math.random(), y: Math.random(),
  r: .25 + Math.random() * 1.0,
  b: Math.random() * Math.PI * 2,
  s: .3 + Math.random() * 1.2
}));
function rsz() { sc.width = innerWidth; sc.height = innerHeight; }
rsz(); addEventListener('resize', rsz);
(function anim(ts) {
  const t = ts / 1000;
  sct.clearRect(0, 0, sc.width, sc.height);
  STARS.forEach(s => {
    sct.globalAlpha = (.2 + .8 * Math.abs(Math.sin(t * s.s + s.b))) * .65;
    sct.fillStyle = '#fff';
    sct.beginPath();
    sct.arc(s.x * sc.width, s.y * sc.height, s.r, 0, Math.PI * 2);
    sct.fill();
  });
  sct.globalAlpha = 1;
  requestAnimationFrame(anim);
})();

// ── Board canvas ──────────────────────────────────────────────────────────────
const bc  = document.getElementById('board-canvas');
const ctx = bc.getContext('2d');

let az   = Math.PI;
let el   = 0.72;
let zoom = 1.35;
const DEPTH = 0.52;        // tile slab thickness
const FP    = 0.44;        // gold frame padding (in tile units)

let TILE = 60;
let ox = 0, oy = 0;

let mouseX = -9999, mouseY = -9999;
let isDrag = false, dragX0, dragY0, az0, el0;
let pinchDist0 = 0, zoom0 = 1;
let selected   = null, validMoves = [], turnWhite = true;
let dragMoved  = false, touchTapX = 0, touchTapY = 0;

let pillarW = 0;
function resize2() {
  bc.width = innerWidth; bc.height = innerHeight;
  pillarW = Math.min(72, Math.max(28, innerWidth * 0.05));
  const avail = Math.min((bc.width - pillarW*2) * 0.92, bc.height * .76);
  TILE = Math.max(38, Math.floor(avail / 12.2));
}
resize2(); addEventListener('resize', resize2);

// ── Input ─────────────────────────────────────────────────────────────────────
bc.style.cursor = 'default';
bc.addEventListener('mousedown', e => {
  isDrag = e.shiftKey;
  dragX0 = e.clientX; dragY0 = e.clientY;
  az0 = az; el0 = el; dragMoved = false;
  bc.style.cursor = e.shiftKey ? 'grabbing' : 'default';
  e.preventDefault();
});
addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (Math.hypot(e.clientX - dragX0, e.clientY - dragY0) > 10) dragMoved = true;
  if (isDrag) {
    az = az0 + (e.clientX - dragX0) * 0.0065;
    el = Math.max(.12, Math.min(1.3, el0 + (e.clientY - dragY0) * 0.004));
  }
});
addEventListener('mouseup', e => {
  if (!isDrag && !dragMoved) handleBoardClick(e.clientX, e.clientY);
  isDrag = false;
  bc.style.cursor = 'default';
});
bc.addEventListener('wheel', e => {
  if (!e.shiftKey) return;
  e.preventDefault();
  zoom *= e.deltaY < 0 ? 1.08 : 0.93;
  zoom = Math.max(0.35, Math.min(4.0, zoom));
}, { passive: false });

// ── Touch: drag to rotate, pinch to zoom ─────────────────────────────────
bc.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDrag  = true;
    dragX0  = e.touches[0].clientX;
    dragY0  = e.touches[0].clientY;
    dragMoved = false;
    touchTapX = e.touches[0].clientX;
    touchTapY = e.touches[0].clientY;
    az0 = az; el0 = el;
  } else if (e.touches.length === 2) {
    isDrag = false;
    pinchDist0 = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    zoom0 = zoom;
  }
}, { passive: false });

bc.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && isDrag) {
    if (Math.hypot(e.touches[0].clientX - touchTapX, e.touches[0].clientY - touchTapY) > 8) dragMoved = true;
    az = az0 + (e.touches[0].clientX - dragX0) * 0.0065;
    el = Math.max(0.12, Math.min(1.3, el0 + (e.touches[0].clientY - dragY0) * 0.004));
    mouseX = e.touches[0].clientX;
    mouseY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    zoom = Math.max(0.35, Math.min(4.0, zoom0 * d / pinchDist0));
  }
}, { passive: false });

bc.addEventListener('touchend', e => {
  if (e.touches.length === 0) {
    if (!dragMoved) handleBoardClick(touchTapX, touchTapY);
    isDrag = false;
    mouseX = -9999; mouseY = -9999;
  }
});

// ── Projection ────────────────────────────────────────────────────────────────
function proj(col, row, wy = 0) {
  const wx = col - 4, wz = row - 4;
  const cA = Math.cos(az), sA = Math.sin(az);
  const sE = Math.sin(el), cE = Math.cos(el);
  const T  = TILE * zoom;
  return {
    x: ox + (wx * cA - wz * sA) * T,
    y: oy + (-(wx * sA + wz * cA) * sE - wy * cE) * T
  };
}

function poly(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function inQuad(mx, my, pts) {
  let pos = 0, neg = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i+1) % pts.length];
    const d = (b.x-a.x)*(my-a.y) - (b.y-a.y)*(mx-a.x);
    if (d > 0) pos++; else if (d < 0) neg++;
  }
  return pos === 4 || neg === 4;
}

// Mid-point of two pts
function mid(a, b) { return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }; }

// ── Frame corner diamond ornament ─────────────────────────────────────────────
function ornament(p) {
  const s = Math.max(4, TILE * zoom * FP * 0.68);
  ctx.save();
  ctx.translate(p.x, p.y);
  // outer diamond
  ctx.beginPath();
  ctx.moveTo(0, -s * .72);
  ctx.lineTo(s * .42, 0);
  ctx.lineTo(0,  s * .72);
  ctx.lineTo(-s * .42, 0);
  ctx.closePath();
  const og = ctx.createRadialGradient(0, -s*.2, 0, 0, 0, s*.8);
  og.addColorStop(0,  '#F0F4FF');
  og.addColorStop(.4, '#A8B4D0');
  og.addColorStop(1,  '#303848');
  ctx.fillStyle = og; ctx.fill();
  ctx.strokeStyle = 'rgba(200,210,240,.5)'; ctx.lineWidth = .8; ctx.stroke();
  // inner dot
  ctx.beginPath();
  ctx.arc(0, 0, s * .14, 0, Math.PI * 2);
  ctx.fillStyle = '#E8EEFF'; ctx.fill();
  ctx.restore();
}

// ── Drawing ───────────────────────────────────────────────────────────────────
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

// Starting position [row][col] → {symbol, white}
const BOARD = Array.from({length:8}, () => Array(8).fill(null));
const back  = ['♜','♞','♝','♛','♚','♝','♞','♜'];
const bPawn = ['♟','♟','♟','♟','♟','♟','♟','♟'];
const wPawn = ['♙','♙','♙','♙','♙','♙','♙','♙'];
const front = ['♖','♘','♗','♕','♔','♗','♘','♖'];
for (let c=0;c<8;c++) {
  BOARD[0][c] = {sym: back[c],  white: false};
  BOARD[1][c] = {sym: bPawn[c], white: false};
  BOARD[6][c] = {sym: wPawn[c], white: true};
  BOARD[7][c] = {sym: front[c], white: true};
}

// ── Chess game logic ──────────────────────────────────────────────────────────
let checkState  = false;   // is current player in check?
let gameOver    = false;
let gameOverMsg = '';

function pieceType(sym) {
  return {'♙':'pawn','♟':'pawn','♖':'rook','♜':'rook',
          '♘':'knight','♞':'knight','♗':'bishop','♝':'bishop',
          '♕':'queen','♛':'queen','♔':'king','♚':'king'}[sym] || null;
}

// Pseudo-moves (no check filtering), includes captures
function getPseudoMoves(r, c) {
  const piece = BOARD[r][c];
  if (!piece) return [];
  const moves = [];
  const isW = piece.white;
  const type = pieceType(piece.sym);

  function ok(nr, nc) { return nr >= 0 && nr < 8 && nc >= 0 && nc < 8; }
  function notSelf(nr, nc) { return ok(nr,nc) && !(BOARD[nr][nc] && BOARD[nr][nc].white === isW); }
  function tryAdd(nr, nc) { if (notSelf(nr, nc)) moves.push({r:nr, c:nc}); }
  function slide(dr, dc) {
    let nr = r+dr, nc = c+dc;
    while (ok(nr,nc)) {
      if (BOARD[nr][nc]) {
        if (BOARD[nr][nc].white !== isW) moves.push({r:nr, c:nc}); // capture
        break;
      }
      moves.push({r:nr, c:nc});
      nr+=dr; nc+=dc;
    }
  }

  if (type === 'pawn') {
    const dir = isW ? -1 : 1;
    const startRow = isW ? 6 : 1;
    if (ok(r+dir,c) && !BOARD[r+dir][c]) {
      moves.push({r:r+dir, c});
      if (r === startRow && !BOARD[r+2*dir][c]) moves.push({r:r+2*dir, c});
    }
    for (const dc of [-1,1]) {
      if (ok(r+dir,c+dc) && BOARD[r+dir][c+dc] && BOARD[r+dir][c+dc].white !== isW)
        moves.push({r:r+dir, c:c+dc});
    }
  } else if (type === 'rook')   { slide(-1,0);slide(1,0);slide(0,-1);slide(0,1); }
  else if (type === 'knight')   { [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>tryAdd(r+dr,c+dc)); }
  else if (type === 'bishop')   { slide(-1,-1);slide(-1,1);slide(1,-1);slide(1,1); }
  else if (type === 'queen')    { slide(-1,0);slide(1,0);slide(0,-1);slide(0,1);slide(-1,-1);slide(-1,1);slide(1,-1);slide(1,1); }
  else if (type === 'king')     { [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>tryAdd(r+dr,c+dc)); }
  return moves;
}

function findKing(isWhite) {
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = BOARD[r][c];
    if (p && p.white===isWhite && pieceType(p.sym)==='king') return {r,c};
  }
  return null;
}

function isInCheck(isWhite) {
  const king = findKing(isWhite);
  if (!king) return false;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = BOARD[r][c];
    if (!p || p.white===isWhite) continue;
    if (getPseudoMoves(r,c).some(m=>m.r===king.r&&m.c===king.c)) return true;
  }
  return false;
}

function getLegalMoves(r, c) {
  const piece = BOARD[r][c];
  if (!piece) return [];
  return getPseudoMoves(r,c).filter(m => {
    const captured = BOARD[m.r][m.c];
    BOARD[m.r][m.c] = piece;
    BOARD[r][c] = null;
    const inCh = isInCheck(piece.white);
    BOARD[r][c] = piece;
    BOARD[m.r][m.c] = captured;
    return !inCh;
  });
}

function hasAnyLegal(isWhite) {
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = BOARD[r][c];
    if (p && p.white===isWhite && getLegalMoves(r,c).length>0) return true;
  }
  return false;
}

function afterMove() {
  checkState = isInCheck(turnWhite);
  if (!hasAnyLegal(turnWhite)) {
    gameOver = true;
    gameOverMsg = checkState
      ? (turnWhite ? '⬛ Black wins!\nCheckmate!' : '⬜ White wins!\nCheckmate!')
      : '½ Stalemate!\nDraw!';
    showGameOver();
  }
  updateTurnUI();
}

function showGameOver() {
  let el = document.getElementById('gameover-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gameover-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:800;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,2,10,0.78);backdrop-filter:blur(4px)';
    document.body.appendChild(el);
  }
  const lines = gameOverMsg.split('\n');
  el.innerHTML = `
    <div style="background:rgba(10,5,28,0.96);border:1.5px solid rgba(200,100,255,0.5);border-radius:24px;padding:44px 56px;text-align:center;box-shadow:0 0 60px rgba(160,60,255,0.35)">
      <div style="font-size:3rem;margin-bottom:16px">${checkState?'♚':'🤝'}</div>
      <div style="font-family:'Orbitron',monospace;font-size:1.4rem;font-weight:900;letter-spacing:0.14em;color:#c880ff;text-shadow:0 0 22px rgba(180,80,255,.6);margin-bottom:8px">${lines[0]}</div>
      <div style="font-family:'Orbitron',monospace;font-size:0.85rem;letter-spacing:0.1em;color:rgba(180,140,255,0.7);margin-bottom:28px">${lines[1]||''}</div>
      <button onclick="resetGame()" style="font-family:'Orbitron',monospace;background:linear-gradient(135deg,rgba(120,0,220,0.7),rgba(80,0,160,0.6));border:1px solid rgba(200,100,255,0.55);color:#e0aaff;padding:12px 36px;border-radius:12px;font-size:0.84rem;font-weight:900;letter-spacing:0.08em;cursor:pointer;">▶ Play Again</button>
    </div>`;
}

function showPromotion(r, c, isWhite) {
  const pieces = isWhite
    ? [{sym:'♕',name:'Queen'},{sym:'♖',name:'Rook'},{sym:'♗',name:'Bishop'},{sym:'♘',name:'Knight'}]
    : [{sym:'♛',name:'Queen'},{sym:'♜',name:'Rook'},{sym:'♝',name:'Bishop'},{sym:'♞',name:'Knight'}];

  let el = document.getElementById('promotion-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'promotion-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;background:rgba(4,2,10,0.75);backdrop-filter:blur(4px)';
    document.body.appendChild(el);
  }

  el.innerHTML = `
    <div style="background:rgba(10,5,28,0.97);border:1.5px solid rgba(200,100,255,0.5);border-radius:22px;padding:36px 44px;text-align:center;box-shadow:0 0 50px rgba(160,60,255,0.35)">
      <div style="font-family:'Orbitron',monospace;font-size:0.9rem;font-weight:900;letter-spacing:0.14em;color:#c880ff;margin-bottom:22px">PROMOTE PAWN</div>
      <div style="display:flex;gap:14px;justify-content:center">
        ${pieces.map(p=>`
          <div onclick="promote(${r},${c},'${p.sym}')" style="cursor:pointer;padding:18px 16px;border-radius:14px;border:1.5px solid rgba(160,80,255,0.35);background:rgba(255,255,255,0.04);transition:all 0.18s;display:flex;flex-direction:column;align-items:center;gap:8px"
               onmouseover="this.style.background='rgba(160,80,255,0.18)';this.style.borderColor='rgba(200,100,255,0.8)'"
               onmouseout="this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='rgba(160,80,255,0.35)'">
            <span style="font-size:2.4rem;${isWhite?'color:#fff;text-shadow:0 0 12px rgba(255,255,255,0.8)':'color:#F0A020;text-shadow:0 0 12px rgba(255,180,0,0.8)'}">${p.sym}</span>
            <span style="font-family:'Orbitron',monospace;font-size:0.58rem;color:rgba(180,140,255,0.7);letter-spacing:0.1em">${p.name}</span>
          </div>`).join('')}
      </div>
    </div>`;

  window._promoWhite = isWhite;
}

function promote(r, c, sym) {
  const el = document.getElementById('promotion-overlay');
  if (el) el.remove();
  BOARD[r][c] = {sym, white: window._promoWhite};
  turnWhite = !turnWhite;
  afterMove();
  if (CHESS_MODE === 'ai' && !turnWhite && !gameOver) setTimeout(aiMove, 420);
}

function openSettings() {
  const el = document.getElementById('gameover-overlay');
  if (el) el.remove();
  const pe = document.getElementById('promotion-overlay');
  if (pe) pe.remove();
  // Reset board state but show mode select
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) BOARD[r][c]=null;
  for (let c=0;c<8;c++) {
    BOARD[0][c]={sym:back[c],white:false};
    BOARD[1][c]={sym:bPawn[c],white:false};
    BOARD[6][c]={sym:wPawn[c],white:true};
    BOARD[7][c]={sym:front[c],white:true};
  }
  selected=null; validMoves=[]; turnWhite=true; checkState=false; gameOver=false;
  // Reset badge
  const badge = document.getElementById('mode-badge');
  if (badge) { badge.textContent=''; badge.style.cssText=''; }
  document.getElementById('turn-indicator').textContent='♙ White to move';
  document.getElementById('turn-indicator').style.color='';
  document.getElementById('mode-select').classList.remove('hidden');
}

function recordMove(fr, fc, tr, tc) {
  moveHistory.push({fr, fc, tr, tc, piece: BOARD[fr][fc], captured: BOARD[tr][tc]});
}

function resetGame() {
  const el = document.getElementById('gameover-overlay');
  if (el) el.remove();
  const pe = document.getElementById('promotion-overlay');
  if (pe) pe.remove();
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) BOARD[r][c]=null;
  for (let c=0;c<8;c++) {
    BOARD[0][c]={sym:back[c],white:false};
    BOARD[1][c]={sym:bPawn[c],white:false};
    BOARD[6][c]={sym:wPawn[c],white:true};
    BOARD[7][c]={sym:front[c],white:true};
  }
  selected=null; validMoves=[]; turnWhite=true; checkState=false; gameOver=false; moveHistory=[]; autoPlayAI=false;
  updateTurnUI();
}

// ── Admin panel ───────────────────────────────────────────────────────────────
let moveHistory   = [];
let adminLoggedIn = false;
let autoPlayAI    = false;

function openAdminPanel() {
  if (adminLoggedIn) { renderAdminPanel(); return; }
  const m = document.getElementById('chess-admin-modal');
  m.style.display = 'flex';
  document.getElementById('chess-admin-pw').value = '';
  document.getElementById('chess-admin-msg').textContent = '';
  setTimeout(() => document.getElementById('chess-admin-pw').focus(), 80);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chess-admin-pw')?.addEventListener('keydown', e => { if (e.key==='Enter') tryAdminLogin(); });
});

function closeAdminModal() {
  document.getElementById('chess-admin-modal').style.display = 'none';
}

function tryAdminLogin() {
  const pw = document.getElementById('chess-admin-pw').value;
  const stored = localStorage.getItem('kq_adm_pw') || '4474';
  if (pw === stored) {
    adminLoggedIn = true;
    closeAdminModal();
    renderAdminPanel();
  } else {
    document.getElementById('chess-admin-msg').textContent = '❌ Wrong code';
    document.getElementById('chess-admin-pw').value = '';
  }
}

function closeAdminPanel() {
  document.getElementById('chess-admin-panel').style.display = 'none';
}

function adminSetDiff(d) {
  AI_DIFFICULTY = d;
  const badge = document.getElementById('mode-badge');
  if (badge) {
    badge.style.cssText = '';
    badge.textContent = '';
    initModeBadge();
  }
  renderAdminPanel();
}

function adminFlipTurn() {
  if (gameOver) return;
  turnWhite = !turnWhite;
  selected = null; validMoves = [];
  checkState = isInCheck(turnWhite);
  updateTurnUI();
  if (CHESS_MODE==='ai' && !turnWhite && !gameOver) setTimeout(aiMove, 420);
  renderAdminPanel();
}

function adminForceAI() {
  if (gameOver) return;
  if (turnWhite) { turnWhite = false; checkState = isInCheck(false); }
  setTimeout(aiMove, 100);
  renderAdminPanel();
}

function adminUndo() {
  if (!moveHistory.length) return;
  const h = moveHistory.pop();
  BOARD[h.fr][h.fc] = h.piece;
  BOARD[h.tr][h.tc] = h.captured;
  // if double (AI replied) also undo
  if (moveHistory.length && CHESS_MODE==='ai') {
    const h2 = moveHistory.pop();
    BOARD[h2.fr][h2.fc] = h2.piece;
    BOARD[h2.tr][h2.tc] = h2.captured;
  }
  selected=null; validMoves=[]; gameOver=false;
  turnWhite = true;
  checkState = isInCheck(true);
  updateTurnUI();
  renderAdminPanel();
}

function adminToggleAutoPlay() {
  autoPlayAI = !autoPlayAI;
  if (autoPlayAI && turnWhite && !gameOver) {
    // AI plays white too — just trigger chain
    setTimeout(autoPlayStep, 300);
  }
  renderAdminPanel();
}

function autoPlayStep() {
  if (!autoPlayAI || gameOver) return;
  const isW = turnWhite;
  const cands = allMoves(isW);
  if (!cands.length) return;
  // use same AI logic for both sides in autoplay
  const mv = cands[Math.floor(Math.random()*cands.length)];
  recordMove(mv.fr, mv.fc, mv.tr, mv.tc);
  const p = BOARD[mv.fr][mv.fc];
  applyMove(mv);
  turnWhite = !isW;
  afterMove();
  if (!gameOver) setTimeout(autoPlayStep, 600);
}

function adminEval() {
  const score = evaluate();
  return score > 0 ? `Black +${score}` : score < 0 ? `White +${-score}` : 'Equal (0)';
}

function renderAdminPanel() {
  const panel = document.getElementById('chess-admin-panel');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '14px';

  const diff = AI_DIFFICULTY;
  const diffColors = {easy:'#60ee80',medium:'#ffcc40',hard:'#ff6060'};
  const histLen = moveHistory.length;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid rgba(160,80,255,0.2)">
      <div style="font-family:'Orbitron',monospace;font-size:0.88rem;font-weight:900;letter-spacing:0.14em;color:#c880ff">🔧 ADMIN</div>
      <button onclick="closeAdminPanel()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(160,80,255,0.3);color:#b080e8;cursor:pointer;font-size:0.75rem;font-weight:700;padding:5px 12px;border-radius:8px;">✕ Close</button>
    </div>

    <div style="${sectionStyle()}">
      <div style="${labelStyle()}">⚡ Difficulty</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${['easy','medium','hard'].map(d=>`
          <button onclick="adminSetDiff('${d}')" style="flex:1;padding:8px 4px;border-radius:9px;font-family:'Orbitron',monospace;font-size:0.62rem;font-weight:700;cursor:pointer;border:1.5px solid ${diffColors[d]}40;background:${d===diff?diffColors[d]+'22':'rgba(255,255,255,0.04)'};color:${diffColors[d]};transition:all 0.15s">${d.charAt(0).toUpperCase()+d.slice(1)}</button>`).join('')}
      </div>
    </div>

    <div style="${sectionStyle()}">
      <div style="${labelStyle()}">📊 Board State</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">
        <div style="${statRow()}"><span style="color:#6050a0">Turn:</span><span style="color:#c0a8ff;font-family:'Orbitron',monospace;font-size:0.72rem">${turnWhite?'⬜ White':'⬛ Black'}</span></div>
        <div style="${statRow()}"><span style="color:#6050a0">Check:</span><span style="color:${checkState?'#ff6060':'#55ee88'};font-family:'Orbitron',monospace;font-size:0.72rem">${checkState?'YES':'No'}</span></div>
        <div style="${statRow()}"><span style="color:#6050a0">Evaluation:</span><span style="color:#c0a8ff;font-family:'Orbitron',monospace;font-size:0.72rem">${adminEval()}</span></div>
        <div style="${statRow()}"><span style="color:#6050a0">Moves made:</span><span style="color:#c0a8ff;font-family:'Orbitron',monospace;font-size:0.72rem">${histLen}</span></div>
      </div>
    </div>

    <div style="${sectionStyle()}">
      <div style="${labelStyle()}">🎮 Controls</div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-top:8px">
        <button onclick="adminForceAI();renderAdminPanel()" style="${actionBtn('#ffaa40')}">⚡ Force AI Move</button>
        <button onclick="adminFlipTurn()" style="${actionBtn('#60c0ff')}">🔄 Flip Turn</button>
        <button onclick="adminUndo()" style="${actionBtn(histLen?'#c080ff':'#444')}">↩ Undo Last Move${histLen>0?' ('+histLen+')':''}</button>
        <button onclick="adminToggleAutoPlay()" style="${actionBtn(autoPlayAI?'#ff6060':'#55ee88')}">${autoPlayAI?'⏹ Stop Auto-Play':'▶ Auto-Play (AI vs AI)'}</button>
      </div>
    </div>

    <div style="${sectionStyle()}">
      <div style="${labelStyle()}">🗑️ Reset</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="resetGame();renderAdminPanel()" style="${actionBtn('#ff6060',true)}">↺ Reset Board</button>
        <button onclick="adminLoggedIn=false;closeAdminPanel()" style="flex:1;padding:9px 6px;border-radius:9px;font-family:'Orbitron',monospace;font-size:0.65rem;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#6050a0">🔒 Logout</button>
      </div>
    </div>`;
}

function sectionStyle() { return 'padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(160,80,255,0.15);border-radius:14px'; }
function labelStyle()   { return 'font-size:0.62rem;font-weight:800;letter-spacing:0.14em;color:#7050a0;text-transform:uppercase'; }
function statRow()      { return 'display:flex;justify-content:space-between;align-items:center;font-size:0.68rem'; }
function actionBtn(col, full) { return `${full?'':'flex:1;'}width:100%;padding:9px 8px;border-radius:9px;font-family:'Orbitron',monospace;font-size:0.68rem;font-weight:700;cursor:pointer;border:1px solid ${col}44;background:${col}18;color:${col};transition:all 0.15s`; }

// ── Game mode ─────────────────────────────────────────────────────────────────
let CHESS_MODE      = 'local';
let AI_DIFFICULTY   = 'easy';

function selectMode(mode) {
  if (mode === 'ai') {
    document.getElementById('ms-step-mode').style.display = 'none';
    document.getElementById('ms-step-diff').style.display = 'flex';
  }
}

function startGame(mode, diff) {
  if (mode === 'network') { alert('Network mode coming soon! Choose another mode.'); return; }
  CHESS_MODE    = mode;
  AI_DIFFICULTY = diff || 'easy';
  document.getElementById('ms-step-mode').style.display = 'flex';
  document.getElementById('ms-step-diff').style.display = 'none';
  document.getElementById('mode-select').classList.add('hidden');
  // Show admin button only in AI mode
  document.getElementById('admin-chess-btn').style.display = mode === 'ai' ? '' : 'none';
  updateTurnUI();
  initModeBadge();
}

function initModeBadge() {
  const badge = document.getElementById('mode-badge');
  if (!badge) return;
  const diffLabel = {easy:'Easy',medium:'Medium',hard:'Hard'};
  const labels = { ai: `🤖 AI · ${diffLabel[AI_DIFFICULTY]||''}`, local: '👥 Local' };
  const styles = {
    ai:    'color:#ffaa40;border:1px solid rgba(255,160,40,0.4);background:rgba(80,30,0,0.35)',
    local: 'color:#c080ff;border:1px solid rgba(160,80,255,0.4);background:rgba(40,10,80,0.35)',
  };
  badge.textContent = labels[CHESS_MODE] || '';
  badge.style.cssText += styles[CHESS_MODE] || '';
}

function updateTurnUI() {
  const el = document.getElementById('turn-indicator');
  if (!el) return;
  if (gameOver) { el.textContent = ''; return; }
  const who = turnWhite ? '♙ White' : '♟ Black';
  if (checkState) {
    el.textContent = who + ' — CHECK!';
    el.style.color = '#ff6060';
  } else {
    el.textContent = CHESS_MODE === 'ai' && !turnWhite ? '🤖 AI thinking…' : who + ' to move';
    el.style.color = '';
  }
}

// ── AI ────────────────────────────────────────────────────────────────────────
const PIECE_VAL = {pawn:1, knight:3, bishop:3, rook:5, queen:9, king:100};

function pieceValue(sym) { return PIECE_VAL[pieceType(sym)] || 0; }

function allMoves(isWhite) {
  const list = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = BOARD[r][c];
    if (!p || p.white !== isWhite) continue;
    getLegalMoves(r,c).forEach(m => list.push({fr:r,fc:c,tr:m.r,tc:m.c}));
  }
  return list;
}

function applyMove(mv) {
  const captured = BOARD[mv.tr][mv.tc];
  const piece    = BOARD[mv.fr][mv.fc];
  BOARD[mv.tr][mv.tc] = piece;
  BOARD[mv.fr][mv.fc] = null;
  // auto-promote to queen
  if (pieceType(piece.sym)==='pawn' && (mv.tr===0||mv.tr===7))
    BOARD[mv.tr][mv.tc] = {sym: piece.white?'♕':'♛', white: piece.white};
  return captured;
}

function undoMove(mv, captured, origPiece) {
  BOARD[mv.fr][mv.fc] = origPiece;
  BOARD[mv.tr][mv.tc] = captured;
}

function evaluate() {
  let score = 0;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = BOARD[r][c];
    if (!p) continue;
    score += (p.white ? -1 : 1) * pieceValue(p.sym);
  }
  return score;
}

function minimax(depth, alpha, beta, maximizing) {
  if (depth === 0) return evaluate();
  const moves = allMoves(maximizing ? false : true); // black maximizes
  if (!moves.length) return evaluate();
  if (maximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const orig = BOARD[mv.fr][mv.fc];
      const cap  = applyMove(mv);
      best = Math.max(best, minimax(depth-1, alpha, beta, false));
      undoMove(mv, cap, orig);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const orig = BOARD[mv.fr][mv.fc];
      const cap  = applyMove(mv);
      best = Math.min(best, minimax(depth-1, alpha, beta, true));
      undoMove(mv, cap, orig);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function aiMove() {
  if (gameOver) return;
  const candidates = allMoves(false);
  if (!candidates.length) return;

  let mv;
  if (AI_DIFFICULTY === 'easy') {
    mv = candidates[Math.floor(Math.random()*candidates.length)];
  } else if (AI_DIFFICULTY === 'medium') {
    // prefer highest-value capture, else random
    candidates.sort((a,b) => {
      const va = BOARD[a.tr][a.tc] ? pieceValue(BOARD[a.tr][a.tc].sym) : 0;
      const vb = BOARD[b.tr][b.tc] ? pieceValue(BOARD[b.tr][b.tc].sym) : 0;
      return vb - va;
    });
    mv = candidates[0];
  } else {
    // hard: minimax depth 3
    let best = -Infinity, bestMv = candidates[0];
    for (const m of candidates) {
      const orig = BOARD[m.fr][m.fc];
      const cap  = applyMove(m);
      const score = minimax(2, -Infinity, Infinity, false);
      undoMove(m, cap, orig);
      if (score > best) { best = score; bestMv = m; }
    }
    mv = bestMv;
  }

  recordMove(mv.fr, mv.fc, mv.tr, mv.tc);
  const aiPiece = BOARD[mv.fr][mv.fc];
  applyMove(mv);
  turnWhite = true;
  afterMove();
}

function handleBoardClick(mx, my) {
  if (document.getElementById('mode-select') && !document.getElementById('mode-select').classList.contains('hidden')) return;
  if (gameOver) return;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const top = [proj(c,r), proj(c+1,r), proj(c+1,r+1), proj(c,r+1)];
      if (!inQuad(mx, my, top)) continue;

      // Move to a valid square
      if (selected && validMoves.some(m => m.r===r && m.c===c)) {
        const movingPiece = BOARD[selected.r][selected.c];
        recordMove(selected.r, selected.c, r, c);
        BOARD[r][c] = movingPiece;
        BOARD[selected.r][selected.c] = null;
        selected = null; validMoves = [];
        // Pawn promotion
        if (pieceType(movingPiece.sym) === 'pawn' && (r === 0 || r === 7)) {
          showPromotion(r, c, movingPiece.white);
          return;
        }
        turnWhite = !turnWhite;
        afterMove();
        if (CHESS_MODE === 'ai' && !turnWhite && !gameOver) setTimeout(aiMove, 420);
        return;
      }

      // Select own piece (in AI mode black can't be selected)
      const piece = BOARD[r][c];
      if (piece && piece.white === turnWhite && !(CHESS_MODE === 'ai' && !turnWhite)) {
        selected   = {r, c};
        validMoves = getLegalMoves(r, c);
        return;
      }

      // Deselect
      selected = null; validMoves = [];
      return;
    }
  }
  selected = null; validMoves = [];
}

function drawScene(ts) {
  const t = ts / 1000;
  const float = Math.sin(t * .6) * 6;

  ctx.clearRect(0, 0, bc.width, bc.height);
  ox = pillarW + (bc.width - pillarW * 2) / 2;
  oy = bc.height / 2 + float;

  const sA = Math.sin(az), cA = Math.cos(az);
  const T  = TILE * zoom;

  // ── Cast shadow ───────────────────────────────────────────────────────────
  const shadowY = oy + Math.sin(el) * 5.5 * T + DEPTH * T * 1.1 + 10;
  ctx.save();
  ctx.translate(ox, shadowY);
  ctx.scale(1, 0.22);
  const sg = ctx.createRadialGradient(0,0,0, 0,0, T * 5.8);
  sg.addColorStop(0,   'rgba(0,0,0,0.72)');
  sg.addColorStop(.45, 'rgba(0,0,0,0.30)');
  sg.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(0, 0, T * 5.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Under-glow ────────────────────────────────────────────────────────────
  const glowCy = oy + Math.sin(el) * 4.2 * T + 18;
  const g0 = ctx.createRadialGradient(ox, glowCy, T * .5, ox, glowCy, T * 7.5);
  g0.addColorStop(0,   'rgba(100,36,210,.60)');
  g0.addColorStop(.28, 'rgba(70,18,160,.22)');
  g0.addColorStop(.6,  'rgba(40,8,100,.08)');
  g0.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g0; ctx.fillRect(0, 0, bc.width, bc.height);

  // ── Frame depth faces ─────────────────────────────────────────────────────
  const FD = DEPTH * 1.40;
  function frameFace(c0,r0,c1,r1) {
    const a  = proj(c0,r0),     b  = proj(c1,r1);
    const ad = proj(c0,r0,-FD), bd = proj(c1,r1,-FD);
    poly([a,b,bd,ad]);
    const fl = ctx.createLinearGradient(
      (a.x+b.x)/2, Math.min(a.y,b.y),
      (a.x+b.x)/2, Math.max(ad.y,bd.y)
    );
    fl.addColorStop(0,   '#3A3E54');
    fl.addColorStop(.35, '#1C1E2A');
    fl.addColorStop(1,   '#080810');
    ctx.fillStyle = fl; ctx.fill();
    ctx.strokeStyle = 'rgba(140,150,190,.20)'; ctx.lineWidth = .6; ctx.stroke();
  }
  if (cA > 0) frameFace(-FP,8+FP, 8+FP,8+FP);
  if (sA > 0) frameFace(8+FP,-FP, 8+FP,8+FP);
  if (cA < 0) frameFace(-FP,-FP,  8+FP,-FP);
  if (sA < 0) frameFace(-FP,-FP, -FP,8+FP);

  // ── Frame top ring ────────────────────────────────────────────────────────
  const fO = [proj(-FP,-FP), proj(8+FP,-FP), proj(8+FP,8+FP), proj(-FP,8+FP)];
  const fI = [proj(0,0),     proj(8,0),      proj(8,8),        proj(0,8)     ];
  const xL = Math.min(...fO.map(p=>p.x)), xR = Math.max(...fO.map(p=>p.x));
  const gGold = ctx.createLinearGradient(xL, 0, xR, 0);
  gGold.addColorStop(0,    '#2A2C38');
  gGold.addColorStop(.12,  '#7880A0');
  gGold.addColorStop(.28,  '#A8B0CC');
  gGold.addColorStop(.42,  '#D0D8F0');
  gGold.addColorStop(.50,  '#EEF2FF');
  gGold.addColorStop(.58,  '#D0D8F0');
  gGold.addColorStop(.72,  '#A8B0CC');
  gGold.addColorStop(.88,  '#7880A0');
  gGold.addColorStop(1,    '#2A2C38');
  for (let i = 0; i < 4; i++) {
    const ni = (i+1)%4;
    poly([fO[i], fO[ni], fI[ni], fI[i]]);
    ctx.fillStyle = gGold; ctx.fill();
  }
  // Frame inner edge highlight
  poly(fI);
  ctx.strokeStyle = 'rgba(220,230,255,.60)'; ctx.lineWidth = 1.2; ctx.stroke();
  // Frame outer edge
  poly(fO);
  ctx.strokeStyle = 'rgba(40,44,70,.90)'; ctx.lineWidth = 1.0; ctx.stroke();

  // ── Board slab sides (one solid face per visible board edge) ─────────────
  function slabFace(pts) {
    poly(pts);
    const ys = pts.map(p => p.y);
    const sg = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    sg.addColorStop(0,   '#2C2848');
    sg.addColorStop(.45, '#16122A');
    sg.addColorStop(1,   '#05030E');
    ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = 'rgba(160,150,200,.18)'; ctx.lineWidth = .5; ctx.stroke();
  }
  if (sA > 0) slabFace([proj(8,0,0), proj(8,8,0), proj(8,8,-DEPTH), proj(8,0,-DEPTH)]);
  if (sA < 0) slabFace([proj(0,8,0), proj(0,0,0), proj(0,0,-DEPTH), proj(0,8,-DEPTH)]);
  if (cA > 0) slabFace([proj(8,8,0), proj(0,8,0), proj(0,8,-DEPTH), proj(8,8,-DEPTH)]);
  if (cA < 0) slabFace([proj(0,0,0), proj(8,0,0), proj(8,0,-DEPTH), proj(0,0,-DEPTH)]);

  // ── Sort tiles ────────────────────────────────────────────────────────────
  const tiles = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) tiles.push({r,c});
  tiles.sort((a,b) =>
    ((a.c+.5)*sA + (a.r+.5)*cA) - ((b.c+.5)*sA + (b.r+.5)*cA)
  );

  // ── Tiles ─────────────────────────────────────────────────────────────────
  tiles.forEach(({r,c}) => {
    const isL = (r+c) % 2 === 0;

    const p00 = proj(c,   r  );
    const p10 = proj(c+1, r  );
    const p11 = proj(c+1, r+1);
    const p01 = proj(c,   r+1);
    const top  = [p00, p10, p11, p01];
    const hov   = inQuad(mouseX, mouseY, top);
    const isSel   = selected && selected.r === r && selected.c === c;
    const isVM    = validMoves.some(m => m.r === r && m.c === c);
    const isCheck = checkState && BOARD[r][c] && pieceType(BOARD[r][c].sym)==='king' && BOARD[r][c].white===turnWhite;

    // Depth faces — border tiles only, with gradient shading
    function depthFace(pa, pb, colL, colD) {
      const pad = proj(pa.col, pa.row, -DEPTH);
      const pbd = proj(pb.col, pb.row, -DEPTH);
      const pts = [
        proj(pa.col,pa.row), proj(pb.col,pb.row), pbd, pad
      ];
      poly(pts);
      const dfg = ctx.createLinearGradient(
        (pts[0].x+pts[1].x)/2, Math.min(pts[0].y,pts[1].y),
        (pts[0].x+pts[1].x)/2, Math.max(pts[2].y,pts[3].y)
      );
      dfg.addColorStop(0,   colL);
      dfg.addColorStop(.5,  colD);
      dfg.addColorStop(1,   '#020108');
      ctx.fillStyle = dfg; ctx.fill();
      ctx.strokeStyle = 'rgba(200,168,75,.10)'; ctx.lineWidth = .4; ctx.stroke();
    }


    // ── Top face: 3-layer rendering ─────────────────────────────────────────

    // Layer 1 — base
    poly(top);
    ctx.fillStyle = isCheck ? '#FF3030'
      : isSel ? '#FFD700'
      : isVM  ? (isL ? '#7BE87B' : '#1A6B1A')
      : hov   ? (isL ? '#D8CEFF' : '#3A2898')
      :         (isL ? '#C2B6E4' : '#140838');
    ctx.fill();

    // Layer 2 — directional gradient (light from top-left)
    poly(top);
    const dg = ctx.createLinearGradient(p00.x, p00.y, p11.x, p11.y);
    if (isL) {
      dg.addColorStop(0,  'rgba(255,255,255,.30)');
      dg.addColorStop(.5, 'rgba(255,255,255,.06)');
      dg.addColorStop(1,  'rgba(20,10,60,.10)');
    } else {
      dg.addColorStop(0,  'rgba(100,60,200,.18)');
      dg.addColorStop(.5, 'rgba(60,30,130,.06)');
      dg.addColorStop(1,  'rgba(0,0,0,.22)');
    }
    ctx.fillStyle = dg; ctx.fill();

    // Layer 3 — specular hotspot (near p00, top-left corner)
    const specCx = p00.x * .68 + p10.x * .18 + p01.x * .14;
    const specCy = p00.y * .68 + p10.y * .18 + p01.y * .14;
    const specR  = T * (isL ? .55 : .40);
    poly(top);
    ctx.save(); ctx.clip();
    const sg2 = ctx.createRadialGradient(specCx, specCy, 0, specCx, specCy, specR);
    if (isL) {
      sg2.addColorStop(0,  'rgba(255,255,255,.48)');
      sg2.addColorStop(.4, 'rgba(255,255,255,.12)');
      sg2.addColorStop(1,  'rgba(0,0,0,0)');
    } else {
      sg2.addColorStop(0,  'rgba(150,90,255,.22)');
      sg2.addColorStop(.5, 'rgba(100,50,200,.06)');
      sg2.addColorStop(1,  'rgba(0,0,0,0)');
    }
    ctx.fillStyle = sg2;
    ctx.fillRect(
      Math.min(p00.x,p10.x,p11.x,p01.x)-2,
      Math.min(p00.y,p10.y,p11.y,p01.y)-2,
      T*2+4, T*2+4
    );
    ctx.restore();

    // Hover rim glow
    if (hov) {
      poly(top);
      ctx.save(); ctx.clip();
      const hg = ctx.createRadialGradient(
        (p00.x+p11.x)/2, (p00.y+p11.y)/2, 0,
        (p00.x+p11.x)/2, (p00.y+p11.y)/2, T
      );
      hg.addColorStop(0, 'rgba(230,200,255,.28)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(
        Math.min(p00.x,p10.x,p11.x,p01.x)-2,
        Math.min(p00.y,p10.y,p11.y,p01.y)-2,
        T*2+4, T*2+4
      );
      ctx.restore();
    }

    // Top face border
    poly(top);
    ctx.strokeStyle = isCheck ? 'rgba(255,60,60,1.0)'
      : isSel ? 'rgba(255,200,0,1.0)'
      : isVM  ? 'rgba(60,220,60,0.9)'
      : hov   ? 'rgba(240,210,80,1.0)'
      :         'rgba(200,168,75,.22)';
    ctx.lineWidth = (isCheck || isSel || isVM || hov) ? 2.0 : 0.5;
    ctx.stroke();

  });

  // ── Pieces (drawn after ALL tiles — separate pass, back→front) ───────────
  tiles.forEach(({r, c}) => {
    const piece = BOARD[r][c];
    if (!piece) return;

    const base = proj(c+.5, r+.5, 0);
    // Screen-space lift: always visible regardless of elevation angle
    const lift = Math.max(T * 0.28, 16);
    const pp   = { x: base.x, y: base.y - lift };
    const pSz  = Math.max(14, T * 0.80);

    ctx.save();
    ctx.font = `${pSz}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow on tile surface
    ctx.globalAlpha = .25;
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = '#000';
    ctx.fillText(piece.sym, base.x + T*.05, base.y + T*.05);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;

    if (piece.white) {
      ctx.strokeStyle = '#1A0A40';
      ctx.lineWidth = pSz * .12;
      ctx.strokeText(piece.sym, pp.x, pp.y);
      ctx.shadowColor = 'rgba(255,255,255,.9)';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = '#FFFFFF';
      ctx.fillText(piece.sym, pp.x, pp.y);
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#EEE8FF';
      ctx.fillText(piece.sym, pp.x, pp.y);
    } else {
      ctx.strokeStyle = '#3A1800';
      ctx.lineWidth = pSz * .12;
      ctx.strokeText(piece.sym, pp.x, pp.y);
      ctx.shadowColor = 'rgba(255,180,0,.8)';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = '#F0A020';
      ctx.fillText(piece.sym, pp.x, pp.y);
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#FFD060';
      ctx.fillText(piece.sym, pp.x, pp.y);
    }
    ctx.restore();
  });

  // ── Corner ornaments ──────────────────────────────────────────────────────
  ornament(proj(-FP,   -FP  ));
  ornament(proj(8+FP,  -FP  ));
  ornament(proj(8+FP,  8+FP ));
  ornament(proj(-FP,   8+FP ));

  // ── Coordinate labels (engraved on frame) ─────────────────────────────────
  const fs = Math.max(8, Math.round(T * .20));
  ctx.font = `700 ${fs}px 'Courier New', monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const LO = FP * .48;

  // Files a–h bottom frame
  for (let c = 0; c < 8; c++) {
    const lp = proj(c + .5, 8 + LO);
    ctx.fillStyle = 'rgba(200,210,240,.80)';
    ctx.fillText(FILES[c], lp.x, lp.y);
  }
  // Ranks 8–1 left frame
  for (let r = 0; r < 8; r++) {
    const lp = proj(-LO, r + .5);
    ctx.fillStyle = 'rgba(200,210,240,.80)';
    ctx.fillText(RANKS[r], lp.x, lp.y);
  }

  requestAnimationFrame(drawScene);
}

requestAnimationFrame(drawScene);
