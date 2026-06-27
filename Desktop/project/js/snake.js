
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
    }, true);
  


    localStorage.removeItem('kq_super_pw');
    // ── Canvas setup — responsive size ────────────────────────────────────────
    const COLS = 24, ROWS = 24;
    const canvas = document.getElementById('game-canvas');
    const ctx    = canvas.getContext('2d');
    const wrap   = document.getElementById('canvas-wrap');

    function computeCell() {
      const maxW = window.innerWidth  - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pillar-w')) || 72) * 2 - 28;
      const maxH = window.innerHeight - 148;
      return Math.floor(Math.min(maxW / COLS, maxH / ROWS, 30));
    }
    let CELL = computeCell();

    function resizeCanvas() {
      CELL = computeCell();
      canvas.width  = COLS * CELL;
      canvas.height = ROWS * CELL;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ── State ─────────────────────────────────────────────────────────────────
    const SPEED_BASE = { easy: 160, normal: 110, hard: 72 };
    let difficulty   = 'normal';
    let selectedDiff = 'normal';
    let hiScore      = Number(localStorage.getItem('nq_snake_hi') || 0);
    document.getElementById('hud-hi').textContent = hiScore;

    // ── Skins ─────────────────────────────────────────────────────────────────
    const SKINS = {
      cyan:   { h1:'#aaffff', h2:'#00cccc', glow:'#00ffee',  pupil:'#00ffee',  bodyRgb:(f)=>[Math.round(120+f*80), Math.round(30+f*20),  Math.round(210+f*45)] },
      green:  { h1:'#aaffcc', h2:'#00bb66', glow:'#00ff88',  pupil:'#00ff88',  bodyRgb:(f)=>[Math.round(30+f*40),  Math.round(170+f*70), Math.round(80+f*40)]  },
      orange: { h1:'#ffcc88', h2:'#ee6600', glow:'#ff8800',  pupil:'#ffaa00',  bodyRgb:(f)=>[Math.round(200+f*40), Math.round(70+f*50),  Math.round(10+f*10)]  },
      pink:   { h1:'#ffaaee', h2:'#cc22aa', glow:'#ff44cc',  pupil:'#ff88ee',  bodyRgb:(f)=>[Math.round(180+f*60), Math.round(30+f*20),  Math.round(150+f*40)] },
      gold:   { h1:'#fff0aa', h2:'#ddaa00', glow:'#ffd700',  pupil:'#ffd700',  bodyRgb:(f)=>[Math.round(160+f*70), Math.round(110+f*50), Math.round(10+f*10)]  },
    };
    let selectedSkin = localStorage.getItem('nq_skin') || 'cyan';

    // ── Feature flags (from start-screen) ────────────────────────────────────
    let featureObstacles = localStorage.getItem('nq_feat_obstacles') !== '0';
    let featurePortals   = localStorage.getItem('nq_feat_portals')   !== '0';
    let featureBombs     = localStorage.getItem('nq_feat_bombs')     !== '0';

    let paused = false;
    let prevSnake = [], lastStepTime = 0, currentInterval = 110;

    // ── Extra settings ────────────────────────────────────────────────────────
    let wallWrap       = localStorage.getItem('nq_wall_wrap')   === '1';
    let showGrid       = localStorage.getItem('nq_show_grid')   !== '0';
    let showTrail      = localStorage.getItem('nq_trail')       !== '0';
    let multiFoodCount = Math.max(1, Math.min(3, Number(localStorage.getItem('nq_multi_food') || 1)));
    let extraFoods     = [];

    let snake, dir, nextDir, food, specialFood;
    let score, foodEaten, gameRunning, loopTimer;
    let flashFx = 0, gameoverFx = 0;
    let particles = [];
    let scorePops = [];
    let obstacles  = new Set();
    let bombFood   = null;
    let portals    = [];
    let portalCooldown = 0;
    let obstaclesEnabled = true;

    // ── Difficulty selector ───────────────────────────────────────────────────
    document.querySelectorAll('.diff-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDiff = btn.dataset.diff;
        document.querySelectorAll('.diff-opt').forEach(b => {
          b.className = 'diff-opt' + (b.dataset.diff === selectedDiff ? ' active-' + selectedDiff : '');
        });
      });
    });

    // ── Feature toggles ──────────────────────────────────────────────────────
    (function initFeatureUI() {
      const feats = { obstacles: featureObstacles, portals: featurePortals, bombs: featureBombs };
      Object.entries(feats).forEach(([key, val]) => {
        const btn = document.getElementById('feat-' + key);
        if (!btn) return;
        btn.classList.toggle('on', val);
        btn.querySelector('.ft-status').textContent = val ? 'ON' : 'OFF';
      });

      document.querySelectorAll('.feat-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const feat = btn.dataset.feat;
          const isOn = btn.classList.toggle('on');
          btn.querySelector('.ft-status').textContent = isOn ? 'ON' : 'OFF';
          const key = 'nq_feat_' + feat;
          if (isOn) localStorage.removeItem(key); else localStorage.setItem(key, '0');
          if (feat === 'obstacles') featureObstacles = isOn;
          if (feat === 'portals')   featurePortals   = isOn;
          if (feat === 'bombs')     featureBombs     = isOn;
        });
      });
    })();

    // ── Skin picker ───────────────────────────────────────────────────────────
    (function initSkinUI() {
      document.querySelectorAll('.skin-swatch').forEach(btn => {
        if (btn.dataset.skin === selectedSkin) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.addEventListener('click', () => {
          selectedSkin = btn.dataset.skin;
          localStorage.setItem('nq_skin', selectedSkin);
          document.querySelectorAll('.skin-swatch').forEach(b => b.classList.toggle('active', b.dataset.skin === selectedSkin));
        });
      });
    })();

    // ── Start-screen extra options ────────────────────────────────────────────
    (function initExtraUI() {
      const opts2 = {
        wallwrap: [()=>wallWrap,  v=>{wallWrap=v;  v ? localStorage.setItem('nq_wall_wrap','1')  : localStorage.removeItem('nq_wall_wrap');}],
        grid:     [()=>showGrid,  v=>{showGrid=v;  v ? localStorage.removeItem('nq_show_grid')   : localStorage.setItem('nq_show_grid','0');}],
        trail:    [()=>showTrail, v=>{showTrail=v; v ? localStorage.removeItem('nq_trail')        : localStorage.setItem('nq_trail','0');}],
      };

      function syncExtra() {
        Object.entries(opts2).forEach(([key, [getter]]) => {
          const btn = document.getElementById('feat-' + key);
          if (!btn) return;
          const val = getter();
          btn.classList.toggle('on', val);
          btn.querySelector('.ft-status').textContent = val ? 'ON' : 'OFF';
          // sync settings overlay counterpart
          const btn2 = document.getElementById('sopt-' + key);
          if (btn2) { btn2.classList.toggle('on', val); btn2.querySelector('.ft-status').textContent = val ? 'ON' : 'OFF'; }
        });
      }
      syncExtra();

      document.querySelectorAll('[data-feat2]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.feat2;
          const [getter, setter] = opts2[key];
          setter(!getter());
          syncExtra();
        });
      });

      // Food count on start screen
      function syncFoodBtns() {
        document.querySelectorAll('[data-foodcount]').forEach(b => {
          const n = Number(b.dataset.foodcount);
          b.className = 'food-opt' + (n === multiFoodCount ? ' active-easy' : '');
        });
        // sync settings overlay
        document.querySelectorAll('[data-sfood]').forEach(b => {
          b.className = 'diff-opt-s' + (Number(b.dataset.sfood) === multiFoodCount ? ' active-s-easy' : '');
        });
      }
      syncFoodBtns();

      document.querySelectorAll('[data-foodcount]').forEach(btn => {
        btn.addEventListener('click', () => {
          multiFoodCount = Number(btn.dataset.foodcount);
          localStorage.setItem('nq_multi_food', multiFoodCount);
          syncFoodBtns();
        });
      });
    })();

    // ── Settings overlay (from Game Over screen) ─────────────────────────────
    (function initSettingsUI() {
      // Sync difficulty buttons
      function syncSDiff() {
        document.querySelectorAll('.diff-opt-s').forEach(b => {
          b.className = 'diff-opt-s' + (b.dataset.sdiff === selectedDiff ? ' active-s-' + selectedDiff : '');
        });
      }
      syncSDiff();
      document.querySelectorAll('.diff-opt-s').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedDiff = btn.dataset.sdiff;
          // Also sync the start-screen buttons
          document.querySelectorAll('.diff-opt').forEach(b => {
            b.className = 'diff-opt' + (b.dataset.diff === selectedDiff ? ' active-' + selectedDiff : '');
          });
          syncSDiff();
        });
      });

      // Sync feature toggles
      function syncSFeats() {
        const feats = { obstacles: featureObstacles, portals: featurePortals, bombs: featureBombs };
        Object.entries(feats).forEach(([key, val]) => {
          const btn = document.getElementById('sfeat-' + key);
          if (!btn) return;
          btn.classList.toggle('on', val);
          btn.querySelector('.ft-status').textContent = val ? 'ON' : 'OFF';
        });
      }
      syncSFeats();
      document.querySelectorAll('.feat-toggle-s').forEach(btn => {
        btn.addEventListener('click', () => {
          const feat = btn.dataset.sfeat;
          const isOn = btn.classList.toggle('on');
          btn.querySelector('.ft-status').textContent = isOn ? 'ON' : 'OFF';
          const lsKey = 'nq_feat_' + feat;
          if (isOn) localStorage.removeItem(lsKey); else localStorage.setItem(lsKey, '0');
          if (feat === 'obstacles') featureObstacles = isOn;
          if (feat === 'portals')   featurePortals   = isOn;
          if (feat === 'bombs')     featureBombs     = isOn;
          // Sync start-screen toggles
          const mainBtn = document.getElementById('feat-' + feat);
          if (mainBtn) { mainBtn.classList.toggle('on', isOn); mainBtn.querySelector('.ft-status').textContent = isOn ? 'ON' : 'OFF'; }
        });
      });

      // Sync skin swatches
      function syncSSkins() {
        document.querySelectorAll('.skin-swatch-s').forEach(b => b.classList.toggle('active', b.dataset.sskin === selectedSkin));
      }
      syncSSkins();
      document.querySelectorAll('.skin-swatch-s').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedSkin = btn.dataset.sskin;
          localStorage.setItem('nq_skin', selectedSkin);
          syncSSkins();
          document.querySelectorAll('.skin-swatch').forEach(b => b.classList.toggle('active', b.dataset.skin === selectedSkin));
        });
      });

      // Extra options (wall wrap, grid, trail)
      const extraOpts = { wallwrap: [()=>wallWrap, v=>{wallWrap=v; if(v)localStorage.setItem('nq_wall_wrap','1'); else localStorage.removeItem('nq_wall_wrap');} ],
                          grid:     [()=>showGrid, v=>{showGrid=v; if(!v)localStorage.setItem('nq_show_grid','0'); else localStorage.removeItem('nq_show_grid');}],
                          trail:    [()=>showTrail, v=>{showTrail=v; if(!v)localStorage.setItem('nq_trail','0'); else localStorage.removeItem('nq_trail');}] };
      function syncSopts() {
        Object.entries(extraOpts).forEach(([key, [getter]]) => {
          const btn = document.getElementById('sopt-' + key);
          if (!btn) return;
          const val = getter();
          btn.classList.toggle('on', val);
          btn.querySelector('.ft-status').textContent = val ? 'ON' : 'OFF';
        });
      }
      syncSopts();
      document.querySelectorAll('[data-sopt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.sopt;
          const [getter, setter] = extraOpts[key];
          setter(!getter());
          syncSopts();
          // sync start screen
          const startBtn = document.getElementById('feat-' + key);
          if (startBtn) { startBtn.classList.toggle('on', getter()); startBtn.querySelector('.ft-status').textContent = getter() ? 'ON' : 'OFF'; }
        });
      });

      // Food count
      function syncSFood() {
        document.querySelectorAll('[data-sfood]').forEach(b => {
          const n = Number(b.dataset.sfood);
          b.className = 'diff-opt-s' + (n === multiFoodCount ? ' active-s-easy' : '');
        });
      }
      syncSFood();
      document.querySelectorAll('[data-sfood]').forEach(btn => {
        btn.addEventListener('click', () => {
          multiFoodCount = Number(btn.dataset.sfood);
          localStorage.setItem('nq_multi_food', multiFoodCount);
          syncSFood();
          // sync start screen
          document.querySelectorAll('[data-foodcount]').forEach(b => {
            b.className = 'food-opt' + (Number(b.dataset.foodcount) === multiFoodCount ? ' active-easy' : '');
          });
        });
      });

      // Open / close
      document.getElementById('settings-btn').addEventListener('click', () => {
        syncSDiff(); syncSFeats(); syncSSkins(); syncSopts(); syncSFood();
        document.getElementById('gameover-overlay').classList.remove('visible');
        document.getElementById('settings-overlay').classList.add('visible');
      });
      document.getElementById('settings-close').addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.remove('visible');
        document.getElementById('gameover-overlay').classList.add('visible');
      });
      document.getElementById('settings-play-btn').addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.remove('visible');
        startGame();
      });
    })();

    // ── Game init ─────────────────────────────────────────────────────────────
    function initGame() {
      const mx = Math.floor(COLS / 2);
      const my = Math.floor(ROWS / 2);
      snake   = [{ x: mx, y: my }, { x: mx-1, y: my }, { x: mx-2, y: my }];
      dir     = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      score = 0; foodEaten = 0;
      flashFx = 0; gameoverFx = 0;
      particles = []; scorePops = [];
      prevSnake = []; lastStepTime = 0;
      specialFood = null;
      bombFood    = null;
      portals     = [];
      portalCooldown = 0;
      obstacles.clear();
      scoreMultiplier = 1;
      const mBtn = document.getElementById('sa-multiplier');
      if (mBtn) { mBtn.classList.remove('active'); mBtn.textContent = '×2 Score Multiplier'; }
      difficulty  = selectedDiff;
      obstaclesEnabled = featureObstacles;
      extraFoods = [];
      if (obstaclesEnabled) spawnObstacles();
      spawnFood();
      syncExtraFoods();
      if (featurePortals) spawnPortals();
      document.getElementById('hud-score').textContent = 0;
      document.getElementById('hud-len-val').textContent = snake.length;
      document.getElementById('hud-speed-val').textContent = 1;
    }

    function occupiedCells() {
      const occ = new Set(snake.map(s => s.x + ',' + s.y));
      obstacles.forEach(k => occ.add(k));
      portals.forEach(p => occ.add(p.x + ',' + p.y));
      if (food)        occ.add(food.x + ',' + food.y);
      extraFoods.forEach(f => occ.add(f.x + ',' + f.y));
      if (specialFood) occ.add(specialFood.x + ',' + specialFood.y);
      if (bombFood)    occ.add(bombFood.x + ',' + bombFood.y);
      return occ;
    }

    function randFreeCell(occ) {
      let x, y, t = 0;
      do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); t++; }
      while (occ.has(x + ',' + y) && t < 400);
      return { x, y };
    }

    function spawnFood() {
      const occ = occupiedCells();
      occ.delete(food ? food.x + ',' + food.y : '');
      const p = randFreeCell(occ);
      food = { x: p.x, y: p.y };
    }

    function syncExtraFoods() {
      const target = multiFoodCount - 1;
      while (extraFoods.length > target) extraFoods.pop();
      while (extraFoods.length < target) extraFoods.push(randFreeCell(occupiedCells()));
    }

    function spawnSpecial() {
      const occ = occupiedCells();
      const p = randFreeCell(occ);
      specialFood = { x: p.x, y: p.y, born: performance.now() };
    }

    function spawnBomb() {
      const occ = occupiedCells();
      const p = randFreeCell(occ);
      bombFood = { x: p.x, y: p.y, born: performance.now() };
    }

    function spawnObstacles() {
      obstacles.clear();
      const count = { easy: 8, normal: 14, hard: 22 }[difficulty] || 14;
      const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
      let tries = 0;
      while (obstacles.size < count && tries < 600) {
        tries++;
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 3) continue;
        obstacles.add(x + ',' + y);
      }
    }

    function spawnPortals() {
      portals = [];
      const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
      const occ = new Set(snake.map(s => s.x + ',' + s.y));
      obstacles.forEach(k => occ.add(k));
      for (let i = 0; i < 2; i++) {
        let x, y, t = 0;
        do {
          x = Math.floor(Math.random() * COLS);
          y = Math.floor(Math.random() * ROWS);
          t++;
        } while ((occ.has(x + ',' + y) || (Math.abs(x-cx)<4 && Math.abs(y-cy)<3)) && t < 300);
        portals.push({ x, y });
        occ.add(x + ',' + y);
      }
    }

    function getInterval() {
      const base  = SPEED_BASE[difficulty];
      const level = getSpeedLevel();
      const step  = difficulty === 'hard' ? 5 : 8;
      return Math.max(55, base - (level - 1) * step);
    }

    function getSpeedLevel() {
      return Math.min(10, 1 + Math.floor(score / 60));
    }

    // ── Particles ─────────────────────────────────────────────────────────────
    function spawnParticles(x, y, color, count) {
      const px = x * CELL + CELL / 2;
      const py = y * CELL + CELL / 2;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 1.5 + Math.random() * 2.5;
        particles.push({
          x: px, y: py,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          decay: 0.035 + Math.random() * 0.025,
          r: 2.5 + Math.random() * 2,
          color,
        });
      }
    }

    function spawnScorePop(gridX, gridY, text, color) {
      const px = gridX * CELL;
      const py = gridY * CELL;
      const el = document.createElement('div');
      el.className  = 'score-pop';
      el.textContent = text;
      el.style.color = color;
      el.style.left  = px + 'px';
      el.style.top   = py + 'px';
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 900);
    }

    // ── Game step ─────────────────────────────────────────────────────────────
    function applyPortal(head) {
      if (portalCooldown > 0) { portalCooldown--; return head; }
      for (let i = 0; i < portals.length; i++) {
        if (head.x === portals[i].x && head.y === portals[i].y) {
          const dest = portals[1 - i];
          spawnParticles(dest.x, dest.y, i === 0 ? '#00ffff' : '#ff00ff', 14);
          portalCooldown = 4;
          return { x: dest.x, y: dest.y };
        }
      }
      return head;
    }

    function step() {
      dir = { ...nextDir };
      let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { endGame(); return; }
      if (obstacles.has(head.x + ',' + head.y))             { endGame(); return; }
      if (snake.some(s => s.x === head.x && s.y === head.y)) { endGame(); return; }

      head = applyPortal(head);

      snake.unshift(head);
      let ate = false;

      // Bomb check
      if (bombFood && head.x === bombFood.x && head.y === bombFood.y) {
        bombFood = null;
        spawnParticles(head.x, head.y, '#ff3333', 18);
        spawnScorePop(head.x, head.y, '💥', '#ff3333');
        endGame(); return;
      }

      if (head.x === food.x && head.y === food.y) {
        const pts = 10 * scoreMultiplier;
        score += pts; foodEaten++;
        flashFx = 1.0; ate = true;
        spawnParticles(head.x, head.y, '#ffd700', 10);
        spawnScorePop(head.x, head.y, '+' + pts, '#ffd700');
        spawnFood();
        if (foodEaten % 5 === 0 && !specialFood) spawnSpecial();
        if (foodEaten % 7 === 0 && !bombFood && featureBombs) spawnBomb();
      } else {
        // Extra foods
        for (let _fi = extraFoods.length - 1; _fi >= 0; _fi--) {
          if (head.x === extraFoods[_fi].x && head.y === extraFoods[_fi].y) {
            const pts = 10 * scoreMultiplier;
            score += pts; foodEaten++;
            flashFx = 1.0; ate = true;
            spawnParticles(head.x, head.y, '#ffd700', 10);
            spawnScorePop(head.x, head.y, '+' + pts, '#ffd700');
            extraFoods.splice(_fi, 1);
            extraFoods.push(randFreeCell(occupiedCells()));
            if (foodEaten % 5 === 0 && !specialFood) spawnSpecial();
            if (foodEaten % 7 === 0 && !bombFood && featureBombs) spawnBomb();
            break;
          }
        }
      }

      if (specialFood && head.x === specialFood.x && head.y === specialFood.y) {
        const pts = 50 * scoreMultiplier;
        score += pts; flashFx = 1.0; ate = true;
        spawnParticles(head.x, head.y, '#00ffee', 16);
        spawnScorePop(head.x, head.y, '+' + pts, '#00ffee');
        specialFood = null;
        clearTimeout(loopTimer);
        loopTimer = setTimeout(gameLoop, getInterval() + 150);
        document.getElementById('hud-score').textContent = score;
        document.getElementById('hud-len-val').textContent = snake.length;
        document.getElementById('hud-speed-val').textContent = getSpeedLevel();
        return;
      }

      if (specialFood && performance.now() - specialFood.born > 7000) specialFood = null;
      if (bombFood    && performance.now() - bombFood.born    > 6000) bombFood    = null;

      if (!ate) snake.pop();

      document.getElementById('hud-score').textContent  = score;
      document.getElementById('hud-len-val').textContent = snake.length;
      document.getElementById('hud-speed-val').textContent = getSpeedLevel();

      clearTimeout(loopTimer);
      loopTimer = setTimeout(gameLoop, getInterval());
    }

    function gameLoop() { step(); }

    function startGame() {
      paused = false;
      document.getElementById('pause-overlay').classList.remove('visible');
      initGame();
      gameRunning = true;
      // Apply skin glow to canvas border
      const sk = SKINS[selectedSkin] || SKINS.cyan;
      document.getElementById('canvas-wrap').style.boxShadow =
        `0 0 0 2px rgba(140,70,255,0.22), 0 0 36px ${sk.glow}88, 0 0 70px ${sk.glow}44`;
      document.getElementById('start-overlay').classList.remove('visible');
      document.getElementById('gameover-overlay').classList.remove('visible');
      clearTimeout(loopTimer);
      loopTimer = setTimeout(gameLoop, getInterval());
    }

    function endGame() {
      gameRunning = false;
      clearTimeout(loopTimer);
      gameoverFx = 1.0;
      const isNew = score > hiScore;
      if (isNew) {
        hiScore = score;
        localStorage.setItem('nq_snake_hi', hiScore);
        document.getElementById('hud-hi').textContent = hiScore;
      }
      setTimeout(() => {
        document.getElementById('go-score').textContent   = 'Score: ' + score;
        document.getElementById('go-hi').textContent      = 'Best: ' + hiScore;
        document.getElementById('go-newhi').style.display = isNew ? 'block' : 'none';
        document.getElementById('gameover-overlay').classList.add('visible');
      }, 700);
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
      if (document.activeElement.tagName === 'INPUT') return;
      const map = {
        w:[-0,1,-1,0], W:[-0,1,-1,0],
        s:[0,1,1,0],   S:[0,1,1,0],
        a:[-1,0,0,-1], A:[-1,0,0,-1],
        d:[1,0,0,1],   D:[1,0,0,1],
      };
      const dirs = {
        w:{x:0,y:-1}, W:{x:0,y:-1}, ArrowUp:{x:0,y:-1},
        s:{x:0,y:1},  S:{x:0,y:1},  ArrowDown:{x:0,y:1},
        a:{x:-1,y:0}, A:{x:-1,y:0}, ArrowLeft:{x:-1,y:0},
        d:{x:1,y:0},  D:{x:1,y:0},  ArrowRight:{x:1,y:0},
      };
      const d = dirs[e.key];
      if (!d) return;
      e.preventDefault();
      if (!gameRunning) return;
      if (d.x === -dir.x && d.y === -dir.y) return;
      nextDir = d;
    });

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('retry-btn').addEventListener('click', startGame);

    // ── Pause ─────────────────────────────────────────────────────────────────
    const pauseOverlay = document.getElementById('pause-overlay');

    function setPause(val) {
      paused = val;
      pauseOverlay.classList.toggle('visible', paused);
      if (!paused && gameRunning) {
        clearTimeout(loopTimer);
        loopTimer = setTimeout(gameLoop, getInterval());
      } else if (paused) {
        clearTimeout(loopTimer);
      }
    }

    document.addEventListener('keydown', e => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if ((e.key === ' ' || e.key === 'Escape') && gameRunning) {
        e.preventDefault();
        setPause(!paused);
      }
    });

    // Patch patchedStep to respect pause
    const _origPatchedStep = patchedStep;

    // ── Touch / swipe controls ────────────────────────────────────────────────
    let touchStart = null;
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (!touchStart || !gameRunning || paused) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      let d;
      if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? {x:1,y:0} : {x:-1,y:0};
      else                              d = dy > 0 ? {x:0,y:1} : {x:0,y:-1};
      if (d.x === -dir.x && d.y === -dir.y) return;
      nextDir = d;
    }, { passive: false });

    // D-pad buttons
    // Apply hub control setting to D-pad and pause button
    (function() {
      const ctrl = localStorage.getItem('hub_control');
      const dpad = document.getElementById('dpad');
      const pauseBtn = document.getElementById('snake-pause-btn');
      const show = ctrl === 'mobile';
      const hide = ctrl === 'pc';
      if (dpad) {
        if (show) dpad.style.display = 'grid';
        else if (hide) dpad.style.display = 'none';
      }
      if (pauseBtn) {
        if (show) pauseBtn.style.display = 'flex';
        else if (hide) pauseBtn.style.display = 'none';
      }
    })();

    function dpadDir(d) {
      if (!gameRunning || paused) return;
      if (d.x === -dir.x && d.y === -dir.y) return;
      nextDir = d;
    }
    const _dpadEl = document.getElementById('dpad');
    [['dp-up',{x:0,y:-1}],['dp-down',{x:0,y:1}],['dp-left',{x:-1,y:0}],['dp-right',{x:1,y:0}]].forEach(([id,d]) => {
      const btn = document.getElementById(id);
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        btn.classList.add('pressed');
        _dpadEl && _dpadEl.classList.add('touching');
        dpadDir(d);
      }, { passive: false });
      btn.addEventListener('touchend', e => {
        btn.classList.remove('pressed');
        // remove touching if no other button active
        if (!_dpadEl.querySelector('.pressed')) _dpadEl.classList.remove('touching');
      });
      btn.addEventListener('click', () => dpadDir(d));
    });

    // Mobile pause button
    const _pauseBtn = document.getElementById('snake-pause-btn');
    if (_pauseBtn) {
      _pauseBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        _pauseBtn.classList.add('touching');
        if (gameRunning) setPause(!paused);
      }, { passive: false });
      _pauseBtn.addEventListener('touchend',    () => _pauseBtn.classList.remove('touching'));
      _pauseBtn.addEventListener('touchcancel', () => _pauseBtn.classList.remove('touching'));
      _pauseBtn.addEventListener('click', () => { if (gameRunning) setPause(!paused); });
    }

    // ── Toast notification ────────────────────────────────────────────────────
    function showToast(msg, color) {
      let t = document.getElementById('snake-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'snake-toast';
        Object.assign(t.style, {
          position:'fixed', bottom:'32px', left:'50%', transform:'translateX(-50%) translateY(20px)',
          background:'rgba(14,8,30,0.96)', border:'1.5px solid rgba(160,80,255,0.55)',
          borderRadius:'12px', padding:'11px 24px', fontSize:'0.82rem', fontWeight:'700',
          letterSpacing:'0.06em', color:'#d0aaff', boxShadow:'0 0 28px rgba(120,0,220,0.40)',
          zIndex:'9999', pointerEvents:'none', opacity:'0',
          transition:'opacity 0.22s ease, transform 0.22s ease',
          fontFamily:"'Orbitron',sans-serif", textAlign:'center', whiteSpace:'nowrap',
        });
        document.body.appendChild(t);
      }
      clearTimeout(t._timer);
      t.style.color  = color || '#d0aaff';
      t.style.borderColor = color ? color.replace(')',',0.55)').replace('rgb','rgba') : 'rgba(160,80,255,0.55)';
      t.textContent  = msg;
      t.style.opacity   = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
      t._timer = setTimeout(() => {
        t.style.opacity   = '0';
        t.style.transform = 'translateX(-50%) translateY(20px)';
      }, 3000);
    }

    // ── 'P' key → open admin panel ────────────────────────────────────────────
    document.addEventListener('keydown', e => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (e.key === 'p' || e.key === 'P') {
        if (isAdminSession()) {
          sidebar.classList.toggle('open');
        } else {
          showToast('⚠ Login as Admin from the main menu first', '#ffaa44');
        }
      }
    });

    // ── Rendering ─────────────────────────────────────────────────────────────
    function drawBg(t) {
      ctx.fillStyle = '#080614';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Twinkling stars
      STARS.forEach(s => {
        const twinkle = 0.45 + 0.55 * (Math.sin(t * s.speed + s.phase) * 0.5 + 0.5);
        ctx.save();
        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fillStyle = '#e8d8ff';
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Grid
      if (showGrid) {
        ctx.strokeStyle = 'rgba(55,25,95,0.13)';
        ctx.lineWidth   = 0.5;
        for (let x = 0; x <= COLS; x++) {
          ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= ROWS; y++) {
          ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke();
        }
      }
    }

    function drawFood(t, fx, fy) {
      const pulse = (Math.sin(t * 3.5) + 1) / 2;
      const cx = (fx !== undefined ? fx : food.x) * CELL + CELL / 2;
      const cy = (fy !== undefined ? fy : food.y) * CELL + CELL / 2;
      const r  = CELL * 0.28 + pulse * CELL * 0.07;

      ctx.save();
      // Outer glow ring
      ctx.globalAlpha = 0.25 + pulse * 0.15;
      ctx.fillStyle   = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 16 + pulse * 10;
      ctx.fillStyle   = '#ffd700';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Sheen
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = 'rgba(255,255,220,0.55)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSpecial(t) {
      if (!specialFood) return;
      const age  = (performance.now() - specialFood.born) / 7000;
      const fade = age > 0.75 ? 1 - (age - 0.75) / 0.25 : 1;
      const pulse = (Math.sin(t * 5) + 1) / 2;
      const spin  = t * 3;
      const cx = specialFood.x * CELL + CELL / 2;
      const cy = specialFood.y * CELL + CELL / 2;
      const R1 = CELL * 0.32 + pulse * CELL * 0.08;
      const R2 = R1 * 0.42;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.shadowColor = '#00ffee';
      ctx.shadowBlur  = 22 + pulse * 14;
      ctx.fillStyle   = '#00ffee';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? R1 : R2;
        i === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
                : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    function drawSnake(t) {
      if (!snake || snake.length === 0) return;
      const sk  = SKINS[selectedSkin] || SKINS.cyan;
      const len = snake.length;

      // Ease-out: starts immediately, decelerates at the end
      const raw  = lastStepTime > 0 ? Math.min(1, (performance.now() - lastStepTime) / Math.max(30, currentInterval)) : 1;
      const prog = 1 - Math.pow(1 - raw, 2);

      function segPos(i) {
        const cur = snake[i];
        const prv = prevSnake[i];
        if (!prv || prog >= 1) return { x: cur.x * CELL + CELL / 2, y: cur.y * CELL + CELL / 2 };
        const dx = cur.x - prv.x;
        const dy = cur.y - prv.y;
        // Detect wall-wrap: if distance > half the board, snap to current position
        if (Math.abs(dx) > COLS / 2 || Math.abs(dy) > ROWS / 2) {
          return { x: cur.x * CELL + CELL / 2, y: cur.y * CELL + CELL / 2 };
        }
        return {
          x: (prv.x + dx * prog) * CELL + CELL / 2,
          y: (prv.y + dy * prog) * CELL + CELL / 2,
        };
      }

      const R  = CELL * 0.43;
      const HR = CELL * 0.47;

      // Motion trail — ghost images behind head
      if (showTrail && prog < 0.75 && len > 0) {
        for (let _ti = 2; _ti >= 1; _ti--) {
          const _tp  = Math.max(0, prog - _ti * 0.20);
          const _eop = 1 - Math.pow(1 - _tp, 2);
          const prv0 = prevSnake[0];
          if (!prv0) break;
          const _tx  = (prv0.x + (snake[0].x - prv0.x) * _eop) * CELL + CELL / 2;
          const _ty  = (prv0.y + (snake[0].y - prv0.y) * _eop) * CELL + CELL / 2;
          ctx.save();
          ctx.globalAlpha = (0.14 - _ti * 0.05) * (1 - prog);
          ctx.fillStyle = sk.h2;
          ctx.shadowColor = sk.glow; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(_tx, _ty, HR * (1 - _ti * 0.1), 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }

      // Draw body back-to-front (tail → neck)
      for (let i = len - 1; i >= 1; i--) {
        const frac   = i / Math.max(1, len - 1);
        const bright = 1 - frac * 0.62;
        const alpha  = 0.55 + bright * 0.45;
        const [rv, gv, bv] = sk.bodyRgb(bright);
        const color = `rgba(${rv},${gv},${bv},${alpha})`;
        const pos   = segPos(i);
        const posN  = segPos(i - 1);

        ctx.save();
        ctx.fillStyle   = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = `rgba(${rv},${gv},${bv},0.5)`;
        ctx.shadowBlur  = 9 * bright;
        ctx.lineWidth   = R * 2;
        ctx.lineCap     = 'round';

        // Tube connecting this segment to the next toward head
        // Skip tube if segments are on opposite sides of a wall-wrap
        const tdx = Math.abs(posN.x - pos.x), tdy = Math.abs(posN.y - pos.y);
        if (tdx < CELL * (COLS / 2) && tdy < CELL * (ROWS / 2)) {
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(posN.x, posN.y);
          ctx.stroke();
        }

        // Filled circle at segment centre
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Head circle
      const hPos = segPos(0);
      ctx.save();
      ctx.shadowColor = sk.glow;
      ctx.shadowBlur  = 28;
      const grd = ctx.createRadialGradient(hPos.x - HR * 0.25, hPos.y - HR * 0.25, 0, hPos.x, hPos.y, HR);
      grd.addColorStop(0, sk.h1);
      grd.addColorStop(1, sk.h2);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(hPos.x, hPos.y, HR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes
      const eyeR  = HR * 0.22;
      const eyeOff = HR * 0.44;
      const e1 = { x: hPos.x + dir.y * eyeOff, y: hPos.y - dir.x * eyeOff };
      const e2 = { x: hPos.x - dir.y * eyeOff, y: hPos.y + dir.x * eyeOff };
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.beginPath(); ctx.arc(e1.x, e1.y, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e2.x, e2.y, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sk.pupil;
      ctx.shadowColor = sk.pupil; ctx.shadowBlur = 5;
      const po = eyeR * 0.42;
      ctx.beginPath(); ctx.arc(e1.x + dir.x * po, e1.y + dir.y * po, eyeR * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e2.x + dir.x * po, e2.y + dir.y * po, eyeR * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Tongue flick
      const flick = Math.sin(t * 9);
      if (flick > 0.1) {
        const ext    = flick * CELL * 0.44;
        const tRoot  = { x: hPos.x + dir.x * HR, y: hPos.y + dir.y * HR };
        const tMid   = { x: tRoot.x + dir.x * ext * 0.45, y: tRoot.y + dir.y * ext * 0.45 };
        const spread = CELL * 0.15;
        ctx.strokeStyle = '#ff1f55';
        ctx.lineWidth   = Math.max(1.2, CELL * 0.07);
        ctx.lineCap     = 'round';
        ctx.shadowColor = '#ff1f55'; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(tRoot.x, tRoot.y); ctx.lineTo(tMid.x, tMid.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tMid.x, tMid.y);
        ctx.lineTo(tMid.x + dir.x * ext * 0.55 + dir.y * spread, tMid.y + dir.y * ext * 0.55 - dir.x * spread); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tMid.x, tMid.y);
        ctx.lineTo(tMid.x + dir.x * ext * 0.55 - dir.y * spread, tMid.y + dir.y * ext * 0.55 + dir.x * spread); ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    function drawParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.08;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawObstacles(t) {
      if (obstacles.size === 0) return;
      const pulse = (Math.sin(t * 1.8) + 1) / 2;
      ctx.save();
      obstacles.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const px = x * CELL + 2, py = y * CELL + 2;
        const sw = CELL - 4;
        ctx.shadowColor = `rgba(110,0,180,${0.5 + pulse * 0.3})`;
        ctx.shadowBlur  = 10 + pulse * 8;
        ctx.fillStyle   = '#130824';
        ctx.beginPath();
        ctx.roundRect(px, py, sw, sw, 4);
        ctx.fill();
        ctx.shadowBlur  = 0;
        // cross lines
        ctx.strokeStyle = `rgba(140,50,220,${0.55 + pulse * 0.25})`;
        ctx.lineWidth   = 1.5;
        const m = CELL * 0.5, q = CELL * 0.22;
        ctx.beginPath();
        ctx.moveTo(x*CELL + q, y*CELL + m); ctx.lineTo(x*CELL + CELL - q, y*CELL + m);
        ctx.moveTo(x*CELL + m, y*CELL + q); ctx.lineTo(x*CELL + m, y*CELL + CELL - q);
        ctx.stroke();
        // corner dots
        ctx.fillStyle = `rgba(170,80,255,${0.45 + pulse * 0.3})`;
        [[0.18,0.18],[0.82,0.18],[0.18,0.82],[0.82,0.82]].forEach(([fx,fy]) => {
          ctx.beginPath();
          ctx.arc(x*CELL + fx*CELL, y*CELL + fy*CELL, 2, 0, Math.PI*2);
          ctx.fill();
        });
      });
      ctx.restore();
    }

    function drawBomb(t) {
      if (!bombFood) return;
      const age   = (performance.now() - bombFood.born) / 6000;
      const fade  = age > 0.75 ? 1 - (age - 0.75) / 0.25 : 1;
      const pulse = (Math.sin(t * (7 + age * 6)) + 1) / 2;
      const cx = bombFood.x * CELL + CELL / 2;
      const cy = bombFood.y * CELL + CELL / 2;
      const r  = CELL * 0.30 + pulse * CELL * 0.07;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur  = 20 + pulse * 18;
      ctx.fillStyle   = '#aa0000';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = `hsl(${0 + pulse*20},100%,${50 + pulse*20}%)`;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,220,0.92)';
      ctx.lineWidth   = Math.max(1.2, r * 0.32);
      ctx.lineCap     = 'round';
      const d = r * 0.30;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      ctx.restore();
    }

    function drawPortals(t) {
      if (portals.length < 2) return;
      const colors = ['#00ffff', '#ff00ff'];
      portals.forEach((portal, i) => {
        const cx    = portal.x * CELL + CELL / 2;
        const cy    = portal.y * CELL + CELL / 2;
        const spin  = t * (i === 0 ? 2.8 : -2.8);
        const pulse = (Math.sin(t * 4 + i * Math.PI) + 1) / 2;
        const r     = CELL * 0.38 + pulse * CELL * 0.07;
        const col   = colors[i];
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = col;
        ctx.shadowBlur  = 18 + pulse * 14;
        // spinning arcs
        for (let j = 0; j < 3; j++) {
          const sa = spin + (j / 3) * Math.PI * 2;
          ctx.globalAlpha = 0.55 + pulse * 0.35;
          ctx.strokeStyle = col;
          ctx.lineWidth   = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, r, sa, sa + Math.PI * 1.1);
          ctx.stroke();
        }
        // inner fill
        ctx.globalAlpha = 0.18 + pulse * 0.14;
        ctx.fillStyle   = col;
        ctx.shadowBlur  = 8;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2); ctx.fill();
        // label A/B
        ctx.globalAlpha  = 0.85;
        ctx.shadowBlur   = 0;
        ctx.fillStyle    = col;
        ctx.font         = `bold ${Math.floor(r * 0.72)}px Orbitron,monospace`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i === 0 ? 'A' : 'B', 0, 0);
        ctx.restore();
      });
    }

    // ── Stars ─────────────────────────────────────────────────────────────
    const STARS = Array.from({length: 90}, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.4 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 2 + Math.random() * 5,
      alpha: 0.15 + Math.random() * 0.55,
    }));

    let animRunning = false;
    function animate(ts) {
      const t = ts / 1000;
      try {
      drawBg(t);
      drawObstacles(t);
      drawPortals(t);
      if (food)        drawFood(t);
      extraFoods.forEach(ef => drawFood(t, ef.x, ef.y));
      if (specialFood) drawSpecial(t);
      if (bombFood)    drawBomb(t);
      if (snake)       drawSnake(t);
      drawParticles();
      } catch(e) { console.error('animate error:', e); }

      // Eat flash
      if (flashFx > 0) {
        ctx.save();
        ctx.globalAlpha = flashFx * 0.28;
        ctx.fillStyle   = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        flashFx = Math.max(0, flashFx - 0.10);
      }
      // Death flash
      if (gameoverFx > 0) {
        ctx.save();
        ctx.globalAlpha = gameoverFx * 0.60;
        ctx.fillStyle   = '#ff1100';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        gameoverFx = Math.max(0, gameoverFx - 0.03);
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    // ── Admin panel ───────────────────────────────────────────────────────────
    const ADMIN_SESSION_KEY = 'kq_admin_session';
    let godMode   = false;
    let speedMode = null; // 'max' | 'slow' | null

    function isAdminSession() { return localStorage.getItem(ADMIN_SESSION_KEY) === '1'; }

    const sidebar = document.getElementById('snake-admin-sidebar');

    function adminLogout() {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      sidebar.classList.remove('open');
      document.getElementById('snake-admin-btn').textContent = '⚙ Admin';
      showToast('🚪 Logged out of Admin', '#ff8888');
    }

    function refreshAdminSidebar() {
      const loggedIn = isAdminSession();
      document.getElementById('snake-adm-login').style.display    = loggedIn ? 'none'  : 'block';
      document.getElementById('snake-adm-controls').style.display = loggedIn ? 'block' : 'none';
    }

    document.getElementById('snake-admin-btn').addEventListener('click', () => {
      refreshAdminSidebar();
      sidebar.classList.toggle('open');
      if (!isAdminSession()) {
        setTimeout(() => {
          const inp = document.getElementById('snake-adm-pw-input');
          if (inp) { inp.value = ''; inp.focus(); }
          document.getElementById('snake-adm-pw-msg').textContent = '';
        }, 80);
      }
    });

    document.getElementById('snake-adm-login-btn').addEventListener('click', () => {
      const val = document.getElementById('snake-adm-pw-input').value;
      const correct = localStorage.getItem('kq_adm_pw') || '4474';
      if (val === correct) {
        localStorage.setItem(ADMIN_SESSION_KEY, '1');
        document.getElementById('snake-admin-btn').textContent = '✅ Admin';
        refreshAdminSidebar();
        showToast('✅ Logged in as Admin', '#55ee99');
      } else {
        document.getElementById('snake-adm-pw-msg').textContent = '❌ Wrong code';
        document.getElementById('snake-adm-pw-input').value = '';
      }
    });

    document.getElementById('snake-adm-pw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('snake-adm-login-btn').click();
    });

    // Update admin btn text on load
    if (isAdminSession()) document.getElementById('snake-admin-btn').textContent = '✅ Admin';

    document.getElementById('sa-logout').addEventListener('click', adminLogout);
    document.getElementById('snake-admin-close').addEventListener('click', () => sidebar.classList.remove('open'));

    document.getElementById('sa-godmode').addEventListener('click', () => {
      godMode = !godMode;
      document.getElementById('sa-godmode').classList.toggle('active', godMode);
    });

    document.getElementById('sa-maxspeed').addEventListener('click', () => {
      speedMode = speedMode === 'max' ? null : 'max';
      document.getElementById('sa-maxspeed').classList.toggle('active', speedMode === 'max');
      document.getElementById('sa-slowmode').classList.remove('active');
      if (speedMode === 'max') speedMode = 'max'; else if (speedMode === 'slow') speedMode = 'slow';
    });

    document.getElementById('sa-slowmode').addEventListener('click', () => {
      speedMode = speedMode === 'slow' ? null : 'slow';
      document.getElementById('sa-slowmode').classList.toggle('active', speedMode === 'slow');
      document.getElementById('sa-maxspeed').classList.remove('active');
    });

    document.getElementById('sa-addfood').addEventListener('click', () => {
      if (!gameRunning) return;
      for (let i = 0; i < 5; i++) spawnFood();
    });

    document.getElementById('sa-addscore').addEventListener('click', () => {
      score += 100;
      document.getElementById('hud-score').textContent = score;
    });

    document.getElementById('sa-resethi').addEventListener('click', () => {
      hiScore = 0;
      localStorage.removeItem('nq_snake_hi');
      document.getElementById('hud-hi').textContent = 0;
    });

    // ── New admin features ────────────────────────────────────────────────────
    let scoreMultiplier = 1;

    document.getElementById('sa-multiplier').addEventListener('click', () => {
      scoreMultiplier = scoreMultiplier === 1 ? 2 : 1;
      const btn = document.getElementById('sa-multiplier');
      btn.classList.toggle('active', scoreMultiplier === 2);
      btn.textContent = scoreMultiplier === 2 ? '×2 Multiplier ON' : '×2 Score Multiplier';
      showToast(scoreMultiplier === 2 ? '×2 Score Multiplier ON' : 'Score Multiplier OFF', scoreMultiplier === 2 ? '#ffd700' : '#aaaaaa');
    });

    document.getElementById('sa-trimsnake').addEventListener('click', () => {
      if (!gameRunning || snake.length <= 3) return;
      snake = snake.slice(0, 3);
      document.getElementById('hud-len-val').textContent = snake.length;
      showToast('✂️ Snake trimmed to 3', '#00ffcc');
    });

    document.getElementById('sa-forcspecial').addEventListener('click', () => {
      if (!gameRunning) return;
      specialFood = null;
      spawnSpecial();
      showToast('💎 Special food spawned!', '#00eeff');
    });

    document.getElementById('sa-softreset').addEventListener('click', () => {
      if (!gameRunning) return;
      const savedHi = hiScore;
      startGame();
      hiScore = savedHi;
      document.getElementById('hud-hi').textContent = hiScore;
      showToast('🔄 Game reset — hi score kept', '#cc88ff');
    });

    document.getElementById('sa-forcbomb').addEventListener('click', () => {
      if (!gameRunning) return;
      bombFood = null;
      spawnBomb();
      showToast('💣 Bomb spawned!', '#ff4444');
    });

    document.getElementById('sa-obstacles').addEventListener('click', () => {
      obstaclesEnabled = !obstaclesEnabled;
      const btn = document.getElementById('sa-obstacles');
      btn.classList.toggle('active', obstaclesEnabled);
      btn.textContent = obstaclesEnabled ? '🧱 Obstacles ON' : '🧱 Obstacles OFF';
      if (!obstaclesEnabled) {
        obstacles.clear();
        showToast('🧱 Obstacles removed', '#aaaaaa');
      } else {
        if (gameRunning) { spawnObstacles(); spawnPortals(); }
        showToast('🧱 Obstacles enabled', '#cc88ff');
      }
    });

    document.getElementById('sa-rerollmap').addEventListener('click', () => {
      if (!gameRunning) return;
      if (obstaclesEnabled) spawnObstacles();
      spawnPortals();
      showToast('🗺 Map rerolled!', '#88ddff');
    });

    // Patch getInterval to respect speedMode
    const _origGetInterval = getInterval;
    // Override endGame to skip death in god mode
    const _origEndGame = endGame;
    const _origStep    = step;

    // Patch step: skip wall/self/obstacle collision if godMode
    function patchedStep() {
      prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
      lastStepTime = performance.now();
      currentInterval = speedMode === 'max' ? 40 : speedMode === 'slow' ? 280 : getInterval();
      dir = { ...nextDir };
      let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      if (godMode || wallWrap) {
        head.x = (head.x + COLS) % COLS;
        head.y = (head.y + ROWS) % ROWS;
      } else {
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { endGame(); return; }
      }
      if (!godMode) {
        if (obstacles.has(head.x + ',' + head.y))              { endGame(); return; }
        if (snake.some(s => s.x === head.x && s.y === head.y)) { endGame(); return; }
      }

      head = applyPortal(head);

      snake.unshift(head);
      let ate = false;

      // Bomb: in god mode lose 30 pts instead of dying
      if (bombFood && head.x === bombFood.x && head.y === bombFood.y) {
        bombFood = null;
        spawnParticles(head.x, head.y, '#ff3333', 18);
        if (godMode) {
          score = Math.max(0, score - 30);
          spawnScorePop(head.x, head.y, '-30', '#ff3333');
        } else {
          spawnScorePop(head.x, head.y, '💥', '#ff3333');
          endGame(); return;
        }
      }

      if (head.x === food.x && head.y === food.y) {
        const pts = 10 * scoreMultiplier;
        score += pts; foodEaten++;
        flashFx = 1.0; ate = true;
        spawnParticles(head.x, head.y, '#ffd700', 10);
        spawnScorePop(head.x, head.y, '+' + pts, '#ffd700');
        spawnFood();
        if (foodEaten % 5 === 0 && !specialFood) spawnSpecial();
        if (foodEaten % 7 === 0 && !bombFood && featureBombs) spawnBomb();
      } else {
        // Check extra foods
        for (let _fi = extraFoods.length - 1; _fi >= 0; _fi--) {
          if (head.x === extraFoods[_fi].x && head.y === extraFoods[_fi].y) {
            const pts = 10 * scoreMultiplier;
            score += pts; foodEaten++;
            flashFx = 1.0; ate = true;
            spawnParticles(head.x, head.y, '#ffd700', 10);
            spawnScorePop(head.x, head.y, '+' + pts, '#ffd700');
            extraFoods.splice(_fi, 1);
            extraFoods.push(randFreeCell(occupiedCells()));
            if (foodEaten % 5 === 0 && !specialFood) spawnSpecial();
            if (foodEaten % 7 === 0 && !bombFood && featureBombs) spawnBomb();
            break;
          }
        }
      }
      if (specialFood && head.x === specialFood.x && head.y === specialFood.y) {
        const pts = 50 * scoreMultiplier;
        score += pts; flashFx = 1.0; ate = true;
        spawnParticles(head.x, head.y, '#00ffee', 16);
        spawnScorePop(head.x, head.y, '+' + pts, '#00ffee');
        specialFood = null;
        clearTimeout(loopTimer);
        const iv = speedMode === 'max' ? 40 : speedMode === 'slow' ? 280 : getInterval() + 150;
        loopTimer = setTimeout(gameLoop, iv);
        document.getElementById('hud-score').textContent  = score;
        document.getElementById('hud-len-val').textContent = snake.length;
        document.getElementById('hud-speed-val').textContent = getSpeedLevel();
        return;
      }

      if (specialFood && performance.now() - specialFood.born > 7000) specialFood = null;
      if (bombFood    && performance.now() - bombFood.born    > 6000) bombFood    = null;
      if (!ate) snake.pop();

      document.getElementById('hud-score').textContent   = score;
      document.getElementById('hud-len-val').textContent  = snake.length;
      document.getElementById('hud-speed-val').textContent = getSpeedLevel();

      clearTimeout(loopTimer);
      const iv = speedMode === 'max' ? 40 : speedMode === 'slow' ? 280 : getInterval();
      loopTimer = setTimeout(gameLoop, iv);
    }

    // Replace step with patched version
    gameLoop = function() { if (!paused) patchedStep(); };

    // ── Superadmin panel ──────────────────────────────────────────────────────
    const SUPER_PW_KEY = 'kq_super_pw';
    const getSuperPw   = () => localStorage.getItem(SUPER_PW_KEY) || '12341234';

    const saOverlay   = document.getElementById('sa-overlay');
    const saLoginBox  = document.getElementById('sa-login-box');
    const saControls  = document.getElementById('sa-controls');
    const saPwInput   = document.getElementById('sa-pw-input');
    const saPwMsg     = document.getElementById('sa-pw-msg');
    const SA_SES_KEY  = 'kq_super_session';

    function isSuperSession() { return localStorage.getItem(SA_SES_KEY) === '1'; }

    function openSuperadmin() {
      saOverlay.classList.add('open');
      if (isSuperSession()) {
        saLoginBox.style.display = 'none';
        saControls.style.display = 'flex';
        refreshSaStats();
      } else {
        saLoginBox.style.display = 'flex';
        saControls.style.display = 'none';
        saPwInput.value     = '';
        saPwMsg.textContent = '';
        setTimeout(() => saPwInput.focus(), 80);
      }
    }

    function closeSuperadmin() {
      saOverlay.classList.remove('open');
    }

    function exitSuperSession() {
      localStorage.removeItem(SA_SES_KEY);
      saLoginBox.style.display = 'flex';
      saControls.style.display = 'none';
      saPwInput.value     = '';
      saPwMsg.textContent = '';
      saOverlay.classList.remove('open');
    }

    function refreshSaStats() {
      document.getElementById('sa-hs-display').textContent = localStorage.getItem('nq_snake_hi') || '0';
      document.getElementById('sa-sec-hi').textContent     = localStorage.getItem('nq_snake_hi') || '0';
      document.getElementById('sa-sec-session').textContent = localStorage.getItem(ADMIN_SESSION_KEY) === '1' ? '✅ Active' : '❌ None';
      document.getElementById('sa-sec-pwset').textContent   = localStorage.getItem('kq_adm_pw') ? '✅ Custom' : '⚙ Default';
    }

    document.getElementById('sa-open-super').addEventListener('click', () => {
      document.getElementById('snake-admin-sidebar').classList.remove('open');
      openSuperadmin();
    });
    document.getElementById('sa-close-btn').addEventListener('click', closeSuperadmin);
    document.getElementById('sa-login-cancel').addEventListener('click', exitSuperSession);
    saOverlay.addEventListener('click', e => { if (e.target === saOverlay) closeSuperadmin(); });

    saPwInput.addEventListener('input', e => {
      const val = e.target.value;
      if (val.length < getSuperPw().length) return;
      if (val === getSuperPw()) {
        localStorage.setItem(SA_SES_KEY, '1');
        saPwInput.value = '';
        saPwMsg.textContent = '';
        saLoginBox.style.display = 'none';
        saControls.style.display = 'flex';
        refreshSaStats();
      } else {
        saPwMsg.textContent = '❌ Wrong superadmin code.';
        saPwMsg.style.color = '#ff6666';
        e.target.value = '';
      }
    });

    // Change admin password
    document.getElementById('sa-save-admpw').addEventListener('click', () => {
      if (!superUnlocked) return;
      const v1  = document.getElementById('sa-new-admpw1').value.trim();
      const v2  = document.getElementById('sa-new-admpw2').value.trim();
      const msg = document.getElementById('sa-admpw-msg');
      if (!v1)          { msg.style.color = '#ff8888'; msg.textContent = 'Enter a password.'; return; }
      if (v1 !== v2)    { msg.style.color = '#ff8888'; msg.textContent = 'Passwords don\'t match.'; return; }
      localStorage.setItem('kq_adm_pw', v1);
      document.getElementById('sa-new-admpw1').value = '';
      document.getElementById('sa-new-admpw2').value = '';
      msg.style.color = '#55ee88'; msg.textContent = '✅ Admin password saved.';
      refreshSaStats();
    });

    // Change superadmin code
    document.getElementById('sa-save-superpw').addEventListener('click', () => {
      if (!superUnlocked) return;
      const v1  = document.getElementById('sa-new-superpw1').value.trim();
      const v2  = document.getElementById('sa-new-superpw2').value.trim();
      const msg = document.getElementById('sa-superpw-msg');
      if (!v1)          { msg.style.color = '#ff8888'; msg.textContent = 'Enter a code.'; return; }
      if (v1 !== v2)    { msg.style.color = '#ff8888'; msg.textContent = 'Codes don\'t match.'; return; }
      localStorage.setItem(SUPER_PW_KEY, v1);
      document.getElementById('sa-new-superpw1').value = '';
      document.getElementById('sa-new-superpw2').value = '';
      msg.style.color = '#55ee88'; msg.textContent = '✅ Superadmin code saved.';
    });

    // Highscore editor
    document.getElementById('sa-hs-save').addEventListener('click', () => {
      if (!superUnlocked) return;
      const val = Number(document.getElementById('sa-hs-input').value);
      if (isNaN(val) || val < 0) return;
      hiScore = val;
      localStorage.setItem('nq_snake_hi', val);
      document.getElementById('hud-hi').textContent = val;
      refreshSaStats();
    });

    // Wipe all snake data
    document.getElementById('sa-wipe-data').addEventListener('click', () => {
      if (!superUnlocked) return;
      localStorage.removeItem('nq_snake_hi');
      hiScore = 0;
      document.getElementById('hud-hi').textContent = 0;
      refreshSaStats();
    });

    // Revoke admin session
    document.getElementById('sa-revoke-session').addEventListener('click', () => {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      document.getElementById('snake-admin-btn').classList.remove('visible');
      refreshSaStats();
      closeSuperadmin();
    });

    document.getElementById('sa-exit-super').addEventListener('click', exitSuperSession);

    // ── Secret word "ooo" → open superadmin ──────────────────────────────────
    (function() {
      const SECRET = 'ooo';
      let buf = '', timer = null;
      document.addEventListener('keydown', e => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        buf += e.key.toLowerCase();
        if (buf.length > SECRET.length) buf = buf.slice(-SECRET.length);
        clearTimeout(timer);
        timer = setTimeout(() => { buf = ''; }, 1800);
        if (buf === SECRET) {
          buf = ''; clearTimeout(timer);
          if (saOverlay.classList.contains('open')) closeSuperadmin();
          else openSuperadmin();
        }
      });
    })();
  