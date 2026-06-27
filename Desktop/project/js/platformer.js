
'use strict';

// ═══════════════════════════════════════════════
// PHYSICS CONSTANTS
// ═══════════════════════════════════════════════
const GRAVITY    = 2600;
const MAX_FALL   = 1200;
const MOVE_SPD   = 300;
const SPRINT_SPD = 480;
const JUMP_VEL   = -840;
const JUMP_CUT   = 0.38;
const COYOTE_T   = 0.11;
const JUMP_BUF   = 0.14;
const MAX_JUMPS  = 2;
const ACCEL_G    = 3400;
const ACCEL_A    = 1600;
const DECEL_G    = 4200;
const DECEL_A    = 480;
// ── extras (points 37-39, 41)
const WALL_SLIDE = 155;   // max fall speed while wall-sliding
const WALL_JX    = 310;   // horizontal kick from wall jump
const DASH_SPD   = 560;   // dash speed px/s
const DASH_DUR   = 0.17;  // dash duration seconds
const DASH_CD    = 0.85;  // dash cooldown seconds

// ═══════════════════════════════════════════════
// DRAWING CONSTANTS  (points 23-32)
// ═══════════════════════════════════════════════
const DRAW_COLORS = ['#c080ff','#00ffcc','#ff9040','#ffd700','#ff4488'];
const INK_MAX     = 3000;   // total pixel-length available per life
const DRAW_LIFE   = 15;     // seconds before platform disappears (point 31)
const DRAW_MAX    = 5;      // max simultaneous drawn platforms (point 32)
const DRAW_MIN    = 30;     // minimum length to register (point 24)

