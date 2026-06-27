
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if (e.key === 'F12') { e.preventDefault(); return; }
      if (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
      if (e.ctrlKey && e.key.toUpperCase() === 'U') { e.preventDefault(); return; }
    });
  

    localStorage.removeItem('kq_super_pw');
    // ── Anti-tamper protections ────────────────────────────────────────────
    let _acToastTimer = null;
    function showAcToast() {
      const el = document.getElementById('ac-toast');
      if (!el) return;
      clearTimeout(_acToastTimer);
      el.classList.remove('hide');
      el.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
      _acToastTimer = setTimeout(() => {
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => { el.style.display = 'none'; el.classList.remove('hide'); }, 250);
      }, 2000);
      if (typeof playSound === 'function') playSound('adminFail');
    }

    document.addEventListener('contextmenu', e => { e.preventDefault(); showAcToast(); });

    let _kqHintTimer = null;
    function showKqHint(msg) {
      let el = document.getElementById('kq-hint-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'kq-hint-toast';
        Object.assign(el.style, {
          position:'fixed', bottom:'32px', left:'50%', transform:'translateX(-50%) translateY(20px)',
          background:'rgba(14,8,30,0.96)', border:'1.5px solid rgba(255,160,60,0.60)',
          borderRadius:'12px', padding:'11px 24px', fontSize:'0.78rem', fontWeight:'700',
          letterSpacing:'0.06em', color:'#ffcc88', boxShadow:'0 0 24px rgba(200,100,0,0.35)',
          zIndex:'9999', pointerEvents:'none', opacity:'0',
          transition:'opacity 0.22s ease, transform 0.22s ease',
          fontFamily:"'Orbitron',sans-serif", textAlign:'center', whiteSpace:'nowrap',
        });
        document.body.appendChild(el);
      }
      clearTimeout(_kqHintTimer);
      el.textContent  = msg;
      el.style.opacity   = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
      _kqHintTimer = setTimeout(() => {
        el.style.opacity   = '0';
        el.style.transform = 'translateX(-50%) translateY(20px)';
      }, 3000);
    }

    document.addEventListener('keydown', e => {
      const c = e.key, ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey;
      if (
        c === 'F12' ||
        (ctrl && shift && (c === 'I' || c === 'i' || c === 'J' || c === 'j' || c === 'C' || c === 'c')) ||
        (ctrl && (c === 'U' || c === 'u')) ||
        (e.metaKey && alt && (c === 'I' || c === 'i'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        showAcToast();
      }
    }, true);

    (function _dbgLoop() {
      setInterval(function() { debugger; }, 100);
    })();
    // ── End anti-tamper ───────────────────────────────────────────────────

    // ======================================================================
    // KEY QUEST — A grid-based key-collection puzzle
    //
    // How to play:
    //   • Move the blue character with the arrow keys (or WASD).
    //   • Find and walk over each golden key to collect it.
    //   • Once all 3 keys are collected the exit door turns green.
    //   • Walk into the (now-green) door to win!
    //
    // Tile type legend used in LEVEL_DATA:
    //   0 = wall        (impassable solid block)
    //   1 = floor       (open walkable space)
    //   2 = player      (player's starting position; becomes floor at runtime)
    //   3 = key         (collectible; becomes floor after pickup)
    //   4 = door/exit   (goal; impassable while locked, passable when unlocked)
    //   5 = trap        (spike pit — costs one life and respawns the player)
    //  10 = heart       (collectible; restores 1 life, becomes floor after pickup)
    // ======================================================================

    // ── Grid constant ───────────────────────────────────────────────────────
    const CELL = 52;   // pixel size of each square grid cell

    // ── Difficulty config ───────────────────────────────────────────────────
    // speedMult > 1 → faster enemies (shorter cooldown); < 1 → slower.
    const DIFFICULTY = {
      easy:   { speedMult: 0.70, lives: 5, extraEnemy: false, rewardMult: 1 },
      normal: { speedMult: 1.00, lives: 3, extraEnemy: false, rewardMult: 2 },
      hard:   { speedMult: 1.30, lives: 3, extraEnemy: true,  rewardMult: 3 },
    };
    let difficulty = 'normal';
    let gameStarted       = false;
    let gamePaused        = false;
    let menuSelectedLevel = 0;
    let godMode           = false;
    let freezeEnemies     = false;
    let superSpeed        = false;
    let adminUnlocked     = localStorage.getItem('kq_admin_session') === '1';
    let adminPassword     = localStorage.getItem('kq_adm_pw') || '4474';
    let superadminCode    = localStorage.getItem('kq_super_pw') || '12341234';
    let superadminUnlocked = false;
    let adminAttempts     = Number(localStorage.getItem('kq_adm_attempts') || 0);
    let adminLockUntil    = Number(localStorage.getItem('kq_adm_lock')     || 0);
    let hasShield         = false;
    let speedBoostTimer   = 0;
    let _warnLastSec      = -1;
    let adminMask         = false;
    let adminCape         = false;
    let adminAura         = false;

    // ── Sound effects (Web Audio API) ─────────────────────────────────────────
    const _ac = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(type) {
      const ac = _ac;
      if (ac.state === 'suspended') ac.resume();
      const now = ac.currentTime;

      function tone(freq, startTime, duration, vol, shape) {
        const osc  = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = shape || 'square';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      }

      if (type === 'candy') {
        tone(880, now,        0.06, 0.18, 'sine');
        tone(1320, now + 0.06, 0.08, 0.14, 'sine');
      } else if (type === 'key') {
        tone(660, now,        0.10, 0.20, 'triangle');
        tone(990, now + 0.10, 0.14, 0.18, 'triangle');
      } else if (type === 'gameover') {
        tone(220, now,        0.18, 0.25, 'sawtooth');
        tone(160, now + 0.18, 0.20, 0.22, 'sawtooth');
        tone(110, now + 0.38, 0.30, 0.20, 'sawtooth');
      } else if (type === 'buy') {
        tone(523, now,        0.07, 0.16, 'sine');
        tone(659, now + 0.07, 0.07, 0.16, 'sine');
        tone(784, now + 0.14, 0.10, 0.18, 'sine');
      } else if (type === 'teleport') {
        const osc = ac.createOscillator(), g2 = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
        g2.gain.setValueAtTime(0.18, now);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(g2); g2.connect(ac.destination);
        osc.start(now); osc.stop(now + 0.22);
      } else if (type === 'win') {
        [523, 659, 784, 988, 1047].forEach((f, i) => tone(f, now + i * 0.09, 0.20, 0.18, 'triangle'));
      } else if (type === 'click') {
        tone(1400, now, 0.025, 0.09, 'sine');
      } else if (type === 'warning') {
        tone(900, now, 0.035, 0.13, 'square');
      } else if (type === 'enemySquish') {
        tone(400, now,        0.04, 0.20, 'sine');
        tone(600, now + 0.04, 0.04, 0.18, 'sine');
        tone(900, now + 0.08, 0.06, 0.16, 'sine');
        tone(1400, now + 0.10, 0.08, 0.14, 'sine');
      } else if (type === 'adminSuccess') {
        tone(880,  now,        0.08, 0.18, 'sine');
        tone(1320, now + 0.09, 0.08, 0.18, 'sine');
        tone(1760, now + 0.18, 0.12, 0.20, 'sine');
      } else if (type === 'adminFail') {
        tone(180, now,        0.12, 0.22, 'sawtooth');
        tone(120, now + 0.13, 0.18, 0.22, 'sawtooth');
      }
    }

    // ── Candy economy ─────────────────────────────────────────────────────────
    let highscore  = parseInt(localStorage.getItem('kq_highscore') || '0', 10);
    let candyCount = parseInt(localStorage.getItem('kq_candies') || '0', 10);
    const CHECKPOINT_COST = 50;
    let checkpointLevel = null;   // null = no checkpoint saved
    function saveCandy() { localStorage.setItem('kq_candies', candyCount); }
    function addCandy(n) { candyCount += n; saveCandy(); updateCandyHUD(); }
    function spendCandy(n) { candyCount -= n; saveCandy(); updateCandyHUD(); }
    function updateCandyHUD() {
      const el = document.getElementById('candy-count');
      if (el) el.textContent = candyCount;
    }

    function updateCheckpointHUD() {
      const btn = document.getElementById('checkpoint-btn');
      if (!btn) return;
      if (checkpointLevel !== null) {
        btn.textContent = `💾 Lvl ${checkpointLevel + 1} saved ✓`;
        btn.classList.add('active');
        btn.title = `Checkpoint at Level ${checkpointLevel + 1} — click to overwrite (50🍬)`;
      } else {
        btn.textContent = `💾 Save (${CHECKPOINT_COST}🍬)`;
        btn.classList.remove('active');
        btn.title = `Save current level as checkpoint for ${CHECKPOINT_COST} candies`;
      }
      btn.disabled = currentLevelIndex === 0 || candyCount < CHECKPOINT_COST;
    }

    // ── Shop ──────────────────────────────────────────────────────────────────
    const SHOP_ITEMS = [
      { id: 'crown',      name: 'Pixel Crown',     icon: '👑', price: 20,  desc: 'A golden crown above your head.' },
      { id: 'glasses',    name: 'Cool Glasses',    icon: '🕶️', price: 35,  desc: 'Stylish shades for the dungeon.' },
      { id: 'neonSkin',   name: 'Neon Cyber Skin', icon: '⚡', price: 50,  desc: 'Pulsing neon pink/cyan body.' },
      { id: 'tophat',     name: 'Top Hat',         icon: '🎩', price: 30,  desc: 'A dapper tall hat.' },
      { id: 'devilHorns', name: 'Devil Horns',     icon: '😈', price: 45,  desc: 'Spooky red horns on your head.' },
      { id: 'fireTrail',  name: 'Fire Trail',      icon: '🔥', price: 60,  desc: 'Blazing fire follows your steps.' },
      { id: 'rainbow',    name: 'Rainbow Aura',    icon: '🌈', price: 80,  desc: 'A shimmering rainbow halo.' },
    ];

    // Load persisted owned / equipped sets
    let ownedItems    = new Set(JSON.parse(localStorage.getItem('kq_owned')    || '[]'));
    let equippedItems = new Set(JSON.parse(localStorage.getItem('kq_equipped') || '[]'));

    function saveShop() {
      localStorage.setItem('kq_owned',    JSON.stringify([...ownedItems]));
      localStorage.setItem('kq_equipped', JSON.stringify([...equippedItems]));
    }

    function renderShop() {
      const list = document.getElementById('shop-items-list');
      if (!list) return;
      document.getElementById('shop-balance').textContent = `🍬 ${candyCount} candies`;
      list.innerHTML = '';
      for (const item of SHOP_ITEMS) {
        const owned    = ownedItems.has(item.id);
        const equipped = equippedItems.has(item.id);
        const canAfford = candyCount >= item.price;

        const row = document.createElement('div');
        row.className = 'shop-item' + (owned ? ' owned' : '');

        const priceLabel = owned
          ? `<span class="shop-item-price owned-label">✔ Owned</span>`
          : `<span class="shop-item-price">🍬 ${item.price} candies</span>`;

        let actionHTML = '';
        if (!owned) {
          actionHTML = `<button class="shop-action-btn buy" data-id="${item.id}" ${canAfford ? '' : 'disabled'}>Buy</button>`;
        } else if (equipped) {
          actionHTML = `<button class="shop-action-btn unequip" data-id="${item.id}">Unequip</button>`;
        } else {
          actionHTML = `<button class="shop-action-btn equip" data-id="${item.id}">Equip</button>`;
        }

        row.innerHTML = `
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-info">
            <div class="shop-item-name">${item.name}</div>
            ${priceLabel}
          </div>
          ${actionHTML}`;
        list.appendChild(row);
      }

      // Bind action buttons
      list.querySelectorAll('.shop-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id   = btn.dataset.id;
          const item = SHOP_ITEMS.find(i => i.id === id);
          if (btn.classList.contains('buy') && candyCount >= item.price) {
            spendCandy(item.price);
            ownedItems.add(id);
            equippedItems.add(id);   // auto-equip on purchase
            saveShop();
            renderShop();
          } else if (btn.classList.contains('equip')) {
            equippedItems.add(id);
            saveShop();
            renderShop();
          } else if (btn.classList.contains('unequip')) {
            equippedItems.delete(id);
            saveShop();
            renderShop();
          }
        });
      });
    }

    // ── Enemy type fixed stats ───────────────────────────────────────────────
    // These never change regardless of level — only quantity/mix scales.
    const ENEMY_STATS = {
      hunter:    { moveCooldown: 0.70, chaseRadius: 5 },  // medium speed, chases player
      patroller: { moveCooldown: 0.45 },                  // fast, straight-line patrol
      erratic:   { moveCooldown: 1.10 },                  // slow, fully random
      chaser:    { moveCooldown: 0.28 },                  // very fast, BFS-pathfinds to player
    };

    // ── All level definitions ────────────────────────────────────────────────
    // Each level specifies: totalKeys, enemy starting positions, and the map.
    // Map tile codes:  0=wall  1=floor  2=player-start  3=key  4=door  5=trap
    const LEVELS = [
      // ── Level 1 ── 13×13 ──────────────────────────────────────────────────
      // 3 keys, 1 enemy, 3 spike traps.
      // P = start (top-left), K = keys, T = traps, D = door (bottom-right).
      {
        totalKeys: 3,
        enemies: [ { row: 5, col: 5, dir: [0, 1], type: 'hunter' } ],
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,2,1,1,0,1,1,1,1,1,1,1,0],
          [0,1,0,1,0,1,0,0,0,0,1,1,0],
          [0,1,0,1,1,1,0,3,1,5,1,1,0],   // KEY at col 7, TRAP at col 9
          [0,1,0,0,0,1,0,1,0,0,0,1,0],
          [0,1,1,1,1,1,1,1,0,1,1,1,0],
          [0,0,0,0,1,0,0,1,0,1,0,0,0],
          [0,3,1,1,1,1,0,1,1,5,1,1,0],   // KEY at col 1, TRAP at col 9
          [0,1,0,0,0,1,0,0,0,0,0,1,0],
          [0,1,0,1,1,1,1,1,1,1,1,1,0],
          [0,1,0,1,0,0,0,0,0,1,3,1,0],   // KEY at col 10
          [0,1,1,1,1,1,5,1,1,1,1,4,0],   // TRAP at col 6, DOOR at col 11
          [0,0,0,0,0,0,0,0,0,0,0,0,0],
        ],
      },
      // ── Level 2 ── 13×13 (denser maze) ───────────────────────────────────
      // 4 keys, 2 enemies, harder layout.
      // Both enemies start on the central corridor and patrol independently.
      {
        totalKeys: 4,
        enemies: [
          { row: 5, col: 7, dir: [0,  1], type: 'patroller' },
          { row: 9, col: 9, dir: [0, -1], type: 'hunter'    },
        ],
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,2,1,1,0,1,1,1,0,1,1,1,0],
          [0,1,0,1,0,1,0,1,0,1,0,1,0],
          [0,1,0,1,1,1,0,1,0,1,0,3,0],   // KEY at col 11
          [0,1,0,0,0,1,0,0,0,1,0,1,0],
          [0,1,1,1,1,1,1,1,1,1,1,1,0],   // central corridor
          [0,1,0,0,0,1,0,0,0,0,0,1,0],
          [0,1,1,1,0,1,0,3,1,1,0,1,0],   // KEY at col 7
          [0,1,0,1,0,1,0,0,0,1,0,1,0],
          [0,1,0,3,1,1,1,1,0,1,1,1,0],   // KEY at col 3
          [0,1,0,0,0,0,0,1,0,0,0,1,0],
          [0,1,1,1,1,1,0,1,1,1,3,1,0],   // KEY at col 10
          [0,0,0,0,0,0,0,0,0,0,0,4,0],   // DOOR at col 11
        ],
      },
      // ── Level 3 ── 14×14 (hardest) ────────────────────────────────────────
      // 5 keys, 3 fast enemies (moveCooldown 0.3 s), complex layout.
      {
        totalKeys: 5,
        enemies: [
          { row: 5, col: 5, dir: [0,  1], type: 'hunter'    },
          { row: 7, col: 8, dir: [0, -1], type: 'patroller' },
          { row: 9, col: 6, dir: [0,  1], type: 'erratic'   },
        ],
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,2,1,1,0,1,1,1,1,1,1,0,1,0],
          [0,1,0,1,0,1,0,0,0,1,0,1,1,0],
          [0,1,0,1,1,1,0,1,1,1,1,1,3,0],  // KEY col 12
          [0,1,0,0,0,1,0,1,0,0,0,0,1,0],
          [0,1,1,1,1,1,1,1,0,3,1,1,1,0],  // KEY col 9
          [0,0,0,0,1,0,0,1,0,1,0,0,1,0],
          [0,3,1,1,1,1,0,1,1,1,0,1,1,0],  // KEY col 1
          [0,1,0,0,0,1,0,0,0,1,0,1,0,0],
          [0,1,0,3,1,1,1,1,0,1,1,1,0,0],  // KEY col 3
          [0,1,0,0,0,1,0,1,0,0,0,1,0,0],
          [0,1,1,1,0,1,1,1,1,1,0,1,1,0],
          [0,0,0,1,0,3,0,0,0,1,1,1,4,0],  // KEY col 5, DOOR col 12
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        ],
      },
      // ── Level 4 ── 15×15 (nightmare) ─────────────────────────────────────
      // 6 keys, 4 enemies: 2 chasers (BFS pathfind) + 1 hunter + 1 patroller.
      // Symmetric layout — traps guard shortcut routes to keys.
      {
        totalKeys: 6,
        enemies: [
          { row: 4, col: 7, dir: [0,  1], type: 'chaser'    },
          { row: 8, col: 7, dir: [0, -1], type: 'chaser'    },
          { row: 1, col: 9, dir: [0, -1], type: 'hunter'    },
          { row:11, col: 6, dir: [1,  0], type: 'patroller' },
        ],
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,2,1,1,1,1,1,1,1,1,1,1,1,1,0],  // top corridor; player (1,1)
          [0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
          [0,1,0,3,0,1,5,0,5,1,0,3,0,1,0],  // KEY(3,3) KEY(3,11) TRAP(3,6)(3,8)
          [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],  // corridor
          [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
          [0,3,1,1,1,5,0,1,0,5,1,1,1,3,0],  // KEY(6,1) KEY(6,13) TRAP(6,5)(6,9)
          [0,1,0,0,0,1,0,1,0,1,0,0,0,1,0],
          [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0],  // corridor
          [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
          [0,1,1,1,0,5,0,1,0,5,0,1,1,1,0],  // TRAP(10,5)(10,9)
          [0,1,0,1,0,1,1,1,1,1,0,1,0,1,0],
          [0,1,1,1,1,1,0,1,0,1,1,1,1,1,0],
          [0,0,0,3,0,0,0,1,0,0,0,3,0,0,0],  // KEY(13,3) KEY(13,11)
          [0,0,0,0,0,0,0,4,0,0,0,0,0,0,0],  // DOOR(14,7)
        ],
      },
      // ── Level 5 ── 16×16 (void / darkness) ───────────────────────────────
      // Unique mechanic: only ~3-tile radius around player is visible.
      // 7 keys, 5 enemies: 2 chasers + 2 hunters + 1 patroller.
      {
        totalKeys: 7,
        enemies: [
          { row:  5, col:  4, dir: [0,  1], type: 'chaser'    },
          { row: 11, col: 10, dir: [0, -1], type: 'chaser'    },
          { row:  1, col: 12, dir: [0, -1], type: 'hunter'    },
          { row:  9, col:  7, dir: [1,  0], type: 'hunter'    },
          { row: 14, col:  6, dir: [0,  1], type: 'patroller' },
        ],
        map: [
          [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
          [0,2,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
          [0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,0],
          [0,1,0,3,0,1,0,3,0,1,0,0,0,3,1,0],  // KEY(3,3)(3,7)(3,13)
          [0,1,0,5,0,1,0,5,0,1,0,0,0,5,1,0],  // TRAP(4,3)(4,7)(4,13)
          [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
          [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0],
          [0,1,1,1,0,5,0,1,0,5,0,1,0,3,1,0],  // TRAP(7,5)(7,9); KEY(7,13)
          [0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,0],
          [0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,0],
          [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,0],
          [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
          [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0],
          [0,3,1,1,1,5,0,1,0,5,1,1,1,3,0,0],  // KEY(13,1)(13,13) TRAP(13,5)(13,9)
          [0,1,0,0,0,1,1,1,1,1,0,0,0,1,0,0],
          [0,3,1,1,1,1,0,4,0,0,0,0,0,0,0,0],  // KEY(15,1) DOOR(15,7)
        ],
      },
    ];

    // ── Canvas setup ────────────────────────────────────────────────────────
    const canvas = document.getElementById('game-canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = LEVELS[0].map[0].length * CELL;
    canvas.height = LEVELS[0].map.length    * CELL;

    function fitCanvas() {
      const vw = window.innerWidth, vh = window.innerHeight;
      // Mirror --pillar-w CSS variable logic across breakpoints
      let pillar;
      if      (vh < 400)  pillar = Math.min(22, Math.max(8,  vw * 0.020));
      else if (vh < 540)  pillar = Math.min(28, Math.max(8,  vw * 0.025));
      else if (vw < 400)  pillar = Math.min(14, Math.max(6,  vw * 0.018));
      else if (vw < 600)  pillar = Math.min(28, Math.max(10, vw * 0.025));
      else                pillar = Math.min(78, Math.max(32, vw * 0.055));
      // Chrome = h1 + hud + top/bottom bars + container padding + body padding + gaps
      let chrome;
      if      (vh < 400)  chrome = 58;   // landscape tiny:  h1+hint hidden
      else if (vh < 540)  chrome = 90;   // landscape short: h1+hint hidden
      else if (vw < 400)  chrome = 148;  // tiny phone portrait
      else if (vw < 600)  chrome = 162;  // small phone portrait
      else                chrome = 190;  // normal desktop / tablet
      const maxW = vw - pillar * 2 - 20;
      const maxH = Math.max(60, vh - chrome);
      const scale = Math.min(1, maxW / canvas.width, maxH / canvas.height);
      canvas.style.width  = Math.round(canvas.width  * scale) + 'px';
      canvas.style.height = Math.round(canvas.height * scale) + 'px';
    }
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    // ── Current level index ─────────────────────────────────────────────────
    let currentLevelIndex = 0;

    // ── Level-select unlock state ───────────────────────────────────────────
    let level2Unlocked = false;
    let level3Unlocked = false;
    let level4Unlocked = false;
    let level5Unlocked = false;
    let gameComplete   = false;

    function updateLevelSelector() {
      const s1 = document.getElementById('sel-1');
      const s2 = document.getElementById('sel-2');
      const s3 = document.getElementById('sel-3');
      const s4 = document.getElementById('sel-4');
      const s5 = document.getElementById('sel-5');
      const l2 = level2Unlocked || gameComplete;
      const l3 = level3Unlocked || gameComplete;
      const l4 = level4Unlocked || gameComplete;
      const l5 = level5Unlocked || gameComplete;
      s1.className = currentLevelIndex === 0 ? 'active' : '';
      s2.className = l2 ? (currentLevelIndex === 1 ? 'active' : '') : 'locked';
      s2.textContent = l2 ? 'Level 2' : '🔒 Level 2';
      s3.className = l3 ? (currentLevelIndex === 2 ? 'active' : '') : 'locked';
      s3.textContent = l3 ? 'Level 3' : '🔒 Level 3';
      if (s4) {
        s4.className = l4 ? (currentLevelIndex === 3 ? 'active' : '') : 'locked';
        s4.textContent = l4 ? 'Level 4' : '🔒 Level 4';
      }
      if (s5) {
        s5.className = l5 ? (currentLevelIndex === 4 ? 'active' : '') : 'locked';
        s5.textContent = l5 ? '🌑 Level 5' : '🔒 Level 5';
      }
    }

    function updateMainMenuLevels() {
      document.getElementById('menu-cleared-msg').style.display = gameComplete ? 'block' : 'none';
      const l2 = level2Unlocked || gameComplete;
      const l3 = level3Unlocked || gameComplete;
      const l4 = level4Unlocked || gameComplete;
      const l5 = level5Unlocked || gameComplete;
      const items = document.querySelectorAll('#menu-level-list .menu-lvl-btn');
      items.forEach(li => {
        const idx = Number(li.dataset.mlevel);
        const unlocked = idx === 0 || (idx === 1 && l2) || (idx === 2 && l3) || (idx === 3 && l4) || (idx === 4 && l5);
        li.className = 'menu-lvl-btn' + (unlocked ? '' : ' locked') +
                       (idx === menuSelectedLevel && unlocked ? ' selected' : '');
        li.textContent = unlocked ? `Level ${idx + 1}` : `🔒 Level ${idx + 1}`;
      });
    }

    // ── Confetti + victory ─────────────────────────────────────────────────
    function spawnConfetti() {
      const colors = ['#ffd700','#ff6b6b','#6bcbff','#a8ff6b','#ff6bdf','#ffcc00','#ffffff'];
      for (let i = 0; i < 90; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        const size = 6 + Math.random() * 9;
        el.style.cssText = [
          `left:${Math.random() * 100}vw`,
          `width:${size}px`,
          `height:${size}px`,
          `background:${colors[Math.floor(Math.random() * colors.length)]}`,
          `border-radius:${Math.random() > 0.45 ? '50%' : '2px'}`,
          `animation-duration:${2.2 + Math.random() * 2.8}s`,
          `animation-delay:${Math.random() * 1.8}s`,
          `opacity:${0.7 + Math.random() * 0.3}`,
        ].join(';');
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }
    }

    function showVictory() {
      playSound('win');
      state.won      = true;
      gameComplete   = true;
      level2Unlocked = true;
      level3Unlocked = true;
      level4Unlocked = true;
      updateLevelSelector();
      updateMainMenuLevels();
      spawnConfetti();
      document.getElementById('victory-overlay').classList.add('visible');
    }

    let _lvTimer = null;
    function showLevelVictory(nextLevelIndex) {
      playSound('win');
      state.won  = true;
      gamePaused = true;
      const overlay = document.getElementById('level-victory');
      const sub     = document.getElementById('lvictory-sub');
      const rewardEl = document.getElementById('lvictory-reward');
      overlay.classList.add('visible');

      const isLast = nextLevelIndex === null;
      sub.textContent = isLast ? 'You beat the game!' : 'Loading next level…';

      // ── Reward calculation ──────────────────────────────────────────────
      const mult        = DIFFICULTY[difficulty].rewardMult;
      const BASE_REWARD = 10 + currentLevelIndex * 5;   // 10/15/20/25/30 per level
      const livesBonus  = state.lives * 5;               // +5 per surviving life
      const isLastBonus = isLast ? 50 : 0;               // +50 for beating the game
      const subtotal    = BASE_REWARD + livesBonus + isLastBonus;
      const total       = subtotal * mult;
      addCandy(total);

      // Build reward breakdown HTML
      const multLabel = mult > 1 ? ` <span style="color:#ff9944;">×${mult}</span>` : '';
      let html = `<div class="reward-line">🏆 Level ${currentLevelIndex + 1} clear: +${BASE_REWARD} 🍬</div>`;
      if (livesBonus > 0)
        html += `<div class="reward-line">❤️ Lives bonus (${state.lives}×5): +${livesBonus} 🍬</div>`;
      if (isLastBonus > 0)
        html += `<div class="reward-line">🎉 All levels cleared bonus: +${isLastBonus} 🍬</div>`;
      if (mult > 1)
        html += `<div class="reward-line" style="color:#ff9944;">${mult === 2 ? '⚔️ Normal' : '💀 Hard'} difficulty: ×${mult}</div>`;
      html += `<div class="reward-line reward-total">Total: +${total} 🍬${multLabel}</div>`;
      rewardEl.innerHTML = html;

      clearTimeout(_lvTimer);
      _lvTimer = setTimeout(() => {
        overlay.classList.remove('visible');
        rewardEl.innerHTML = '';
        document.querySelectorAll('.confetti').forEach(el => el.remove());
        if (isLast) {
          showVictory();
        } else {
          const lives = state.lives;
          if (nextLevelIndex === 1) LEVELS[1] = generateRandomLevel();
          initState(nextLevelIndex);
          state.lives = lives;
          gamePaused  = false;
          updateHUD();
          updateLevelSelector();
          updateMainMenuLevels();
        }
      }, 3500);
    }

    function setDifficulty(d) {
      if (gameStarted) return;
      difficulty = d;
      document.querySelectorAll('[data-diff]').forEach(btn => {
        btn.className = 'diff-btn' + (btn.dataset.diff === d ? ' sel-' + d : '');
      });
    }


    // ── Game state ──────────────────────────────────────────────────────────
    // All mutable state lives in one object so resetGame() is trivial.
    let state = {};

    // ── Level themes ──────────────────────────────────────────────────────────
    const THEMES = [
      { // Level 1 — Cyberpunk
        bodyBg:       'radial-gradient(ellipse at 50% 30%, #1a0a2e 0%, #05010f 70%)',
        canvasBg:     '#08010d',
        wallBase:     '#1a0428', wallBorder: 'rgba(255,0,220,0.30)', wallGlow: '#ff00cc',
        floorBase:    '#0d0118', floorGrid: 'rgba(255,0,200,0.09)',
        keyColor:     '#ffff00', keyDark: '#aaaa00', keyShadow: '#ffff00',
        playerBody:   ['#00ffff', '#007799'], playerOutline: '#005566', playerShadow: '#00ffff',
        containerBorder: 'rgba(255,0,220,0.45)',
        containerShadow: '0 0 0 1px rgba(255,0,200,0.10), 0 0 40px rgba(255,0,200,0.22), 0 8px 40px rgba(0,0,0,0.5)',
        accent: '#ff00cc', accent2: '#00ffff',
      },
      { // Level 2 — Retro Arcade
        bodyBg:       'radial-gradient(ellipse at 50% 30%, #001400 0%, #000000 70%)',
        canvasBg:     '#000500',
        wallBase:     '#001800', wallBorder: 'rgba(0,255,0,0.28)', wallGlow: '#00ff00',
        floorBase:    '#000a00', floorGrid: 'rgba(0,200,0,0.09)',
        keyColor:     '#ffffff', keyDark: '#aaaaaa', keyShadow: '#ccffcc',
        playerBody:   ['#ffaa00', '#cc5500'], playerOutline: '#883300', playerShadow: '#ffaa00',
        containerBorder: 'rgba(0,220,0,0.5)',
        containerShadow: '0 0 0 1px rgba(0,200,0,0.10), 0 0 40px rgba(0,200,0,0.22), 0 8px 40px rgba(0,0,0,0.5)',
        accent: '#00ff00', accent2: '#ffaa00',
      },
      { // Level 3 — Magma Dungeon
        bodyBg:       'radial-gradient(ellipse at 50% 30%, #2a0a00 0%, #0f0500 70%)',
        canvasBg:     '#130300',
        wallBase:     '#2a0800', wallBorder: 'rgba(255,80,0,0.30)', wallGlow: '#ff4400',
        floorBase:    '#1a0400', floorGrid: 'rgba(255,60,0,0.08)',
        keyColor:     '#ffd700', keyDark: '#b8860b', keyShadow: '#ffd700',
        playerBody:   ['#ffcc66', '#cc6600'], playerOutline: '#884400', playerShadow: '#ff8800',
        containerBorder: 'rgba(255,80,0,0.45)',
        containerShadow: '0 0 0 1px rgba(255,60,0,0.10), 0 0 40px rgba(255,80,0,0.22), 0 8px 40px rgba(0,0,0,0.5)',
        accent: '#ff6600', accent2: '#ffd700',
      },
      { // Level 4 — Deep Ocean
        bodyBg:       'radial-gradient(ellipse at 50% 30%, #001830 0%, #000810 70%)',
        canvasBg:     '#000c1a',
        wallBase:     '#001428', wallBorder: 'rgba(0,210,210,0.28)', wallGlow: '#00cccc',
        floorBase:    '#000c1a', floorGrid: 'rgba(0,180,180,0.08)',
        keyColor:     '#e8f4f8', keyDark: '#aaccdd', keyShadow: '#88eeff',
        playerBody:   ['#00eeff', '#0066aa'], playerOutline: '#004477', playerShadow: '#00ccff',
        containerBorder: 'rgba(0,190,190,0.5)',
        containerShadow: '0 0 0 1px rgba(0,180,180,0.10), 0 0 40px rgba(0,180,180,0.22), 0 8px 40px rgba(0,0,0,0.5)',
        accent: '#00cccc', accent2: '#88eeff',
        stars: false,
      },
      { // Level 5+ — Cosmic Void
        bodyBg:       'radial-gradient(ellipse at 50% 30%, #1a0040 0%, #050008 70%)',
        canvasBg:     '#080010',
        wallBase:     '#150030', wallBorder: 'rgba(160,80,255,0.28)', wallGlow: '#aa44ff',
        floorBase:    '#0a0018', floorGrid: 'rgba(130,60,255,0.08)',
        keyColor:     '#00ff88', keyDark: '#00aa55', keyShadow: '#00ff88',
        playerBody:   ['#cc88ff', '#6600cc'], playerOutline: '#440088', playerShadow: '#aa44ff',
        containerBorder: 'rgba(150,70,255,0.5)',
        containerShadow: '0 0 0 1px rgba(130,60,255,0.10), 0 0 40px rgba(150,70,255,0.22), 0 8px 40px rgba(0,0,0,0.5)',
        accent: '#aa44ff', accent2: '#00ff88',
        stars: true,
      },
    ];

    let THEME = THEMES[0];

    // Cosmic Void starfield data (generated once, reused each frame)
    const STARS = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.5 + Math.random() * 1.5,
      b: Math.random() * Math.PI * 2,
    }));

    function applyLevelTheme(levelIndex) {
      THEME = THEMES[Math.min(levelIndex, THEMES.length - 1)];
      const root = document.documentElement;
      root.style.setProperty('--theme-bg',      THEME.bodyBg);
      root.style.setProperty('--theme-accent',  THEME.accent);
      root.style.setProperty('--theme-accent2', THEME.accent2);
      document.body.style.background = THEME.bodyBg;
      const gc = document.getElementById('game-container');
      if (gc) {
        gc.style.borderColor = THEME.containerBorder;
        gc.style.boxShadow   = THEME.containerShadow;
      }
      // Tint HUD accent
      document.querySelectorAll('.hud-value').forEach(el => {
        el.style.color = THEME.accent;
      });
    }

    function initState(levelIndex) {
      applyLevelTheme(Math.min(levelIndex, THEMES.length - 1));
      document.getElementById('game-container').classList.remove('ghost-active');
      currentLevelIndex = levelIndex;
      const levelDef = LEVELS[levelIndex];

      // Deep-clone the level so we can modify tiles (remove keys) during play.
      const map = levelDef.map.map(row => [...row]);

      // Resize canvas to match this level's grid dimensions.
      canvas.width  = map[0].length * CELL;
      canvas.height = map.length    * CELL;
      fitCanvas();

      // Locate the player start tile (type 2), record it, then erase it.
      let startRow = 1, startCol = 1;
      outer: for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[r].length; c++) {
          if (map[r][c] === 2) {
            startRow = r; startCol = c;
            map[r][c] = 1;   // becomes a plain floor tile
            break outer;
          }
        }
      }

      // Build the enemies array — base speed from ENEMY_STATS, scaled by difficulty.
      const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
      const enemies = levelDef.enemies.map(e => {
        const stats = ENEMY_STATS[e.type] || ENEMY_STATS.hunter;
        return { row: e.row, col: e.col, type: e.type || 'hunter', dir: [...e.dir], timer: 0,
                 moveCooldown: stats.moveCooldown / diff.speedMult };
      });

      // Hard mode: spawn one extra erratic enemy on a random far floor tile.
      if (diff.extraEnemy) {
        const floorCandidates = [];
        for (let r = 1; r < map.length - 1; r++)
          for (let c = 1; c < map[r].length - 1; c++)
            if (map[r][c] === 1 &&
                Math.abs(r - startRow) + Math.abs(c - startCol) > 4 &&
                enemies.every(e => Math.abs(r - e.row) + Math.abs(c - e.col) > 3))
              floorCandidates.push([r, c]);
        if (floorCandidates.length > 0) {
          const [er, ec] = floorCandidates[Math.floor(Math.random() * floorCandidates.length)];
          enemies.push({ row: er, col: ec, type: 'erratic', dir: [0, 1], timer: 0,
                         moveCooldown: ENEMY_STATS.erratic.moveCooldown / diff.speedMult });
        }
      }

      state = {
        map,
        row:      startRow,
        col:      startCol,
        prevRow:  startRow,
        prevCol:  startCol,
        lastMoveTime: 0,
        startRow,           // kept so we can respawn after hitting a trap or enemy
        startCol,
        lives:         diff.lives,
        totalKeys:     levelDef.totalKeys,
        keysCollected: 0,
        doorUnlocked:  false,
        won:           false,
        gameOver:      false,
        // Particle bursts spawned when a key is picked up.
        // Each entry: { r, c, life } where life goes from 1.0 → 0.0.
        fx: [],
        // Full-screen red flash shown when the player takes damage.
        damageFx: 0,
        // Invincibility seconds remaining after taking a hit (prevents chain damage).
        invincible: 0,
        // All roaming enemies for this level.
        enemies,
        // Ghost Mode — Q key ability.
        ghostActive:   false,
        ghostTimer:    0,
        ghostCooldown: 0,
        teleportFx:       0,    // purple flash life (1→0)
        teleportCooldown: 0,  // seconds remaining until next teleport
        portals:          [],  // [{r,c}, {r,c}] set after scatter
      };

      // Scatter 1–2 heart tiles (tile 10) on random plain floor cells
      const heartPool = [];
      for (let r = 1; r < state.map.length - 1; r++)
        for (let c = 1; c < state.map[r].length - 1; c++)
          if (state.map[r][c] === 1) heartPool.push([r, c]);
      heartPool.sort(() => Math.random() - 0.5);
      const heartAmt = 1 + Math.floor(Math.random() * 2);  // 1–2
      for (let i = 0; i < Math.min(heartAmt, heartPool.length); i++)
        state.map[heartPool[i][0]][heartPool[i][1]] = 10;

      // Scatter 3–5 candy tiles (tile 6) on random plain floor cells
      const candyPool = [];
      for (let r = 1; r < state.map.length - 1; r++)
        for (let c = 1; c < state.map[r].length - 1; c++)
          if (state.map[r][c] === 1) candyPool.push([r, c]);
      candyPool.sort(() => Math.random() - 0.5);
      const candyAmt = 3 + Math.floor(Math.random() * 3);  // 3–5
      for (let i = 0; i < Math.min(candyAmt, candyPool.length); i++)
        state.map[candyPool[i][0]][candyPool[i][1]] = 6;

      // Scatter 1 shield (tile 7) and 1 speed power-up (tile 8)
      const puPool = [];
      for (let r = 1; r < state.map.length - 1; r++)
        for (let c = 1; c < state.map[r].length - 1; c++)
          if (state.map[r][c] === 1) puPool.push([r, c]);
      puPool.sort(() => Math.random() - 0.5);
      if (puPool.length > 0) state.map[puPool[0][0]][puPool[0][1]] = 7;
      if (puPool.length > 1) state.map[puPool[1][0]][puPool[1][1]] = 8;

      // Place two portals (tile 9): one on leftmost floor col, one on rightmost
      const ROWS = state.map.length, COLS = state.map[0].length;
      let leftPortal = null, rightPortal = null;
      let minCol = COLS, maxCol = -1;
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (state.map[r][c] === 1) {
            if (c < minCol) { minCol = c; leftPortal  = [r, c]; }
            if (c > maxCol) { maxCol = c; rightPortal = [r, c]; }
          }
        }
      }
      if (leftPortal && rightPortal && leftPortal[1] !== rightPortal[1]) {
        state.map[leftPortal[0]][leftPortal[1]]   = 9;
        state.map[rightPortal[0]][rightPortal[1]] = 9;
        state.portals = [
          { r: leftPortal[0],  c: leftPortal[1]  },
          { r: rightPortal[0], c: rightPortal[1] },
        ];
      }

      // Reset power-up state for the new level
      hasShield      = false;
      speedBoostTimer = 0;
    }

    // ======================================================================
    // DRAWING — one function per tile type
    // ======================================================================

    // Dark stone wall with a subtle bevel (lighter top/left, darker bottom/right).
    function drawWall(x, y) {
      ctx.fillStyle = THEME.wallBase;
      ctx.fillRect(x, y, CELL, CELL);
      // Thick neon border
      ctx.shadowColor = THEME.wallGlow || THEME.wallBorder;
      ctx.shadowBlur  = 8;
      ctx.strokeStyle = THEME.wallBorder;
      ctx.lineWidth   = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      ctx.shadowBlur  = 0;
      // Bright top + left highlight edge
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, y, CELL, 2);
      ctx.fillRect(x, y, 2, CELL);
      // Dark bottom + right shadow edge
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, y + CELL - 2, CELL, 2);
      ctx.fillRect(x + CELL - 2, y, 2, CELL);
    }

    // Dark stone floor — very subtle so characters pop.
    function drawFloor(x, y) {
      ctx.fillStyle = THEME.floorBase;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = THEME.floorGrid || 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }

    // A spike-pit trap tile — dark red floor with a glowing X and spike tips.
    // `pulse` drives a gentle glow throb so the danger is always visible.
    function drawTrap(x, y, pulse) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;

      // Dark crimson base
      ctx.fillStyle = '#1f0505';
      ctx.fillRect(x, y, CELL, CELL);

      // Faint red cell border
      ctx.strokeStyle = '#6a1010';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

      // Pulsing red glow
      ctx.shadowColor = '#ff1100';
      ctx.shadowBlur  = 8 + 8 * pulse;

      // X mark — two diagonal lines
      const m = 12;   // margin from cell edge
      ctx.strokeStyle = '#dd1111';
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(x + m,        y + m);
      ctx.lineTo(x + CELL - m, y + CELL - m);
      ctx.moveTo(x + CELL - m, y + m);
      ctx.lineTo(x + m,        y + CELL - m);
      ctx.stroke();
      ctx.lineCap = 'butt';

      ctx.shadowBlur = 0;

      // Four small spike triangles at the X tips
      ctx.fillStyle = '#ff3322';
      const spikes = [
        [x + m, y + m,         -1, -1],   // top-left
        [x + CELL - m, y + m,   1, -1],   // top-right
        [x + m, y + CELL - m,  -1,  1],   // bottom-left
        [x + CELL - m, y + CELL - m, 1, 1], // bottom-right
      ];
      for (const [sx, sy, dx, dy] of spikes) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dx * 8, sy);
        ctx.lineTo(sx, sy + dy * 8);
        ctx.closePath();
        ctx.fill();
      }
    }

    // The player — a glowing round adventurer with simple eyes and smile.
    function drawPlayer(x, y) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const r  = 19;

      const ghost = state.ghostActive;
      ctx.save();
      if (ghost) ctx.globalAlpha = 0.60;

      // Pulsing glow — ghost gets a layered purple/cyan aura
      if (ghost) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350);
        ctx.shadowColor = '#cc88ff';
        ctx.shadowBlur  = 30 + pulse * 22;
        // outer aura ring
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,80,255,${0.10 + pulse * 0.10})`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Active skin (falls back to SKINS[0] if array not yet defined)
      const skin = (typeof SKINS !== 'undefined') ? SKINS[currentSkin] : null;
      // Shop cosmetics
      const eq = (typeof equippedItems !== 'undefined') ? equippedItems : new Set();
      const hasNeon       = eq.has('neonSkin');
      const hasCrown      = eq.has('crown');
      const hasGlasses    = eq.has('glasses');
      const hasTophat     = eq.has('tophat');
      const hasDevilHorns = eq.has('devilHorns');
      const hasFireTrail  = eq.has('fireTrail');
      const hasRainbow    = eq.has('rainbow');

      // Shield ring
      if (hasShield) {
        const sp = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        ctx.save();
        ctx.shadowColor = '#66ccff';
        ctx.shadowBlur  = 14 + sp * 10;
        ctx.strokeStyle = `rgba(100,200,255,${0.75 + sp * 0.25})`;
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Rainbow Aura
      if (hasRainbow && !ghost) {
        const rp = Date.now() / 600;
        ctx.save();
        const hue1 = (rp * 60) % 360;
        const hue2 = (hue1 + 60) % 360;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
        const rg = ctx.createLinearGradient(cx - r - 9, cy, cx + r + 9, cy);
        rg.addColorStop(0,   `hsla(${hue1},100%,60%,0.55)`);
        rg.addColorStop(0.5, `hsla(${(hue1+120)%360},100%,60%,0.55)`);
        rg.addColorStop(1,   `hsla(${hue2},100%,60%,0.55)`);
        ctx.strokeStyle = rg;
        ctx.lineWidth = 4;
        ctx.shadowColor = `hsl(${hue1},100%,70%)`;
        ctx.shadowBlur  = 14;
        ctx.stroke();
        ctx.restore();
      }

      // Fire Trail (drawn before body so body appears on top)
      if (hasFireTrail && !ghost) {
        const ft = Date.now();
        ctx.save();
        for (let i = 0; i < 6; i++) {
          const fp = (ft / 120 + i * 0.9) % (Math.PI * 2);
          const fx = cx + (Math.cos(fp + i) * 6) - 0 + (i % 2 === 0 ? -3 : 3);
          const fy = cy + r + 4 + i * 2.5;
          const fsize = 5 - i * 0.5;
          const falpha = 0.85 - i * 0.12;
          ctx.beginPath();
          ctx.arc(fx, fy, fsize, 0, Math.PI * 2);
          ctx.fillStyle = i < 2
            ? `rgba(255,200,50,${falpha})`
            : i < 4
              ? `rgba(255,100,0,${falpha})`
              : `rgba(180,30,0,${falpha})`;
          ctx.shadowColor = '#ff6600';
          ctx.shadowBlur  = 8;
          ctx.fill();
        }
        ctx.restore();
      }

      // Neon Cyber Skin outer aura
      if (hasNeon && !ghost) {
        const np = 0.5 + 0.5 * Math.sin(Date.now() / 220);
        ctx.save();
        ctx.globalAlpha = 0.18 + np * 0.14;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = np > 0.5 ? '#ff44cc' : '#00ffee';
        ctx.shadowColor = np > 0.5 ? '#ff44cc' : '#00ffee';
        ctx.shadowBlur  = 18;
        ctx.fill();
        ctx.restore();
      }

      // Glow halo
      ctx.shadowColor = ghost ? '#cc88ff' : hasNeon ? '#ff44cc' : (skin ? skin.shadow : '#00ccff');
      ctx.shadowBlur  = ghost ? 28 : 30;

      // Body — ghost → purple | neon → pulsing pink/cyan | skin/default
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, r);
      if (ghost) {
        g.addColorStop(0, '#d8b4fe');
        g.addColorStop(1, '#6d28d9');
      } else if (hasNeon) {
        const np2 = 0.5 + 0.5 * Math.sin(Date.now() / 220);
        g.addColorStop(0, np2 > 0.5 ? '#ff88dd' : '#88ffee');
        g.addColorStop(1, np2 > 0.5 ? '#cc0088' : '#007799');
      } else {
        g.addColorStop(0, skin ? skin.body[0] : (THEME.playerBody ? THEME.playerBody[0] : '#90e8ff'));
        g.addColorStop(1, skin ? skin.body[1] : (THEME.playerBody ? THEME.playerBody[1] : '#007acc'));
      }
      ctx.fillStyle = g;
      ctx.fill();

      // Outline
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = ghost ? '#9b59d6' : hasNeon ? '#cc0088' : (skin ? skin.outline : (THEME.playerOutline || '#005588'));
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Eyes — white base + dark pupil
      for (const ex of [cx - 6, cx + 6]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ex, cy - 5, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00334d';
        ctx.beginPath(); ctx.arc(ex, cy - 4.5, 2.2, 0, Math.PI * 2); ctx.fill();
      }

      // ── Cool Glasses accessory ────────────────────────────────────────────
      if (hasGlasses) {
        ctx.save();
        ctx.shadowColor = '#222';
        ctx.shadowBlur  = 4;
        // Lens frames
        for (const ex of [cx - 6, cx + 6]) {
          ctx.beginPath();
          ctx.ellipse(ex, cy - 5, 5.5, 4, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(10,10,20,0.88)';
          ctx.fill();
          ctx.strokeStyle = '#444';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        // Bridge connecting the two lenses
        ctx.beginPath();
        ctx.moveTo(cx - 0.5, cy - 5);
        ctx.lineTo(cx + 0.5, cy - 5);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Shine glint on each lens
        for (const ex of [cx - 8, cx + 4]) {
          ctx.beginPath();
          ctx.ellipse(ex, cy - 7, 1.5, 1, -0.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fill();
        }
        ctx.restore();
      }

      // Smile arc
      ctx.beginPath();
      ctx.arc(cx, cy + 3, 7, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.strokeStyle = ghost ? '#9b59d6' : hasNeon ? '#cc0088' : '#005588';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // ── Pixel Crown accessory ─────────────────────────────────────────────
      if (hasCrown) {
        ctx.save();
        const ct = Date.now();
        const cp = 0.5 + 0.5 * Math.sin(ct / 600);
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 8 + cp * 8;
        // Crown base band
        const bx = cx - 10, by = cy - r - 14;
        ctx.fillStyle = `rgba(255,${180 + Math.floor(cp*60)},0,1)`;
        ctx.fillRect(bx, by + 8, 20, 6);
        // Three crown points (trapezoid teeth)
        ctx.beginPath();
        ctx.moveTo(bx,      by + 8);   // left base
        ctx.lineTo(bx,      by);       // left point top
        ctx.lineTo(bx + 5,  by + 5);
        ctx.lineTo(bx + 10, by - 2);   // centre peak
        ctx.lineTo(bx + 15, by + 5);
        ctx.lineTo(bx + 20, by);       // right point top
        ctx.lineTo(bx + 20, by + 8);   // right base
        ctx.closePath();
        ctx.fill();
        // Small gem dots on each point
        for (const [gx, gy] of [[bx + 1, by + 1], [bx + 10, by - 1], [bx + 19, by + 1]]) {
          ctx.beginPath();
          ctx.arc(gx, gy, 2, 0, Math.PI * 2);
          ctx.fillStyle = cp > 0.5 ? '#fff9aa' : '#ffe066';
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Top Hat accessory ─────────────────────────────────────────────────
      if (hasTophat && !hasCrown) {
        ctx.save();
        const thbx = cx - 11;
        const thby = cy - r - 22;
        // brim
        ctx.fillStyle = '#111';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.fillRect(thbx - 4, thby + 18, 30, 4);
        ctx.strokeRect(thbx - 4, thby + 18, 30, 4);
        // tall body
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(thbx, thby, 22, 20);
        ctx.strokeRect(thbx, thby, 22, 20);
        // red band
        ctx.fillStyle = '#aa1111';
        ctx.fillRect(thbx, thby + 15, 22, 4);
        ctx.restore();
      }

      // ── Devil Horns accessory ─────────────────────────────────────────────
      if (hasDevilHorns) {
        ctx.save();
        const dp = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur  = 6 + dp * 8;
        ctx.fillStyle   = `rgb(${200 + Math.floor(dp * 55)},20,10)`;
        // left horn
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - r + 2);
        ctx.lineTo(cx - 16, cy - r - 12);
        ctx.lineTo(cx - 5,  cy - r - 2);
        ctx.closePath();
        ctx.fill();
        // right horn
        ctx.beginPath();
        ctx.moveTo(cx + 10, cy - r + 2);
        ctx.lineTo(cx + 16, cy - r - 12);
        ctx.lineTo(cx + 5,  cy - r - 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ── God Mode: golden halo ring + white wings ─────────────────────────
      if (godMode) {
        ctx.globalAlpha = 1.0;
        const t = Date.now();
        const haloPulse = 0.5 + 0.5 * Math.sin(t / 500);

        // Wings — two bezier arcs, left and right
        ctx.save();
        ctx.globalAlpha = 0.72 + haloPulse * 0.18;
        ctx.shadowColor = '#ffffaa';
        ctx.shadowBlur  = 14 + haloPulse * 10;
        // Left wing
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - 2);
        ctx.bezierCurveTo(cx - r - 18, cy - 14, cx - r - 28, cy + 6, cx - r - 10, cy + 14);
        ctx.bezierCurveTo(cx - r - 4,  cy + 18, cx - r + 4,  cy + 8, cx - r + 4, cy + 2);
        const wg = ctx.createLinearGradient(cx - r - 28, cy, cx - r, cy);
        wg.addColorStop(0, 'rgba(255,255,230,0.0)');
        wg.addColorStop(0.5, 'rgba(255,255,210,0.72)');
        wg.addColorStop(1, 'rgba(255,255,240,0.55)');
        ctx.fillStyle = wg;
        ctx.fill();
        // Right wing (mirrored)
        ctx.beginPath();
        ctx.moveTo(cx + r, cy - 2);
        ctx.bezierCurveTo(cx + r + 18, cy - 14, cx + r + 28, cy + 6, cx + r + 10, cy + 14);
        ctx.bezierCurveTo(cx + r + 4,  cy + 18, cx + r - 4,  cy + 8, cx + r - 4, cy + 2);
        const wg2 = ctx.createLinearGradient(cx + r, cy, cx + r + 28, cy);
        wg2.addColorStop(0, 'rgba(255,255,240,0.55)');
        wg2.addColorStop(0.5, 'rgba(255,255,210,0.72)');
        wg2.addColorStop(1, 'rgba(255,255,230,0.0)');
        ctx.fillStyle = wg2;
        ctx.fill();
        ctx.restore();

        // Golden halo ring
        ctx.save();
        ctx.globalAlpha = 0.85 + haloPulse * 0.15;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 18 + haloPulse * 16;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r - 7, 14, 5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,${180 + Math.floor(haloPulse*60)},0,0.95)`;
        ctx.lineWidth   = 3.5;
        ctx.stroke();
        // Inner shimmer line
        ctx.beginPath();
        ctx.ellipse(cx, cy - r - 7, 10, 3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,200,${0.4 + haloPulse * 0.35})`;
        ctx.lineWidth   = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      // ── Super Speed: electric lightning bolts + speed trail ──────────────
      if (superSpeed) {
        ctx.globalAlpha = 1.0;
        const t  = Date.now();
        const sp = 0.5 + 0.5 * Math.sin(t / 80);   // fast flicker

        // Speed-streak lines behind the player
        ctx.save();
        ctx.globalAlpha = 0.30 + sp * 0.30;
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth   = 1.5;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur  = 8;
        for (let i = 0; i < 4; i++) {
          const oy = cy - 8 + i * 5;
          const len = 10 + i * 4;
          ctx.beginPath();
          ctx.moveTo(cx - r - 2, oy);
          ctx.lineTo(cx - r - 2 - len, oy);
          ctx.stroke();
        }
        ctx.restore();

        // Lightning bolts — left and right
        ctx.save();
        ctx.globalAlpha = 0.80 + sp * 0.20;
        ctx.shadowColor = '#ffff44';
        ctx.shadowBlur  = 14 + sp * 12;
        ctx.strokeStyle = '#ffe600';
        ctx.lineWidth   = 2;
        ctx.fillStyle   = '#fff176';
        // Left bolt
        const lx = cx - r - 14, ly = cy - 10;
        ctx.beginPath();
        ctx.moveTo(lx + 4,  ly);
        ctx.lineTo(lx,      ly + 7);
        ctx.lineTo(lx + 3,  ly + 7);
        ctx.lineTo(lx - 2,  ly + 16);
        ctx.lineTo(lx + 6,  ly + 5);
        ctx.lineTo(lx + 2,  ly + 5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Right bolt
        const rx2 = cx + r + 6, ry = cy - 10;
        ctx.beginPath();
        ctx.moveTo(rx2 + 4,  ry);
        ctx.lineTo(rx2,      ry + 7);
        ctx.lineTo(rx2 + 3,  ry + 7);
        ctx.lineTo(rx2 - 2,  ry + 16);
        ctx.lineTo(rx2 + 6,  ry + 5);
        ctx.lineTo(rx2 + 2,  ry + 5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Rapid outer pulse ring
        ctx.save();
        ctx.globalAlpha = 0.18 + sp * 0.22;
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur  = 20;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 7 + sp * 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.restore();
      }

      // ── Admin Aura: rotating golden neon ring ────────────────────────────
      if (adminAura) {
        const t   = Date.now();
        const rot = (t / 600) % (Math.PI * 2);
        const ap  = 0.5 + 0.5 * Math.sin(t / 400);
        ctx.save();
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 22 + ap * 16;
        ctx.strokeStyle = `rgba(255,${180 + Math.floor(ap * 60)},0,${0.80 + ap * 0.20})`;
        ctx.lineWidth   = 3.5;
        // Draw dashed rotating arc segments
        for (let i = 0; i < 6; i++) {
          const a1 = rot + (i / 6) * Math.PI * 2;
          const a2 = a1 + Math.PI / 8;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 13, a1, a2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Dev Cape: red cape behind the player ────────────────────────────
      if (adminCape) {
        ctx.save();
        const cp = 0.5 + 0.5 * Math.sin(Date.now() / 250);
        ctx.shadowColor = '#cc0000';
        ctx.shadowBlur  = 10;
        // Cape body — trapezoid hanging from shoulders
        const capeGrad = ctx.createLinearGradient(cx, cy - r + 4, cx, cy + r + 14);
        capeGrad.addColorStop(0, `rgba(200,0,0,0.92)`);
        capeGrad.addColorStop(1, `rgba(120,0,0,0.55)`);
        ctx.fillStyle = capeGrad;
        ctx.beginPath();
        ctx.moveTo(cx - r + 6, cy - r + 4);       // left shoulder
        ctx.lineTo(cx - r - 4 - cp * 3, cy + r + 14); // left hem (flutters)
        ctx.lineTo(cx + r + 4 + cp * 3, cy + r + 14); // right hem
        ctx.lineTo(cx + r - 6, cy - r + 4);       // right shoulder
        ctx.closePath();
        ctx.fill();
        // Cape edge highlight
        ctx.strokeStyle = `rgba(255,60,60,0.55)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // ── Hacker Mask: 🎭 emoji centered on the face ──────────────────────
      if (adminMask) {
        ctx.save();
        ctx.font = `${Math.round(r * 1.1)}px serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha  = 0.92;
        ctx.fillText('🎭', cx, cy - 2);
        ctx.restore();
      }

      ctx.restore();
    }

    // ── Enemy draw functions — one per type ────────────────────────────────

    // Hunter: Red Skull — medium speed, chases player.
    function drawHunter(x, y) {
      const cx = x + CELL / 2, cy = y + CELL / 2;
      ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 32;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 18, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx - 5, cy - 7, 2, cx, cy - 2, 18);
      g.addColorStop(0, '#ff5544'); g.addColorStop(1, '#7a0000');
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#440000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#110000';
      ctx.beginPath(); ctx.ellipse(cx - 6, cy - 4, 5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 6, cy - 4, 5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffdddd';
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 8 + i * 5, cy + 6, 4, 7);
      ctx.fillStyle = '#550000'; ctx.fillRect(cx - 9, cy + 6, 21, 2);
    }

    // Patroller: Blue Ghost — fast, straight-line patrol, wavy body.
    function drawPatroller(x, y) {
      const cx = x + CELL / 2, cy = y + CELL / 2;
      ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 34;
      const R = 17;
      ctx.beginPath();
      ctx.arc(cx, cy - 3, R, Math.PI, 0, false);
      ctx.lineTo(cx + R, cy + 11);
      ctx.quadraticCurveTo(cx + R * 0.65, cy + 4,  cx + R * 0.33, cy + 11);
      ctx.quadraticCurveTo(cx,            cy + 4,  cx - R * 0.33, cy + 11);
      ctx.quadraticCurveTo(cx - R * 0.65, cy + 4,  cx - R,        cy + 11);
      ctx.lineTo(cx - R, cy - 3);
      const g = ctx.createRadialGradient(cx - 5, cy - 8, 2, cx, cy - 3, R);
      g.addColorStop(0, '#99ccff'); g.addColorStop(1, '#0033bb');
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#002299'; ctx.lineWidth = 2; ctx.stroke();
      // Large hollow eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(cx - 6, cy - 5, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 6, cy - 5, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#001888';
      ctx.beginPath(); ctx.ellipse(cx - 5, cy - 4, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 7, cy - 4, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Erratic: Green Slime — slow, random movement, blobby shape.
    function drawErratic(x, y) {
      const cx = x + CELL / 2, cy = y + CELL / 2 + 3;
      ctx.shadowColor = '#33dd55'; ctx.shadowBlur = 30;
      ctx.beginPath();
      const R = 16;
      ctx.moveTo(cx + R, cy);
      ctx.bezierCurveTo(cx + R,       cy - R * 0.5,  cx + R * 0.5,  cy - R * 1.2, cx,      cy - R);
      ctx.bezierCurveTo(cx - R * 0.5, cy - R * 1.2,  cx - R * 1.1,  cy - R * 0.4, cx - R,  cy);
      ctx.bezierCurveTo(cx - R * 1.1, cy + R * 0.4,  cx - R * 0.4,  cy + R,       cx,      cy + R * 0.8);
      ctx.bezierCurveTo(cx + R * 0.4, cy + R,        cx + R,        cy + R * 0.5, cx + R,  cy);
      const g = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, R);
      g.addColorStop(0, '#99ff99'); g.addColorStop(1, '#117733');
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#0a5520'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#001a08';
      ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#77ff99';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 5, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, cy - 5, 1.3, 0, Math.PI * 2); ctx.fill();
    }

    // Chaser: Magenta Diamond — very fast, BFS-tracks player everywhere.
    function drawChaser(x, y) {
      const cx = x + CELL / 2, cy = y + CELL / 2;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 140);
      ctx.shadowColor = `rgba(255,60,220,0.95)`;
      ctx.shadowBlur = 26 + pulse * 18;
      ctx.beginPath();
      ctx.moveTo(cx,      cy - 19);
      ctx.lineTo(cx + 14, cy + 2 );
      ctx.lineTo(cx + 8,  cy + 16);
      ctx.lineTo(cx - 8,  cy + 16);
      ctx.lineTo(cx - 14, cy + 2 );
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy - 2, 1, cx, cy + 4, 17);
      g.addColorStop(0, '#ff88ff');
      g.addColorStop(1, '#990099');
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#660066'; ctx.lineWidth = 2; ctx.stroke();
      // Glowing orange eyes
      const eyeGlow = `rgba(255,${160 + Math.floor(pulse * 80)},0,1)`;
      ctx.fillStyle = eyeGlow;
      ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy - 1, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 6, cy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
    }

    // Frozen ice overlay — drawn on top of any enemy when freezeEnemies is on.
    function drawFrozenOverlay(x, y) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const t  = Date.now();
      const shimmer = 0.5 + 0.5 * Math.sin(t / 700);

      ctx.save();

      // Icy blue fill over the whole cell
      ctx.globalAlpha = 0.52 + shimmer * 0.08;
      ctx.fillStyle   = 'rgba(140,220,255,0.38)';
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 8);
      ctx.fill();

      // Glowing border
      ctx.globalAlpha = 0.80 + shimmer * 0.20;
      ctx.shadowColor = '#00d2ff';
      ctx.shadowBlur  = 14 + shimmer * 10;
      ctx.strokeStyle = `rgba(${100 + Math.floor(shimmer*80)},230,255,0.90)`;
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 8);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Snowflake ❄ — 6-arm star drawn with lines
      ctx.globalAlpha = 0.75 + shimmer * 0.20;
      ctx.strokeStyle = '#e8f8ff';
      ctx.shadowColor = '#88eeff';
      ctx.shadowBlur  = 8;
      ctx.lineWidth   = 1.8;
      const sr = 9;   // arm radius
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const ax = cx + Math.cos(angle) * sr;
        const ay = cy + Math.sin(angle) * sr;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // small tick marks on each arm
        const bx = cx + Math.cos(angle) * sr * 0.55;
        const by = cy + Math.sin(angle) * sr * 0.55;
        const pa = angle + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(pa) * 3.5, by + Math.sin(pa) * 3.5);
        ctx.lineTo(bx - Math.cos(pa) * 3.5, by - Math.sin(pa) * 3.5);
        ctx.stroke();
      }
      // centre dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Ice crack lines
      ctx.globalAlpha = 0.28 + shimmer * 0.12;
      ctx.strokeStyle = '#c8f0ff';
      ctx.shadowBlur  = 0;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 10); ctx.lineTo(cx - 2, cy + 4); ctx.lineTo(cx + 6, cy - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 9, cy + 8);  ctx.lineTo(cx + 2, cy - 2); ctx.stroke();

      ctx.restore();
    }

    // Dispatch to the right draw function based on enemy type.
    function drawEnemy(en, px, py) {
      if (en.type === 'patroller') drawPatroller(px, py);
      else if (en.type === 'erratic') drawErratic(px, py);
      else if (en.type === 'chaser') drawChaser(px, py);
      else drawHunter(px, py);
      if (freezeEnemies) drawFrozenOverlay(px, py);
    }

    // A golden collectible key.  `bob` is a small vertical offset (0–3 px)
    // supplied each frame to create a gentle floating animation.
    function drawKey(x, y, bob) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2 + bob;   // bob floats the key up and down

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 5);   // slight tilt for visual interest

      const gold  = THEME.keyColor  || '#FFD700';
      const dGold = THEME.keyDark   || '#B8860B';

      ctx.shadowColor = THEME.keyShadow || '#FFD700';
      ctx.shadowBlur  = 28;

      // Key ring (hollow circle)
      ctx.beginPath();
      ctx.arc(0, -8, 9, 0, Math.PI * 2);
      ctx.strokeStyle = gold;
      ctx.lineWidth   = 4.5;
      ctx.stroke();
      ctx.strokeStyle = dGold;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Key shaft — softer glow so it doesn't overpower the ring
      ctx.shadowBlur = 14;
      ctx.fillStyle  = gold;
      ctx.fillRect(-3, -2, 6, 22);
      ctx.fillStyle  = dGold;
      ctx.fillRect(-3, -2, 1.5, 22);   // left shadow stripe

      // Teeth (two right-side notches)
      ctx.fillStyle = gold;
      ctx.fillRect(3, 5,  6, 4);    // tooth 1
      ctx.fillRect(3, 13, 6, 3);    // tooth 2

      ctx.restore();
    }

    // The exit door — translucent glowing portal (red=locked, cyan=unlocked).
    function drawDoor(x, y, unlocked, pulse) {
      ctx.save();
      const cx = x + CELL / 2, cy = y + CELL / 2;
      const pad = 4;
      const W = CELL - pad * 2, H = CELL - pad * 2;

      // Outer glow
      ctx.shadowColor = unlocked ? '#00ffcc' : '#ff4400';
      ctx.shadowBlur  = 24 + 20 * pulse;

      // Semi-transparent filled body (portal glass)
      ctx.globalAlpha = 0.45 + 0.22 * pulse;
      ctx.fillStyle   = unlocked ? 'rgba(0,220,140,0.9)' : 'rgba(200,50,10,0.9)';
      ctx.fillRect(x + pad, y + pad, W, H);

      // Diagonal shimmer stripe
      const g = ctx.createLinearGradient(x + pad, y + pad, x + pad + W, y + pad + H);
      g.addColorStop(0,    unlocked ? 'rgba(200,255,230,0.5)' : 'rgba(255,180,130,0.5)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.08)');
      g.addColorStop(1,    'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(x + pad, y + pad, W, H);

      // Glowing border frame
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur  = 8;
      ctx.strokeStyle = unlocked ? '#00ffcc' : '#ff6633';
      ctx.lineWidth   = 2;
      ctx.strokeRect(x + pad + 1, y + pad + 1, W - 2, H - 2);

      // Keyhole
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      const kx = cx, ky = cy - 4;
      ctx.fillStyle = unlocked ? 'rgba(0,60,40,0.8)' : 'rgba(60,10,0,0.8)';
      ctx.beginPath(); ctx.arc(kx, ky, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(kx - 4, ky + 5); ctx.lineTo(kx + 4, ky + 5);
      ctx.lineTo(kx + 2.5, ky + 15); ctx.lineTo(kx - 2.5, ky + 15);
      ctx.closePath(); ctx.fill();

      // Label
      ctx.fillStyle = unlocked ? '#aaffee' : '#ffaa88';
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(unlocked ? 'EXIT' : 'LOCK', kx, y + CELL - 7);
      ctx.textAlign = 'left';

      ctx.restore();
    }

    // Candy collectible — a pink 🍬 emoji that bobs like the key.
    function drawCandy(x, y, bob) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2 + bob;
      ctx.save();
      ctx.shadowColor = '#ff88cc';
      ctx.shadowBlur  = 14;
      ctx.font        = '20px serif';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍬', cx, cy);
      ctx.restore();
    }

    function drawShieldPU(x, y, bob) {
      const cx = x + CELL / 2, cy = y + CELL / 2 + bob;
      ctx.save();
      ctx.shadowColor = '#66ccff'; ctx.shadowBlur = 18;
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', cx, cy);
      ctx.restore();
    }

    function drawSpeedPU(x, y, bob) {
      const cx = x + CELL / 2, cy = y + CELL / 2 + bob;
      ctx.save();
      ctx.shadowColor = '#ffee44'; ctx.shadowBlur = 18;
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', cx, cy);
      ctx.restore();
    }

    function drawHeart(x, y, bob) {
      const cx = x + CELL / 2, cy = y + CELL / 2 + bob;
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.shadowColor = `rgba(255,80,120,${0.7 + pulse * 0.3})`;
      ctx.shadowBlur = 14 + pulse * 10;
      // Draw a simple heart shape using bezier curves
      const s = 9 + pulse * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.9);
      ctx.bezierCurveTo(cx - s * 1.5, cy, cx - s * 2, cy - s * 1.2, cx, cy - s * 0.4);
      ctx.bezierCurveTo(cx + s * 2, cy - s * 1.2, cx + s * 1.5, cy, cx, cy + s * 0.9);
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy - s * 0.2, 1, cx, cy + s * 0.3, s * 1.6);
      g.addColorStop(0, '#ff99bb');
      g.addColorStop(1, '#cc1144');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#880022';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    function drawPortal(x, y, t) {
      const cx = x + CELL / 2, cy = y + CELL / 2;
      const spin = t * 2.8;
      ctx.save();
      // Swirling glow rings
      for (let i = 0; i < 3; i++) {
        const r = 14 + i * 4;
        const alpha = 0.5 - i * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, r, spin + i, spin + i + Math.PI * 1.3);
        ctx.strokeStyle = i === 0 ? `rgba(180,80,255,${alpha})` : i === 1 ? `rgba(100,160,255,${alpha})` : `rgba(200,100,255,${alpha})`;
        ctx.lineWidth = 3.5 - i * 0.8;
        ctx.shadowColor = '#aa44ff';
        ctx.shadowBlur = 16;
        ctx.stroke();
      }
      // Emoji centre
      ctx.shadowBlur = 0;
      ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🌀', cx, cy);
      ctx.restore();
    }

    // Particle burst drawn at the tile where a key was collected.
    // `life` ranges from 1.0 (just spawned) down to 0.0 (vanished).
    function drawCollectFx(fx) {
      const px = fx.c * CELL + CELL / 2;
      const py = fx.r * CELL + CELL / 2;
      const age = 1 - fx.life;   // 0 at spawn, 1 at expiry

      const color = fx.heart ? '#ff3366' : fx.candy ? '#ff88cc' : '#FFD700';
      ctx.save();
      ctx.globalAlpha = fx.life;

      // Expanding ring
      ctx.beginPath();
      ctx.arc(px, py, age * 34 + 8, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.stroke();

      // Six radiating sparkle dots
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const dist  = age * 30 + 10;
        ctx.beginPath();
        ctx.arc(px + Math.cos(angle) * dist,
                py + Math.sin(angle) * dist, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.restore();
    }

    // ── Key Storm effect state ────────────────────────────────────────────
    let keyStormParticles = [];   // { x, y, vx, vy, life, size }  flying keys
    let keyStormText      = 0;    // life 0→1→0  (1.0 = just spawned, fades to 0)
    let keyStormExplosion = 0;    // golden burst life at player position

    function launchKeyStorm() {
      if (!gameStarted) return;

      // Collect key positions before erasing them
      const keyPositions = [];
      for (let r = 0; r < state.map.length; r++)
        for (let c = 0; c < state.map[r].length; c++)
          if (state.map[r][c] === 3) keyPositions.push({ r, c });

      if (!keyPositions.length) return;   // nothing to animate

      // Erase keys from map, update state
      for (const kp of keyPositions) state.map[kp.r][kp.c] = 1;
      state.keysCollected = state.totalKeys;
      state.doorUnlocked  = true;
      updateHUD();

      // Spawn flying-key particles (one per real key, extras for flair)
      const px = state.col * CELL + CELL / 2;
      const py = state.row * CELL + CELL / 2;
      for (const kp of keyPositions) {
        const sx = kp.c * CELL + CELL / 2;
        const sy = kp.r * CELL + CELL / 2;
        const dist = Math.hypot(px - sx, py - sy) || 1;
        // velocity aimed at player, scaled so far keys travel faster
        const speed = 3.5 + dist * 0.03;
        keyStormParticles.push({
          x: sx, y: sy,
          vx: ((px - sx) / dist) * speed,
          vy: ((py - sy) / dist) * speed,
          life: 1.0,
          size: 10 + Math.random() * 6,
        });
      }

      keyStormText      = 1.0;   // trigger banner
      keyStormExplosion = 0;     // reset — will fire when last particle arrives
    }

    // Draw a single flying key particle (mini key icon)
    function drawFlyingKey(p) {
      ctx.save();
      ctx.globalAlpha = Math.min(p.life * 2, 1.0);
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur  = 12;
      ctx.font        = `${p.size}px serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🗝️', p.x, p.y);
      ctx.restore();
    }

    // Draw the "KEY STORM!" banner centred on the canvas
    function drawKeyStormBanner(life) {
      const fade   = life < 0.25 ? life / 0.25 : life > 0.75 ? (1 - life) / 0.25 : 1;
      const shake  = Math.sin(Date.now() / 35) * 3 * fade;
      const cx     = canvas.width  / 2 + shake;
      const cy     = canvas.height / 2;
      ctx.save();
      ctx.globalAlpha = fade * 0.95;
      ctx.font        = `bold ${Math.round(26 + fade * 8)}px 'Segoe UI', sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur  = 30 + fade * 20;
      ctx.fillStyle   = '#fffde0';
      ctx.fillText('🔑  KEY STORM!  🔑', cx, cy);
      // Thicker golden outline
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = '#c8900a';
      ctx.lineWidth   = 2;
      ctx.strokeText('🔑  KEY STORM!  🔑', cx, cy);
      ctx.restore();
    }

    // Draw golden burst explosion at the player position
    function drawKeyExplosion(life) {
      const px  = state.col * CELL + CELL / 2;
      const py  = state.row * CELL + CELL / 2;
      const age = 1 - life;
      ctx.save();
      ctx.globalAlpha = life;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist  = age * 55 + 8;
        const sx    = px + Math.cos(angle) * dist;
        const sy    = py + Math.sin(angle) * dist;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5 * life, 0, Math.PI * 2);
        ctx.fillStyle   = i % 2 === 0 ? '#ffd700' : '#fff176';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 12;
        ctx.fill();
      }
      // central flash
      ctx.beginPath();
      ctx.arc(px, py, age < 0.3 ? 22 * (0.3 - age) / 0.3 : 0, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(255,240,100,0.55)';
      ctx.shadowBlur  = 30;
      ctx.fill();
      ctx.restore();
    }

    // ======================================================================
    // RENDER — called every frame
    // ======================================================================

    function render(t) {
      // t = elapsed seconds since page load (from requestAnimationFrame timestamp)
      const { map, row, col, doorUnlocked, fx, damageFx } = state;

      // Smooth player position interpolation (ease-out)
      const _raw  = state.lastMoveTime > 0
        ? Math.min(1, (performance.now() - state.lastMoveTime) / Math.max(30, _currentMoveMs))
        : 1;
      const _prog = 1 - Math.pow(1 - _raw, 2);
      const _drawCol = (state.prevCol + (col - state.prevCol) * _prog);
      const _drawRow = (state.prevRow + (row - state.prevRow) * _prog);

      ctx.fillStyle = THEME.canvasBg || '#0d0b14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cosmic Void starfield
      if (THEME.stars) {
        const W = canvas.width, H = canvas.height;
        STARS.forEach(s => {
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.b));
          ctx.globalAlpha = twinkle * 0.8;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // Door pulse wave (gentle sine)
      const pulse = (Math.sin(t * 3.2) + 1) / 2;

      // Key bob animation (sine oscillation, ±3 px)
      const bob = Math.sin(t * 2.5) * 3;

      // Draw every tile in the grid
      for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[r].length; c++) {
          const px   = c * CELL;
          const py   = r * CELL;
          const tile = map[r][c];

          if (tile === 0) {
            // Wall
            drawWall(px, py);
          } else if (tile === 1) {
            // Empty floor
            drawFloor(px, py);
          } else if (tile === 3) {
            // Key sitting on a floor cell
            drawFloor(px, py);
            drawKey(px, py, bob);
          } else if (tile === 4) {
            // Exit door on a floor cell
            drawFloor(px, py);
            drawDoor(px, py, doorUnlocked, pulse);
          } else if (tile === 5) {
            // Spike trap on a floor cell
            drawTrap(px, py, pulse);
          } else if (tile === 6) {
            drawFloor(px, py);
            drawCandy(px, py, bob);
          } else if (tile === 7) {
            drawFloor(px, py);
            drawShieldPU(px, py, bob);
          } else if (tile === 8) {
            drawFloor(px, py);
            drawSpeedPU(px, py, bob);
          } else if (tile === 9) {
            drawFloor(px, py);
            drawPortal(px, py, t);
          } else if (tile === 10) {
            drawFloor(px, py);
            drawHeart(px, py, bob);
          }
        }
      }

      // Reset any leftover shadow state before drawing effects/player
      ctx.shadowBlur = 0;

      // Particle burst effects (behind the player)
      for (const f of fx) {
        drawCollectFx(f);
      }

      // Enemies — drawn above FX but below the player
      for (const en of state.enemies) {
        drawEnemy(en, en.col * CELL, en.row * CELL);
        ctx.shadowBlur = 0;
      }

      // Player drawn last (on top of everything) — interpolated position
      const _pdr = state.row - state.prevRow;
      const _pdc = state.col - state.prevCol;
      const _moving = (_pdr !== 0 || _pdc !== 0) && _prog < 1;

      // Motion trail — ghost images fading behind
      if (_moving && _prog < 0.72) {
        for (let _ti = 1; _ti <= 2; _ti++) {
          const _tp  = Math.max(0, _prog - _ti * 0.18);
          const _tcp = 1 - Math.pow(1 - _tp, 2);
          const _tx  = (state.prevCol + (col - state.prevCol) * _tcp) * CELL;
          const _ty  = (state.prevRow + (row - state.prevRow) * _tcp) * CELL;
          ctx.save();
          ctx.globalAlpha = (0.18 - _ti * 0.07) * (1 - _prog);
          drawPlayer(_tx, _ty);
          ctx.restore();
        }
      }

      // Squash & stretch + lean in movement direction
      const _pCx = _drawCol * CELL + CELL / 2;
      const _pCy = _drawRow * CELL + CELL / 2;
      const _stretch = _moving ? Math.sin(_prog * Math.PI) * 0.22 : 0;
      const _scaleX  = _pdc !== 0 ? 1 + _stretch : (_pdr !== 0 ? 1 - _stretch * 0.55 : 1);
      const _scaleY  = _pdr !== 0 ? 1 + _stretch : (_pdc !== 0 ? 1 - _stretch * 0.55 : 1);
      const _lean    = _pdc * Math.sin(_prog * Math.PI) * 0.18;

      ctx.save();
      ctx.translate(_pCx, _pCy);
      ctx.rotate(_lean);
      ctx.scale(_scaleX, _scaleY);
      ctx.translate(-_pCx, -_pCy);
      drawPlayer(_drawCol * CELL, _drawRow * CELL);
      ctx.restore();

      // Also reset shadow after player draw
      ctx.shadowBlur = 0;

      // ── Key Storm: flying key particles ──────────────────────────────────
      for (const p of keyStormParticles) drawFlyingKey(p);

      // ── Key Storm: golden explosion at player ────────────────────────────
      if (keyStormExplosion > 0) drawKeyExplosion(keyStormExplosion);

      // ── Key Storm: "KEY STORM!" banner ───────────────────────────────────
      if (keyStormText > 0) drawKeyStormBanner(keyStormText);

      // Full-screen red flash for trap damage — fades out over ~20 frames
      if (damageFx > 0) {
        ctx.save();
        ctx.globalAlpha = damageFx * 0.45;
        ctx.fillStyle   = '#ff0000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Purple teleport flash
      if (state.teleportFx > 0) {
        ctx.save();
        ctx.globalAlpha = state.teleportFx * 0.55;
        ctx.fillStyle   = '#aa44ff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Portal cooldown countdown drawn on each portal tile
      if (state.portals.length === 2 && state.teleportCooldown > 0) {
        ctx.save();
        for (const portal of state.portals) {
          const tx = portal.c * CELL + CELL / 2;
          const ty = portal.r * CELL + CELL / 2;
          // Grey-out overlay on portal
          ctx.globalAlpha = 0.52;
          ctx.fillStyle   = 'rgba(10,0,20,0.72)';
          ctx.beginPath();
          ctx.arc(tx, ty, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          // Countdown ring — arc shrinks as cooldown decreases
          const pct = state.teleportCooldown / 2.5;
          ctx.beginPath();
          ctx.arc(tx, ty, 17, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
          ctx.strokeStyle = '#ff5544';
          ctx.lineWidth   = 3.5;
          ctx.shadowColor = '#ff3322';
          ctx.shadowBlur  = 10;
          ctx.stroke();
          ctx.shadowBlur  = 0;
          // Number label
          ctx.font         = 'bold 12px monospace';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle    = '#ff8877';
          ctx.fillText(state.teleportCooldown.toFixed(1), tx, ty);
        }
        ctx.restore();
      }

      // "Press [E]" / cooldown hint — shown when player is standing on a portal tile
      if (state.portals.length === 2) {
        const p0 = state.portals[0], p1 = state.portals[1];
        if ((state.row === p0.r && state.col === p0.c) ||
            (state.row === p1.r && state.col === p1.c)) {
          const px = state.col * CELL + CELL / 2;
          const py = state.row * CELL - 10;
          ctx.save();
          ctx.font         = 'bold 13px monospace';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          const onCooldown = state.teleportCooldown > 0;
          const label = onCooldown ? `⏳ ${state.teleportCooldown.toFixed(1)}s` : 'Press [E]';
          const tw = ctx.measureText(label).width;
          const pad = 6;
          const bx = px - tw / 2 - pad, by = py - 20;
          const bw = tw + pad * 2,      bh = 20;
          ctx.globalAlpha  = 0.88;
          ctx.fillStyle    = '#1a0035';
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 6);
          ctx.fill();
          ctx.strokeStyle  = onCooldown ? '#ff5544' : '#aa44ff';
          ctx.lineWidth    = 1.5;
          ctx.stroke();
          ctx.globalAlpha  = 1;
          ctx.fillStyle    = onCooldown ? '#ff8877' : '#cc88ff';
          ctx.shadowColor  = onCooldown ? '#ff3322' : '#aa44ff';
          ctx.shadowBlur   = 8;
          ctx.fillText(label, px, py);
          ctx.restore();
        }
      }

      // ── Level 5 Darkness (Void) effect ──────────────────────────────────
      if (currentLevelIndex === 4 && gameStarted && !state.won && !state.gameOver) {
        const plx = state.col * CELL + CELL / 2;
        const ply = state.row * CELL + CELL / 2;
        const vis = CELL * 3.2;

        ctx.save();
        // Soft gradient ring: transparent core → opaque black at vis radius
        const grad = ctx.createRadialGradient(plx, ply, vis * 0.5, plx, ply, vis);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,3,0.98)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Solid black everywhere beyond vis radius (evenodd hole punch)
        ctx.fillStyle = 'rgba(0,0,3,0.98)';
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.arc(plx, ply, vis, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.restore();
      }

      // ── Ghost mode timer overlay ──────────────────────────────────────────
      if (state.ghostActive && state.ghostTimer > 0) {
        const W    = canvas.width;
        const secs = state.ghostTimer;
        const total = 3.5;
        const frac  = secs / total;
        const low   = frac < 0.4;
        const color = low ? '#ff4466' : '#cc66ff';
        const glow  = low ? '#ff2244' : '#aa44ff';

        ctx.save();

        // ── Badge background ─────────────────────────────
        const bw = 160, bh = 36, bx = (W - bw) / 2, by = 10, br = 18;
        ctx.globalAlpha = 0.90;
        ctx.fillStyle   = 'rgba(10,0,28,0.88)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, br);
        ctx.fill();

        // Badge border glow
        ctx.globalAlpha  = 1;
        ctx.strokeStyle  = color;
        ctx.lineWidth    = 2;
        ctx.shadowColor  = glow;
        ctx.shadowBlur   = 16;
        ctx.stroke();
        ctx.shadowBlur   = 0;

        // ── Ghost icon + label ───────────────────────────
        ctx.font         = 'bold 14px monospace';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = color;
        ctx.shadowColor  = glow;
        ctx.shadowBlur   = 10;
        ctx.fillText('👻 GHOST', bx + 14, by + bh / 2 - 1);
        ctx.shadowBlur   = 0;

        // ── Countdown seconds ────────────────────────────
        ctx.font         = 'bold 16px monospace';
        ctx.textAlign    = 'right';
        ctx.fillStyle    = '#ffffff';
        ctx.shadowColor  = glow;
        ctx.shadowBlur   = 12;
        ctx.fillText(secs.toFixed(1) + 's', bx + bw - 12, by + bh / 2);
        ctx.shadowBlur   = 0;

        // ── Progress bar beneath badge ───────────────────
        const barH = 5, barY = by + bh + 4;
        const barW = bw * frac;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(bx, barY, bw, barH, 3);
        ctx.fill();

        ctx.globalAlpha  = 1;
        ctx.fillStyle    = color;
        ctx.shadowColor  = glow;
        ctx.shadowBlur   = 10;
        ctx.beginPath();
        ctx.roundRect(bx, barY, barW, barH, 3);
        ctx.fill();
        ctx.shadowBlur   = 0;

        ctx.restore();
      }
    }

    // ======================================================================
    // GAME LOGIC
    // ======================================================================

    // Update the HUD text elements to reflect current state.
    function updateHUD() {
      // Lives: filled hearts for remaining, hollow for lost
      const maxLives = DIFFICULTY[difficulty].lives;
      document.getElementById('lives').textContent =
        '❤️'.repeat(state.lives) + '🖤'.repeat(Math.max(0, maxLives - state.lives));

      document.getElementById('level-num').textContent =
        `${currentLevelIndex + 1} / ${LEVELS.length}`;

      document.getElementById('key-count').textContent =
        `${state.keysCollected} / ${state.totalKeys}`;

      const el = document.getElementById('door-status');
      if (state.doorUnlocked) {
        el.textContent = 'Unlocked!';
        el.className   = 'unlocked';
      } else {
        el.textContent = 'Locked';
        el.className   = '';
      }

      const gs = document.getElementById('ghost-status');
      if (state.ghostActive) {
        gs.textContent = `Active: ${Math.ceil(state.ghostTimer)}s`;
        gs.className   = 'active';
      } else if (state.ghostCooldown > 0) {
        gs.textContent = `Wait: ${Math.ceil(state.ghostCooldown)}s`;
        gs.className   = 'cooldown';
      } else {
        gs.textContent = 'Ready';
        gs.className   = '';
      }

      // Sync mobile ghost button
      const gb = document.getElementById('kq-ghost-btn');
      const gl = document.getElementById('kq-ghost-label');
      if (gb && gl) {
        if (state.ghostActive) {
          gb.className   = 'ghost-on';
          gl.textContent = Math.ceil(state.ghostTimer) + 's';
          const pct = Math.round((state.ghostTimer / 3.5) * 100);
          gb.style.setProperty('--pct', pct + '%');
        } else if (state.ghostCooldown > 0) {
          gb.className   = 'ghost-cd';
          gl.textContent = Math.ceil(state.ghostCooldown) + 's';
          const pct = Math.round((1 - state.ghostCooldown / 25) * 100);
          gb.style.setProperty('--pct', pct + '%');
        } else {
          gb.className   = 'ghost-ready';
          gl.textContent = 'Q';
          gb.style.setProperty('--pct', '100%');
        }
      }

      const portalHud = document.getElementById('hud-portal');
      const ps        = document.getElementById('portal-status');
      if (portalHud && ps) {
        if (state.portals.length === 2) {
          portalHud.style.display = '';
          if (state.teleportCooldown > 0) {
            ps.textContent = `Wait: ${state.teleportCooldown.toFixed(1)}s`;
            ps.className   = 'cooldown';
          } else {
            ps.textContent = 'Ready';
            ps.className   = '';
          }
        } else {
          portalHud.style.display = 'none';
        }
      }

      const shieldEl = document.getElementById('hud-shield');
      if (shieldEl) shieldEl.style.display = hasShield ? '' : 'none';

      const speedEl  = document.getElementById('hud-speed');
      const speedTm  = document.getElementById('speed-timer');
      if (speedEl) speedEl.style.display = speedBoostTimer > 0 ? '' : 'none';
      if (speedTm) speedTm.textContent   = Math.ceil(speedBoostTimer) + 's';

      updateCheckpointHUD();
    }

    // Shared damage handler for enemy collisions.
    // Invincibility frames stop a single touch from draining multiple lives.
    function hitByEnemy() {
      if (godMode || state.ghostActive || state.invincible > 0 || state.won || state.gameOver) return;
      if (hasShield) {
        playSound('enemySquish');
        hasShield        = false;
        state.damageFx   = 1.0;
        state.invincible = 1.5;
        updateHUD();
        return;
      }
      state.lives--;
      state.damageFx   = 1.0;
      state.invincible = 1.5;   // 1.5 s grace period before next hit
      updateHUD();
      if (state.lives <= 0) {
        state.gameOver = true;
        playSound('gameover');
        showGameOver();
      } else {
        state.row = state.startRow;
        state.col = state.startCol;
      }
    }

    // Attempt to move the player by (dr rows, dc columns).
    // Enforces all movement rules: walls, locked door, key pickup, trap, win.
    function tryMove(dr, dc) {
      if (!gameStarted || gamePaused || state.won || state.gameOver) return;

      const newRow = state.row + dr;
      const newCol = state.col + dc;

      // Stay inside the grid
      if (newRow < 0 || newRow >= state.map.length)    return;
      if (newCol < 0 || newCol >= state.map[0].length) return;

      const tile  = state.map[newRow][newCol];
      const ghost = state.ghostActive;

      if (tile === 0 && !ghost) return;                  // wall — blocked (ghost walks through)
      if (tile === 4 && !state.doorUnlocked) return;     // locked door — always blocked

      // Move is legal — save previous position for interpolation, then update
      state.prevRow = state.row;
      state.prevCol = state.col;
      state.lastMoveTime = performance.now();
      state.row = newRow;
      state.col = newCol;

      // Enemy collision — ignored while ghost is active
      if (!ghost && state.enemies.some(en => en.row === state.row && en.col === state.col)) {
        hitByEnemy();
        return;
      }

      // Trap — ignored while ghost is active or god mode is on
      if (tile === 5 && !ghost && !godMode) {
        state.lives--;
        state.damageFx = 1.0;
        updateHUD();
        if (state.lives <= 0) {
          state.gameOver = true;
          showGameOver();
        } else {
          state.row = state.startRow;
          state.col = state.startCol;
        }
        return;
      }

      // Portal tile — player stands on it; 'E' key triggers the warp

      // Pick up a candy
      if (tile === 6) {
        state.map[newRow][newCol] = 1;
        addCandy(1);
        playSound('candy');
        state.fx.push({ r: newRow, c: newCol, life: 1.0, candy: true });
      }

      // Pick up a shield power-up
      if (tile === 7) {
        state.map[newRow][newCol] = 1;
        hasShield = true;
        state.fx.push({ r: newRow, c: newCol, life: 1.0, candy: true });
        playSound('key');
      }

      // Pick up a speed power-up
      if (tile === 8) {
        state.map[newRow][newCol] = 1;
        speedBoostTimer = 6;
        state.fx.push({ r: newRow, c: newCol, life: 1.0, candy: true });
        playSound('candy');
        // Restart movement interval at boosted speed
        if (_moveInterval) startMovement(_activeKey || _nextKey || 'ArrowRight');
      }

      // Pick up a heart — restore 1 life (capped at max)
      if (tile === 10) {
        state.map[newRow][newCol] = 1;
        const maxLives = DIFFICULTY[difficulty].lives;
        if (state.lives < maxLives) state.lives++;
        state.fx.push({ r: newRow, c: newCol, life: 1.0, heart: true });
        playSound('key');
        updateHUD();
      }

      // Pick up a key
      if (tile === 3) {
        state.map[newRow][newCol] = 1;
        playSound('key');
        state.keysCollected++;

        // Spawn a particle burst at this cell
        state.fx.push({ r: newRow, c: newCol, life: 1.0 });

        // Unlock the door once all keys are in hand
        if (state.keysCollected >= state.totalKeys) {
          state.doorUnlocked = true;
        }

        updateHUD();
      }

      // Door reached — advance to next level or trigger grand finale
      if (tile === 4 && state.doorUnlocked) {
        const nextIdx = currentLevelIndex + 1;
        const isLast  = nextIdx >= LEVELS.length;
        if (!isLast) {
          if (nextIdx === 1) level2Unlocked = true;
          if (nextIdx === 2) level3Unlocked = true;
          if (nextIdx === 3) level4Unlocked = true;
          if (nextIdx === 4) level5Unlocked = true;
          updateLevelSelector(); updateMainMenuLevels();
          showLevelVictory(nextIdx);
        } else {
          // Grand finale
          gameComplete = level2Unlocked = level3Unlocked = level4Unlocked = level5Unlocked = true;
          updateLevelSelector(); updateMainMenuLevels();
          spawnConfetti();
          showLevelVictory(null);
        }
      }
    }

    // Procedurally generate a 13×13 maze for Level 2.
    // Uses a recursive-backtracker (DFS) so the result is always fully connected.
    // BFS from (startR, startC) — returns a Set of "r,c" strings for every
    // reachable non-wall tile (floors, keys, and the door all count as passable).
    function bfsReachable(map, startR, startC) {
      const ROWS = map.length, COLS = map[0].length;
      const visited = new Set();
      const queue   = [[startR, startC]];
      visited.add(`${startR},${startC}`);
      while (queue.length) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const key = `${nr},${nc}`;
          if (visited.has(key) || map[nr][nc] === 0) continue;
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
      return visited;
    }

    function generateRandomLevel() {
      const ROWS = 13, COLS = 13;

      for (;;) {
        const map = Array.from({length: ROWS}, () => Array(COLS).fill(0));

        // Recursive-backtracker DFS — carves a perfect maze on odd-indexed cells.
        function carve(r, c) {
          map[r][c] = 1;
          const dirs = [[-2,0],[2,0],[0,-2],[0,2]].sort(() => Math.random() - 0.5);
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 1 && nr <= ROWS-2 && nc >= 1 && nc <= COLS-2 && map[nr][nc] === 0) {
              map[r + dr/2][c + dc/2] = 1;
              carve(nr, nc);
            }
          }
        }
        carve(1, 1);

        // ── Add loops (~20% of bridging walls) ─────────────────────────────
        // Opening extra walls turns the pure tree into a graph with
        // side-paths, so enemies in narrow corridors can always be dodged.
        const wallCandidates = [];
        for (let r = 2; r <= ROWS-3; r++) {
          for (let c = 2; c <= COLS-3; c++) {
            if (map[r][c] !== 0) continue;
            const horiz = map[r][c-1] !== 0 && map[r][c+1] !== 0;
            const vert  = map[r-1][c] !== 0 && map[r+1][c] !== 0;
            if (horiz || vert) wallCandidates.push([r, c]);
          }
        }
        wallCandidates.sort(() => Math.random() - 0.5);
        const loopCount = Math.max(6, Math.floor(wallCandidates.length * 0.20));
        for (let i = 0; i < loopCount && i < wallCandidates.length; i++)
          map[wallCandidates[i][0]][wallCandidates[i][1]] = 1;

        // Player start and door.
        map[1][1]           = 2;
        map[ROWS-2][COLS-2] = 4;
        map[ROWS-2][COLS-3] = 1;
        map[ROWS-3][COLS-2] = 1;

        // Floor tiles away from start/door corners.
        const pool = [];
        for (let r = 1; r < ROWS-1; r++)
          for (let c = 1; c < COLS-1; c++)
            if (map[r][c] === 1 && !(r <= 2 && c <= 2) && !(r >= ROWS-3 && c >= COLS-3))
              pool.push([r, c]);

        if (pool.length < 8) continue;
        pool.sort(() => Math.random() - 0.5);

        // Place 4 keys.
        for (let i = 0; i < 4; i++) map[pool[i][0]][pool[i][1]] = 3;

        // Solvability check — every key and the door must be BFS-reachable.
        const reachable = bfsReachable(map, 1, 1);
        let solvable = true;
        for (let r = 0; r < ROWS && solvable; r++)
          for (let c = 0; c < COLS && solvable; c++)
            if ((map[r][c] === 3 || map[r][c] === 4) && !reachable.has(`${r},${c}`))
              solvable = false;
        if (!solvable) continue;

        // ── Safe enemy spawn: Manhattan distance > 4 from player start ──────
        const enemyPool = pool.slice(4).filter(([r, c]) =>
          Math.abs(r - 1) + Math.abs(c - 1) > 4
        );
        if (enemyPool.length < 2) continue;

        // Generated Level 2: 1 Hunter + 1 Patroller for variety and challenge.
        const enemies = [
          { row: enemyPool[0][0], col: enemyPool[0][1], dir: [0,  1], type: 'hunter'    },
          { row: enemyPool[1][0], col: enemyPool[1][1], dir: [0, -1], type: 'patroller' },
        ];

        return { totalKeys: 4, enemies, map };
      }
    }

    // ======================================================================
    // ANIMATION LOOP
    // ======================================================================

    let lastTime = 0;

    function tick(timestamp) {
      const t  = timestamp / 1000;
      const dt = lastTime ? Math.min(t - lastTime, 0.1) : 0;  // cap to avoid tab-resume jumps
      lastTime = t;



      // Age and prune particle effects each frame
      state.fx = state.fx
        .map(f => ({ ...f, life: f.life - 0.033 }))   // ~30 frames to vanish
        .filter(f => f.life > 0);

      // ── Key Storm particle movement ───────────────────────────────────────
      if (keyStormParticles.length) {
        const px = state.col * CELL + CELL / 2;
        const py = state.row * CELL + CELL / 2;
        let allArrived = true;
        keyStormParticles = keyStormParticles.map(p => {
          const dx = px - p.x, dy = py - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 8) {
            return { ...p, life: 0 };           // arrived
          }
          allArrived = false;
          // accelerate toward player
          const speed = Math.hypot(p.vx, p.vy) + 0.4;
          return {
            ...p,
            x: p.x + (dx / dist) * speed,
            y: p.y + (dy / dist) * speed,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            life: p.life - 0.012,
          };
        }).filter(p => p.life > 0);
        if (allArrived && keyStormExplosion === 0) keyStormExplosion = 1.0;
      }
      if (keyStormExplosion > 0) keyStormExplosion = Math.max(0, keyStormExplosion - 0.038);
      if (keyStormText     > 0) keyStormText       = Math.max(0, keyStormText     - 0.022);

      // Decay the red damage flash
      if (state.damageFx   > 0) state.damageFx   = Math.max(0, state.damageFx   - 0.05);
      // Decay the purple teleport flash
      if (state.teleportFx > 0) state.teleportFx = Math.max(0, state.teleportFx - 0.07);
      // Decay the teleport cooldown
      if (state.teleportCooldown > 0) {
        state.teleportCooldown = Math.max(0, state.teleportCooldown - dt);
        updateHUD();
      }

      // Decay invincibility timer
      if (state.invincible > 0) state.invincible = Math.max(0, state.invincible - dt);

      // Decay speed boost timer
      if (speedBoostTimer > 0) {
        speedBoostTimer = Math.max(0, speedBoostTimer - dt);
        updateHUD();
        if (speedBoostTimer > 0 && speedBoostTimer <= 2) {
          const sec = Math.ceil(speedBoostTimer);
          if (sec !== _warnLastSec) { _warnLastSec = sec; playSound('warning'); }
        } else if (speedBoostTimer === 0) {
          _warnLastSec = -1;
        }
      }

      // ── Ghost Mode timers + enemy AI — frozen while paused ───────────────
      if (gamePaused) { render(t); requestAnimationFrame(tick); return; }

      if (state.ghostActive) {
        state.ghostTimer -= dt;
        if (state.ghostTimer <= 0) {
          state.ghostActive   = false;
          state.ghostTimer    = 0;
          state.ghostCooldown = 25;
          document.getElementById('game-container').classList.remove('ghost-active');
          // If the player is inside a wall when ghost expires, push them out.
          if (state.map[state.row][state.col] === 0) pushOutOfWall();
        }
        updateHUD();
      } else if (state.ghostCooldown > 0) {
        state.ghostCooldown = Math.max(0, state.ghostCooldown - dt);
        updateHUD();
      }

      // ── Enemy AI ──────────────────────────────────────────────────────────
      if (!state.won && !state.gameOver && !freezeEnemies) {
        const canPass = (nr, nc) => {
          if (nr < 0 || nr >= state.map.length)    return false;
          if (nc < 0 || nc >= state.map[0].length) return false;
          const t = state.map[nr][nc];
          return t === 1 || t === 3 || t === 5;
        };
        const ALL = [[-1,0],[1,0],[0,-1],[0,1]];
        const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

        for (const en of state.enemies) {
          en.timer += dt;
          if (en.timer < en.moveCooldown) continue;
          en.timer = 0;

          const [dr, dc] = en.dir;

          if (en.type === 'hunter') {
            // ── Hunter: chase player when close, random-walk otherwise ──────
            const dist = Math.abs(en.row - state.row) + Math.abs(en.col - state.col);
            if (dist <= ENEMY_STATS.hunter.chaseRadius) {
              const pdr = Math.sign(state.row - en.row);
              const pdc = Math.sign(state.col - en.col);
              const preferred = [];
              if (pdr !== 0 && canPass(en.row + pdr, en.col    )) preferred.push([pdr, 0]);
              if (pdc !== 0 && canPass(en.row,        en.col + pdc)) preferred.push([0, pdc]);
              const step = preferred.length > 0
                ? rnd(preferred)
                : rnd(ALL.filter(([r,c]) => canPass(en.row + r, en.col + c)) || [[0,0]]);
              if (step) { en.dir = step; en.row += step[0]; en.col += step[1]; }
            } else {
              // outside radius — non-reversing random walk
              if (canPass(en.row + dr, en.col + dc)) {
                en.row += dr; en.col += dc;
              } else {
                const nr = ALL.filter(([r,c]) => !(r===-dr&&c===-dc) && canPass(en.row+r, en.col+c));
                const ch = nr.length > 0 ? nr : ALL.filter(([r,c]) => canPass(en.row+r, en.col+c));
                if (ch.length > 0) { en.dir = rnd(ch); en.row += en.dir[0]; en.col += en.dir[1]; }
              }
            }

          } else if (en.type === 'patroller') {
            // ── Patroller: straight ahead, turn randomly on wall ────────────
            if (canPass(en.row + dr, en.col + dc)) {
              en.row += dr; en.col += dc;
            } else {
              const nr = ALL.filter(([r,c]) => !(r===-dr&&c===-dc) && canPass(en.row+r, en.col+c));
              const ch = nr.length > 0 ? nr : ALL.filter(([r,c]) => canPass(en.row+r, en.col+c));
              if (ch.length > 0) { en.dir = rnd(ch); en.row += en.dir[0]; en.col += en.dir[1]; }
            }

          } else if (en.type === 'chaser') {
            // ── Chaser: BFS shortest path to player, always pursues ──────────
            const ROWS = state.map.length, COLS = state.map[0].length;
            const visited = new Set([`${en.row},${en.col}`]);
            const queue = [{ r: en.row, c: en.col, first: null }];
            let nextStep = null;
            outer: while (queue.length) {
              const { r, c, first } = queue.shift();
              for (const [qdr, qdc] of ALL) {
                const nr = r + qdr, nc = c + qdc;
                if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
                if (!canPass(nr, nc)) continue;
                const key = `${nr},${nc}`;
                if (visited.has(key)) continue;
                visited.add(key);
                const step = first || [qdr, qdc];
                if (nr === state.row && nc === state.col) { nextStep = step; break outer; }
                queue.push({ r: nr, c: nc, first: step });
              }
            }
            if (nextStep) { en.dir = nextStep; en.row += nextStep[0]; en.col += nextStep[1]; }

          } else {
            // ── Erratic: fully random direction every step ───────────────────
            const ch = ALL.filter(([r,c]) => canPass(en.row + r, en.col + c));
            if (ch.length > 0) { en.dir = rnd(ch); en.row += en.dir[0]; en.col += en.dir[1]; }
          }

          if (en.row === state.row && en.col === state.col && !state.ghostActive) hitByEnemy();
        }
      }

      render(t);
      requestAnimationFrame(tick);
    }

    // BFS outward from current position to find the nearest non-wall tile.
    function pushOutOfWall() {
      const { map } = state;
      const ROWS = map.length, COLS = map[0].length;
      const visited = new Set([`${state.row},${state.col}`]);
      const queue   = [[state.row, state.col]];
      while (queue.length) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const k = `${nr},${nc}`;
          if (visited.has(k)) continue;
          visited.add(k);
          if (map[nr][nc] !== 0) { state.row = nr; state.col = nc; return; }
          queue.push([nr, nc]);
        }
      }
    }

    // ======================================================================
    // INPUT — continuous movement via keysPressed map
    // ======================================================================

    function openUnifiedLogin() {
      document.getElementById('unified-login').classList.add('open');
      document.getElementById('ul-msg').textContent = '';
      _ulRefreshAttempts();
      gamePaused = true;
      setTimeout(() => document.getElementById('ul-pw').focus(), 60);
    }
    function closeUnifiedLogin() {
      document.getElementById('unified-login').classList.remove('open');
      document.getElementById('ul-pw').value = '';
      document.getElementById('ul-msg').textContent = '';
      gamePaused = false;
    }
    function _ulRefreshAttempts() {
      const rem = adminLockUntil - Date.now();
      const el  = document.getElementById('ul-attempts');
      if (rem > 0) {
        const m = Math.floor(rem / 60000), s = Math.ceil((rem % 60000) / 1000);
        el.textContent = `🔒 Locked — ${m > 0 ? m + 'm ' : ''}${s}s remaining`;
        el.style.color = '#ff6644';
        document.getElementById('ul-pw').disabled = true;
      } else {
        const left = 10 - adminAttempts;
        el.textContent = adminAttempts > 0 ? `${left} attempt${left === 1 ? '' : 's'} remaining` : '';
        el.style.color = adminAttempts >= 5 ? '#ffaa33' : '#4a3868';
        document.getElementById('ul-pw').disabled = false;
      }
    }

    // ── Unified Login handlers ───────────────────────────────────────────────
    document.getElementById('ul-close').addEventListener('click', closeUnifiedLogin);

    document.getElementById('ul-pw').addEventListener('input', (e) => {
      if (_adminLockRemaining() > 0) {
        playSound('adminFail');
        e.target.value = '';
        _ulRefreshAttempts();
        return;
      }
      if (e.target.value.length < adminPassword.length) return;

      const msg = document.getElementById('ul-msg');
      if (e.target.value === adminPassword) {
        playSound('adminSuccess');
        adminAttempts = 0;
        localStorage.setItem('kq_adm_attempts', '0');
        adminUnlocked = true;
        e.target.value = '';
        closeUnifiedLogin();
        openAdminSidebar();
      } else {
        playSound('adminFail');
        e.target.value = '';
        adminAttempts++;
        localStorage.setItem('kq_adm_attempts', String(adminAttempts));
        if (adminAttempts >= 10) {
          adminLockUntil = Date.now() + 60 * 60 * 1000;
          adminAttempts  = 0;
          localStorage.setItem('kq_adm_lock',     String(adminLockUntil));
          localStorage.setItem('kq_adm_attempts', '0');
          _ulRefreshAttempts();
          if (_lockInterval) { clearInterval(_lockInterval); _lockInterval = null; }
          _lockInterval = setInterval(() => { _ulRefreshAttempts(); if (_adminLockRemaining() <= 0) { clearInterval(_lockInterval); _lockInterval = null; } }, 1000);
        } else if (adminAttempts >= 5) {
          const left = 10 - adminAttempts;
          msg.textContent = `⚠️ Warning! ${left} attempt${left === 1 ? '' : 's'} left before 1-hour lock.`;
          msg.style.color = '#ffaa33';
          playSound('warning');
          _ulRefreshAttempts();
        } else {
          const left = 10 - adminAttempts;
          msg.textContent = `Wrong code. ${left} attempts left.`;
          msg.style.color = '#ff6666';
          _ulRefreshAttempts();
        }
      }
    });

    function openAdminSidebar() {
      if (!adminUnlocked && !gameComplete) {
        openUnifiedLogin();
        return;
      }
      document.getElementById('admin-sidebar').classList.add('open');
      document.getElementById('admin-pw-box').style.display = 'none';
      document.getElementById('admin-controls').style.display = 'flex';
      refreshPostGameSection();
    }
    function closeAdminSidebar() {
      document.getElementById('admin-sidebar').classList.remove('open');
      document.getElementById('admin-pw').value = '';
      gamePaused = false;
    }

    const KQ_SA_SES = 'kq_super_session';
    function isSuperSession() { return localStorage.getItem(KQ_SA_SES) === '1'; }

    function openSuperadminSidebar() {
      document.getElementById('superadmin-sidebar').classList.add('open');
      if (isSuperSession()) {
        document.getElementById('adm-super-login').style.display    = 'none';
        document.getElementById('adm-super-controls').style.display = 'flex';
        superadminUnlocked = true;
      } else {
        setTimeout(() => document.getElementById('adm-super-pw').focus(), 50);
      }
    }
    function closeSuperadminSidebar() {
      document.getElementById('superadmin-sidebar').classList.remove('open');
    }
    function exitSuperSession() {
      localStorage.removeItem(KQ_SA_SES);
      superadminUnlocked = false;
      document.getElementById('adm-super-login').style.display    = 'flex';
      document.getElementById('adm-super-controls').style.display = 'none';
      document.getElementById('adm-super-pw').value       = '';
      document.getElementById('adm-super-msg').textContent = '';
      document.getElementById('adm-new-pw').value         = '';
      document.getElementById('adm-new-pw2').value        = '';
      document.getElementById('adm-new-super1').value     = '';
      document.getElementById('adm-new-super2').value     = '';
      document.getElementById('adm-pw-msg').textContent        = '';
      document.getElementById('adm-super-code-msg').textContent = '';
      closeSuperadminSidebar();
    }
    function showToast(msg, color) {
      let t = document.getElementById('kq-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'kq-toast';
        Object.assign(t.style, {
          position:'fixed', bottom:'32px', left:'50%', transform:'translateX(-50%) translateY(20px)',
          background:'rgba(14,8,30,0.96)', border:'1.5px solid rgba(160,80,255,0.55)',
          borderRadius:'12px', padding:'11px 24px', fontSize:'0.82rem', fontWeight:'700',
          letterSpacing:'0.06em', color:'#d0aaff', boxShadow:'0 0 28px rgba(120,0,220,0.40)',
          zIndex:'9999', pointerEvents:'none', opacity:'0',
          transition:'opacity 0.22s ease, transform 0.22s ease',
          fontFamily:"system-ui,sans-serif", textAlign:'center', whiteSpace:'nowrap',
        });
        document.body.appendChild(t);
      }
      clearTimeout(t._timer);
      t.style.color = color || '#d0aaff';
      t.textContent = msg;
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
      t._timer = setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(20px)';
      }, 3000);
    }

    function toggleAdminPanel() {
      if (!adminUnlocked) {
        showToast('⛔ Access denied — please log in as Admin from the Hub first', '#ff5555');
        return;
      }
      const sidebar = document.getElementById('admin-sidebar');
      if (sidebar.classList.contains('open')) closeAdminSidebar();
      else openAdminSidebar();
    }
    function refreshPostGameSection() {
      const post = document.getElementById('adm-grid-post');
      post.style.display = (gameComplete || adminUnlocked) ? 'flex' : 'none';
    }

    // ── Grid movement ─────────────────────────────────────────────────────────
    const MOVE_DIRS = {
      w:[-1,0], W:[-1,0],
      s:[1,0],  S:[1,0],
      a:[0,-1], A:[0,-1],
      d:[0,1],  D:[0,1],
    };
    const pressedKeys = {};
    let _moveInterval    = null;
    let _activeKey       = null;
    let _nextKey         = null;
    let _currentMoveMs   = 180;  // current interval duration for interpolation

    // Returns true if the player can step one tile in direction [dr,dc]
    function canMove(dr, dc) {
      if (!gameStarted || gamePaused || state.won || state.gameOver) return false;
      const nr = state.row + dr;
      const nc = state.col + dc;
      if (nr < 0 || nr >= state.map.length)    return false;
      if (nc < 0 || nc >= state.map[0].length) return false;
      const tile = state.map[nr][nc];
      if (tile === 0 && !state.ghostActive)          return false;
      if (tile === 4 && !state.doorUnlocked)          return false;
      return true;
    }

    function stopMovement() {
      clearInterval(_moveInterval);
      _moveInterval = null;
      _activeKey    = null;
    }

    // One tick of the movement loop — called both on first press and by setInterval
    function moveTick() {
      // Try to switch to the buffered direction first
      if (_nextKey && _nextKey !== _activeKey) {
        const nd = MOVE_DIRS[_nextKey];
        if (canMove(nd[0], nd[1])) {
          _activeKey = _nextKey;
        }
      }
      if (!_activeKey) return;
      const d = MOVE_DIRS[_activeKey];
      if (canMove(d[0], d[1])) {
        tryMove(d[0], d[1]);
      }
      // if blocked, just wait — interval keeps firing; player resumes when path clears
    }

    function startMovement(key) {
      _nextKey = key;
      const d = MOVE_DIRS[key];
      // If current direction is free, switch immediately
      if (canMove(d[0], d[1])) _activeKey = key;
      // First tap: instant move
      moveTick();
      // Start/restart the repeat interval
      clearInterval(_moveInterval);
      _currentMoveMs = superSpeed ? 100 : speedBoostTimer > 0 ? 108 : 180;
      _moveInterval = setInterval(() => {
        // Stop only if no keys are held at all
        if (!Object.keys(MOVE_DIRS).some(k => pressedKeys[k])) {
          stopMovement();
          _nextKey = null;
          return;
        }
        moveTick();
      }, _currentMoveMs);
    }

    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;

      const dir = MOVE_DIRS[e.key];
      if (dir) {
        e.preventDefault();
        pressedKeys[e.key] = true;
        if (e.repeat) { _nextKey = e.key; return; }   // update buffer on OS repeat
        startMovement(e.key);
        return;
      }

      switch (e.key) {
        case 'q': case 'Q':
          if (gameStarted && !gamePaused && !state.ghostActive && state.ghostCooldown === 0 && !state.won && !state.gameOver) {
            state.ghostActive = true;
            state.ghostTimer  = 3.5;
            document.getElementById('game-container').classList.add('ghost-active');
            updateHUD();
          }
          break;
        case 'p': case 'P':
          e.preventDefault();
          if (adminUnlocked) {
            toggleAdminPanel();
          } else {
            showKqHint('⚠ Login as Admin from the main menu first');
          }
          break;
        case 'e': case 'E':
          if (gameStarted && !gamePaused && !state.won && !state.gameOver && state.portals.length === 2) {
            const p0 = state.portals[0], p1 = state.portals[1];
            const onP0 = (state.row === p0.r && state.col === p0.c);
            const onP1 = (state.row === p1.r && state.col === p1.c);
            if (onP0 || onP1) {
              if (state.teleportCooldown > 0) break;
              const dest = onP0 ? p1 : p0;
              state.row = dest.r;
              state.col = dest.c;
              state.teleportFx      = 1.0;
              state.teleportCooldown = 2.5;
              updateHUD();
              playSound('teleport');
            }
          }
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      pressedKeys[e.key] = false;
      if (!MOVE_DIRS[e.key]) return;
      // If buffered key released, clear buffer
      if (e.key === _nextKey) _nextKey = null;
      // Fall back to any still-held key
      const fallback = Object.keys(MOVE_DIRS).find(k => pressedKeys[k]);
      if (fallback) {
        _nextKey = fallback;
        if (e.key === _activeKey) _activeKey = fallback;
      } else {
        stopMovement();
        _nextKey = null;
      }
    });

    window.addEventListener('blur', () => {
      Object.keys(pressedKeys).forEach(k => pressedKeys[k] = false);
      stopMovement();
      _nextKey = null;
    });

    // ── D-pad touch controls ──────────────────────────────────────────────────
    (function initDpad() {
      // Apply hub control setting
      const ctrl = localStorage.getItem('hub_control');
      const dpadEl = document.getElementById('kq-dpad');
      if (dpadEl) {
        if (ctrl === 'mobile') dpadEl.style.display = 'grid';
        else if (ctrl === 'pc') dpadEl.style.display = 'none';
      }

      const dpadMap = {
        'kq-dp-up':    'w',
        'kq-dp-down':  's',
        'kq-dp-left':  'a',
        'kq-dp-right': 'd',
      };
      let activeTouchIds = {}; // touchId → key

      Object.entries(dpadMap).forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('touchstart', e => {
          e.preventDefault();
          btn.classList.add('pressed');
          dpadEl && dpadEl.classList.add('touching');
          pressedKeys[key] = true;
          activeTouchIds[e.changedTouches[0].identifier] = key;
          startMovement(key);
        }, { passive: false });

        const _endTouch = (e) => {
          btn.classList.remove('pressed');
          pressedKeys[key] = false;
          delete activeTouchIds[e.changedTouches[0].identifier];
          if (!Object.values(activeTouchIds).length) {
            dpadEl && dpadEl.classList.remove('touching');
            stopMovement();
            _nextKey = null;
          }
        };
        btn.addEventListener('touchend',    e => { e.preventDefault(); _endTouch(e); }, { passive: false });
        btn.addEventListener('touchcancel', e => { _endTouch(e); }, { passive: false });
      });

      // Ghost button touch
      const ghostBtn = document.getElementById('kq-ghost-btn');
      if (ghostBtn) {
        ghostBtn.addEventListener('touchstart', e => {
          e.preventDefault();
          ghostBtn.classList.add('touching');
          if (gameStarted && !gamePaused && !state.ghostActive && state.ghostCooldown === 0 && !state.won && !state.gameOver) {
            state.ghostActive = true;
            state.ghostTimer  = 3.5;
            document.getElementById('game-container').classList.add('ghost-active');
            updateHUD();
          }
        }, { passive: false });
        ghostBtn.addEventListener('touchend',    () => ghostBtn.classList.remove('touching'));
        ghostBtn.addEventListener('touchcancel', () => ghostBtn.classList.remove('touching'));
        ghostBtn.addEventListener('click', () => {
          if (gameStarted && !gamePaused && !state.ghostActive && state.ghostCooldown === 0 && !state.won && !state.gameOver) {
            state.ghostActive = true;
            state.ghostTimer  = 3.5;
            document.getElementById('game-container').classList.add('ghost-active');
            updateHUD();
          }
        });
      }

      // Apply hub control
      if (ghostBtn) {
        if (ctrl === 'mobile') ghostBtn.style.display = 'flex';
        else if (ctrl === 'pc') ghostBtn.style.display = 'none';
      }

      // Swipe on canvas as fallback
      const cvs = document.getElementById('game-canvas');
      if (!cvs) return;
      let _swipeStart = null;
      cvs.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
          _swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }, { passive: true });
      cvs.addEventListener('touchend', e => {
        if (!_swipeStart) return;
        const dx = e.changedTouches[0].clientX - _swipeStart.x;
        const dy = e.changedTouches[0].clientY - _swipeStart.y;
        _swipeStart = null;
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
        const key = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'd' : 'a')
          : (dy > 0 ? 's' : 'w');
        pressedKeys[key] = true;
        startMovement(key);
        setTimeout(() => {
          pressedKeys[key] = false;
          stopMovement();
          _nextKey = null;
        }, 160);
      }, { passive: true });
    })();

    // ======================================================================
    // RESET
    // ======================================================================

    function resetGame() {
      clearInterval(_lvTimer);
      document.getElementById('level-victory').classList.remove('visible');
      document.getElementById('victory-overlay').classList.remove('visible');
      document.getElementById('gameover-overlay').classList.remove('visible');
      document.querySelectorAll('.confetti').forEach(el => el.remove());
      level2Unlocked = false;
      level3Unlocked = false;
      level4Unlocked = false;
      level5Unlocked = false;
      gameComplete   = false;
      godMode        = false;
      freezeEnemies  = false;
      superSpeed     = false;
      adminUnlocked  = false;
      closeAdminSidebar();
      document.getElementById('admin-controls').style.display = 'none';
      document.getElementById('adm-shield').classList.remove('active');
      document.getElementById('adm-freeze').classList.remove('active');
      document.getElementById('adm-speed').classList.remove('active');
      checkpointLevel = null;
      initState(0);
      updateHUD();
      updateCheckpointHUD();
      updateLevelSelector();
    }

    function showGameOver() {
      document.getElementById('gameover-overlay').classList.add('visible');
      const resumeBtn = document.getElementById('checkpoint-resume-btn');
      if (checkpointLevel !== null && checkpointLevel > 0) {
        document.getElementById('checkpoint-level-display').textContent = checkpointLevel + 1;
        resumeBtn.style.display = '';
      } else {
        resumeBtn.style.display = 'none';
      }
    }

    document.getElementById('full-reset-btn').addEventListener('click', resetGame);
    document.getElementById('try-again-btn').addEventListener('click', () => {
      document.getElementById('gameover-overlay').classList.remove('visible');
      resetGame();
    });
    document.getElementById('victory-close-btn').addEventListener('click', returnToMenu);

    document.getElementById('checkpoint-resume-btn').addEventListener('click', () => {
      const lvl = checkpointLevel;
      checkpointLevel = null;
      document.getElementById('gameover-overlay').classList.remove('visible');
      if (lvl === 1) LEVELS[1] = generateRandomLevel();
      initState(lvl);
      state.lives = DIFFICULTY[difficulty].lives;
      gamePaused = false;
      updateHUD();
      updateCheckpointHUD();
      updateLevelSelector();
    });

    document.getElementById('checkpoint-btn').addEventListener('click', () => {
      if (!gameStarted || state.won || state.gameOver || currentLevelIndex === 0) return;
      if (candyCount < CHECKPOINT_COST) return;
      spendCandy(CHECKPOINT_COST);
      checkpointLevel = currentLevelIndex;
      updateCheckpointHUD();
      playSound('key');
    });

    // ── Main Menu interactions ──────────────────────────────────────────────
    function startGame() {
      document.getElementById('shop-modal').style.display = 'none';
      gameStarted = true;
      gamePaused  = false;
      document.getElementById('main-menu').classList.add('hidden');
      document.getElementById('menu-btn').classList.add('visible');
      document.getElementById('difficulty-bar').classList.add('game-locked');
      if (menuSelectedLevel === 1) LEVELS[1] = generateRandomLevel();
      initState(menuSelectedLevel);
      updateHUD();
      updateLevelSelector();
    }

    function showMenuModal() {
      gamePaused = true;
      document.getElementById('confirm-modal').classList.add('visible');
    }

    function closeMenuModal() {
      gamePaused = false;
      document.getElementById('confirm-modal').classList.remove('visible');
    }

    function returnToMenu() {
      clearInterval(_lvTimer);
      document.getElementById('level-victory').classList.remove('visible');
      document.getElementById('confirm-modal').classList.remove('visible');
      document.getElementById('gameover-overlay').classList.remove('visible');
      document.getElementById('victory-overlay').classList.remove('visible');
      document.querySelectorAll('.confetti').forEach(el => el.remove());
      level2Unlocked    = false;
      level3Unlocked    = false;
      level4Unlocked    = false;
      level5Unlocked    = false;
      gameStarted       = false;
      gamePaused        = false;
      godMode           = false;
      freezeEnemies     = false;
      superSpeed        = false;
      adminUnlocked     = false;
      menuSelectedLevel = 0;
      document.getElementById('menu-btn').classList.remove('visible');
      document.getElementById('difficulty-bar').classList.remove('game-locked');
      closeAdminSidebar();
      document.getElementById('admin-controls').style.display = 'none';
      document.getElementById('adm-shield').classList.remove('active');
      document.getElementById('adm-freeze').classList.remove('active');
      document.getElementById('adm-speed').classList.remove('active');
      initState(0);
      updateHUD();
      updateLevelSelector();
      updateMainMenuLevels();
      document.getElementById('main-menu').classList.remove('hidden');
    }

    document.getElementById('menu-btn').addEventListener('click', showMenuModal);
    document.getElementById('confirm-yes').addEventListener('click', returnToMenu);
    document.getElementById('confirm-no').addEventListener('click', closeMenuModal);


    // Close shop on backdrop click
    document.getElementById('shop-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('shop-modal')) window.toggleShop(false);
    });

    document.getElementById('menu-level-list').addEventListener('click', e => {
      const li = e.target.closest('.menu-lvl-btn');
      if (!li || li.classList.contains('locked')) return;
      menuSelectedLevel = Number(li.dataset.mlevel);
      updateMainMenuLevels();
    });

    // Menu difficulty buttons share the same data-diff attribute; handled by
    // the existing difficulty-bar listener plus the querySelectorAll in setDifficulty.
    document.getElementById('difficulty-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-diff]');
      if (btn) setDifficulty(btn.dataset.diff);
    });
    document.querySelector('.menu-diff-row').addEventListener('click', e => {
      const btn = e.target.closest('[data-diff]');
      if (btn) setDifficulty(btn.dataset.diff);
    });

    // ── Admin panel ─────────────────────────────────────────────────────────
    function _adminLockRemaining() { return adminLockUntil - Date.now(); }

    function _showAdminLockState() {
      const rem = _adminLockRemaining();
      const el  = document.getElementById('admin-lock-msg');
      const inp = document.getElementById('admin-pw');
      if (rem > 0) {
        const mins = Math.floor(rem / 60000);
        const secs = Math.ceil((rem % 60000) / 1000);
        el.textContent   = mins > 0 ? `🔒 Locked — ${mins}m ${secs}s remaining.` : `🔒 Locked — ${secs}s remaining.`;
        el.style.color   = '#ff6666';
        el.style.display = 'block';
        inp.disabled     = true;
        inp.placeholder  = '🔒 Locked';
      } else {
        el.style.display = 'none';
        inp.disabled     = false;
        inp.placeholder  = 'Enter code';
      }
    }

    let _lockInterval = null;
    function _startLockCountdown() {
      clearInterval(_lockInterval);
      _showAdminLockState();
      _lockInterval = setInterval(() => {
        _showAdminLockState();
        if (_adminLockRemaining() <= 0) { clearInterval(_lockInterval); _lockInterval = null; }
      }, 1000);
    }

    document.getElementById('admin-pw').addEventListener('input', (e) => {
      if (_adminLockRemaining() > 0) {
        playSound('adminFail');
        e.target.value = '';
        _showAdminLockState();
        return;
      }
      if (e.target.value.length < adminPassword.length) return;

      if (e.target.value === adminPassword) {
        playSound('adminSuccess');
        adminAttempts = 0;
        localStorage.setItem('kq_adm_attempts', '0');
        adminUnlocked = true;
        e.target.value = '';
        document.getElementById('admin-lock-msg').style.display = 'none';
        document.getElementById('admin-pw-box').style.display = 'none';
        document.getElementById('admin-controls').style.display = 'flex';
        refreshPostGameSection();
        gamePaused = false;
      } else {
        playSound('adminFail');
        e.target.value = '';
        adminAttempts++;
        localStorage.setItem('kq_adm_attempts', String(adminAttempts));
        const el = document.getElementById('admin-lock-msg');
        if (adminAttempts >= 10) {
          // Hard lock after 10 attempts
          adminLockUntil = Date.now() + 60 * 60 * 1000;
          adminAttempts  = 0;
          localStorage.setItem('kq_adm_lock',     String(adminLockUntil));
          localStorage.setItem('kq_adm_attempts', '0');
          _startLockCountdown();
        } else if (adminAttempts >= 5) {
          // Warning zone: 5–9 attempts
          const left = 10 - adminAttempts;
          el.textContent   = `⚠️ Warning! ${left} attempt${left === 1 ? '' : 's'} left before 1-hour lock.`;
          el.style.color   = '#ffaa33';
          el.style.display = 'block';
          playSound('warning');
        } else {
          const left = 10 - adminAttempts;
          el.textContent   = `Wrong code. ${left} attempts left.`;
          el.style.color   = '#ff6666';
          el.style.display = 'block';
        }
      }
    });

    // Refresh lock state each time sidebar opens
    const _origOpen = openAdminSidebar;
    openAdminSidebar = function() {
      _origOpen();
      if (_adminLockRemaining() > 0) _startLockCountdown();
      else _showAdminLockState();
    };

    document.getElementById('admin-sidebar-close').addEventListener('click', closeAdminSidebar);
    document.getElementById('admin-toggle').addEventListener('click', toggleAdminPanel);

    document.getElementById('adm-logout').addEventListener('click', () => {
      localStorage.removeItem('kq_admin_session');
      adminUnlocked = false;
      closeAdminSidebar();
      showToast('🚪 Logged out of Admin', '#ff8888');
    });
    document.getElementById('superadmin-sidebar-close').addEventListener('click', closeSuperadminSidebar);
    document.getElementById('adm-exit-super-session').addEventListener('click', exitSuperSession);

    document.getElementById('adm-shield').addEventListener('click', () => {
      godMode = !godMode;
      document.getElementById('adm-shield').classList.toggle('active', godMode);
    });

    document.getElementById('adm-freeze').addEventListener('click', () => {
      freezeEnemies = !freezeEnemies;
      document.getElementById('adm-freeze').classList.toggle('active', freezeEnemies);
    });

    document.getElementById('adm-speed').addEventListener('click', () => {
      superSpeed = !superSpeed;
      document.getElementById('adm-speed').classList.toggle('active', superSpeed);
    });

    document.getElementById('adm-keys').addEventListener('click', () => {
      launchKeyStorm();
    });

    document.getElementById('adm-skip').addEventListener('click', () => {
      if (!gameStarted) return;
      const nextIdx = currentLevelIndex + 1;
      const isLast  = nextIdx >= LEVELS.length;
      if (!isLast) {
        if (nextIdx === 1) level2Unlocked = true;
        if (nextIdx === 2) level3Unlocked = true;
        if (nextIdx === 3) level4Unlocked = true;
        const lives = state.lives;
        if (nextIdx === 1) LEVELS[1] = generateRandomLevel();
        initState(nextIdx); state.lives = lives;
        updateHUD(); updateLevelSelector(); updateMainMenuLevels();
      } else {
        gameComplete = level2Unlocked = level3Unlocked = level4Unlocked = level5Unlocked = true;
        updateLevelSelector(); updateMainMenuLevels();
        spawnConfetti();
        showLevelVictory(null);
      }
    });

    // ── Post-game / authenticated features ─────────────────────────────────

    // Secret Level — compact 11×11 gauntlet with 5 keys and 4 enemies
    const SECRET_LEVEL = {
      totalKeys: 5,
      enemies: [
        { row: 1, col: 5, dir: [0,  1], type: 'hunter'    },
        { row: 5, col: 1, dir: [1,  0], type: 'patroller' },
        { row: 5, col: 9, dir: [-1, 0], type: 'patroller' },
        { row: 9, col: 5, dir: [0, -1], type: 'erratic'   },
      ],
      map: [
        [0,0,0,0,0,0,0,0,0,0,0],
        [0,2,1,3,0,1,0,3,1,1,0],
        [0,1,0,1,1,1,1,1,0,5,0],
        [0,1,5,0,0,1,0,0,0,1,0],
        [0,1,1,1,1,1,1,1,1,1,0],
        [0,3,0,0,1,0,1,0,0,3,0],
        [0,1,1,1,1,1,1,1,1,1,0],
        [0,1,0,0,0,1,0,0,5,1,0],
        [0,5,1,1,1,1,1,1,0,1,0],
        [0,1,0,3,0,1,0,1,1,1,0],
        [0,0,0,0,0,4,0,0,0,0,0],
      ],
    };
    let secretLevelUnlocked = false;

    document.getElementById('adm-secret').addEventListener('click', () => {
      if (!gameStarted || (!gameComplete && !adminUnlocked)) return;
      if (!secretLevelUnlocked) {
        LEVELS.push(SECRET_LEVEL);
        secretLevelUnlocked = true;
        // Add a tab for the secret level
        const ul = document.getElementById('level-select');
        const li = document.createElement('li');
        li.id = 'sel-secret';
        li.dataset.level = LEVELS.length - 1;
        li.textContent = '★ Secret';
        ul.appendChild(li);
        updateLevelSelector();
        updateMainMenuLevels();
      }
      const lives = state.lives;
      initState(LEVELS.length - 1);
      state.lives = lives;
      gamePaused = false;
      updateHUD(); updateLevelSelector();
      closeAdminSidebar();
    });

    // Character skins — each is a { body: [stop0, stop1], outline, shadow } descriptor
    const SKINS = [
      { name: 'Cyan',    body: ['#90e8ff', '#007acc'], outline: '#005588', shadow: '#00ccff' },
      { name: 'Crimson', body: ['#ff9999', '#aa0022'], outline: '#660011', shadow: '#ff4466' },
      { name: 'Gold',    body: ['#ffe066', '#b8860b'], outline: '#7a5800', shadow: '#ffd700' },
      { name: 'Emerald', body: ['#99ffbb', '#117733'], outline: '#0a5520', shadow: '#33dd88' },
      { name: 'Violet',  body: ['#e0b4fe', '#6d28d9'], outline: '#4b1fa0', shadow: '#cc88ff' },
    ];
    let currentSkin = 0;

    document.getElementById('adm-skin').addEventListener('click', () => {
      currentSkin = (currentSkin + 1) % SKINS.length;
      const btn = document.getElementById('adm-skin');
      btn.textContent = `🎨 Skin: ${SKINS[currentSkin].name}`;
    });

    // Override drawPlayer body colours with the active skin each frame
    // by patching the gradient stop values read from SKINS[currentSkin].
    // We do this by making drawPlayer reference a global `activeSkin` variable.
    // (activeSkin is read inside drawPlayer via the closure — see render section)

    document.getElementById('adm-unlock-all').addEventListener('click', () => {
      level2Unlocked = true;
      level3Unlocked = true;
      level4Unlocked = true;
      level5Unlocked = true;
      updateLevelSelector();
      updateMainMenuLevels();
      playSound('adminSuccess');
      closeAdminSidebar();
    });

    document.getElementById('level-select').addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li || li.classList.contains('locked') || li.classList.contains('active')) return;
      const idx = Number(li.dataset.level);
      if (isNaN(idx)) return;
      const lives = state.lives;
      currentLevelIndex = idx;
      initState(idx);
      state.lives = lives;
      gamePaused = false;
      updateHUD();
      updateLevelSelector();
    });

    document.getElementById('adm-reset').addEventListener('click', () => {
      if (!gameStarted || (!gameComplete && !adminUnlocked)) return;
      const lives = state.lives;
      initState(currentLevelIndex);
      state.lives = lives;
      state.keysCollected = 0;
      state.doorUnlocked  = false;
      // Re-place keys from the level definition
      const def = LEVELS[currentLevelIndex];
      state.map = def.map.map(row => [...row]);
      godMode = freezeEnemies = superSpeed = false;
      document.getElementById('adm-shield').classList.remove('active');
      document.getElementById('adm-freeze').classList.remove('active');
      document.getElementById('adm-speed').classList.remove('active');
      updateHUD();
    });

    document.getElementById('adm-open-super').addEventListener('click', () => {
      closeAdminSidebar();
      openSuperadminSidebar();
    });

    // ── Admin Accessories ───────────────────────────────────────────────────
    document.getElementById('adm-mask').addEventListener('click', () => {
      adminMask = !adminMask;
      document.getElementById('adm-mask').classList.toggle('active', adminMask);
    });
    document.getElementById('adm-cape').addEventListener('click', () => {
      adminCape = !adminCape;
      document.getElementById('adm-cape').classList.toggle('active', adminCape);
    });
    document.getElementById('adm-aura').addEventListener('click', () => {
      adminAura = !adminAura;
      document.getElementById('adm-aura').classList.toggle('active', adminAura);
    });

    // ── Superadmin login ─────────────────────────────────────────────────────
    function _superToast(msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      Object.assign(t.style, {
        position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%)',
        background:'linear-gradient(135deg,rgba(80,0,180,0.92),rgba(120,0,255,0.85))',
        color:'#e8ccff', border:'1px solid rgba(200,100,255,0.6)',
        borderRadius:'10px', padding:'9px 22px',
        fontSize:'0.80rem', fontWeight:'700', letterSpacing:'0.06em',
        boxShadow:'0 0 20px rgba(157,0,255,0.45)', zIndex:'99999',
        pointerEvents:'none', transition:'opacity 0.4s',
      });
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, 1800);
    }

    document.getElementById('adm-super-pw').addEventListener('input', (e) => {
      if (e.target.value.length < superadminCode.length) return;
      if (e.target.value === superadminCode) {
        playSound('adminSuccess');
        superadminUnlocked = true;
        localStorage.setItem(KQ_SA_SES, '1');
        e.target.value = '';
        document.getElementById('adm-super-login').style.display    = 'none';
        document.getElementById('adm-super-controls').style.display = 'flex';
      } else {
        playSound('adminFail');
        e.target.value = '';
        const msg = document.getElementById('adm-super-msg');
        msg.textContent = 'Wrong superadmin code.';
        msg.style.color = '#ff6666';
        setTimeout(() => { msg.textContent = ''; }, 1500);
      }
    });

    // Change admin password (with confirm)
    document.getElementById('adm-save-pw').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      const v1  = document.getElementById('adm-new-pw').value.trim();
      const v2  = document.getElementById('adm-new-pw2').value.trim();
      const msg = document.getElementById('adm-pw-msg');
      if (!v1 || !v2) {
        playSound('adminFail');
        msg.textContent = 'Fill in both fields.'; msg.style.color = '#ff6666';
        setTimeout(() => { msg.textContent = ''; }, 1600);
        return;
      }
      if (v1 !== v2) {
        playSound('adminFail');
        msg.textContent = '⚠️ Passwords do not match!'; msg.style.color = '#ffaa33';
        setTimeout(() => { msg.textContent = ''; }, 1800);
        return;
      }
      adminPassword = v1;

      localStorage.setItem('kq_adm_pw', v1);
      document.getElementById('adm-new-pw').value  = '';
      document.getElementById('adm-new-pw2').value = '';
      msg.textContent = '';
      playSound('adminSuccess');
      _superToast('✔ Admin password updated!');
    });

    // Changeeeeeeegot superadmin code (with confirm)
    document.getElementById('adm-save-super-pw').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      const v1  = document.getElementById('adm-new-super1').value.trim();
      const v2  = document.getElementById('adm-new-super2').value.trim();
      const msg = document.getElementById('adm-super-code-msg');
      if (!v1 || !v2) {
        playSound('adminFail');
        msg.textContent = 'Fill in both fields.'; msg.style.color = '#ff6666';
        setTimeout(() => { msg.textContent = ''; }, 1600);
        return;
      }
      if (v1 !== v2) {
        playSound('adminFail');
        msg.textContent = '⚠️ Codes do not match!'; msg.style.color = '#ffaa33';
        setTimeout(() => { msg.textContent = ''; }, 1800);
        return;
        
      }
      superadminCode = v1;
      localStorage.setItem('kq_super_pw', v1);
      document.getElementById('adm-new-super1').value = '';
      document.getElementById('adm-new-super2').value = '';
      msg.textContent = '';
      playSound('adminSuccess');
      _superToast('✔ Superadmin code updated!');
    });

    // Security status helpers
    let _secInterval = null;
    function _updateSecStatus() {
      const attEl  = document.getElementById('adm-sec-attempts');
      const lockEl = document.getElementById('adm-sec-locktime');
      const hsEl  = document.getElementById('adm-hs-display');
      const hsEl2 = document.getElementById('adm-hs-display2');
      if (!attEl) return;
      attEl.textContent = adminAttempts;
      if (hsEl)  hsEl.textContent  = highscore;
      if (hsEl2) hsEl2.textContent = highscore;
      const rem = adminLockUntil - Date.now();
      if (rem > 0) {
        const m = Math.floor(rem / 60000), s = Math.ceil((rem % 60000) / 1000);
        lockEl.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
        lockEl.classList.add('sec-locked');
      } else {
        lockEl.textContent = '—';
        lockEl.classList.remove('sec-locked');
      }
    }
    function _startSecTicker() {
      clearInterval(_secInterval);
      _updateSecStatus();
      _secInterval = setInterval(_updateSecStatus, 1000);
    }
    function _stopSecTicker() { clearInterval(_secInterval); _secInterval = null; }

    // Hook into superadmin open/close to tick the counter
    const _origOpenSuper = openSuperadminSidebar;
    openSuperadminSidebar = function() { _origOpenSuper(); _startSecTicker(); };
    const _origCloseSuper = closeSuperadminSidebar;
    closeSuperadminSidebar = function() { _origCloseSuper(); _stopSecTicker(); };

    // Reset brute-force lock
    document.getElementById('adm-reset-lock').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      adminAttempts  = 0;
      adminLockUntil = 0;
      localStorage.setItem('kq_adm_attempts', '0');
      localStorage.removeItem('kq_adm_lock');
      // Re-enable the admin password input if it was locked
      const inp = document.getElementById('admin-pw');
      const msg = document.getElementById('admin-lock-msg');
      if (inp) { inp.disabled = false; inp.placeholder = 'Enter code'; }
      if (msg) { msg.style.display = 'none'; }
      if (_lockInterval) { clearInterval(_lockInterval); _lockInterval = null; }
      _updateSecStatus();
      playSound('adminSuccess');
      _superToast('🔓 Brute-force lock cleared!');
    });

    // Highscore editor
    document.getElementById('adm-hs-save').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      const val = parseInt(document.getElementById('adm-hs-input').value, 10);
      if (isNaN(val) || val < 0) {
        playSound('adminFail');
        return;
      }
      highscore = val;
      localStorage.setItem('kq_highscore', val);
      document.getElementById('adm-hs-input').value = '';
      _updateSecStatus();
      playSound('adminSuccess');
      _superToast('🏆 Highscore updated!');
    });

    // Wipe player data (preserve passwords)
    document.getElementById('adm-wipe-data').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      if (!confirm('Wipe all player data? Passwords will be kept. Page will reload.')) return;
      const keep = {
        kq_adm_pw:   localStorage.getItem('kq_adm_pw'),
        kq_super_pw: localStorage.getItem('kq_super_pw'),
      };
      localStorage.clear();
      if (keep.kq_adm_pw)   localStorage.setItem('kq_adm_pw',   keep.kq_adm_pw);
      if (keep.kq_super_pw) localStorage.setItem('kq_super_pw', keep.kq_super_pw);
      location.reload();
    });

    // 200 Candies
    document.getElementById('adm-give-candy').addEventListener('click', () => {
      if (!superadminUnlocked) return;
      addCandy(200);
      playSound('adminSuccess');
      _superToast('🍬 +200 Candies added!');
    });


    // ── Secret word "ooo" → open superadmin ─────────────────────────────────
    (function() {
      const SECRET = 'ooo';
      let buf = '';
      let timer = null;
      document.addEventListener('keydown', (e) => {
        // Ignore when user is typing in any input / textarea
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        buf += e.key.toLowerCase();
        // Keep only last N chars (length of secret word)
        if (buf.length > SECRET.length) buf = buf.slice(-SECRET.length);

        clearTimeout(timer);
        timer = setTimeout(() => { buf = ''; }, 1800);

        if (buf === SECRET) {
          buf = '';
          clearTimeout(timer);
          const sidebar = document.getElementById('superadmin-sidebar');
          if (sidebar.classList.contains('open')) closeSuperadminSidebar();
          else openSuperadminSidebar();
        }
      });
    })();

    // ── Shop open/close — single authoritative definition ───────────────────
    window.toggleShop = function(show) {
      const modal = document.getElementById('shop-modal');
      if (!modal) return;
      if (show) {
        // Rebuild items list
        const list    = document.getElementById('shop-items-list');
        const balance = document.getElementById('shop-balance');
        if (balance) balance.textContent = '🍬 ' + candyCount + ' candies';
        if (list) {
          list.innerHTML = '';
          SHOP_ITEMS.forEach(function(item) {
            const owned    = ownedItems.has(item.id);
            const equipped = equippedItems.has(item.id);
            const canBuy   = !owned && candyCount >= item.price;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:11px 14px;';
            const label = owned
              ? '<span style="font-size:0.74rem;color:#88cc88;">✔ Owned</span>'
              : '<span style="font-size:0.74rem;color:#ffcc66;">🍬 ' + item.price + '</span>';
            let btnStyle = 'padding:6px 14px;border-radius:9px;font-size:0.76rem;font-weight:800;cursor:pointer;border:1px solid;';
            let btnText, btnAction;
            if (!owned) {
              btnStyle += canBuy
                ? 'background:rgba(255,215,0,0.15);border-color:rgba(255,215,0,0.5);color:#ffd740;'
                : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1);color:#666;cursor:not-allowed;';
              btnText = 'Buy'; btnAction = canBuy ? 'buy' : '';
            } else if (equipped) {
              btnStyle += 'background:rgba(255,80,80,0.12);border-color:rgba(255,80,80,0.4);color:#ff8888;';
              btnText = 'Unequip'; btnAction = 'unequip';
            } else {
              btnStyle += 'background:rgba(80,200,120,0.14);border-color:rgba(80,200,120,0.4);color:#66ee99;';
              btnText = 'Equip'; btnAction = 'equip';
            }
            row.innerHTML = '<span style="font-size:1.6rem;">' + item.icon + '</span>'
              + '<div style="flex:1;text-align:left;"><div style="font-size:0.9rem;font-weight:800;color:#d8c8f0;">' + item.name + '</div>' + label + '</div>'
              + '<button style="' + btnStyle + '" data-id="' + item.id + '" data-action="' + btnAction + '"' + (!btnAction ? ' disabled' : '') + '>' + btnText + '</button>';
            list.appendChild(row);
          });
          list.querySelectorAll('button[data-action]').forEach(function(btn) {
            btn.addEventListener('click', function() {
              playSound('click');
              const id = btn.dataset.id, action = btn.dataset.action;
              if (action === 'buy') {
                const item = SHOP_ITEMS.find(function(i){ return i.id === id; });
                if (item && candyCount >= item.price) {
                  candyCount -= item.price; saveCandy(); updateCandyHUD();
                  ownedItems.add(id); equippedItems.add(id); saveShop();
                  playSound('buy');
                }
              } else if (action === 'equip')   { equippedItems.add(id);    saveShop(); }
              else if (action === 'unequip')    { equippedItems.delete(id); saveShop(); }
              window.toggleShop(true); // re-render
            });
          });
        }
        document.getElementById('main-menu').classList.add('hidden');
        modal.style.display = 'flex';
      } else {
        modal.style.display = 'none';
        document.getElementById('main-menu').classList.remove('hidden');
      }
    };
    window.startGame = startGame;

    // Wire buttons
    (function() {
      const playBtn = document.getElementById('playBtn');
      if (playBtn) playBtn.onclick = function(e) { e.stopPropagation(); playSound('click'); startGame(); };
      const shopBtn = document.getElementById('shopBtn');
      if (shopBtn) shopBtn.onclick = function(e) { e.stopPropagation(); playSound('click'); window.toggleShop(true); };
      const closeBtn = document.getElementById('shopClose');
      if (closeBtn) closeBtn.onclick = function(e) { e.stopPropagation(); playSound('click'); window.toggleShop(false); };
      const modal = document.getElementById('shop-modal');
      if (modal) {
        modal.style.cssText += ';align-items:center;justify-content:center;';
        modal.addEventListener('click', function(e) {
          if (e.target === modal) window.toggleShop(false);
        });
      }
    })();

    // ── Kick everything off ─────────────────────────────────────────────────
    initState(0);
    updateHUD();
    updateCandyHUD();
    updateLevelSelector();
    updateMainMenuLevels();
    requestAnimationFrame(tick);
  