// ═══════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════
class Input {
  constructor(){
    this._h={}; this._p={}; this._v={}; this._vp={};
    window.addEventListener('keydown',e=>{
      if(!this._h[e.code]) this._p[e.code]=true;
      this._h[e.code]=true;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup',e=>{ this._h[e.code]=false; });
  }
  // 90 — virtual key injection from d-pad
  vdown(c){ if(!this._v[c]) this._vp[c]=true; this._v[c]=true; }
  vup(c)  { this._v[c]=false; }
  held(c)   { return !!this._h[c]||!!this._v[c]; }
  pressed(c){ return !!this._p[c]||!!this._vp[c]; }
  flush()   { this._p={}; this._vp={}; }
  get left()        { return this.held('ArrowLeft') ||this.held('KeyA'); }
  get right()       { return this.held('ArrowRight')||this.held('KeyD'); }
  get sprint()      { return this.held('ShiftLeft') ||this.held('ShiftRight'); }
  get jumpHeld()    { return this.held('ArrowUp')||this.held('KeyW')||this.held('Space'); }
  get jumpPressed() { return this.pressed('ArrowUp')||this.pressed('KeyW')||this.pressed('Space'); }
  get down()        { return this.held('ArrowDown')||this.held('KeyS'); }
  get dashPressed() { return this.pressed('ControlLeft')||this.pressed('ControlRight')||this.pressed('KeyX'); }
}

// ═══════════════════════════════════════════════
// CAMERA — player at 65% from top (point 13)
// ═══════════════════════════════════════════════
class Camera {
  constructor(){
    this.x=0; this.y=0; this.vw=800; this.vh=600;
    this.lvW=1000; this.lvH=5800; this._ld=0;
    // 75 — screen shake
    this._shAmp=0; this._shDur=0; this._shT=0; this._shX=0; this._shY=0;
  }
  // 75 — trigger shake; higher amp overwrites lower
  shake(amp,dur){
    if(amp>=this._shAmp){ this._shAmp=amp; this._shDur=dur; this._shT=0; }
  }
  updateShake(dt){
    if(this._shAmp<=0) return;
    this._shT=Math.min(this._shDur,this._shT+dt);
    const pct=1-this._shT/this._shDur;
    this._shX=(Math.random()-.5)*2*this._shAmp*pct;
    this._shY=(Math.random()-.5)*2*this._shAmp*pct;
    if(pct<=0){ this._shAmp=0; this._shX=0; this._shY=0; }
  }
  follow(px,py,pvx,pvy,dt){
    const ld=pvx>30?1:pvx<-30?-1:this._ld;
    this._ld+=(ld-this._ld)*6*dt;
    const tx=px-this.vw*0.5+this._ld*80;
    const vLook=Math.max(-80,Math.min(40,pvy*0.06));
    const ty=py-this.vh*0.65+vLook;   // 65% from top — 81: smooth easing already here
    this.x+=(tx-this.x)*7*dt;
    this.y+=(ty-this.y)*5.5*dt;
    // center horizontally when level is narrower than viewport
    if(this.lvW<=this.vw) this.x=(this.lvW-this.vw)/2;
    else this.x=Math.max(0,Math.min(this.lvW-this.vw,this.x));
    this.y=Math.max(0,Math.min(this.lvH-this.vh,this.y));
  }
  scr(wx,wy){ return {x:wx-this.x+this._shX, y:wy-this.y+this._shY}; }
  toWorld(sx,sy){ return {x:sx+this.x, y:sy+this.y}; }
  inView(wx,wy,ww,wh){
    return wx+ww>this.x&&wx<this.x+this.vw&&wy+wh>this.y&&wy<this.y+this.vh;
  }
}

// ═══════════════════════════════════════════════
// PARTICLE
// ═══════════════════════════════════════════════
class Particle {
  constructor(x,y,vx,vy,col,life,r){
    this.x=x;this.y=y;this.vx=vx;this.vy=vy;
    this.col=col;this.life=this.maxLife=life;this.r=r;
  }
  update(dt){ this.x+=this.vx*dt;this.y+=this.vy*dt;this.vy+=700*dt;this.vx*=1-5*dt;this.life-=dt; }
  get alive(){ return this.life>0; }
  draw(ctx,cam){
    const s=cam.scr(this.x,this.y);
    const a=Math.max(0,this.life/this.maxLife);
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle=this.col;
    ctx.shadowColor=this.col;ctx.shadowBlur=this.r*3;
    ctx.beginPath();ctx.arc(s.x,s.y,this.r*a+.5,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// PLATFORM (pre-built)
// ═══════════════════════════════════════════════
class Platform {
  constructor(x,y,w,h,opts={}){
    this.x=x;this.y=y;this.w=w;this.h=h;
    this.type    =opts.type    ||'solid';
    this.color   =opts.color   ||'#6030c8';
    this.glowCol =opts.glowCol ||'#9060ff';
    this.moveAxis=opts.moveAxis||'x';
    this.moveDist=opts.moveDist||0;
    this.moveSpd =opts.moveSpd ||60;
    this._sx=x;this._sy=y;
    this._t=Math.random()*Math.PI*2;
    this._px=x;this._py=y;
    this.dX=0;this.dY=0;
    this.crTimer=0;this.crumbled=false;this.crAlpha=1;
    // new types
    this.conveyorDir=opts.conveyorDir||1;
    this.conveyorSpd=opts.conveyorSpd||90;
    this._disappearT=opts.disappearOff||(Math.random()*3);
    this._origW=w; this._touched=false;
  }
  get right (){ return this.x+this.w; }
  get bottom(){ return this.y+this.h; }

  update(dt){
    this._px=this.x;this._py=this.y;
    if(this.type==='moving'){
      this._t+=this.moveSpd*(Math.PI/180)*dt;
      if(this.moveAxis==='x') this.x=this._sx+Math.sin(this._t)*this.moveDist;
      else                     this.y=this._sy+Math.sin(this._t)*this.moveDist;
    }
    if(this.type==='crumble'&&this.crTimer>0){
      this.crTimer-=dt;
      if(this.crTimer<=0) this.crumbled=true;
    }
    if(this.type==='crumble'&&this.crumbled){
      this.crAlpha-=dt*1.8;
      if(this.crAlpha<=0){ this.crumbled=false;this.crAlpha=1;this.crTimer=0; }
    }
    // disappear: 2s on, 1s off cycle (point 48)
    if(this.type==='disappear'){
      this._disappearT+=dt;
      const ph=this._disappearT%3;
      this.crumbled=ph>=2;
      this.crAlpha=ph<1.6?1:Math.max(0,1-(ph-1.6)/0.4);
    }
    // shrink: narrow over time after first touch (point 49)
    if(this.type==='shrink'&&this._touched&&this.w>24){
      this.w=Math.max(24,this.w-30*dt);
      this.x=this._sx+(this._origW-this.w)/2;
    }
    this.dX=this.x-this._px;this.dY=this.y-this._py;
  }

  draw(ctx,cam){
    if(!cam.inView(this.x,this.y,this.w,this.h)||this.crumbled) return;
    const s=cam.scr(this.x,this.y);
    ctx.save();ctx.globalAlpha=this.crAlpha;
    ctx.shadowColor=this.glowCol;ctx.shadowBlur=14;
    const g=ctx.createLinearGradient(s.x,s.y,s.x,s.y+this.h);
    g.addColorStop(0,this.color);g.addColorStop(1,'rgba(10,3,28,.96)');
    ctx.fillStyle=g;ctx.fillRect(s.x,s.y,this.w,this.h);
    ctx.shadowBlur=0;

    // top edge highlight
    const edgeCol=this.type==='passthrough'?'rgba(160,110,255,.45)':
                  this.type==='ice'?'rgba(160,235,255,.75)':
                  this.type==='bounce'?'rgba(255,230,40,.8)':
                  this.type==='conveyor'?'rgba(255,160,40,.7)':
                  this.type==='disappear'?'rgba(200,100,255,.55)':
                  this.type==='shrink'?'rgba(255,120,200,.65)':'rgba(200,155,255,.65)';
    ctx.fillStyle=edgeCol;ctx.fillRect(s.x,s.y,this.w,3);

    // crumble cracks
    if(this.type==='crumble'&&this.crTimer>0&&this.crTimer<0.65){
      const cr=1-this.crTimer/.65;
      ctx.strokeStyle=`rgba(255,55,55,${cr*.8})`;ctx.lineWidth=1.5;
      for(let i=0;i<3;i++){
        const cx=s.x+this.w*(0.2+i*0.3);
        ctx.beginPath();ctx.moveTo(cx,s.y+2);ctx.lineTo(cx+(Math.random()-.5)*8,s.y+this.h);ctx.stroke();
      }
    }

    // bounce: spring chevrons (point 44)
    if(this.type==='bounce'){
      ctx.strokeStyle='rgba(255,240,60,.75)';ctx.lineWidth=1.6;
      const n=Math.max(2,Math.floor(this.w/20));
      for(let i=0;i<n;i++){
        const bx=s.x+this.w*(i+.5)/n;
        ctx.beginPath();ctx.moveTo(bx-4,s.y+this.h-3);ctx.lineTo(bx,s.y+4);ctx.lineTo(bx+4,s.y+this.h-3);ctx.stroke();
      }
    }

    // ice: diagonal crystal lines (point 45)
    if(this.type==='ice'){
      ctx.strokeStyle='rgba(200,245,255,.5)';ctx.lineWidth=1;
      for(let ix=s.x+6;ix<s.x+this.w-2;ix+=16){
        ctx.beginPath();ctx.moveTo(ix,s.y+2);ctx.lineTo(ix+6,s.y+this.h-2);ctx.stroke();
      }
    }

    // conveyor: directional arrows (point 47)
    if(this.type==='conveyor'){
      ctx.fillStyle=this.conveyorDir>0?'rgba(255,170,50,.85)':'rgba(80,200,255,.85)';
      ctx.font=`bold ${Math.floor(this.h-4)}px monospace`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      const midY=s.y+this.h/2;
      const sym=this.conveyorDir>0?'›':'‹';
      const sp=22;
      for(let ax=s.x+14;ax<s.x+this.w-6;ax+=sp) ctx.fillText(sym,ax,midY+1);
    }

    // disappear: dot-dashes on top when near-invisible
    if(this.type==='disappear'&&this.crAlpha<0.5){
      ctx.save();ctx.globalAlpha=this.crAlpha*.7;
      ctx.setLineDash([4,6]);ctx.strokeStyle='rgba(200,100,255,.6)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(s.x,s.y+1);ctx.lineTo(s.x+this.w,s.y+1);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();
    }

    // shrink: show original width outline while shrinking (point 49)
    if(this.type==='shrink'&&this._touched&&this.w<this._origW-4){
      ctx.globalAlpha=0.18;ctx.strokeStyle='rgba(255,120,200,.5)';ctx.lineWidth=1;ctx.setLineDash([3,5]);
      const ox=cam.scr(this._sx,this.y);
      ctx.strokeRect(ox.x,s.y,this._origW,this.h);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// DRAWN PLATFORM  — points 23-32
// ═══════════════════════════════════════════════
class DrawnPlatform {
  constructor(wx1,wy1,wx2,wy2,color){
    // Horizontal platform: y = midpoint of draw, x = left to right
    const thick=13;
    this.x    = Math.min(wx1,wx2);
    this.y    = (wy1+wy2)/2 - thick/2;
    this.w    = Math.abs(wx2-wx1);
    this.h    = thick;
    this.color= color;
    this.type = 'passthrough'; // land on top only
    this.timer= DRAW_LIFE;     // point 31
    this.length= Math.hypot(wx2-wx1, wy2-wy1); // ink cost
    this.alpha = 1;
    this._blink= 0;
    // compat with Platform interface
    this.crumbled=false; this.dX=0; this.dY=0;
    this.crTimer=0; this.crAlpha=1;
    this.moveDist=0;
  }
  get right (){ return this.x+this.w; }
  get bottom(){ return this.y+this.h; }

  update(dt){
    this.timer-=dt;
    this._blink+=dt;
    // blink when < 3s remain
    if(this.timer<3){
      this.alpha=0.4+0.55*Math.abs(Math.sin(this._blink*5));
    }
    return this.timer>0;
  }

  draw(ctx,cam){
    if(!cam.inView(this.x,this.y,this.w,this.h)) return;
    const s=cam.scr(this.x,this.y);
    ctx.save();
    ctx.globalAlpha=this.alpha*0.82;
    ctx.shadowColor=this.color; ctx.shadowBlur=10;
    ctx.fillStyle=this.color;
    ctx.globalAlpha*=0.7;
    ctx.fillRect(s.x,s.y,this.w,this.h);
    // top highlight
    ctx.globalAlpha=this.alpha*0.9;
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,.45)';
    ctx.fillRect(s.x,s.y,this.w,3);
    // timer bar — shrinks as time runs out
    const barW=this.w*(this.timer/DRAW_LIFE);
    ctx.fillStyle=this.color;
    ctx.globalAlpha=this.alpha*0.55;
    ctx.fillRect(s.x,s.y-4,barW,2);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// COIN / GEM
// ═══════════════════════════════════════════════
class Coin {
  constructor(x,y,type='coin'){
    this.wx=x;this.wy=y;this.type=type;
    this.r=type==='gem'?10:type==='secret'?12:7;
    this.collected=false;
    this._ph=Math.random()*Math.PI*2;
    this.value=type==='gem'?50:type==='secret'?200:10;
    this.secret=type==='secret';
  }
  wy_anim(t){ return this.wy+Math.sin(t*2.2+this._ph)*5; }

  draw(ctx,cam,t){
    if(this.collected) return;
    const wy=this.wy_anim(t);
    if(!cam.inView(this.wx-this.r,wy-this.r,this.r*2,this.r*2)) return;
    const s=cam.scr(this.wx,wy);
    const pulse=(Math.sin(t*3+this._ph)+1)/2;
    ctx.save();
    if(this.type==='secret'){
      // rotating 5-point star (point 56)
      const spin=t*1.4+this._ph;
      ctx.shadowColor='#ffffff'; ctx.shadowBlur=22+pulse*14;
      ctx.fillStyle=`hsl(${270+pulse*60},100%,78%)`;
      ctx.beginPath();
      for(let i=0;i<10;i++){
        const a=spin+i*Math.PI/5;
        const r=i%2===0?this.r:this.r*.42;
        i===0?ctx.moveTo(s.x+Math.cos(a)*r,s.y+Math.sin(a)*r)
             :ctx.lineTo(s.x+Math.cos(a)*r,s.y+Math.sin(a)*r);
      }
      ctx.closePath();ctx.fill();
      // sparkle ring
      ctx.globalAlpha=.35+pulse*.25;
      ctx.strokeStyle='#e0c0ff';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(s.x,s.y,this.r+4+pulse*3,0,Math.PI*2);ctx.stroke();
    } else if(this.type==='gem'){
      ctx.shadowColor='#00ffcc';ctx.shadowBlur=14+pulse*8;
      ctx.fillStyle=`hsl(${160+pulse*20},100%,62%)`;
      ctx.beginPath();
      ctx.moveTo(s.x,s.y-this.r);ctx.lineTo(s.x+this.r*.7,s.y);
      ctx.lineTo(s.x,s.y+this.r*.6);ctx.lineTo(s.x-this.r*.7,s.y);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(200,255,240,.45)';
      ctx.beginPath();ctx.arc(s.x-2,s.y-3,this.r*.32,0,Math.PI*2);ctx.fill();
    } else {
      ctx.shadowColor='#ffd700';ctx.shadowBlur=10+pulse*6;
      ctx.fillStyle=`hsl(${44+pulse*12},100%,58%)`;
      ctx.beginPath();ctx.arc(s.x,s.y,this.r*(0.9+pulse*.1),0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,200,.5)';
      ctx.beginPath();ctx.arc(s.x-2,s.y-2,this.r*.38,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  test(pcx,pcy,pw,ph,t){
    const wy=this.wy_anim(t);
    return !this.collected&&Math.abs(pcx-this.wx)<pw/2+this.r&&Math.abs(pcy-wy)<ph/2+this.r;
  }
}

// ═══════════════════════════════════════════════
// FALLING ROCK
// ═══════════════════════════════════════════════
class FallingRock {
  constructor(x, y){
    this.x=x; this.y=y;
    this.r=10+Math.random()*9;
    this.vx=(Math.random()-.5)*55;
    this.vy=180+Math.random()*80;
    this.alive=true;
    this._rot=Math.random()*Math.PI*2;
    this._rotSpd=(Math.random()-.5)*4;
    const n=6+Math.floor(Math.random()*3);
    this._pts=Array.from({length:n},(_,i)=>{
      const a=(i/n)*Math.PI*2;
      const r=this.r*(0.65+Math.random()*.38);
      return {x:Math.cos(a)*r,y:Math.sin(a)*r};
    });
  }
  update(dt,platforms){
    this.vy=Math.min(this.vy+1000*dt,900);
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this._rot+=this._rotSpd*dt;
    for(const p of platforms){
      if(p.crumbled||p.type==='passthrough') continue;
      if(this.x+this.r>p.x&&this.x-this.r<p.right&&
         this.y+this.r>p.y&&this.y-this.r<p.bottom){
        this.alive=false; break;
      }
    }
  }
  hitPlayer(player){
    return Math.hypot(this.x-player.cx,this.y-player.cy)<this.r+Math.min(player.w,player.h)*.38;
  }
  draw(ctx,cam){
    if(!cam.inView(this.x-this.r,this.y-this.r,this.r*2,this.r*2)) return;
    const s=cam.scr(this.x,this.y);
    ctx.save();
    ctx.translate(s.x,s.y); ctx.rotate(this._rot);
    ctx.shadowColor='#ff6622'; ctx.shadowBlur=14;
    ctx.fillStyle='#6a4a28'; ctx.strokeStyle='#ffaa66'; ctx.lineWidth=1.8;
    ctx.beginPath();
    ctx.moveTo(this._pts[0].x,this._pts[0].y);
    for(let i=1;i<this._pts.length;i++) ctx.lineTo(this._pts[i].x,this._pts[i].y);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha=.55; ctx.stroke();
    ctx.globalAlpha=.22; ctx.fillStyle='#ffddaa'; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(-this.r*.25,-this.r*.28,this.r*.32,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// SPIKE  — stationary deadly zone
// ═══════════════════════════════════════════════
class Spike {
  constructor(x,y,w){ this.x=x; this.y=y; this.w=w; this.h=14; }
  // y = platform top; spikes point UP from y to y-h
  hitPlayer(p){
    const top=this.y-this.h;
    return p.x<this.x+this.w&&p.right>this.x&&p.bottom>top+2&&p.y<this.y;
  }
  draw(ctx,cam){
    const top=this.y-this.h;
    if(!cam.inView(this.x,top,this.w,this.h)) return;
    const s=cam.scr(this.x,this.y); // s.y = screen y of platform top (spike base)
    const n=Math.max(1,Math.floor(this.w/12));
    const tw=this.w/n;
    ctx.save();
    ctx.shadowColor='#ff2244'; ctx.shadowBlur=10; ctx.fillStyle='#cc2244';
    for(let i=0;i<n;i++){
      ctx.beginPath();
      ctx.moveTo(s.x+i*tw,     s.y);          // base left  (at platform surface)
      ctx.lineTo(s.x+i*tw+tw/2,s.y-this.h);   // tip UP
      ctx.lineTo(s.x+(i+1)*tw, s.y);          // base right
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,100,130,.4)'; ctx.lineWidth=1;
    for(let i=0;i<n;i++){
      ctx.beginPath();
      ctx.moveTo(s.x+i*tw,     s.y);
      ctx.lineTo(s.x+i*tw+tw/2,s.y-this.h);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// CHECKPOINT — flag mid-level; respawn here
// ═══════════════════════════════════════════════
class CheckPoint {
  constructor(x,y){
    this.x=x; this.y=y; this.w=28; this.h=54;
    this.triggered=false;
    this._ph=Math.random()*Math.PI*2;
  }
  get cx(){ return this.x+this.w/2; }
  get right(){ return this.x+this.w; }
  get bottom(){ return this.y+this.h; }

  test(player){
    if(this.triggered) return false;
    return player.x<this.right+10&&player.right>this.x-10&&
           player.bottom>this.y&&player.y<this.bottom;
  }

  draw(ctx,cam,t){
    const poleTop=this.y-44;
    if(!cam.inView(this.x-4,poleTop,this.w+8,this.h+50)) return;
    const sb=cam.scr(this.cx,this.y+this.h); // pole base screen pos
    const pulse=(Math.sin(t*2.8+this._ph)+1)/2;
    const col=this.triggered?'#00ff88':'#cc80ff';
    const glow=this.triggered?'#00ff88':'#9940cc';
    ctx.save();
    // Pole
    ctx.strokeStyle=col; ctx.shadowColor=glow;
    ctx.shadowBlur=this.triggered?16+pulse*8:7;
    ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(sb.x,sb.y);
    ctx.lineTo(sb.x,sb.y-this.h-44);
    ctx.stroke();
    // Flag
    ctx.shadowBlur=this.triggered?12:4;
    ctx.fillStyle=col;
    ctx.globalAlpha=this.triggered?1:0.72+pulse*0.22;
    const wave=this.triggered?Math.sin(t*7+this._ph)*5:0;
    ctx.beginPath();
    ctx.moveTo(sb.x,sb.y-this.h-44);
    ctx.lineTo(sb.x+24+wave,sb.y-this.h-32);
    ctx.lineTo(sb.x,sb.y-this.h-20);
    ctx.closePath(); ctx.fill();
    // Base bar
    ctx.globalAlpha=1;
    ctx.shadowBlur=this.triggered?10:4;
    ctx.strokeStyle=col; ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(sb.x-9,sb.y);
    ctx.lineTo(sb.x+9,sb.y);
    ctx.stroke();
    // CP label when inactive
    if(!this.triggered){
      ctx.globalAlpha=0.4+pulse*0.2;
      ctx.fillStyle=col; ctx.shadowBlur=0;
      ctx.font='bold 7px Orbitron,monospace';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('CP',sb.x,sb.y-this.h-48);
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// PROJECTILE
// ═══════════════════════════════════════════════
class Projectile {
  constructor(x,y,dir){
    this.x=x; this.y=y; this.vx=dir*265; this.vy=0;
    this.r=5; this.alive=true; this._t=0;
  }
  update(dt,platforms,lvW){
    this.x+=this.vx*dt; this._t+=dt;
    if(this.x<-60||this.x>lvW+60||this._t>7){ this.alive=false; return; }
    for(const p of platforms){
      if(p.crumbled||p.type==='passthrough') continue;
      if(this.x+this.r>p.x&&this.x-this.r<p.right&&
         this.y+this.r>p.y&&this.y-this.r<p.bottom){ this.alive=false; return; }
    }
  }
  hitPlayer(player){ return Math.hypot(this.x-player.cx,this.y-player.cy)<this.r+9; }
  draw(ctx,cam){
    if(!cam.inView(this.x-12,this.y-12,24,24)) return;
    const s=cam.scr(this.x,this.y);
    ctx.save();
    ctx.globalAlpha=.28; ctx.fillStyle='#ff9900';
    ctx.beginPath(); ctx.arc(s.x-this.vx*.016,s.y,this.r*.7,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1; ctx.shadowColor='#ff4400'; ctx.shadowBlur=14; ctx.fillStyle='#ff6600';
    ctx.beginPath(); ctx.arc(s.x,s.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.fillStyle='rgba(255,240,180,.55)';
    ctx.beginPath(); ctx.arc(s.x-1.5,s.y-1.5,this.r*.38,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// ENEMY  (guard / shooter)
// ═══════════════════════════════════════════════
class Enemy {
  constructor(x,y,pL,pR,type='guard'){
    this.x=x; this.y=y; this.w=18; this.h=34;
    this.type=type;
    this.patrolLeft=pL; this.patrolRight=pR;
    this.spd=type==='shooter'?38:68;
    this.vx=this.spd; this.facing=1;
    this._walkT=0; this._shootTimer=2.8+Math.random()*2;
    this._sx=x; this._sy=y;
  }
  get cx(){ return this.x+this.w/2; }
  get cy(){ return this.y+this.h/2; }
  get right(){ return this.x+this.w; }
  get bottom(){ return this.y+this.h; }
  reset(){
    this.x=this._sx; this.y=this._sy;
    this.vx=this.spd; this.facing=1;
    this._shootTimer=2.8+Math.random()*2;
  }
  update(dt,projectiles){
    this.x+=this.vx*dt;
    if(this.x<=this.patrolLeft){ this.x=this.patrolLeft; this.vx=this.spd; this.facing=1; }
    if(this.x+this.w>=this.patrolRight){ this.x=this.patrolRight-this.w; this.vx=-this.spd; this.facing=-1; }
    this._walkT+=dt*Math.abs(this.vx)/55;
    if(this.type==='shooter'){
      this._shootTimer-=dt;
      if(this._shootTimer<=0){
        this._shootTimer=3.5+Math.random()*2.5;
        projectiles.push(new Projectile(this.cx,this.cy,this.facing));
      }
    }
  }
  hitPlayer(player){
    return player.x<this.right&&player.right>this.x&&
           player.y<this.bottom&&player.bottom>this.y;
  }
  draw(ctx,cam){
    if(!cam.inView(this.x,this.y,this.w,this.h)) return;
    const s=cam.scr(this.cx,this.cy);
    ctx.save(); ctx.translate(s.x,s.y);
    const H=this.h,hR=H*.18,hcY=-H/2+hR;
    const shY=hcY+hR+2,hiY=H/2-4;
    const ARM=H*.26,LEG=H*.28;
    const moving=Math.abs(this.vx)>5;
    const wp=this._walkT*7.5;
    const legA=moving?Math.sin(wp)*.5:0;
    const armA=moving?-Math.sin(wp)*.38:.3;
    const COL=this.type==='shooter'?'#ff8800':'#ff3355';
    const GLOW=this.type==='shooter'?'#ff4400':'#cc0022';
    ctx.strokeStyle=COL; ctx.fillStyle=COL;
    ctx.shadowColor=GLOW; ctx.shadowBlur=14;
    ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.arc(0,hcY,hR,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(this.facing*hR*.35,hcY-hR*.08,hR*.26,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(0,hcY+hR*.35,hR*.5,Math.PI+.3,-0.3); ctx.stroke();
    ctx.shadowBlur=10;
    ctx.beginPath(); ctx.moveTo(0,shY); ctx.lineTo(0,hiY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,shY+2);
    ctx.lineTo(-Math.sin(armA+.3)*ARM,shY+2+Math.cos(armA+.3)*ARM*.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,shY+2);
    ctx.lineTo( Math.sin(-armA+.3)*ARM,shY+2+Math.cos(-armA+.3)*ARM*.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,hiY);
    ctx.lineTo(-Math.sin(legA)*LEG,hiY+Math.cos(legA)*LEG); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,hiY);
    ctx.lineTo( Math.sin(-legA)*LEG,hiY+Math.cos(-legA)*LEG); ctx.stroke();
    if(this.type==='shooter'){
      ctx.shadowBlur=8; ctx.strokeStyle='#ffaa00'; ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(this.facing*4,shY+8);
      ctx.lineTo(this.facing*ARM*.85,shY+5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// WIND ZONE
// ═══════════════════════════════════════════════
class WindZone {
  constructor(x,y,w,h,dir,force){
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.dir=dir; this.force=force||400; this._t=0;
  }
  contains(px,py){ return px>this.x&&px<this.x+this.w&&py>this.y&&py<this.y+this.h; }
  update(dt){ this._t+=dt; }
  draw(ctx,cam){
    if(!cam.inView(this.x,this.y,this.w,this.h)) return;
    const s=cam.scr(this.x,this.y);
    const col=this.dir>0?'#00aaff':'#aa44ff';
    ctx.save();
    ctx.globalAlpha=.09; ctx.fillStyle=col;
    ctx.fillRect(s.x,s.y,this.w,this.h);
    ctx.globalAlpha=.5; ctx.strokeStyle=col; ctx.lineWidth=1.8;
    const rows=Math.max(2,Math.floor(this.h/44));
    const cols=Math.max(2,Math.floor(this.w/60));
    for(let r=0;r<rows;r++){
      const oy=s.y+(r+.5)*(this.h/rows);
      for(let c=0;c<cols;c++){
        const bx=(c+.5)*(this.w/cols);
        const ox=s.x+((bx+this._t*this.dir*55)%this.w+this.w)%this.w;
        ctx.beginPath();
        ctx.moveTo(ox-this.dir*10,oy); ctx.lineTo(ox+this.dir*10,oy);
        ctx.moveTo(ox+this.dir*10,oy); ctx.lineTo(ox+this.dir*2,oy-7);
        ctx.moveTo(ox+this.dir*10,oy); ctx.lineTo(ox+this.dir*2,oy+7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha=.3; ctx.strokeStyle=col; ctx.lineWidth=1.5;
    ctx.setLineDash([5,5]); ctx.strokeRect(s.x,s.y,this.w,this.h); ctx.setLineDash([]);
    ctx.globalAlpha=.5; ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=8;
    ctx.font='bold 9px Orbitron,monospace'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText(this.dir>0?'» WIND »':'« WIND «',s.x+this.w/2,s.y+5);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// PLAYER — stick figure (points 1, 7, 8, 9)
// ═══════════════════════════════════════════════
class Player {
  constructor(x,y){
    this.x=x;this.y=y; this.w=26; this.h=48;
    this.vx=0;this.vy=0;
    this.onGround=false;this.onPlat=null;
    this.jumpsLeft=MAX_JUMPS;
    this.coyoteT=0;this.bufT=0;this.jumpHeld=false;
    this.facing=1;
    this.dead=false;this.invT=0;
    this._sqX=1;this._sqY=1;
    this._blink=0;
    this._trail=[];this._dustT=0;
    this._walkT=0;
    // wall slide / wall jump (37-38)
    this._wallL=false; this._wallR=false; this._wallSliding=false;
    // dash (39)
    this._dashCD=0; this._dashing=0; this._dashVX=0; this._dashDir=1;
    // crouch (41)
    this._crouching=false;
    // audio helper
    this._lastLandVY=0;
  }
  get cx()    { return this.x+this.w/2; }
  get cy()    { return this.y+this.h/2; }
  get right() { return this.x+this.w; }
  get bottom(){ return this.y+this.h; }

  _overlaps(p){
    return this.x<p.right&&this.right>p.x&&this.y<p.bottom&&this.bottom>p.y;
  }

  update(dt,inp,platforms,particles,lvW){
    if(this.dead) return;
    // pre-carry: move with last frame's platform BEFORE physics so player never detaches
    if(this.onGround&&this.onPlat){
      this.x+=this.onPlat.dX;
      this.y+=this.onPlat.dY+(this.onPlat.type==='moving'?0.5:0);
    }
    this.coyoteT=Math.max(0,this.coyoteT-dt);
    this.bufT   =Math.max(0,this.bufT-dt);
    this.invT   =Math.max(0,this.invT-dt);
    this._sqX+=(1-this._sqX)*Math.min(1,dt*14);
    this._sqY+=(1-this._sqY)*Math.min(1,dt*14);
    this._blink=Math.max(0,this._blink-dt);
    if(this._blink<=0&&Math.random()<dt*.3) this._blink=0.12;

    // dash cooldown tick
    this._dashCD=Math.max(0,this._dashCD-dt);
    if(this._dashing>0) this._dashing-=dt;

    // crouch (point 41) — shrink hitbox while pressing down on ground
    const wantCrouch=inp.down&&this.onGround;
    if(wantCrouch&&!this._crouching){
      this._crouching=true; this.y+=20; this.h=28;
    } else if(!wantCrouch&&this._crouching){
      this.h=48; this.y-=20; this._crouching=false;
    }

    if(inp.jumpPressed) this.bufT=JUMP_BUF;

    // dash trigger (point 39) — X key or Ctrl
    if(inp.dashPressed&&this._dashCD<=0&&this._dashing<=0){
      const dir=inp.right?1:inp.left?-1:this.facing;
      this._dashing=DASH_DUR; this._dashVX=dir*DASH_SPD;
      this._dashCD=DASH_CD; this._dashDir=dir;
      for(let i=0;i<9;i++){
        const a=Math.random()*Math.PI*2;
        particles.push(new Particle(this.cx,this.cy,Math.cos(a)*90+dir*-50,Math.sin(a)*55,'#c080ff',.2,2.4));
      }
    }

    const wasGnd=this.onGround;
    const onIce=this.onPlat?.type==='ice';

    if(this._dashing>0){
      // during dash: lock horizontal, kill gravity
      this.vx=this._dashVX;
      this.vy=Math.min(this.vy,50);
    } else {
      const topSpd=inp.sprint?SPRINT_SPD:MOVE_SPD;
      const accel=this.onGround?(onIce?ACCEL_G*.2:ACCEL_G):ACCEL_A;
      const decel=this.onGround?(onIce?DECEL_G*.035:DECEL_G):DECEL_A;

      if(inp.left){
        this.facing=-1;
        if(this.vx>-topSpd) this.vx-=accel*dt;
        if(this.vx<-topSpd) this.vx=-topSpd;
      } else if(inp.right){
        this.facing=1;
        if(this.vx<topSpd) this.vx+=accel*dt;
        if(this.vx>topSpd) this.vx=topSpd;
      } else {
        const sign=Math.sign(this.vx);
        this.vx-=sign*decel*dt;
        if(Math.sign(this.vx)!==sign) this.vx=0;
      }
    }

    if(!this.onGround){
      const gm=this._dashing>0?0:(this.vy>0?1.3:(this.jumpHeld?0.68:1.0));
      this.vy+=GRAVITY*gm*dt;
      if(this.vy>MAX_FALL) this.vy=MAX_FALL;
    }

    // wall slide (point 37) + wall jump (point 38)
    this._wallSliding=false;
    const wallDir=this._wallR?1:this._wallL?-1:0;
    if(!this.onGround&&wallDir!==0&&this._dashing<=0){
      const pushing=(wallDir===1&&inp.right)||(wallDir===-1&&inp.left);
      if(pushing&&this.vy>0){
        this._wallSliding=true;
        if(this.vy>WALL_SLIDE) this.vy=WALL_SLIDE;
        // wall-slide sparks
        if(Math.random()<dt*12){
          particles.push(new Particle(
            this.x+(wallDir===1?this.w:0),this.cy+(Math.random()-.5)*8,
            -wallDir*(20+Math.random()*60),Math.random()*40+10,'#80c0ff',.18+Math.random()*.1,1.5));
        }
      }
    }

    // wall jump: absorbs the buffered jump press
    if(this._wallSliding&&this.bufT>0){
      const wDir=this._wallR?-1:1;
      this.vx=wDir*WALL_JX; this.vy=JUMP_VEL*0.85;
      this.facing=wDir; this.jumpHeld=true; this.bufT=0;
      this.jumpsLeft=MAX_JUMPS-1; this._wallSliding=false;
      for(let i=0;i<10;i++){
        const a=-Math.PI/2+(wDir*Math.random()*.9);
        particles.push(new Particle(this.cx,this.cy,Math.cos(a)*110,Math.sin(a)*90,'#80c0ff',.28,2.5));
      }
    }

    const canJump=this.coyoteT>0||this.jumpsLeft>0;
    if(this.bufT>0&&canJump&&!this._wallSliding){ this._doJump(particles);this.bufT=0; }
    if(!inp.jumpHeld&&this.jumpHeld&&this.vy<0){ this.vy*=JUMP_CUT;this.jumpHeld=false; }
    this.jumpHeld=inp.jumpHeld;

    this.x+=this.vx*dt;
    this._resolveX(platforms);
    this.onGround=false;this.onPlat=null;
    this.y+=this.vy*dt;
    this._resolveY(platforms,particles);

    if(wasGnd&&!this.onGround&&this.vy>=0) this.coyoteT=COYOTE_T;
    if(this.onGround){ this.jumpsLeft=MAX_JUMPS;this.coyoteT=0; }

    // conveyor push (x/y carry is handled by pre-carry above)
    if(this.onPlat?.type==='conveyor'){
      const push=this.onPlat.conveyorDir*this.onPlat.conveyorSpd;
      this.vx+=push*dt;
      this.vx=Math.max(-SPRINT_SPD*1.3,Math.min(SPRINT_SPD*1.3,this.vx));
    }

    // point 9: edge clamp
    if(this.x<0){ this.x=0;this.vx=0; }
    if(this.right>lvW){ this.x=lvW-this.w;this.vx=0; }

    if(!wasGnd&&this.onGround&&this.onPlat?.type!=='bounce'){
      const spd=Math.abs(this._lastLandVY);
      // 77 — squash on land proportional to fall speed
      const sq=Math.min(.38,spd/3800);
      this._sqY=1-sq;this._sqX=1+sq*.7;
      sfx?.land(spd);
      // 75 — screen shake on hard landing
      if(spd>380&&typeof game!=='undefined') game.cam.shake(Math.min(10,spd/120),.22);
      // 76 — dust puff on landing (wider spread)
      const dustN=4+Math.floor(spd/220);
      for(let i=0;i<dustN;i++){
        const side=i%2===0?-1:1;
        particles.push(new Particle(
          this.cx+side*(6+Math.random()*10),this.bottom,
          side*(50+Math.random()*110),-(12+Math.random()*38),
          i%2===0?'#c0a8e8':'#ffffff',
          .2+Math.random()*.16, 1.4+Math.random()*1.6));
      }
      // central puff
      for(let i=0;i<4;i++){
        particles.push(new Particle(
          this.cx+(Math.random()-.5)*8,this.bottom,
          (Math.random()-.5)*40,-Math.random()*25,
          '#e0d0ff',.16+Math.random()*.1,1.2+Math.random()));
      }
    }

    if(this.onGround&&Math.abs(this.vx)>12) this._walkT+=dt*Math.abs(this.vx)/80;

    this._dustT+=dt;
    const _skT=typeof game!=='undefined'?SKINS[game._skin]||SKINS[0]:SKINS[0];
    const trailCol=this._dashing>0?_skT.dashCol:this._wallSliding?_skT.slideCol:_skT.glow;
    if(this._dustT>.04&&(Math.abs(this.vx)>50||!this.onGround||this._dashing>0)){
      this._dustT=0;
      this._trail.push({x:this.cx,y:this.cy,life:this._dashing>0?.28:.18,ml:this._dashing>0?.28:.18,col:trailCol});
    }
    this._trail.forEach(t=>t.life-=dt);
    this._trail=this._trail.filter(t=>t.life>0);
  }

  _doJump(particles){
    const fromGnd=this.onGround||this.coyoteT>0;
    if(!fromGnd&&this.jumpsLeft<=0) return;
    sfx?.jump();
    this.vy=JUMP_VEL;this.jumpHeld=true;this.coyoteT=0;this.onGround=false;
    if(!fromGnd){
      this.jumpsLeft--;
      for(let i=0;i<16;i++){
        const a=(i/16)*Math.PI*2;
        particles.push(new Particle(this.cx,this.cy,Math.cos(a)*110,Math.sin(a)*110,'#c080ff',.3,3));
      }
    } else {
      // 77 — stretch on jump
      this.jumpsLeft=MAX_JUMPS-1;
      this._sqY=1.38;this._sqX=.68;
      // 76 — dust puff on takeoff
      for(let i=0;i<14;i++){
        const a=Math.PI+Math.PI*(Math.random()-.5)*.9;
        particles.push(new Particle(
          this.cx+(Math.random()-.5)*14,this.bottom,
          Math.cos(a)*(60+Math.random()*80),Math.sin(a)*(40+Math.random()*50),
          i%3===0?'#c8a8ff':i%3===1?'#ffffff':'#9060e0',
          .22+Math.random()*.14, 1.6+Math.random()*1.4));
      }
    }
  }

  _resolveX(platforms){
    this._wallL=false; this._wallR=false;
    for(const p of platforms){
      if(p.crumbled||p.type==='passthrough') continue;
      if(!this._overlaps(p)) continue;
      // standing on top (incl. the +0.5 carry into moving platforms) is NOT a wall
      // hit — skip so the player isn't shoved sideways off a moving platform.
      const footDip=this.bottom-p.y;
      if(this.y<p.y&&footDip>0&&footDip<=6) continue;
      if(this.right-p.x<p.right-this.x){ this.x=p.x-this.w; this._wallR=true; }
      else { this.x=p.right; this._wallL=true; }
      this.vx=0;
    }
  }
  _resolveY(platforms,particles){
    for(const p of platforms){
      if(p.crumbled) continue;
      if(!this._overlaps(p)) continue;
      const oT=this.bottom-p.y, oB=p.bottom-this.y;
      const landing=(landP)=>{
        this.y=landP.y-this.h; this.onGround=true; this.onPlat=landP;
        if(landP.type==='crumble'&&landP.crTimer<=0) landP.crTimer=0.7;
        if(landP.type==='shrink') landP._touched=true;
        if(landP.type==='bounce'){
          this.vy=JUMP_VEL*2.02; this.jumpsLeft=MAX_JUMPS;
          this._sqY=1.4;this._sqX=.68;
          for(let i=0;i<12;i++){
            const a=-Math.PI/2+((Math.random()-.5)*1.1);
            particles.push(new Particle(this.cx,landP.y,Math.cos(a)*160,Math.sin(a)*160,'#ffe040',.38,3));
          }
        } else { this._lastLandVY=this.vy; this.vy=0; }
      };
      if(p.type==='passthrough'){
        if(this.vy>=0&&oT>0&&oT<16) landing(p);
      } else {
        if(oT<oB) landing(p);
        else { this.y=p.bottom;this.vy=Math.abs(this.vy)*.08; }
      }
    }
  }

  // ── STICK FIGURE — points 1, 7, 8 ──
  draw(ctx,cam){
    if(this.dead) return;
    if(this.invT>0&&Math.floor(this.invT*10)%2===0) return;

    const _tStyle=typeof game!=='undefined'?game._trailStyle:'default';
    if(_tStyle!=='none'){
      for(const tr of this._trail){
        const s=cam.scr(tr.x,tr.y);
        const a=tr.life/tr.ml;
        ctx.save();
        if(_tStyle==='comet'){
          ctx.globalAlpha=a*.32;
          ctx.fillStyle=tr.col||'#9050e0';
          ctx.shadowColor=tr.col||'#9050e0'; ctx.shadowBlur=14;
          ctx.beginPath();ctx.arc(s.x,s.y,10*a+2,0,Math.PI*2);ctx.fill();
        } else if(_tStyle==='sparkle'){
          ctx.globalAlpha=a*.70;
          ctx.fillStyle=tr.col||'#9050e0';
          ctx.shadowColor=tr.col||'#9050e0'; ctx.shadowBlur=8;
          const r=4*a+1, R=r*2.4;
          ctx.beginPath();
          for(let i=0;i<8;i++){
            const ang=i*Math.PI/4-(Math.PI/8);
            const rd=i%2===0?R:r;
            i===0?ctx.moveTo(s.x+Math.cos(ang)*rd,s.y+Math.sin(ang)*rd)
                 :ctx.lineTo(s.x+Math.cos(ang)*rd,s.y+Math.sin(ang)*rd);
          }
          ctx.closePath();ctx.fill();
        } else {
          ctx.globalAlpha=a*.20;
          ctx.strokeStyle=tr.col||'#9050e0';ctx.lineWidth=2.5;ctx.lineCap='round';
          ctx.beginPath();ctx.arc(s.x,s.y,7,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
      }
    }

    const s=cam.scr(this.cx,this.cy);
    ctx.save();
    ctx.translate(s.x,s.y);
    // dash: horizontal stretch
    const dashStretch=this._dashing>0?(1+this._dashing/DASH_DUR*.22):1;
    ctx.scale(this._sqX*dashStretch,this._sqY/dashStretch);

    const H   = this.h;
    const hR  = H*.192;         // head radius ≈7.3
    const hcY = -H/2+hR;       // head center
    const shY = hcY+hR+3;      // shoulder
    const hiY = H/2-4;          // hip
    const ARM = H*.27;
    const LEG = H*.30;

    const moving   = this.onGround&&Math.abs(this.vx)>12;
    const wp       = this._walkT*7.5;
    const legA     = moving?Math.sin(wp)*.52:0;
    const armA     = moving?-Math.sin(wp)*.38:0;
    const inAir    = !this.onGround;
    const sliding  = this._wallSliding;
    const crouching= this._crouching;

    // crouch: compress scale
    if(crouching) ctx.scale(1.15,.65);

    // Feature 68: skin colours
    const _sk = typeof game!=='undefined'?SKINS[game._skin]||SKINS[0]:SKINS[0];
    const COL = this._dashing>0?_sk.dashCol:sliding?_sk.slideCol:_sk.col;
    const GLOW= _sk.glow;
    ctx.strokeStyle=COL;ctx.fillStyle=COL;
    ctx.shadowColor=GLOW;ctx.shadowBlur=16;
    ctx.lineWidth=3.0;ctx.lineCap='round';ctx.lineJoin='round';

    // body — torso trapezoid (wider shoulders, narrower hips)
    const torsoW=H*.22;
    ctx.lineWidth=2.2;
    ctx.beginPath();
    ctx.moveTo(-torsoW,shY); ctx.lineTo(torsoW,shY);     // shoulders
    ctx.lineTo(torsoW*.6,hiY); ctx.lineTo(-torsoW*.6,hiY); // hips
    ctx.closePath();
    ctx.globalAlpha=0.22; ctx.fill();
    ctx.globalAlpha=1;    ctx.stroke();
    ctx.lineWidth=3.0;

    // head
    ctx.beginPath();ctx.arc(0,hcY,hR,0,Math.PI*2);ctx.stroke();

    // eye
    ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(this.facing*hR*.38,hcY-hR*.08,hR*.24,0,Math.PI*2);ctx.fill();

    // smile
    ctx.shadowBlur=4;
    ctx.beginPath();ctx.arc(0,hcY+hR*.22,hR*.52,0.28,Math.PI-0.28);ctx.stroke();

    ctx.shadowBlur=9;
    const armBaseY=shY+2;
    const aOff=torsoW;  // arms start at shoulder edges

    // arms
    if(sliding){
      const wd=this._wallR?1:-1;
      ctx.beginPath();ctx.moveTo(wd*aOff,armBaseY);ctx.lineTo(wd*(aOff+ARM*.8),armBaseY-ARM*.3);ctx.stroke();
      ctx.beginPath();ctx.moveTo(wd*aOff,armBaseY);ctx.lineTo(wd*(aOff+ARM*.6),armBaseY+ARM*.5);ctx.stroke();
    } else if(inAir){
      ctx.beginPath();ctx.moveTo(-aOff,armBaseY);ctx.lineTo(-aOff-ARM*.72,armBaseY-ARM*.52);ctx.stroke();
      ctx.beginPath();ctx.moveTo( aOff,armBaseY);ctx.lineTo( aOff+ARM*.72,armBaseY-ARM*.52);ctx.stroke();
    } else {
      ctx.beginPath();ctx.moveTo(-aOff,armBaseY);
      ctx.lineTo(-aOff-Math.sin(armA+.4)*ARM,armBaseY+Math.cos(armA+.4)*ARM*.7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(aOff,armBaseY);
      ctx.lineTo( aOff+Math.sin(-armA+.4)*ARM,armBaseY+Math.cos(-armA+.4)*ARM*.7);ctx.stroke();
    }

    // legs
    if(inAir){
      const jl=this.vy<0?-0.28:0.14;
      ctx.beginPath();ctx.moveTo(0,hiY);ctx.lineTo(-LEG*.44,hiY+LEG*(0.86+jl));ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,hiY);ctx.lineTo( LEG*.44,hiY+LEG*(0.86+jl));ctx.stroke();
    } else {
      ctx.beginPath();ctx.moveTo(0,hiY);
      ctx.lineTo(-Math.sin(legA)*LEG,hiY+Math.cos(legA)*LEG);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,hiY);
      ctx.lineTo( Math.sin(-legA)*LEG,hiY+Math.cos(-legA)*LEG);ctx.stroke();
    }

    // ── Accessories ──
    const _acc = typeof game!=='undefined'?ACCESSORIES[game._accessory]||ACCESSORIES[0]:ACCESSORIES[0];
    if(_acc.id>0){
      ctx.save();
      const acGlow=_acc.col;
      ctx.shadowColor=acGlow; ctx.shadowBlur=14;
      ctx.strokeStyle=acGlow; ctx.fillStyle=acGlow;
      ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round';

      if(_acc.id===1){ // HAT — top hat
        const brimY=hcY-hR-1, topY=brimY-12;
        ctx.fillRect(-10,brimY,20,3);
        ctx.fillRect(-6,topY,12,12);
      } else if(_acc.id===2){ // SWORD — on arm
        const sx=this.facing*(aOff+ARM*.68), sy=armBaseY+ARM*.4;
        ctx.beginPath();
        ctx.moveTo(sx,sy); ctx.lineTo(sx+this.facing*18,sy-14); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx+this.facing*8,sy-6); ctx.lineTo(sx+this.facing*14,sy-2); ctx.stroke();
      } else if(_acc.id===3){ // CROWN
        const crY=hcY-hR-2;
        ctx.beginPath();
        ctx.moveTo(-8,crY); ctx.lineTo(-8,crY-9);
        ctx.lineTo(-4,crY-5); ctx.lineTo(0,crY-12);
        ctx.lineTo(4,crY-5); ctx.lineTo(8,crY-9);
        ctx.lineTo(8,crY); ctx.closePath();
        ctx.fill();
        ctx.shadowBlur=5;ctx.fillStyle='#fff';
        ctx.beginPath();ctx.arc(-5,crY-7,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(5,crY-7,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(0,crY-11,1.5,0,Math.PI*2);ctx.fill();
      } else if(_acc.id===4){ // CAPE
        ctx.globalAlpha=0.72;
        ctx.beginPath();
        ctx.moveTo(-this.facing*4,shY);
        ctx.lineTo(-this.facing*16,shY+12);
        ctx.lineTo(-this.facing*10,hiY+6);
        ctx.lineTo(-this.facing*2,hiY);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// LEVEL DATA — point 17: zigzag staircase
// ═══════════════════════════════════════════════
const LEVELS=[
  {
    name:'NEON STAIRCASE',
    bg:['#07031a','#10072a'],
    lvW:900, lvH:5800,
    spX:150, spY:5680,
    goal:{x:660,y:190,w:58,h:76,label:'EXIT'},
    star3Time:220, star2Time:380, rockInterval:3.0, lava:false,
    spikes:[
      {x:140,y:5520,w:70},{x:660,y:5280,w:90},
      {x:680,y:4320,w:90},{x:100,y:3600,w:80},
    ],
    enemies:[
      {x:90, y:4046,pL:60, pR:265,type:'guard'},
      {x:700,y:3326,pL:630,pR:835,type:'guard'},
      {x:700,y:2366,pL:630,pR:835,type:'shooter'},
    ],
    windZones:[
      {x:0,  y:3640,w:300,h:175,dir:1, force:360},
      {x:600,y:2680,w:330,h:175,dir:-1,force:380},
    ],
    plats:[
      {x:60, y:5520,w:210,h:22},
      {x:630,y:5280,w:210,h:22},
      {x:60, y:5040,w:210,h:22},
      {x:630,y:4800,w:210,h:22,type:'moving',moveAxis:'x',moveDist:100,moveSpd:44},
      // bounce platform — launches 2x (point 44)
      {x:60, y:4560,w:210,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:630,y:4320,w:210,h:22,type:'crumble',color:'#8a2a14',glowCol:'#ff4828'},
      {x:60, y:4080,w:210,h:22},
      {x:630,y:3840,w:210,h:22,type:'moving',moveAxis:'y',moveDist:80,moveSpd:38},
      // ice platform — slippery (point 45)
      {x:60, y:3600,w:210,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:630,y:3360,w:210,h:22},
      {x:60, y:3120,w:210,h:22,type:'crumble',color:'#8a2a14',glowCol:'#ff4828'},
      {x:630,y:2880,w:210,h:22,type:'moving',moveAxis:'x',moveDist:90,moveSpd:50},
      // disappear platform — 2s on 1s off (point 48)
      {x:60, y:2640,w:210,h:22,type:'disappear',color:'#440060',glowCol:'#c050ff',disappearOff:0},
      {x:630,y:2400,w:210,h:22},
      {x:60, y:2160,w:210,h:22,type:'moving',moveAxis:'y',moveDist:70,moveSpd:42},
      // conveyor pushing right (point 47)
      {x:630,y:1920,w:210,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:1,conveyorSpd:110},
      {x:60, y:1680,w:210,h:22},
      // shrink platform — narrows after step (point 49)
      {x:630,y:1440,w:210,h:22,type:'shrink',color:'#500040',glowCol:'#ff60cc'},
      {x:60, y:1200,w:210,h:22},
      {x:630,y:960, w:210,h:22,type:'moving',moveAxis:'x',moveDist:110,moveSpd:46},
      // ice + bounce combo finale
      {x:60, y:720, w:210,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:630,y:480, w:210,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:570,y:250, w:330,h:30},
    ],
    coins:[
      {x:165,y:5490,t:'coin'},{x:735,y:5250,t:'coin'},
      {x:165,y:5010,t:'gem' },{x:735,y:4770,t:'coin'},
      {x:165,y:4530,t:'coin'},{x:735,y:4290,t:'coin'},
      {x:165,y:4050,t:'gem' },{x:735,y:3810,t:'coin'},
      {x:165,y:3570,t:'coin'},{x:735,y:3330,t:'coin'},
      {x:165,y:3090,t:'gem' },{x:735,y:2850,t:'coin'},
      {x:165,y:2610,t:'coin'},{x:735,y:2370,t:'coin'},
      {x:165,y:2130,t:'gem' },{x:735,y:1890,t:'coin'},
      {x:165,y:1650,t:'coin'},{x:735,y:1410,t:'coin'},
      {x:165,y:1170,t:'gem' },{x:735,y:930, t:'coin'},
      {x:165,y:690, t:'coin'},{x:735,y:450, t:'gem' },
      // secret coin — tucked behind the far-left wall at mid-height (point 56)
      {x:18,y:3590,t:'secret'},
    ],
    checkpoints:[{x:340,y:2820}],
    platsEasy:[
      {x:320,y:5160,w:120,h:22},{x:320,y:4560,w:120,h:22},
      {x:320,y:3600,w:120,h:22},{x:320,y:2640,w:120,h:22},{x:320,y:1680,w:120,h:22},
    ],
  },
  {
    name:'VERTICAL CLIMB',
    bg:['#050820','#0c1440'],
    lvW:1000, lvH:3800,
    spX:160, spY:3460,
    goal:{x:850,y:160,w:58,h:76,label:'EXIT'},
    star3Time:140, star2Time:250, rockInterval:2.2, lava:true,
    spikes:[
      {x:90, y:3520,w:80},{x:80, y:2200,w:80},{x:520,y:1540,w:80},
    ],
    enemies:[
      {x:160,y:3486,pL:60, pR:275,type:'guard'},
      {x:100,y:2166,pL:60, pR:275,type:'guard'},
      {x:520,y:1066,pL:500,pR:695,type:'shooter'},
    ],
    windZones:[
      {x:0,  y:2900,w:480,h:180,dir:-1,force:400},
      {x:500,y:1580,w:490,h:200,dir:1, force:390},
    ],
    plats:[
      {x:60, y:3520,w:220,h:22},
      {x:460,y:3300,w:200,h:22,type:'moving',moveAxis:'x',moveDist:120,moveSpd:48},
      {x:60, y:3080,w:220,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:500,y:2860,w:200,h:22,type:'crumble',color:'#8a2a14',glowCol:'#ff4828'},
      {x:60, y:2640,w:220,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:-1,conveyorSpd:130},
      {x:500,y:2420,w:200,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:60, y:2200,w:220,h:22},
      {x:500,y:1980,w:200,h:22,type:'disappear',color:'#440060',glowCol:'#c050ff',disappearOff:1},
      {x:60, y:1760,w:220,h:22,type:'moving',moveAxis:'x',moveDist:130,moveSpd:52},
      {x:500,y:1540,w:200,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:60, y:1320,w:220,h:22,type:'shrink',color:'#500040',glowCol:'#ff60cc'},
      {x:500,y:1100,w:200,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:1,conveyorSpd:120},
      {x:60, y:880, w:220,h:22,type:'crumble',color:'#8a2a14',glowCol:'#ff4828'},
      {x:500,y:660, w:200,h:22,type:'disappear',color:'#440060',glowCol:'#c050ff',disappearOff:2},
      {x:60, y:440, w:220,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:780,y:220, w:250,h:30},
    ],
    coins:[
      {x:170,y:3490,t:'coin'},{x:560,y:3270,t:'coin'},
      {x:170,y:3050,t:'gem' },{x:600,y:2830,t:'coin'},
      {x:170,y:2610,t:'coin'},{x:600,y:2390,t:'coin'},
      {x:170,y:2170,t:'gem' },{x:600,y:1950,t:'coin'},
      {x:170,y:1730,t:'coin'},{x:600,y:1510,t:'coin'},
      {x:170,y:1290,t:'gem' },{x:600,y:1070,t:'coin'},
      {x:170,y:850, t:'coin'},{x:600,y:630, t:'coin'},
      {x:170,y:410, t:'gem' },{x:880,y:190, t:'gem' },
      // secret coin — above the right zone, needs extra-height jump (point 56)
      {x:970,y:420,t:'secret'},
    ],
    checkpoints:[{x:270,y:1930}],
    platsEasy:[
      {x:270,y:3190,w:140,h:22},{x:270,y:2530,w:140,h:22},
      {x:270,y:1870,w:140,h:22},{x:270,y:1210,w:140,h:22},
    ],
  },
  {
    name:'SPEED CIRCUIT',
    bg:['#140006','#260010'],
    lvW:4500, lvH:1200,
    spX:100, spY:980,
    goal:{x:4260,y:760,w:58,h:76,label:'EXIT'},
    star3Time:65, star2Time:120, rockInterval:4.0, lava:false,
    spikes:[
      {x:695, y:870,w:60},{x:1170,y:710,w:70},
      {x:2680,y:800,w:50},{x:3950,y:740,w:60},
    ],
    enemies:[
      {x:965, y:746,pL:930, pR:1085,type:'guard'},
      {x:2195,y:636,pL:2160,pR:2315,type:'shooter'},
      {x:3700,y:626,pL:3660,pR:3830,type:'guard'},
    ],
    windZones:[
      {x:1350,y:540,w:360,h:330,dir:1, force:460},
      {x:2380,y:530,w:360,h:320,dir:-1,force:430},
      {x:3130,y:550,w:430,h:300,dir:1, force:490},
    ],
    plats:[
      {x:0,   y:1020,w:380,h:30},
      {x:420, y:920, w:180,h:22,type:'moving',moveAxis:'y',moveDist:90,moveSpd:58},
      {x:680, y:870, w:170,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:930, y:780, w:160,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:1160,y:710, w:175,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:1,conveyorSpd:150},
      {x:1400,y:780, w:165,h:22,type:'crumble',color:'#8a2a14',glowCol:'#ff4828'},
      {x:1640,y:880, w:190,h:22,type:'moving',moveAxis:'x',moveDist:120,moveSpd:62},
      {x:1920,y:740, w:175,h:22,type:'disappear',color:'#440060',glowCol:'#c050ff',disappearOff:0.5},
      {x:2160,y:670, w:160,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:2400,y:740, w:175,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:-1,conveyorSpd:140},
      {x:2650,y:800, w:165,h:22,type:'shrink',color:'#500040',glowCol:'#ff60cc'},
      {x:2900,y:720, w:175,h:22,type:'bounce',color:'#706000',glowCol:'#ffe040'},
      {x:3150,y:800, w:190,h:22,type:'disappear',color:'#440060',glowCol:'#c050ff',disappearOff:1.5},
      {x:3420,y:720, w:160,h:22,type:'ice',color:'#104060',glowCol:'#60d8ff'},
      {x:3660,y:660, w:175,h:22,type:'conveyor',color:'#503000',glowCol:'#ff9020',conveyorDir:1,conveyorSpd:160},
      {x:3920,y:740, w:190,h:22,type:'shrink',color:'#500040',glowCol:'#ff60cc'},
      {x:4180,y:800, w:450,h:30},
    ],
    coins:[
      {x:480, y:880, t:'coin'},{x:740, y:830, t:'coin'},
      {x:1000,y:740, t:'gem' },{x:1240,y:670, t:'coin'},
      {x:1700,y:840, t:'coin'},{x:1990,y:700, t:'coin'},
      {x:2230,y:630, t:'gem' },{x:2710,y:760, t:'coin'},
      {x:2960,y:680, t:'coin'},{x:3720,y:620, t:'coin'},
      {x:4300,y:770, t:'gem' },
      // secret coin — floating above conveyor zone, need dash+jump (point 56)
      {x:2560,y:550,t:'secret'},
    ],
    checkpoints:[{x:2050,y:620}],
    platsEasy:[
      {x:1100,y:840,w:150,h:22},{x:1780,y:810,w:150,h:22},
      {x:2530,y:760,w:150,h:22},{x:3280,y:695,w:150,h:22},
    ],
  },
];

// ═══════════════════════════════════════════════
// ACCESSORIES — buyable with collected coins
// ═══════════════════════════════════════════════
const ACCESSORIES=[
  {id:0,name:'NONE',  price:0,  icon:'✕', col:'#555'},
  {id:1,name:'HAT',   price:2,  icon:'🎩', col:'#c080ff'},
  {id:2,name:'SWORD', price:10, icon:'⚔',  col:'#80d8ff'},
  {id:3,name:'CROWN', price:20, icon:'👑', col:'#ffd700'},
  {id:4,name:'CAPE',  price:35, icon:'🌙', col:'#ff8040'},
];

// ═══════════════════════════════════════════════
// SKINS — unlockable by beating levels
// ═══════════════════════════════════════════════
const SKINS=[
  {id:0,name:'NEON',    col:'#cca8ff',glow:'#8840ff',dashCol:'#ff90ff',slideCol:'#90d0ff',unlockLevel:-1},
  {id:1,name:'INFERNO', col:'#ff9040',glow:'#cc2200',dashCol:'#ffcc00',slideCol:'#ff6600',unlockLevel:0},
  {id:2,name:'FROST',   col:'#80e8ff',glow:'#0080c0',dashCol:'#ffffff',slideCol:'#40c8ff',unlockLevel:1},
  {id:3,name:'COSMIC',  col:'#ffe040',glow:'#cc6600',dashCol:'#ff80ff',slideCol:'#80ff80',unlockLevel:2},
  {id:4,name:'SHADOW',  col:'#a060ff',glow:'#2000a0',dashCol:'#e0d0ff',slideCol:'#5020b0',unlockLevel:-1},
  {id:5,name:'LAVA',    col:'#ff4830',glow:'#aa1000',dashCol:'#ffee00',slideCol:'#ff8030',unlockLevel:-1},
  {id:6,name:'EMERALD', col:'#30ee80',glow:'#007040',dashCol:'#80ffcc',slideCol:'#00c060',unlockLevel:-1},
  {id:7,name:'GALAXY',  col:'#ff70ff',glow:'#600090',dashCol:'#ffe090',slideCol:'#70c0ff',unlockLevel:-1},
];

// ═══════════════════════════════════════════════
// DIFFICULTY MODES
// ═══════════════════════════════════════════════
const DIFF_MODES=[
  {id:0,name:'EASY',  enemyMult:0.55,rockMult:1.9,inkMult:1.5, extraPlats:true},
  {id:1,name:'NORMAL',enemyMult:1.0, rockMult:1.0,inkMult:1.0, extraPlats:false},
  {id:2,name:'HARD',  enemyMult:1.65,rockMult:0.6,inkMult:0.65,extraPlats:false},
];

// ═══════════════════════════════════════════════
// STARS
// ═══════════════════════════════════════════════
const STARS=Array.from({length:110},()=>({
  x:Math.random(),y:Math.random(),
  r:.4+Math.random()*1.7,a:.1+Math.random()*.55,
  sp:.6+Math.random()*3,ph:Math.random()*Math.PI*2,
}));

// ═══════════════════════════════════════════════
// GAME
// ═══════════════════════════════════════════════
class Game {
  constructor(){
    this.canvas=document.getElementById('gc');
    this.ctx=this.canvas.getContext('2d');
    this.inp=new Input();
    this.cam=new Camera();

    this.state='start';
    this.lvIdx=0; this.score=0; this.lives=3; this.coins=0;

    // Skin + difficulty (feature 66, 68)
    this._skin       = Math.min(SKINS.length-1,   parseInt(localStorage.getItem('nr_skin')||'0'));
    this._difficulty = Math.min(DIFF_MODES.length-1,parseInt(localStorage.getItem('nr_diff')||'1'));
    this._trailStyle = localStorage.getItem('nr_trail')||'default';
    // Accessories + persistent wallet (start with 2 bonus coins)
    this._accessory  = Math.min(ACCESSORIES.length-1,parseInt(localStorage.getItem('nr_acc')||'0'));
    if(localStorage.getItem('nr_wallet')===null) localStorage.setItem('nr_wallet','2');
    this._wallet     = parseInt(localStorage.getItem('nr_wallet')||'2');

    this.player=null; this.platforms=[]; this.coinObjs=[];
    this.particles=[]; this.lvData=null;
    this.rocks=[]; this._rockTimer=2.5; this._nextRockX=null;
    this.spikes=[]; this.enemies=[]; this.projectiles=[]; this.windZones=[];
    // Checkpoints (feature 63)
    this.checkpointObjs=[]; this._cpX=0; this._cpY=0; this._cpFlash=0;
    // Polish (75, 78, 79, 80)
    this._deathFlash=0; this._coinSparks=[]; this._confetti=[];
    this._deathTimer=0; this._goalPulse=0;
    this._goalReached=false; this._winMsgTimer=0;

    // Speedrun timer (point 53)
    this._levelTime=0;

    // Combo multiplier (point 52)
    this._combo=0; this._comboTimer=0; this._comboFloats=[];

    // Drawing state — points 23-32
    this.drawnPlatforms=[];
    this._undoStack=[];
    this._inkUsed=0;
    this._drawing=false;
    this._erasing=false;
    this._drawStart=null;
    this._drawEnd=null;
    this._drawColor=DRAW_COLORS[0];

    this._resize();
    window.addEventListener('resize',()=>this._resize());
    this._setupDrawingUI();
    this._setupDrawingEvents();
    this._setupKeyBindings();

    // Mute button — feature 74
    const _muteBtn=document.getElementById('mute-btn');
    _muteBtn.addEventListener('click',()=>this._toggleMute());
    // Sync initial icon from persisted mute state
    if(sfx.muted){ _muteBtn.textContent='🔇'; _muteBtn.classList.add('muted'); }

    document.getElementById('btn-play')    .onclick=()=>this._showLevelSelect();
    document.getElementById('btn-settings').onclick=()=>this._showSettings();
    document.getElementById('btn-sett-back').onclick=()=>this._settBack();
    document.getElementById('sett-btn')    .onclick=()=>this._showSettings();
    document.getElementById('btn-retry') .onclick=()=>{ this.lives=3;this.score=0;this.coins=0;this._showLevelSelect(); };
    document.getElementById('btn-next')  .onclick=()=>this._loadLevel(this.lvIdx+1,false);
    document.getElementById('btn-again') .onclick=()=>{ this.lives=3;this.score=0;this.coins=0;this._showLevelSelect(); };
    // 88 — replay + level-select from win screen
    document.getElementById('btn-replay-clear').onclick=()=>{ this.lives=3;this.score=0;this.coins=0;this._loadLevel(this.lvIdx,false); };
    document.getElementById('btn-ls-clear')    .onclick=()=>{ this.lives=3;this.score=0;this.coins=0;this._showLevelSelect(); };
    document.getElementById('btn-replay-all')  .onclick=()=>{ this.lives=3;this.score=0;this.coins=0;this._loadLevel(this.lvIdx,false); };
    // 86 — pause menu
    document.getElementById('btn-resume')       .onclick=()=>this._togglePause();
    document.getElementById('btn-pause-restart').onclick=()=>{ this._unpause(); this.lives=3;this.score=0;this.coins=0;this._loadLevel(this.lvIdx,false); };
    document.getElementById('btn-pause-quit')   .onclick=()=>{ this._unpause(); this.lives=3;this.score=0;this.coins=0;this._showLevelSelect(); };
    // 91 — clear drawn platforms button
    document.getElementById('btn-clear-plats').onclick=()=>this._clearAllPlats();
    // 90 — mobile d-pad
    this._setupDpad();
    // 85 — touch drawing
    this._setupTouchDrawing();
    // D-pad: default ON for real touch devices, OFF for desktop; user can override
    this._dpadOn = localStorage.getItem('nr_dpad') !== null
      ? localStorage.getItem('nr_dpad') === '1'
      : window.matchMedia('(hover:none) and (pointer:coarse)').matches;
    this._applyDpad();
  }

  _resize(){
    const pw=Math.min(72,Math.max(28,window.innerWidth*.05));
    const aw=Math.max(360,window.innerWidth-pw*2-14);
    const ah=Math.max(280,window.innerHeight-68);
    this.canvas.width=aw; this.canvas.height=ah;
    this.cam.vw=aw; this.cam.vh=ah;
  }

  // ── helpers ──
  _fmtTime(s){
    if(!isFinite(s)||s<0) return '--:--.--';
    const m=Math.floor(s/60);
    const sec=(s%60).toFixed(1).padStart(4,'0');
    return `${m}:${sec}`;
  }
  _getBest(idx){ return parseFloat(localStorage.getItem(`nr_best_${idx}`))||Infinity; }
  _saveBest(idx,t){ if(t<this._getBest(idx)) localStorage.setItem(`nr_best_${idx}`,t.toFixed(2)); }
  _calcStars(idx,time,coinsGot,coinsTotal){
    const lv=LEVELS[idx];
    const pct=coinsTotal>0?coinsGot/coinsTotal:0;
    if(time<=lv.star3Time&&pct>=0.75) return 3;
    if(time<=lv.star2Time&&pct>=0.4)  return 2;
    return 1;
  }

  // ── DRAWING UI — point 30: color picker ──
  _setupDrawingUI(){
    const row=document.getElementById('color-row');
    DRAW_COLORS.forEach((c,i)=>{
      const btn=document.createElement('div');
      btn.className='col-btn'+(i===0?' active':'');
      btn.style.background=c;
      btn.style.color=c;
      btn.title='Color '+(i+1);
      btn.onclick=()=>{
        this._drawColor=c;
        document.querySelectorAll('.col-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
      };
      row.appendChild(btn);
    });
  }

  // ── DRAWING MOUSE EVENTS — points 23, 25, 27 ──
  _setupDrawingEvents(){
    const canvas=this.canvas;

    canvas.addEventListener('mousedown',e=>{
      if(this.state!=='playing') return;
      e.preventDefault();
      const rect=canvas.getBoundingClientRect();
      const wx=e.clientX-rect.left+this.cam.x;
      const wy=e.clientY-rect.top +this.cam.y;
      if(e.button===2){
        this._erasing=true;
        this._eraseAt(wx,wy);
      } else if(e.button===0){
        this._drawing=true;
        this._drawStart={x:wx,y:wy};
        this._drawEnd  ={x:wx,y:wy};
      }
    });

    window.addEventListener('mousemove',e=>{
      if(this.state!=='playing') return;
      const rect=canvas.getBoundingClientRect();
      const wx=e.clientX-rect.left+this.cam.x;
      const wy=e.clientY-rect.top +this.cam.y;
      if(this._drawing)  this._drawEnd={x:wx,y:wy};
      if(this._erasing)  this._eraseAt(wx,wy);
    });

    window.addEventListener('mouseup',e=>{
      if(e.button===2){ this._erasing=false; }
      else if(e.button===0&&this._drawing){
        this._drawing=false;
        this._finalizeDraw();
      }
    });

    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }

  // ── Ctrl+Z undo — point 29; M key mute — 74; Esc pause — 86; Space start — 87 ──
  _setupKeyBindings(){
    window.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){
        this._undoDraw(); e.preventDefault();
      }
      if(e.code==='KeyM'&&!e.ctrlKey&&!e.metaKey){
        this._toggleMute();
      }
      // 86 — pause toggle
      if(e.code==='Escape'){
        e.preventDefault();
        if(this.state==='playing') this._togglePause();
        else if(this.state==='paused') this._togglePause();
      }
      // 87 — Space on start screen
      if(e.code==='Space'&&this.state==='start'){
        e.preventDefault();
        this._showLevelSelect();
      }
    });
  }

  _toggleMute(){
    const muted=sfx?.toggle()??false;
    const btn=document.getElementById('mute-btn');
    if(btn){ btn.textContent=muted?'🔇':'🔊'; btn.classList.toggle('muted',muted); }
  }

  // 86 — pause / resume
  _togglePause(){
    if(this.state==='playing'){
      this.state='paused';
      sfx?.stopBG();
      this._screen('screen-pause');
    } else if(this.state==='paused'){
      this._unpause();
    }
  }
  _unpause(){
    this.state='playing';
    sfx?.startBG();
    this._screen(null);
  }

  _applyDpad(){
    document.getElementById('dpad').classList.toggle('visible', this._dpadOn);
    document.getElementById('tog-dpad-on') .classList.toggle('active', this._dpadOn);
    document.getElementById('tog-dpad-off').classList.toggle('active', !this._dpadOn);
  }

  // 91 — wipe all drawn platforms
  _clearAllPlats(){
    this.drawnPlatforms=[];
    this._undoStack=[];
    this._inkUsed=0;
    this._updateDrawHUD();
  }

  // 90 — mobile d-pad: inject virtual keys
  _setupDpad(){
    const map={
      'dp-left' :['ArrowLeft'],
      'dp-right':['ArrowRight'],
      'dp-jump' :['Space'],
      'dp-dash' :['KeyX'],
    };
    Object.entries(map).forEach(([id,codes])=>{
      const el=document.getElementById(id);
      if(!el) return;
      const down=e=>{
        e.preventDefault();
        el.classList.add('active');
        codes.forEach(c=>this.inp.vdown(c));
      };
      const up=e=>{
        el.classList.remove('active');
        codes.forEach(c=>this.inp.vup(c));
      };
      el.addEventListener('pointerdown',down);
      el.addEventListener('pointerup',  up);
      el.addEventListener('pointerleave',up);
      el.addEventListener('pointercancel',up);
    });
  }

  // 85 — touch drawing support
  _setupTouchDrawing(){
    const canvas=this.canvas;
    const getWorld=touch=>{
      const rect=canvas.getBoundingClientRect();
      return {x:touch.clientX-rect.left+this.cam.x, y:touch.clientY-rect.top+this.cam.y};
    };
    canvas.addEventListener('touchstart',e=>{
      if(this.state!=='playing') return;
      // only if touch starts on canvas and not on d-pad zone
      const touch=e.changedTouches[0];
      const rect=canvas.getBoundingClientRect();
      if(touch.clientY<rect.top||touch.clientX<rect.left||touch.clientX>rect.right) return;
      e.preventDefault();
      const w=getWorld(touch);
      this._drawing=true;
      this._drawStart={x:w.x,y:w.y};
      this._drawEnd  ={x:w.x,y:w.y};
    },{passive:false});
    canvas.addEventListener('touchmove',e=>{
      if(!this._drawing) return;
      e.preventDefault();
      const w=getWorld(e.changedTouches[0]);
      this._drawEnd={x:w.x,y:w.y};
    },{passive:false});
    canvas.addEventListener('touchend',e=>{
      if(!this._drawing) return;
      e.preventDefault();
      this._drawing=false;
      this._finalizeDraw();
    },{passive:false});
  }

  // ── point 23: finalize drawn platform ──
  _finalizeDraw(){
    const s=this._drawStart, e=this._drawEnd;
    if(!s||!e) return;
    const len=Math.hypot(e.x-s.x, e.y-s.y);
    const inkCap=INK_MAX*DIFF_MODES[this._difficulty].inkMult;
    if(len<DRAW_MIN) return;                          // point 24: min length
    if(this._inkUsed+len>inkCap) return;              // point 28: ink limit
    if(this.drawnPlatforms.length>=DRAW_MAX) return;  // point 32: max platforms

    const dp=new DrawnPlatform(s.x,s.y,e.x,e.y,this._drawColor);
    this.drawnPlatforms.push(dp);
    this._undoStack.push(dp);
    this._inkUsed+=dp.length;
    this._updateDrawHUD();
  }

  // ── point 27: erase by right-click ──
  _eraseAt(wx,wy){
    const before=this.drawnPlatforms.length;
    this.drawnPlatforms=this.drawnPlatforms.filter(dp=>{
      const cx=dp.x+dp.w/2, cy=dp.y+dp.h/2;
      if(Math.hypot(wx-cx,wy-cy)<dp.w/2+25){
        this._inkUsed=Math.max(0,this._inkUsed-dp.length);
        this._undoStack=this._undoStack.filter(u=>u!==dp);
        return false;
      }
      return true;
    });
    if(this.drawnPlatforms.length!==before) this._updateDrawHUD();
  }

  // ── point 29: undo last drawn platform ──
  _undoDraw(){
    if(!this._undoStack.length) return;
    const last=this._undoStack.pop();
    this.drawnPlatforms=this.drawnPlatforms.filter(d=>d!==last);
    this._inkUsed=Math.max(0,this._inkUsed-last.length);
    this._updateDrawHUD();
  }

  _updateDrawHUD(){
    const inkCap=INK_MAX*DIFF_MODES[this._difficulty].inkMult;
    const pct=Math.max(0,1-this._inkUsed/inkCap);
    document.getElementById('ink-fill').style.width=(pct*100)+'%';
    document.getElementById('ink-fill').style.background=
      pct>0.5?'linear-gradient(to right,#8040ff,#c080ff)':
      pct>0.2?'linear-gradient(to right,#ff8000,#ffcc00)':
              'linear-gradient(to right,#ff2020,#ff6060)';
    document.getElementById('pc').textContent=this.drawnPlatforms.length;
  }

  _screen(id){
    ['screen-start','screen-over','screen-clear','screen-allclear','screen-levelselect','screen-pause','screen-settings']
      .forEach(s=>document.getElementById(s).style.display='none');
    if(id) document.getElementById(id).style.display='flex';
  }

  // ── Level select screen (feature 65) ──
  _showLevelSelect(){
    // Build level cards
    const container=document.getElementById('level-cards');
    container.innerHTML='';
    LEVELS.forEach((lv,i)=>{
      const unlocked=i===0||localStorage.getItem(`nr_cleared_${i-1}`)===`1`;
      const stars=parseInt(localStorage.getItem(`nr_stars_${i}`)||'0');
      const best=this._getBest(i);
      const card=document.createElement('div');
      card.className='level-card'+(unlocked?'':' locked');
      card.innerHTML=`<div class="lc-num">${i+1}</div>`+
        `<div class="lc-name">${lv.name}</div>`+
        `<div class="lc-stars">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`+
        `<div class="lc-time">${isFinite(best)?this._fmtTime(best):'--:--'}</div>`+
        (unlocked?'':`<div class="lc-lock">🔒</div>`);
      if(unlocked){
        card.addEventListener('click',()=>{
          this.lives=3; this.score=0; this.coins=0;
          this._loadLevel(i,false);
        });
      }
      container.appendChild(card);
    });
    this._screen('screen-levelselect');
  }

  _settBack(){
    if(this._settFrom==='playing') this._unpause();
    else this._showLevelSelect();
  }

  _showSettings(){
    this._settFrom=this.state;
    if(this.state==='playing'){ this.state='paused'; sfx?.stopBG(); }
    // Difficulty
    document.querySelectorAll('.diff-btn[id^="diff-"]').forEach((b,i)=>b.classList.toggle('active',i===this._difficulty));
    // Skin
    this._renderSkinPicker();
    // Accessories
    this._renderAccessoryShop();
    // D-pad
    this._applyDpad();
    // Sound
    const sOn=document.getElementById('sett-sound-on');
    const sOff=document.getElementById('sett-sound-off');
    const syncSound=()=>{
      const m=sfx?.muted??false;
      sOn .classList.toggle('active',!m);
      sOff.classList.toggle('active', m);
    };
    syncSound();
    sOn .onclick=()=>{ if(sfx?.muted) sfx.toggle(); syncSound(); };
    sOff.onclick=()=>{ if(!sfx?.muted) sfx.toggle(); syncSound(); };
    // Diff buttons
    document.querySelectorAll('.diff-btn[id^="diff-"]').forEach((b,i)=>{
      b.onclick=()=>{
        this._difficulty=i;
        localStorage.setItem('nr_diff',i);
        document.querySelectorAll('.diff-btn[id^="diff-"]').forEach((x,j)=>x.classList.toggle('active',j===i));
      };
    });
    // D-pad buttons
    const setDpad=on=>{ this._dpadOn=on; localStorage.setItem('nr_dpad',on?'1':'0'); this._applyDpad(); };
    document.getElementById('tog-dpad-on') .onclick=()=>setDpad(true);
    document.getElementById('tog-dpad-off').onclick=()=>setDpad(false);
    // Trail style buttons
    const trailBtns=document.querySelectorAll('.trail-btn');
    const syncTrail=()=>trailBtns.forEach(b=>b.classList.toggle('active',b.id==='trail-'+this._trailStyle));
    syncTrail();
    trailBtns.forEach(b=>{
      b.onclick=()=>{
        this._trailStyle=b.id.replace('trail-','');
        localStorage.setItem('nr_trail',this._trailStyle);
        syncTrail();
      };
    });
    this._screen('screen-settings');
  }

  _renderSkinPicker(){
    const slots=document.getElementById('skin-slots');
    if(!slots) return;
    slots.innerHTML='';
    const preview=document.getElementById('skin-name-preview');
    // Show current skin name on load
    const curSk=SKINS[this._skin]||SKINS[0];
    if(preview){ preview.textContent=curSk.name; preview.style.color=curSk.col; }

    SKINS.forEach(sk=>{
      const unlocked=sk.unlockLevel<0||localStorage.getItem(`nr_cleared_${sk.unlockLevel}`)===`1`;
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;';

      const dot=document.createElement('div');
      dot.className='skin-dot'+(this._skin===sk.id?' active':'')+(unlocked?'':' skin-locked');
      dot.style.background=unlocked?sk.col:'#2a1a4a';
      dot.style.color=unlocked?sk.col:'#444';
      dot.title=sk.name+(unlocked?'':' — beat level '+(sk.unlockLevel+1)+' to unlock');
      if(!unlocked){ dot.textContent='🔒'; dot.style.fontSize='15px'; }

      const lbl=document.createElement('span');
      lbl.style.cssText=`font-family:Orbitron,monospace;font-size:7px;letter-spacing:.05em;color:${unlocked?sk.col:'#3a2a5a'};`;
      lbl.textContent=sk.name;

      if(unlocked){
        dot.addEventListener('mouseenter',()=>{
          if(preview){ preview.textContent=sk.name; preview.style.color=sk.col; }
        });
        dot.addEventListener('mouseleave',()=>{
          const cur=SKINS[this._skin]||SKINS[0];
          if(preview){ preview.textContent=cur.name; preview.style.color=cur.col; }
        });
        dot.addEventListener('click',()=>{
          this._skin=sk.id;
          localStorage.setItem('nr_skin',sk.id);
          this._renderSkinPicker();
        });
      }
      wrap.appendChild(dot);
      wrap.appendChild(lbl);
      slots.appendChild(wrap);
    });
  }

  _renderAccessoryShop(){
    const slots=document.getElementById('acc-slots');
    const walletEl=document.getElementById('sett-wallet');
    if(!slots) return;
    if(walletEl) walletEl.textContent=`🪙 ${this._wallet}`;
    slots.innerHTML='';
    const owned=JSON.parse(localStorage.getItem('nr_acc_owned')||'[0]');
    ACCESSORIES.forEach(ac=>{
      const isOwned=owned.includes(ac.id);
      const isActive=this._accessory===ac.id;
      const card=document.createElement('div');
      card.className='acc-card'+(isActive?' active':'')+((!isOwned&&ac.price>0)?' acc-locked':'');

      const icon=document.createElement('div');
      icon.className='acc-icon'; icon.textContent=ac.icon;

      const name=document.createElement('div');
      name.className='acc-name'; name.textContent=ac.name;
      name.style.color=ac.col;

      const status=document.createElement('div');
      if(isOwned||ac.price===0){
        status.className='acc-owned'; status.textContent=isActive?'EQUIPPED':'OWNED';
      } else {
        status.className='acc-price'; status.textContent=`🪙 ${ac.price}`;
      }

      card.appendChild(icon); card.appendChild(name); card.appendChild(status);

      card.addEventListener('click',()=>{
        if(isOwned||ac.price===0){
          this._accessory=ac.id;
          localStorage.setItem('nr_acc',ac.id);
          this._renderAccessoryShop();
        } else if(this._wallet>=ac.price){
          this._wallet-=ac.price;
          localStorage.setItem('nr_wallet',this._wallet);
          const upd=JSON.parse(localStorage.getItem('nr_acc_owned')||'[0]');
          upd.push(ac.id);
          localStorage.setItem('nr_acc_owned',JSON.stringify(upd));
          this._accessory=ac.id;
          localStorage.setItem('nr_acc',ac.id);
          this._renderAccessoryShop();
        }
      });
      slots.appendChild(card);
    });
  }

  _hud(){
    document.getElementById('h-score').textContent=this.score;
    document.getElementById('h-level').textContent=this.lvIdx+1;
    document.getElementById('h-lives').textContent='♥'.repeat(Math.max(0,this.lives));
    const total=this.coinObjs?this.coinObjs.length:0;
    document.getElementById('h-coins').textContent=`${this.coins}/${total}`;
  }

  _loadLevel(idx,reset){
    if(reset){ this.lives=3;this.score=0;this.coins=0; }
    this.lvIdx=idx%LEVELS.length;
    const lv=LEVELS[this.lvIdx];
    this.lvData=lv;
    this.cam.lvW=lv.lvW; this.cam.lvH=lv.lvH;
    // center narrow levels from the first frame
    this.cam.x=lv.lvW<=this.cam.vw?(lv.lvW-this.cam.vw)/2:Math.max(0,lv.spX-this.cam.vw/2);
    this.cam.y=Math.max(0,lv.spY-this.cam.vh*.65);

    const diff=DIFF_MODES[this._difficulty];

    this.platforms=lv.plats.map(p=>new Platform(
      p.x,p.y,p.w,p.h,
      {type:p.type,color:p.color,glowCol:p.glowCol,
       moveAxis:p.moveAxis,moveDist:p.moveDist,moveSpd:p.moveSpd,
       conveyorDir:p.conveyorDir,conveyorSpd:p.conveyorSpd,disappearOff:p.disappearOff}
    ));

    // Feature 67: procedural — randomize platform X positions ±38px each run
    for(let i=0;i<lv.plats.length;i++){
      const p=this.platforms[i];
      const shift=Math.round((Math.random()-.5)*76);
      const nx=Math.max(20,Math.min(lv.lvW-p.w-20,p.x+shift));
      p.x=nx; p._sx=nx;
    }

    // Feature 66 (Easy): add extra bridge platforms
    if(diff.extraPlats&&lv.platsEasy){
      lv.platsEasy.forEach(p=>this.platforms.push(new Platform(p.x,p.y,p.w,p.h,{type:'solid',color:'#304080',glowCol:'#5080ff'})));
    }

    // point 14: world floor — lava levels have no solid floor (player falls into lava)
    if(!lv.lava){
      this.platforms.push(new Platform(0,lv.lvH-28,lv.lvW,28,
        {type:'solid',color:'#3020a0',glowCol:'#7060ff'}));
    }

    this.coinObjs=lv.coins.map(c=>new Coin(c.x,c.y,c.t));
    this.spikes=(lv.spikes||[]).map(s=>new Spike(s.x,s.y,s.w));
    this.enemies=(lv.enemies||[]).map(e=>new Enemy(e.x,e.y,e.pL,e.pR,e.type));
    // Feature 66 (difficulty): scale enemy speed
    this.enemies.forEach(e=>{ e.spd=Math.max(18,Math.round(e.spd*diff.enemyMult)); e.vx=e.spd; });
    this.windZones=(lv.windZones||[]).map(z=>new WindZone(z.x,z.y,z.w,z.h,z.dir,z.force));
    this.projectiles=[];
    // Feature 63: checkpoints — only keep flags that stand on a NON-moving block,
    // so respawning never drops the player into the void (moving/vanishing blocks
    // won't be where the flag was when you come back).
    this.checkpointObjs=lv.lava?[]:(lv.checkpoints||[])
      .map(c=>new CheckPoint(c.x,c.y))
      .filter(cp=>this._cpHasStableGround(cp));
    this._cpX=lv.spX; this._cpY=lv.spY; this._cpFlash=0;
    this.player=new Player(lv.spX,lv.spY);
    this.player.invT=1.2;
    this.particles=[];
    this._deathTimer=0;
    // clear drawing state on level load
    this.drawnPlatforms=[];this._undoStack=[];this._inkUsed=0;
    this._goalReached=false; this._winMsgTimer=0;
    // reset timer, combo, per-level coin count (points 52-53)
    this._levelTime=0; this._combo=0; this._comboTimer=0; this._comboFloats=[];
    this._lvCoins=0;
    // Feature 66: difficulty modifies rock interval
    this.rocks=[]; this._rockTimer=(lv.rockInterval||2.5)*diff.rockMult*.6;
    this._nextRockX=lv.lvW*.25+Math.random()*lv.lvW*.5;
    this._updateDrawHUD();
    this._screen(null);
    this.state='playing';
    document.getElementById('draw-hud').classList.add('visible');
    document.getElementById('undo-hint').classList.add('visible');
    document.getElementById('ctrl-hud').classList.add('visible');
    this._hud();
    sfx?.startBG();
  }

  // A checkpoint is valid only if a stable (non-moving, non-vanishing) block sits
  // directly under its base — otherwise respawning there would drop the player.
  _cpHasStableGround(cp){
    const UNSTABLE=new Set(['moving','crumble','disappear','shrink']);
    const baseY=cp.bottom; // flag pole base = ground level
    for(const p of this.platforms){
      if(UNSTABLE.has(p.type)) continue;
      if(cp.cx>=p.x-6&&cp.cx<=p.right+6&&p.y>=baseY-12&&p.y<=baseY+100) return true;
    }
    return false;
  }

  // point 26: clear drawn platforms on death; respawn at last checkpoint (feature 63)
  _respawn(){
    const lv=this.lvData;
    this.player=new Player(this._cpX,this._cpY);
    this.player.invT=1.8;
    this._deathTimer=0;
    this.drawnPlatforms=[];this._undoStack=[];this._inkUsed=0;
    // timer resets on respawn (point 53), combo breaks, level coin count too
    this._levelTime=0; this._combo=0; this._comboTimer=0; this._comboFloats=[];
    this._lvCoins=0;
    this._cpFlash=0;
    const _diff=DIFF_MODES[this._difficulty];
    this.rocks=[]; this._rockTimer=(this.lvData.rockInterval||2.5)*_diff.rockMult*.6;
    this._nextRockX=this.lvData.lvW*.25+Math.random()*this.lvData.lvW*.5;
    this.enemies.forEach(e=>e.reset()); this.projectiles=[];
    // restore all coins so they can be re-collected after respawn
    if(this.coinObjs) this.coinObjs.forEach(c=>c.collected=false);
    this._updateDrawHUD();
  }

  _hitGoal(){
    const p=this.player,g=this.lvData.goal;
    return p.x<g.x+g.w&&p.right>g.x&&p.y<g.y+g.h&&p.bottom>g.y;
  }

  update(dt){
    if(this.state==='paused') return;
    if(this.state!=='playing') return;
    dt=Math.min(dt,.05);
    this._goalPulse+=dt*2.2;
    this.cam.updateShake(dt);
    // 78 coin sparks, 79 confetti, 80 death flash
    this._coinSparks=this._coinSparks.filter(s=>{ s.life-=dt; return s.life>0; });
    this._confetti=this._confetti.filter(c=>{ c.life-=dt; return c.life>0; });
    if(this._deathFlash>0) this._deathFlash-=dt;

    // speedrun timer — ticks while alive, stops when goal reached (point 53)
    if(!this._goalReached) this._levelTime+=dt;

    // combo decay — break chain if player takes too long (point 52)
    if(this._comboTimer>0){
      this._comboTimer-=dt;
      if(this._comboTimer<=0){ this._combo=0; }
    }
    // animate combo floats
    this._comboFloats.forEach(f=>f.life-=dt);
    this._comboFloats=this._comboFloats.filter(f=>f.life>0);

    this.platforms.forEach(p=>p.update(dt));

    // point 31: update & expire drawn platforms
    this.drawnPlatforms=this.drawnPlatforms.filter(dp=>{
      const alive=dp.update(dt);
      if(!alive) this._inkUsed=Math.max(0,this._inkUsed-dp.length);
      return alive;
    });

    if(this._deathTimer>0){
      this._deathTimer-=dt;
      if(this._deathTimer<=0) this._respawn();
      this.particles.forEach(p=>p.update(dt));
      this.particles=this.particles.filter(p=>p.alive);
      this.inp.flush(); return;
    }

    if(this.player){
      const allPlatforms=[...this.platforms,...this.drawnPlatforms];
      this.player.update(dt,this.inp,allPlatforms,this.particles,this.lvData.lvW);
      this.cam.follow(this.player.cx,this.player.cy,this.player.vx,this.player.vy,dt);

      if(this.player.y>this.lvData.lvH+400&&!this.player.dead) this._die();
      // point 20-22: goal touch → door turns green + "DOOR REACHED!" → level clear
      if(!this.player.dead&&this._hitGoal()&&!this._goalReached){
        this._goalReached=true; this._winMsgTimer=1.6;
        sfx?.win(); sfx?.stopBG();
        // 79 — win confetti burst
        const g=this.lvData.goal;
        const confCols=['#ffd700','#ff60cc','#60d8ff','#80ff80','#ff9040','#c080ff','#ffffff'];
        for(let i=0;i<80;i++){
          const a=Math.random()*Math.PI*2, sp=180+Math.random()*320;
          const col=confCols[i%confCols.length];
          this._confetti.push({
            wx:g.x+g.w/2+(Math.random()-.5)*g.w, wy:g.y+g.h/2,
            vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-120,
            life:1.4+Math.random()*.8, maxLife:1.4+Math.random()*.8,
            col, r:2.5+Math.random()*3.5
          });
        }
        // Shake on win
        this.cam.shake(7,.35);
        setTimeout(()=>this._levelClear(), 1600);
      }
      if(this._winMsgTimer>0) this._winMsgTimer-=dt;

      const t=performance.now()/1000;
      for(const c of this.coinObjs){
        if(c.test(this.player.cx,this.player.cy,this.player.w,this.player.h,t)){
          c.collected=true; this.coins++;
          this._wallet+=c.type==='gem'?5:c.type==='secret'?20:1;
          localStorage.setItem('nr_wallet',this._wallet);
          sfx?.coin(c.type);
          // 78 — coin sparkle ring
          const scol=c.type==='secret'?'#e0c0ff':c.type==='gem'?'#00ffcc':'#ffd700';
          this._coinSparks.push({wx:c.wx,wy:c.wy_anim(t),life:0.55,maxLife:0.55,color:scol});

          // combo multiplier (point 52)
          this._combo++; this._comboTimer=2.8; this._lvCoins++;
          const mult=Math.floor((this._combo-1)/3)+1;  // every 3 coins raises tier
          const earned=c.value*mult;
          this.score+=earned;
          this._hud();

          // particle burst
          const pcol=c.type==='secret'?'#e0c0ff':c.type==='gem'?'#00ffcc':'#ffd700';
          const pn=c.type==='secret'?20:12;
          for(let i=0;i<pn;i++){
            const a=Math.random()*Math.PI*2;
            this.particles.push(new Particle(c.wx,c.wy,
              Math.cos(a)*(c.type==='secret'?160:120),Math.sin(a)*120-40,pcol,.36+Math.random()*.18,3));
          }

          // combo float text (point 52) — show if mult>1 or secret
          if(mult>1||c.secret){
            const label=c.secret?`SECRET! +${earned}`:`×${mult}  +${earned}`;
            const col=c.secret?'#e0c0ff':mult>=3?'#ff9020':'#ffd700';
            this._comboFloats.push({text:label,wx:c.wx,wy:c.wy-12,life:1.4,maxLife:1.4,col});
          }
        }
      }

      // Feature 63: checkpoint detection
      for(const cp of this.checkpointObjs){
        if(cp.test(this.player)){
          cp.triggered=true;
          this._cpX=cp.cx-this.player.w/2;
          this._cpY=cp.bottom-this.player.h;
          this._cpFlash=1.6;
          for(let i=0;i<20;i++){
            const a=Math.random()*Math.PI*2;
            this.particles.push(new Particle(cp.cx,cp.y+cp.h*.5,Math.cos(a)*120,Math.sin(a)*110-20,'#00ff88',.45+Math.random()*.2,3));
          }
        }
      }
      if(this._cpFlash>0) this._cpFlash-=dt;
    }

    // ── Enemies / projectiles / spikes / wind / lava ──
    if(this._deathTimer<=0){
      this.enemies.forEach(e=>e.update(dt,this.projectiles));
      const _ap=[...this.platforms,...this.drawnPlatforms];
      this.projectiles=this.projectiles.filter(proj=>{
        proj.update(dt,_ap,this.lvData.lvW);
        if(!proj.alive) return false;
        if(this.player&&!this.player.dead&&this.player.invT<=0&&proj.hitPlayer(this.player)){
          for(let i=0;i<10;i++){
            const a=Math.random()*Math.PI*2;
            this.particles.push(new Particle(proj.x,proj.y,Math.cos(a)*90,Math.sin(a)*90,'#ff6600',.35,3));
          }
          this._die(); return false;
        }
        return true;
      });
      this.windZones.forEach(z=>z.update(dt));
      if(this.player&&!this.player.dead){
        for(const z of this.windZones){
          if(z.contains(this.player.cx,this.player.cy)){
            this.player.vx+=z.dir*z.force*dt;
            this.player.vx=Math.max(-SPRINT_SPD*1.8,Math.min(SPRINT_SPD*1.8,this.player.vx));
          }
        }
        if(this.player.invT<=0){
          for(const sp of this.spikes){
            if(sp.hitPlayer(this.player)){ this._die(); break; }
          }
          if(!this.player.dead){
            for(const e of this.enemies){
              if(e.hitPlayer(this.player)){
                for(let i=0;i<12;i++){
                  const a=Math.random()*Math.PI*2;
                  this.particles.push(new Particle(e.cx,e.cy,Math.cos(a)*110,Math.sin(a)*110,'#ff3355',.4,3.5));
                }
                this._die(); break;
              }
            }
          }
          if(!this.player.dead&&this.lvData.lava&&this.player.bottom>=this.lvData.lvH-72){
            this._die();
          }
        }
      }
    }

    // ── Falling rocks ──
    if(!this._goalReached&&this._deathTimer<=0){
      this._rockTimer-=dt;
      if(this._rockTimer<=0){
        this.rocks.push(new FallingRock(this._nextRockX,this.cam.y-30));
        const iv=(this.lvData.rockInterval||2.5)+Math.random()*1.0;
        this._rockTimer=iv;
        const nx=this.cam.x+30+Math.random()*Math.max(40,this.cam.vw-60);
        this._nextRockX=Math.max(30,Math.min(this.lvData.lvW-30,nx));
      }
    }
    const _allP=[...this.platforms,...this.drawnPlatforms];
    this.rocks=this.rocks.filter(rock=>{
      rock.update(dt,_allP);
      if(!rock.alive){
        for(let i=0;i<8;i++){
          const a=Math.random()*Math.PI*2;
          this.particles.push(new Particle(rock.x,rock.y,Math.cos(a)*90,Math.sin(a)*90-20,'#cc8844',.35,2.5));
        }
        return false;
      }
      if(rock.y>this.lvData.lvH+100) return false;
      if(this.player&&!this.player.dead&&this.player.invT<=0&&rock.hitPlayer(this.player)){
        for(let i=0;i<14;i++){
          const a=Math.random()*Math.PI*2;
          this.particles.push(new Particle(rock.x,rock.y,Math.cos(a)*130,Math.sin(a)*130-30,'#ff7733',.48,3.5));
        }
        this._die(); return false;
      }
      return true;
    });

    this.particles.forEach(p=>p.update(dt));
    this.particles=this.particles.filter(p=>p.alive);
    this._updateDrawHUD();
    this.inp.flush();
  }

  _die(){
    this.lives--;this._hud();
    const pl=this.player;
    for(let i=0;i<22;i++){
      const a=Math.random()*Math.PI*2,sp=150+Math.random()*200;
      this.particles.push(new Particle(pl.cx,pl.cy,Math.cos(a)*sp,Math.sin(a)*sp,'#ff50a0',.5+Math.random()*.3,4));
    }
    // 80 — death flash; 75 — death shake
    this._deathFlash=0.55;
    this.cam.shake(13,.3);
    this.player.dead=true;
    if(this.lives<=0){
      this.state='gameover';
      sfx?.stopBG();
      document.getElementById('over-msg').textContent=`Score: ${this.score}  |  Coins: ${this.coins}`;
      setTimeout(()=>this._screen('screen-over'),900);
    } else {
      this._deathTimer=0.75;
    }
  }

  _levelClear(){
    this.state='levelup';
    const time=this._levelTime;
    const total=this.coinObjs.length;
    const stars=this._calcStars(this.lvIdx,time,this._lvCoins||0,total);
    const prevBest=this._getBest(this.lvIdx);
    this._saveBest(this.lvIdx,time);          // point 54
    // Save stars and cleared flag (features 65, 68)
    const prevStars=parseInt(localStorage.getItem(`nr_stars_${this.lvIdx}`)||'0');
    if(stars>prevStars) localStorage.setItem(`nr_stars_${this.lvIdx}`,stars);
    const firstClear=localStorage.getItem(`nr_cleared_${this.lvIdx}`)!=='1';
    localStorage.setItem(`nr_cleared_${this.lvIdx}`,'1');
    // Check skin unlock
    const newSkin=SKINS.find(s=>s.unlockLevel===this.lvIdx);
    const skinUnlockMsg=firstClear&&newSkin?`<br><span style="color:#${newSkin.col.slice(1)}">★ Skin unlocked: ${newSkin.name}!</span>`:'';
    const isNewBest=time<prevBest;
    const timeStr=this._fmtTime(time);
    const bestStr=isNewBest?'NEW BEST!':this._fmtTime(prevBest);
    const starStr='★'.repeat(stars)+'☆'.repeat(3-stars);

    const last=this.lvIdx>=LEVELS.length-1;
    if(last){
      document.getElementById('allclear-msg').innerHTML=
        `<span style="font-size:1.6em;letter-spacing:4px">${starStr}</span><br>`+
        `Time: ${timeStr} &nbsp; Best: ${bestStr}<br>`+
        `Score: ${this.score} &nbsp; Coins: ${this._lvCoins||0}/${total}`+
        skinUnlockMsg;
      this._screen('screen-allclear');
    } else {
      document.getElementById('clear-msg').innerHTML=
        `<span style="font-size:1.6em;letter-spacing:4px">${starStr}</span><br>`+
        `Time: ${timeStr} &nbsp; ${isNewBest?'🏅 NEW BEST!':'Best: '+bestStr}<br>`+
        `Score: ${this.score} &nbsp; Coins: ${this._lvCoins||0}/${total}`+
        skinUnlockMsg;
      this._screen('screen-clear');
    }
  }

  draw(ts){
    const ctx=this.ctx,cam=this.cam;
    const t=ts/1000;
    const W=this.canvas.width,H=this.canvas.height;
    const lv=this.lvData||LEVELS[0];

    // background
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,lv.bg[0]);bg.addColorStop(1,lv.bg[1]);
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

    // stars
    for(const s of STARS){
      const sx=((s.x*4000-cam.x*.11)%W+W)%W;
      const sy=((s.y*2000-cam.y*.06)%H+H)%H;
      const tw=.6+.4*Math.sin(t*s.sp+s.ph);
      ctx.save();ctx.globalAlpha=s.a*tw;ctx.fillStyle='#dcc8ff';
      ctx.shadowColor='#b090e0';ctx.shadowBlur=s.r*2;
      ctx.beginPath();ctx.arc(sx,sy,s.r,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }

    // point 15: guide lines every screen height
    if(this.lvData){
      ctx.save();
      ctx.strokeStyle='rgba(140,90,255,.10)';
      ctx.lineWidth=1;ctx.setLineDash([8,14]);
      const firstLine=Math.ceil(cam.y/H)*H;
      for(let wy=firstLine;wy<cam.y+H;wy+=H){
        const sy=wy-cam.y;
        if(sy>0&&sy<H){
          ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(W,sy);ctx.stroke();
        }
      }
      ctx.setLineDash([]);ctx.restore();
    }

    // ── Lava at world bottom ──
    if(this.lvData?.lava){
      const lavaY=this.lvData.lvH-80;
      const ls=cam.scr(0,lavaY);
      if(ls.y<H+60){
        ctx.save();
        const lg=ctx.createLinearGradient(0,ls.y,0,ls.y+80);
        lg.addColorStop(0,`rgba(255,${60+Math.sin(t*3)*18|0},0,.95)`);
        lg.addColorStop(1,'rgba(55,0,0,1)');
        ctx.fillStyle=lg; ctx.shadowColor='#ff4400'; ctx.shadowBlur=32;
        ctx.fillRect(0,ls.y,W,Math.max(80,H-ls.y+80));
        ctx.fillStyle=`rgba(255,${90+Math.sin(t*4.2)*35|0},0,.88)`;
        ctx.shadowBlur=20;
        ctx.beginPath(); ctx.moveTo(0,ls.y+8);
        for(let wx=0;wx<=W;wx+=18){
          const wv=Math.sin((wx/38)+t*2.8)*7+Math.sin((wx/22)+t*2)*4;
          ctx.lineTo(wx,ls.y+wv);
        }
        ctx.lineTo(W,ls.y+28); ctx.lineTo(0,ls.y+28); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    this.platforms.forEach(p=>p.draw(ctx,cam));
    this.drawnPlatforms.forEach(dp=>dp.draw(ctx,cam));
    this.checkpointObjs.forEach(cp=>cp.draw(ctx,cam,t));
    this.windZones.forEach(z=>z.draw(ctx,cam));
    this.spikes.forEach(s=>s.draw(ctx,cam));
    this.rocks.forEach(r=>r.draw(ctx,cam));
    this.enemies.forEach(e=>e.draw(ctx,cam));
    this.projectiles.forEach(p=>p.draw(ctx,cam));

    // ── point 25: dashed preview while drawing ──
    if(this._drawing&&this._drawStart&&this._drawEnd){
      const s1=cam.scr(this._drawStart.x,this._drawStart.y);
      const s2=cam.scr(this._drawEnd.x,  this._drawEnd.y);
      const len=Math.hypot(this._drawEnd.x-this._drawStart.x, this._drawEnd.y-this._drawStart.y);
      const inkLeft=INK_MAX-this._inkUsed;
      const canPlace=len>=DRAW_MIN&&len<=inkLeft&&this.drawnPlatforms.length<DRAW_MAX;
      const col=canPlace?this._drawColor:'#666688';
      ctx.save();
      // dashed line
      ctx.strokeStyle=col;ctx.lineWidth=2;
      ctx.setLineDash([8,6]);ctx.globalAlpha=.7;
      ctx.shadowColor=col;ctx.shadowBlur=canPlace?8:0;
      ctx.beginPath();ctx.moveTo(s1.x,s1.y);ctx.lineTo(s2.x,s2.y);ctx.stroke();
      ctx.setLineDash([]);
      // platform preview (horizontal band)
      if(canPlace&&Math.abs(s2.x-s1.x)>DRAW_MIN*.5){
        const midY=(s1.y+s2.y)/2;
        ctx.globalAlpha=.28;ctx.fillStyle=col;ctx.shadowBlur=0;
        ctx.fillRect(Math.min(s1.x,s2.x),midY-6,Math.abs(s2.x-s1.x),12);
      }
      ctx.restore();
    }

    this._drawGoal(ctx,cam,t);
    this.coinObjs.forEach(c=>c.draw(ctx,cam,t));

    // 78 — coin sparkle rings
    this._coinSparks.forEach(s=>{
      const pct=s.life/s.maxLife;
      const sp=cam.scr(s.wx,s.wy);
      const r=18+22*(1-pct);
      ctx.save();
      ctx.strokeStyle=s.color;
      ctx.globalAlpha=pct*.85;
      ctx.lineWidth=2.5*pct;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,r,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=pct*.45;
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sp.x,sp.y,r*.6,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    });

    this.particles.forEach(p=>p.draw(ctx,cam));

    // 82 — player shadow (faint ellipse showing height above platform)
    if(this.player){
      const pl=this.player;
      const allPlats=[...this.platforms,...(this.drawnPlatforms||[])];
      let nearestDist=Infinity;
      allPlats.forEach(p=>{
        const dist=p.y-pl.bottom;
        if(pl.cx>=p.x&&pl.cx<=p.x+p.w&&dist>0&&dist<nearestDist) nearestDist=dist;
      });
      if(nearestDist<320){
        const shadowY=pl.bottom+nearestDist;
        const sp=cam.scr(pl.cx,shadowY);
        const fade=1-nearestDist/320;
        ctx.save();
        ctx.globalAlpha=0.38*fade;
        ctx.fillStyle='#000';
        ctx.beginPath();
        ctx.ellipse(sp.x,sp.y,18*fade+4,5*fade+2,0,0,Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }

    if(this.player) this.player.draw(ctx,cam);

    // 79 — confetti draw + gravity physics
    {
      const cdt=1/60;
      this._confetti.forEach(c=>{
        c.wx+=c.vx*cdt; c.wy+=c.vy*cdt; c.vx*=0.985; c.vy+=200*cdt;
        const sp=cam.scr(c.wx,c.wy);
        const pct=c.life/c.maxLife;
        ctx.save();
        ctx.globalAlpha=Math.min(1,pct*2)*.9;
        ctx.fillStyle=c.col;
        ctx.translate(sp.x,sp.y);
        ctx.rotate(c.wx*.04+c.wy*.02);
        ctx.fillRect(-c.r,-c.r*.5,c.r*2,c.r);
        ctx.restore();
      });
    }

    // 80 — death flash full-screen red overlay
    if(this._deathFlash>0){
      ctx.save();
      ctx.globalAlpha=Math.min(1,this._deathFlash)*0.7;
      ctx.fillStyle='#ff1020';
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // level name
    ctx.save();
    ctx.font='bold 10px Orbitron,monospace';
    ctx.fillStyle='rgba(140,90,255,.4)';
    ctx.textAlign='right';ctx.textBaseline='top';
    ctx.fillText(lv.name,W-8,52);
    ctx.restore();

    // 83 — height meter (top-left, 0m at bottom → ~1000m at top)
    if(this.player&&this.state==='playing'){
      const maxWH=this.lvData.lvH;
      const meters=Math.max(0,Math.min(9999,Math.round((maxWH-this.player.bottom)/maxWH*1000)));
      const BAR_H=80, BAR_W=6, bx=8, by=88;
      const frac=meters/1000;
      ctx.save();
      // bar background
      ctx.globalAlpha=.5;
      ctx.fillStyle='rgba(60,20,120,.55)';
      ctx.fillRect(bx-1,by-1,BAR_W+2,BAR_H+2);
      // bar fill
      ctx.globalAlpha=.9;
      const barGrad=ctx.createLinearGradient(0,by+BAR_H,0,by);
      barGrad.addColorStop(0,'#8040ff');
      barGrad.addColorStop(1,'#00ffcc');
      ctx.fillStyle=barGrad;
      ctx.fillRect(bx,by+BAR_H*(1-frac),BAR_W,BAR_H*frac);
      // text
      ctx.globalAlpha=.85;
      ctx.font='bold 9px Orbitron,monospace';
      ctx.fillStyle='#b090ff';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.shadowColor='#8040ff'; ctx.shadowBlur=6;
      ctx.fillText(meters+'m',bx+BAR_W+4,by+BAR_H/2-5);
      ctx.restore();
    }

    // 89 — minimap (bottom-right corner)
    if(this.lvData&&(this.state==='playing'||this.state==='paused')){
      const MM_W=90, MM_H=60, MM_PAD=8;
      const mx=W-MM_W-MM_PAD, my=H-MM_H-MM_PAD;
      const lvW=this.lvData.lvW, lvH=this.lvData.lvH;
      const sx=v=>mx+v/lvW*MM_W, sy=v=>my+v/lvH*MM_H;
      ctx.save();
      // background
      ctx.globalAlpha=.68;
      ctx.fillStyle='rgba(4,2,16,.82)';
      ctx.strokeStyle='rgba(130,60,220,.45)'; ctx.lineWidth=1;
      ctx.fillRect(mx-2,my-2,MM_W+4,MM_H+4);
      ctx.strokeRect(mx-2,my-2,MM_W+4,MM_H+4);
      // camera viewport rect
      ctx.globalAlpha=.2;
      ctx.fillStyle='rgba(160,100,255,.35)';
      ctx.fillRect(sx(this.cam.x),sy(this.cam.y),this.cam.vw/lvW*MM_W,this.cam.vh/lvH*MM_H);
      // platforms
      ctx.globalAlpha=.6;
      ctx.fillStyle='#7050c0';
      this.platforms.forEach(p=>{
        const pw=Math.max(1,p.w/lvW*MM_W);
        const ph=Math.max(1,p.h/lvH*MM_H);
        ctx.fillRect(sx(p.x),sy(p.y),pw,ph);
      });
      // drawn platforms
      ctx.fillStyle='#c080ff';
      this.drawnPlatforms.forEach(p=>{
        const pw=Math.max(1,p.w/lvW*MM_W);
        ctx.fillRect(sx(p.x),sy(p.y),Math.max(1,pw),2);
      });
      // coins
      ctx.fillStyle='#ffd700';
      this.coinObjs.forEach(c=>{
        if(!c.collected) ctx.fillRect(sx(c.wx)-1,sy(c.wy)-1,2,2);
      });
      // goal
      const g=this.lvData.goal;
      ctx.fillStyle=this._goalReached?'#00ff88':'#ffd700';
      ctx.fillRect(sx(g.x),sy(g.y),Math.max(2,g.w/lvW*MM_W),Math.max(2,g.h/lvH*MM_H));
      // player dot
      if(this.player){
        ctx.globalAlpha=1;
        ctx.fillStyle='#ffffff';
        ctx.shadowColor='#c080ff'; ctx.shadowBlur=6;
        ctx.beginPath();
        ctx.arc(sx(this.player.cx),sy(this.player.cy),2.5,0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // speedrun timer — centre-top (point 53)
    if(this.state==='playing'&&this.lvData){
      const timeStr=this._fmtTime(this._levelTime);
      const best=this._getBest(this.lvIdx);
      const ahead=isFinite(best)&&this._levelTime<best;
      ctx.save();
      ctx.font='bold 12px Orbitron,monospace';
      ctx.textAlign='center';ctx.textBaseline='top';
      ctx.shadowColor=ahead?'#00ff88':'#c080ff';ctx.shadowBlur=10;
      ctx.fillStyle=ahead?'#80ffbb':'rgba(190,150,255,.85)';
      ctx.fillText(timeStr,W/2,52);
      if(isFinite(best)){
        ctx.font='bold 9px Orbitron,monospace';
        ctx.fillStyle='rgba(140,100,200,.55)';ctx.shadowBlur=0;
        ctx.fillText('BEST '+this._fmtTime(best),W/2,68);
      }
      // combo tier indicator (point 52)
      if(this._comboTimer>0&&this._combo>=3){
        const mult=Math.floor((this._combo-1)/3)+1;
        const fa=Math.min(1,this._comboTimer/.8);
        ctx.save();ctx.globalAlpha=fa;
        ctx.font=`bold ${11+mult}px Orbitron,monospace`;
        ctx.fillStyle='#ffd700';ctx.shadowColor='#ff8800';ctx.shadowBlur=14;
        ctx.textAlign='left';
        ctx.fillText(`×${mult} COMBO`,8,52);
        ctx.restore();
      }
      ctx.restore();
    }

    // combo float texts (point 52)
    for(const f of this._comboFloats){
      const a=f.life/f.maxLife;
      const rise=(1-a)*48;
      const sc=cam.scr(f.wx,f.wy-rise);
      ctx.save();ctx.globalAlpha=a*a;
      ctx.font='bold 13px Orbitron,monospace';
      ctx.fillStyle=f.col||'#ffd700';
      ctx.shadowColor=f.col||'#ff8800';ctx.shadowBlur=16;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.scale(1+.18*(1-a),1+.18*(1-a));
      ctx.fillText(f.text,sc.x/(1+.18*(1-a)),sc.y/(1+.18*(1-a)));
      ctx.restore();
    }

    // ── Rock warning indicator ──
    if(this.state==='playing'&&this._rockTimer<0.75&&this._nextRockX!==null&&!this._goalReached){
      const sx=this._nextRockX-this.cam.x;
      if(sx>10&&sx<W-10&&Math.floor(this._rockTimer*14)%2===0){
        ctx.save();
        ctx.fillStyle='#ff3300'; ctx.shadowColor='#ff3300'; ctx.shadowBlur=20;
        ctx.font='bold 16px monospace'; ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText('▼',sx,52);
        ctx.shadowBlur=0; ctx.globalAlpha=.55;
        ctx.font='bold 9px Orbitron,monospace';
        ctx.fillText('ROCK',sx,70);
        ctx.restore();
      }
    }

    // Checkpoint activated flash
    if(this._cpFlash>0){
      ctx.save();
      ctx.globalAlpha=(this._cpFlash/1.6)*0.22;
      ctx.fillStyle='#00ff88';
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // danger vignette near floor
    if(this.player&&this.lvData){
      const dist=this.lvData.lvH-28-this.player.bottom;
      if(dist<400){
        const d=Math.max(0,(400-dist)/400);
        ctx.save();ctx.globalAlpha=d*.35;
        const vg=ctx.createLinearGradient(0,H*.55,0,H);
        vg.addColorStop(0,'transparent');vg.addColorStop(1,'#ff1100');
        ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
        ctx.restore();
      }
    }
  }

  // points 19-21: draw a proper door, yellow→green on reach
  _drawGoal(ctx,cam,t){
    const g=this.lvData?.goal;
    if(!g||!cam.inView(g.x,g.y-20,g.w,g.h+20)) return;
    const s=cam.scr(g.x,g.y);
    const pulse=(Math.sin(this._goalPulse)+1)/2;
    const reached=this._goalReached;

    // point 21: yellow → green on reach
    const frameH = reached ? 120+Math.sin(t*8)*60 : 48+pulse*12;  // hue
    const frameCol= reached
      ? `hsl(${140+Math.sin(t*5)*15},100%,${55+Math.sin(t*7)*8}%)`
      : `hsl(${frameH},100%,55%)`;
    const glowCol = reached ? '#00ff88' : '#ffd700';
    const glowR   = reached ? 28+Math.sin(t*6)*10 : 16+pulse*10;

    ctx.save();
    const W=g.w, H=g.h, sx=s.x, sy=s.y;

    // ── outer glow ring ──
    ctx.shadowColor=glowCol; ctx.shadowBlur=glowR;

    // ── door frame (thick border) ──
    ctx.strokeStyle=frameCol; ctx.lineWidth=4;
    ctx.strokeRect(sx,sy,W,H);

    const bg=reached?'rgba(0,180,80,.22)':'rgba(100,80,0,.18)';
    ctx.fillStyle=bg; ctx.fillRect(sx+2,sy+2,W-4,H-4);

    const pad=9;
    ctx.shadowBlur=0;
    ctx.strokeStyle=frameCol; ctx.lineWidth=1.8; ctx.globalAlpha=.55;
    ctx.strokeRect(sx+pad,sy+pad,W-pad*2,H-pad*2);
    ctx.globalAlpha=1;

    // ── arch window at top of panel ──
    const archCx=sx+W/2;
    const archCy=sy+pad+(W-pad*2)*0.48;
    const archR =(W-pad*2)*0.42;
    ctx.globalAlpha=.45; ctx.strokeStyle=frameCol; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.arc(archCx,archCy,archR,Math.PI,0);
    ctx.stroke();
    ctx.globalAlpha=reached?.12:.07;
    ctx.fillStyle=glowCol;
    ctx.beginPath(); ctx.arc(archCx,archCy,archR,Math.PI,0); ctx.fill();
    ctx.globalAlpha=1;

    // ── vertical centre line (two-panel door) ──
    ctx.strokeStyle=frameCol; ctx.lineWidth=1.2; ctx.globalAlpha=.35;
    ctx.beginPath();
    ctx.moveTo(sx+W/2, sy+pad+(W-pad*2)*0.96);
    ctx.lineTo(sx+W/2, sy+H-pad);
    ctx.stroke();
    ctx.globalAlpha=1;

    // ── doorknob ──
    ctx.shadowColor=glowCol; ctx.shadowBlur=8;
    ctx.fillStyle=frameCol;
    const knobX=sx+W*.72, knobY=sy+H*.62;
    ctx.beginPath(); ctx.arc(knobX,knobY,3.8,0,Math.PI*2); ctx.fill();
    // knob shine
    ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.arc(knobX-1,knobY-1,1.3,0,Math.PI*2); ctx.fill();

    // ── up arrow (bounces; stops bouncing when reached) ──
    ctx.shadowColor=glowCol; ctx.shadowBlur=reached?14:6;
    ctx.fillStyle=frameCol;
    ctx.font=`bold ${Math.floor(W*.38)}px Orbitron,monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const bounce=reached?0:Math.sin(t*2.5)*4;
    ctx.fillText('↑',sx+W/2,sy+H*.52+bounce);

    // ── "EXIT" label above door ──
    ctx.shadowBlur=5; ctx.font='bold 10px Orbitron,monospace';
    ctx.fillStyle=frameCol; ctx.fillText(g.label,sx+W/2,sy-12);

    // ── point 22: "DOOR REACHED!" text floats above ──
    if(reached){
      const age=1.6-this._winMsgTimer;          // 0→1.6
      const fadeIn=Math.min(1,age/0.25);
      const rise=Math.min(30,age*30);
      ctx.globalAlpha=fadeIn;
      ctx.shadowColor='#00ff88'; ctx.shadowBlur=24;
      ctx.fillStyle='#00ff88';
      ctx.font='bold 15px Orbitron,monospace';
      ctx.fillText('DOOR REACHED!', sx+W/2, sy-30-rise);
    }

    ctx.restore();
  }

  run(){
    let last=0;
    const loop=(ts)=>{
      const dt=(ts-last)/1000; last=ts;
      this.update(dt);
      this.draw(ts);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(ts=>{ last=ts; loop(ts); });
  }
}

// ═══════════════════════════════════════════════
// AUDIO ENGINE — Web Audio API, all sounds procedural
// ═══════════════════════════════════════════════
class AudioEngine{
  constructor(){
    this._ctx=null; this._master=null;
    this._muted=JSON.parse(localStorage.getItem('nr_muted')||'false');
    this._bgRunning=false; this._bgNextT=0; this._bgTid=null;
    this._bgPool=[];
  }
  _init(){
    if(this._ctx) return;
    this._ctx=new(window.AudioContext||window.webkitAudioContext)();
    this._master=this._ctx.createGain();
    this._master.gain.value=this._muted?0:1;
    this._master.connect(this._ctx.destination);
  }
  _resume(){
    this._init();
    if(this._ctx.state==='suspended') this._ctx.resume();
    return this._ctx;
  }
  setMute(m){
    this._muted=m; localStorage.setItem('nr_muted',JSON.stringify(m));
    if(this._master) this._master.gain.setTargetAtTime(m?0:1,this._ctx.currentTime,0.06);
  }
  toggle(){ this.setMute(!this._muted); return this._muted; }
  get muted(){ return this._muted; }

  // 69 — Jump: quick upward blip
  jump(){
    const ctx=this._resume(),t=ctx.currentTime;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g); g.connect(this._master);
    o.type='square';
    o.frequency.setValueAtTime(200,t);
    o.frequency.exponentialRampToValueAtTime(490,t+0.09);
    g.gain.setValueAtTime(0.13,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);
    o.start(t); o.stop(t+0.13);
  }

  // 70 — Land: low thud, volume proportional to fall speed
  land(vy){
    const vol=Math.min(0.32,Math.max(0,vy/1600)*0.32);
    if(vol<0.018) return;
    const ctx=this._resume(),t=ctx.currentTime;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g); g.connect(this._master);
    o.type='sine';
    o.frequency.setValueAtTime(115,t);
    o.frequency.exponentialRampToValueAtTime(36,t+0.13);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.17);
    o.start(t); o.stop(t+0.18);
    // Percussive noise transient
    const len=Math.floor(ctx.sampleRate*0.04);
    const buf=ctx.createBuffer(1,len,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
    const src=ctx.createBufferSource(),ng=ctx.createGain();
    src.buffer=buf; src.connect(ng); ng.connect(this._master);
    ng.gain.value=vol*0.55; src.start(t);
  }

  // 71 — Coin: chime, pitch varies by type
  coin(type='coin'){
    const ctx=this._resume(),t=ctx.currentTime;
    const freqs=type==='secret'?[1320,1760,2200]:type==='gem'?[880,1320,1760]:[1100,1650];
    freqs.forEach((f,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g); g.connect(this._master);
      o.type='sine'; o.frequency.value=f;
      const st=t+i*0.065;
      g.gain.setValueAtTime(0.11,st);
      g.gain.exponentialRampToValueAtTime(0.0001,st+0.42);
      o.start(st); o.stop(st+0.44);
    });
  }

  // 72 — Win fanfare: ascending 5-note melody
  win(){
    const ctx=this._resume(),t=ctx.currentTime;
    [523,659,784,1047,1319].forEach((f,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g); g.connect(this._master);
      o.type='triangle'; o.frequency.value=f;
      const st=t+i*0.14;
      g.gain.setValueAtTime(0,st);
      g.gain.linearRampToValueAtTime(0.19,st+0.025);
      g.gain.exponentialRampToValueAtTime(0.0001,st+0.38);
      o.start(st); o.stop(st+0.4);
    });
  }

  // 73 — Background music: looping ambient arpeggio in A minor
  startBG(){
    if(this._bgRunning) return;
    this._bgRunning=true;
    const ctx=this._resume();
    this._bgNextT=ctx.currentTime+0.05;
    this._bgTick();
  }
  stopBG(){
    this._bgRunning=false;
    clearTimeout(this._bgTid);
    this._bgPool.forEach(n=>{try{n.stop(0);}catch(e){}});
    this._bgPool=[];
  }
  _bgTick(){
    if(!this._bgRunning) return;
    const ctx=this._resume(),now=ctx.currentTime;
    if(this._bgNextT>now+1.8){
      this._bgTid=setTimeout(()=>this._bgTick(),(this._bgNextT-now-1.5)*1000);
      return;
    }
    const LOOP=8;
    this._loopBlock(this._bgNextT,LOOP);
    this._bgNextT+=LOOP;
    this._bgTid=setTimeout(()=>this._bgTick(),(this._bgNextT-ctx.currentTime-1.6)*1000);
  }
  _loopBlock(t,dur){
    const ctx=this._ctx, add=n=>this._bgPool.push(n);

    // Low drone (filtered sawtooth)
    const drn=ctx.createOscillator(),dg=ctx.createGain(),df=ctx.createBiquadFilter();
    drn.type='sawtooth'; drn.frequency.value=55;
    df.type='lowpass'; df.frequency.value=175; df.Q.value=2.8;
    drn.connect(df); df.connect(dg); dg.connect(this._master);
    dg.gain.setValueAtTime(0,t);
    dg.gain.linearRampToValueAtTime(0.046,t+0.9);
    dg.gain.setValueAtTime(0.046,t+dur-0.7);
    dg.gain.linearRampToValueAtTime(0,t+dur+0.05);
    drn.start(t); drn.stop(t+dur+0.1); add(drn);

    // Bass pulses (A1 A1 C2 D2)
    [[55,0],[55,2],[65.4,4],[73.4,6]].forEach(([f,beat])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine'; o.frequency.value=f;
      o.connect(g); g.connect(this._master);
      const st=t+beat*dur/8;
      g.gain.setValueAtTime(0.09,st);
      g.gain.exponentialRampToValueAtTime(0.0001,st+0.78);
      o.start(st); o.stop(st+0.82); add(o);
    });

    // Arpeggio lead — Am pentatonic (A3 C4 D4 E4 G4 A4 C5 D5 E5)
    const sc=[220,261.6,293.7,329.6,392,440,523.3,587.3,659.3];
    [0,2,4,6,8,6,4,2,1,3,5,7,8,7,5,3].forEach((si,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='triangle'; o.frequency.value=sc[si];
      o.connect(g); g.connect(this._master);
      const st=t+i*(dur/16);
      g.gain.setValueAtTime(0.032,st);
      g.gain.exponentialRampToValueAtTime(0.0001,st+(dur/16)*0.82);
      o.start(st); o.stop(st+dur/16+0.02); add(o);
    });

    // Shimmer highs
    [1,5,9,13].forEach((step,j)=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine'; o.frequency.value=sc[(7-j%3)]*2;
      o.connect(g); g.connect(this._master);
      const st=t+step*(dur/16);
      g.gain.setValueAtTime(0.013,st);
      g.gain.exponentialRampToValueAtTime(0.0001,st+0.62);
      o.start(st); o.stop(st+0.66); add(o);
    });
  }
}

const sfx=new AudioEngine();

const game=new Game();
game.run();

// ═══════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════
(function(){
  const ADMIN_SESSION_KEY = 'kq_admin_session';
  const ADMIN_PW_KEY      = 'kq_adm_pw';
  const btn   = document.getElementById('admin-btn');
  const panel = document.getElementById('admin-panel');
  const loginGate = document.getElementById('adm-login-gate');
  const controls  = document.getElementById('adm-controls');

  const _flags = { god:false, speed:false, ink:false, fly:false, jumps:false, freeze:false, slow:false };
  let _enemySnap = [];

  function isAdmin(){ return localStorage.getItem(ADMIN_SESSION_KEY)==='1'; }
  function getAdminPw(){ return localStorage.getItem(ADMIN_PW_KEY) || '4474'; }

  function refreshBtn(){
    if(isAdmin()){
      btn.textContent = '✅ Admin';
      btn.classList.add('adm-logged');
    } else {
      btn.textContent = '🔧 Admin';
      btn.classList.remove('adm-logged');
    }
  }
  refreshBtn();
  setInterval(refreshBtn, 2000);

  function openPanel(){
    panel.classList.add('visible');
    if(isAdmin()){
      loginGate.style.display = 'none';
      controls.style.display  = 'flex';
      buildLevelBtns();
      updateStats();
    } else {
      loginGate.style.display = 'flex';
      controls.style.display  = 'none';
      const pwInput = document.getElementById('adm-pw-input');
      pwInput.value = '';
      document.getElementById('adm-pw-msg').textContent = '';
      setTimeout(()=>pwInput.focus(), 80);
    }
  }
  function closePanel(){
    panel.classList.remove('visible');
  }

  // Login form logic
  function tryAdminLogin(){
    const val = document.getElementById('adm-pw-input').value;
    const msg = document.getElementById('adm-pw-msg');
    if(val === getAdminPw()){
      localStorage.setItem(ADMIN_SESSION_KEY, '1');
      refreshBtn();
      loginGate.style.display = 'none';
      controls.style.display  = 'flex';
      buildLevelBtns();
      updateStats();
      msg.textContent = '';
    } else {
      msg.style.color = '#ff6666';
      msg.textContent = '❌ Wrong code';
      document.getElementById('adm-pw-input').value = '';
      setTimeout(()=>document.getElementById('adm-pw-input').focus(), 50);
    }
  }
  document.getElementById('adm-login-btn').addEventListener('click', tryAdminLogin);
  document.getElementById('adm-pw-input').addEventListener('keydown', e=>{ if(e.key==='Enter') tryAdminLogin(); });

  btn.addEventListener('click', openPanel);
  document.getElementById('adm-close').addEventListener('click', closePanel);
  panel.addEventListener('click', e=>{ if(e.target===panel) closePanel(); });

  function updateStats(){
    document.getElementById('adm-lv').textContent = game.lvData ? game.lvIdx+1 : '—';
    document.getElementById('adm-sc').textContent = game.score  ?? '—';
    document.getElementById('adm-li').textContent = game.lives  ?? '—';
    document.getElementById('adm-co').textContent = game.coins  ?? '—';
  }
  setInterval(()=>{ if(panel.classList.contains('visible')) updateStats(); }, 400);

  function buildLevelBtns(){
    const container = document.getElementById('adm-level-btns');
    if(container.children.length) return; // already built
    LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'adm-btn';
      b.textContent = `${i+1}. ${lv.name}`;
      b.onclick = () => adminGotoLevel(i);
      container.appendChild(b);
    });
  }

  // Toggle
  window.adminToggle = function(key){
    _flags[key] = !_flags[key];
    document.getElementById('tog-'+key).classList.toggle('on', _flags[key]);
    if(key==='ink' && _flags.ink){ game._inkUsed=0; game._updateDrawHUD(); }
    if(key==='freeze'){
      // snapshot enemy positions when freezing
      _enemySnap = game.enemies ? game.enemies.map(e=>({e, x:e.x, y:e.y})) : [];
    }
  };

  // Patch _die: god mode blocks death
  const origDie = game._die.bind(game);
  game._die = function(){
    if(_flags.god) return;
    origDie();
  };

  // Patch update: apply all flag effects each frame
  const origUpdate = game.update.bind(game);
  game.update = function(dt){
    const effectiveDt = _flags.slow ? dt * 0.4 : dt;
    origUpdate(effectiveDt);

    const p = game.player;
    if(!p || p.dead) return;

    // Speed ×2
    if(_flags.speed){
      if(p.vx >  MOVE_SPD) p.vx = Math.min(p.vx,  SPRINT_SPD*2);
      if(p.vx < -MOVE_SPD) p.vx = Math.max(p.vx, -SPRINT_SPD*2);
    }
    // No gravity — hold jump to float
    if(_flags.fly && p.vy > 0 &&
       (game.inp.held('ArrowUp')||game.inp.held('KeyW')||game.inp.held('Space'))){
      p.vy = -150;
    }
    // Infinite ink
    if(_flags.ink && game._inkUsed > INK_MAX * 0.05){
      game._inkUsed = 0; game._updateDrawHUD();
    }
    // Unlimited jumps
    if(_flags.jumps && !p.onGround){
      p.jumpsLeft = MAX_JUMPS;
    }
    // Freeze enemies — restore saved positions each frame
    if(_flags.freeze && game.enemies){
      game.enemies.forEach(e => { e.vx=0; });
    }
  };

  // ── Action buttons ──────────────────────────────
  window.adminAddLives = function(){
    game.lives += 3; game._hud(); updateStats();
  };
  window.adminAddScore = function(){
    game.score += 1000; game._hud(); updateStats();
  };
  window.adminRefillInk = function(btn){
    game._inkUsed = 0; game._updateDrawHUD();
    flashBtn(btn, '✓ Refilled');
  };
  window.adminCollectCoins = function(btn){
    if(!game.coinObjs) return;
    let gained = 0;
    game.coinObjs.forEach(c => {
      if(!c.collected){ c.collected=true; game.score+=c.value; game.coins++; gained++; }
    });
    game._hud(); updateStats();
    flashBtn(btn, `✓ +${gained} coins`);
  };
  window.adminTeleportCP = function(btn){
    const p = game.player;
    if(!p || !game._cpX) { flashBtn(btn, '✗ No checkpoint'); return; }
    p.x = game._cpX - p.w/2;
    p.y = game._cpY - p.h - 4;
    p.vx = 0; p.vy = 0;
    flashBtn(btn, '✓ Teleported');
  };
  window.adminSkipLevel = function(){
    closePanel();
    if(game.state==='playing'||game.state==='levelup') game._levelClear();
  };
  window.adminRestartLevel = function(){
    closePanel();
    game._loadLevel(game.lvIdx, false);
  };
  window.adminGotoLevel = function(idx){
    closePanel();
    game.lives = 3; game.score = 0; game.coins = 0;
    game._loadLevel(idx, false);
  };
  window.adminUnlockAll = function(btn){
    LEVELS.forEach((_,i) => localStorage.setItem(`nr_cleared_${i}`, '1'));
    flashBtn(btn, '✓ All Unlocked');
  };
  window.adminWipeScores = function(btn){
    if(!confirm('Wipe all Neon Rush best times?')) return;
    LEVELS.forEach((_,i) => localStorage.removeItem(`nr_best_${i}`));
    flashBtn(btn, '✓ Wiped');
  };

  // Helper: briefly change button text
  function flashBtn(btn, msg){
    if(!btn) return;
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }
})();
