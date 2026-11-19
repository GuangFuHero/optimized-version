/*!
 * Vendored from ChiTienHsieh/dotfiles, skills/shared/scripted-demo/assets/player.js (ScriptedDemo.version 1.2.0),
 * with the author's permission to use it in this repository. Keep this copy unmodified: fix bugs
 * upstream and copy the new version in. The tutorial pages use it with a recorded-video stage
 * (video/interactive.mjs); the original hand-drawn stages work with it as before.
 */
/*!
 * scripted-demo player.js：播放器的唯一正本。
 *
 * 用一般 <script src="player.js"></script> 載入，不要改成 type="module"：
 * 瀏覽器會擋從本機檔案（file://）載入 module，雙擊打開 HTML 就會壞掉。
 * 交付時用 scripts/inline_player.py 把這份內容塞進 HTML，產出單一檔案。
 *
 * 用法與欄位說明見 references/script-format.md。
 */
(function (global) {
  'use strict';

  // 各段動畫的基準時間（毫秒），實際時間 = 基準 / 播放速度
  var T = { appear: 420, move: 720, press: 260, typeChar: 55, hold: 1500, perChar: 40, card: 2800, summary: 5000, cut: 380 };
  var SPEEDS = [0.5, 1, 2];
  var PAD = 6;    // spotlight 比目標外擴幾 px
  var EDGE = 6;   // 游標離舞台邊緣至少幾 px
  var SMALL = 64; // 寬或高小於這個值就算小目標，游標改指右下角外側
  var TIP = 2;    // 小目標時游標尖端離右下角幾 px（PAD 減 TIP 要大於約 3，尖端才不會落在 spotlight 圓角外的暗處）

  var CSS = [
    // 舞台上的演員用內部變數上色；深色模式（<html data-sd-theme="dark">）整組換掉。頁面要改色用 --sd-* / --sd-dark-*
    '.sd-layer{position:absolute;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden;--sd-move:720ms;--_dim:var(--sd-dim,rgba(15,23,42,.55));--_accent:var(--sd-accent,#3b82f6);--_curtain:var(--sd-bar,#0b1220);--_card:#fff;--_card-ink:#0f172a;--_card-muted:#64748b;--_card-line:#e2e8f0;--_card-q:#f1f5f9}',
    '[data-sd-theme="dark"] .sd-layer{--_dim:var(--sd-dark-dim,rgba(0,0,0,.45));--_accent:var(--sd-dark-accent,#60a5fa);--_curtain:#000;--_card:#343746;--_card-ink:#f8f8f2;--_card-muted:#9ea9d2;--_card-line:#44475a;--_card-q:#282a36}',
    '.sd-spot{position:absolute;display:none;border-radius:10px;box-shadow:0 0 0 9999px var(--_dim);outline:2px solid var(--_accent);transition:left var(--sd-move) cubic-bezier(.4,0,.2,1),top var(--sd-move) cubic-bezier(.4,0,.2,1),width var(--sd-move) cubic-bezier(.4,0,.2,1),height var(--sd-move) cubic-bezier(.4,0,.2,1)}',
    '.sd-cursor{position:absolute;display:none;width:22px;height:22px;transform:translate(-3px,-2px);transition:left var(--sd-move) cubic-bezier(.4,0,.2,1),top var(--sd-move) cubic-bezier(.4,0,.2,1),opacity var(--sd-move) ease;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}',
    // 手機模式（device: 'phone'）：游標換成手指點的圓點，圓心就是點下去的位置
    '.sd-phone .sd-cursor{width:30px;height:30px;transform:translate(-15px,-15px);filter:none}',
    '.sd-instant .sd-spot,.sd-instant .sd-cursor{transition:none}',
    '.sd-ripple{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:2px solid var(--_accent);animation:sd-ripple .45s ease-out forwards}',
    '@keyframes sd-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}',
    '.sd-caption{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:none;max-width:min(640px,90%);padding:8px 14px;border-radius:10px;background:rgba(15,23,42,.92);color:#fff;font:14px/1.55 system-ui,"Microsoft JhengHei",sans-serif}',
    '.sd-caption.sd-top{top:16px;bottom:auto}',
    '.sd-caption small{display:block;opacity:.7;font-size:11px}',
    '.sd-cardwrap{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:var(--_dim)}',
    '.sd-card{max-width:min(520px,86%);max-height:calc(100% - 32px);overflow:auto;box-sizing:border-box;padding:22px 26px;border-radius:14px;background:var(--_card);color:var(--_card-ink);box-shadow:0 20px 50px rgba(0,0,0,.3);font:15px/1.6 system-ui,"Microsoft JhengHei",sans-serif}',
    // 卡片進場淡入；離場時背景先拿掉（交給 spotlight 的暗色接手），卡片本身淡出
    '.sd-cardwrap{animation:sd-fade .3s ease}.sd-card{animation:sd-pop .3s ease;transition:opacity .3s ease,transform .3s ease}',
    '.sd-cardwrap.sd-out{background:transparent;animation:none}.sd-out .sd-card{opacity:0;transform:scale(.96) translateY(8px)}',
    '@keyframes sd-fade{from{background:transparent}}@keyframes sd-pop{from{opacity:0;transform:scale(.96) translateY(8px)}}',
    '.sd-cardwrap.sd-now,.sd-cardwrap.sd-now .sd-card{animation:none;transition:none}',
    '.sd-cardwrap.sd-over{background:transparent}',
    // 換段落：舞台先暗到底再亮起來，介紹卡從右邊滑進來，讓觀眾感覺換了一個方案
    '.sd-curtain{position:absolute;inset:0;background:var(--_curtain);opacity:0;transition:opacity 380ms ease}.sd-curtain.sd-on{opacity:1}',
    '.sd-slide .sd-card{animation:sd-slide .45s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes sd-slide{from{opacity:0;transform:translateX(48px)}}',
    '.sd-card h3{margin:2px 0 8px;font-size:20px}.sd-card p{margin:0;white-space:pre-line}.sd-card ul{margin:6px 0 0;padding-left:20px}',
    '.sd-kicker{font-size:12px;color:var(--_card-muted)}.sd-hint{margin-top:14px;font-size:12px;color:var(--_card-muted)}',
    '.sd-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}.sd-cols b{font-size:13px}',
    '.sd-touring{cursor:default}.sd-touring>*:not(.sd-layer){pointer-events:none}',
    '.sd-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}.sd-table th,.sd-table td{border-bottom:1px solid var(--_card-line);padding:5px 6px;text-align:left;vertical-align:top}.sd-table th{color:var(--_card-muted);font-weight:600}',
    '.sd-q{margin-top:10px;padding:8px 12px;border-radius:8px;background:var(--_card-q)}.sd-q b{font-size:13px}',
    // 控制列永遠跟舞台一亮一暗：淺色舞台配深色控制列；深色模式時舞台變暗，控制列換成 Solarized Light 的米白
    '.sd-ctl{--_ink:#e5e7eb;--_head:#f8fafc;--_muted:#94a3b8;--_line:rgba(255,255,255,.18);--_soft:rgba(255,255,255,.08);--_strong:#f8fafc;--_strong-ink:#0f172a;--_hi:#fbbf24;--_track:rgba(255,255,255,.15);--_done:rgba(255,255,255,.45);background:var(--sd-bar,#0b1220);color:var(--_ink);padding:12px 16px 10px;font:14px/1.5 system-ui,"Microsoft JhengHei",sans-serif;transition:background-color .25s ease,color .25s ease}',
    '[data-sd-theme="dark"] .sd-ctl{--_ink:#556b73;--_head:#073642;--_muted:#657b83;--_line:rgba(85,107,115,.3);--_soft:rgba(85,107,115,.08);--_strong:#1c679b;--_strong-ink:#ffffff;--_hi:#1c679b;--_track:rgba(85,107,115,.16);--_done:rgba(85,107,115,.45);background:var(--sd-dark-bar,#fdf6e3)}',
    '.sd-ctl button,.sd-ctl select{font:inherit;color:inherit;background:transparent;border:1px solid var(--_line);border-radius:999px;padding:4px 12px;cursor:pointer}',
    '.sd-ctl button:hover{background:var(--_soft)}.sd-ctl button:disabled{opacity:.3;cursor:default}',
    '.sd-ctl select{border-radius:8px;padding:4px 6px}.sd-ctl select option{color:#0f172a}',
    '.sd-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.sd-chap{font-size:13px}.sd-chap.sd-on{background:var(--_strong);color:var(--_strong-ink);border-color:var(--_strong)}',
    '.sd-free{margin-left:auto;font-size:13px}.sd-free.sd-on{border-color:var(--_hi);color:var(--_hi)}.sd-theme{font-size:13px}',
    '.sd-main{display:flex;align-items:center;gap:16px;margin-top:10px}',
    '.sd-narr{flex:1;min-width:0}.sd-narr small{display:block;font-size:12px;color:var(--_muted)}.sd-narr div{font-size:16px;color:var(--_head)}',
    '.sd-tp{display:flex;align-items:center;gap:6px}.sd-tp .sd-play{background:var(--_strong);color:var(--_strong-ink);border-color:var(--_strong);font-weight:700;padding:6px 16px}',
    '.sd-dots{display:flex;gap:4px;margin-top:10px}.sd-dots i{flex:1;height:4px;border-radius:2px;background:var(--_track);cursor:pointer}',
    '.sd-dots i.sd-done{background:var(--_done)}.sd-dots i.sd-cur{background:var(--_hi)}',
    // 觀眾用手機打開 demo：章節改成左右滑，旁白和播放鈕上下排
    '@media (max-width:640px){.sd-ctl{padding:10px 12px 8px}.sd-row{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.sd-row button{flex-shrink:0;white-space:nowrap}.sd-free{margin-left:12px}.sd-main{flex-direction:column;align-items:stretch;gap:8px}.sd-narr div{font-size:15px}.sd-tp{justify-content:center}}'
  ].join('\n');

  var CURSOR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.4L20.5 11z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  // 手指：半透明圓點，深色外圈加白色內圈，亮底暗底都看得到，也不會整個蓋住底下的按鈕
  var TOUCH_SVG = '<svg viewBox="0 0 30 30" width="30" height="30"><circle cx="15" cy="15" r="13" fill="rgba(255,255,255,.18)" stroke="rgba(17,17,17,.7)" stroke-width="2"/><circle cx="15" cy="15" r="10.5" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.25"/></svg>';

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function patch(state, p) { if (p) Object.keys(p).forEach(function (k) { state[k] = clone(p[k]); }); return state; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function div(cls, html) { var e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; return e; }
  function frames2() { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); }
  function $(x) { return typeof x === 'string' ? document.querySelector(x) : x; }

  // 把每段展開成「介紹卡 → 各步 → 總結卡」的影格清單；start 是該段第一格，也就是 keyframe 所在
  function buildFrames(sections) {
    var frames = [];
    sections.forEach(function (sec, si) {
      var start = frames.length, steps = sec.steps || [];
      if (sec.intro) frames.push({ type: 'intro', section: si, start: start });
      steps.forEach(function (st, k) { frames.push({ type: 'step', section: si, start: start, step: st, n: k + 1, total: steps.length }); });
      if (sec.summary) frames.push({ type: 'summary', section: si, start: start });
    });
    return frames;
  }

  function Player(o) {
    var self = this;
    this.stage = $(o.stage);
    this.controls = $(o.controls);
    this.renderFn = o.render;
    this.sections = o.sections || [];
    this.initial = clone(o.initialState || {});
    this.state = clone(this.initial);
    this.frames = buildFrames(this.sections);
    this.idx = -1;         // 目前在哪一格；-1 表示沒在導覽
    this.gen = 0;          // 世代計數：每次換格 +1，舊動畫發現號碼過期就自己停
    this.speed = 1;
    this.playing = false;
    this.touring = false;
    this.busy = false;
    this.only = null;      // 只播某一段時是段落索引；全部連播是 null
    this.snapshot = null;  // 進導覽前的狀態，停止時還原
    this.pt = null;        // 游標目前的點（相對舞台）
    this.spotRect = null;  // spotlight 目前的框（相對舞台）
    // 配色：'light'（預設）或 'dark'；寫在 <html data-sd-theme>，頁面 CSS 依它換舞台配色
    this.theme = o.theme || document.documentElement.getAttribute('data-sd-theme') || 'light';
    // 要示範的是手機畫面還是電腦畫面：'phone' 時游標換成手指，點在目標正中間
    this.device = o.device === 'phone' ? 'phone' : 'desktop';
    // 游標元素左上角到「點下去那一點」的距離，給 scripts/check_demo.py 量動畫中的位置用
    this.tipOffset = this.device === 'phone' ? { x: 15, y: 15 } : { x: 3, y: 2 };

    if (!document.getElementById('sd-style')) {
      var st = document.createElement('style'); st.id = 'sd-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    if (getComputedStyle(this.stage).position === 'static') this.stage.style.position = 'relative';
    this._buildLayer();
    if (this.controls) this._buildControls();
    this._render();

    // 舞台大小或版面一變（視窗縮放、Ctrl +/-、作者自己的 CSS transition）就依錨點重算位置
    var reflow = function () { if (self.touring && !self.busy) self._place(false); };
    global.addEventListener('resize', reflow);
    if (global.ResizeObserver) new ResizeObserver(reflow).observe(this.stage);
    this.stage.addEventListener('transitionend', function (e) { if (!self.layer.contains(e.target)) reflow(); });
    global.addEventListener('keydown', function (e) { self._key(e); });
    this._setSpeed(1);
    this.setTheme(this.theme);
  }

  var P = Player.prototype;

  // ---------- 對外 API ----------

  // 自由操作時，舞台自己的事件處理器用它改狀態；導覽中一律忽略，畫面只聽劇本
  P.update = function (p) { if (this.touring) return; patch(this.state, p); this._render(); };

  P.playAll = function () { this.only = null; this.playing = true; this.goTo(0); };
  P.playSection = function (si) {
    this.only = si; this.playing = true;
    for (var i = 0; i < this.frames.length; i++) if (this.frames[i].section === si) return this.goTo(i);
  };
  P.next = function () {
    var r = this._range();
    if (this.idx < 0) return this.goTo(r[0]);
    if (this.idx < r[1]) return this.goTo(this.idx + 1);
  };
  P.prev = function () {
    var r = this._range();
    if (this.idx > r[0]) return this.goTo(this.idx - 1);
  };
  P.play = function () {
    var r = this._range();
    this.playing = true;
    if (this.idx < 0 || this.idx >= r[1]) return this.goTo(r[0]);
    return this.goTo(this.idx + 1);
  };
  P.pause = function () { this.playing = false; this._sync(); };
  // 切換淺色／深色：只換 <html> 的 data-sd-theme 與按鈕文字，不碰導覽狀態，所以播放中切換也不會中斷。
  // 頁面要用 JS 跟著換（例如畫布）時，聽 window 的 sd-theme 事件（event.detail.theme）
  P.setTheme = function (t) {
    var self = this;
    this.theme = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-sd-theme', this.theme);
    this._sync();
    if (typeof CustomEvent === 'function') global.dispatchEvent(new CustomEvent('sd-theme', { detail: { theme: this.theme } }));
    // 換配色可能讓版面差幾 px（字重、邊框），等畫面套用後依錨點重新對準；正在演的動畫會自己在結尾對準
    requestAnimationFrame(function () { if (self.touring && !self.busy) self._place(false); });
  };
  P.toggleTheme = function () { this.setTheme(this.theme === 'dark' ? 'light' : 'dark'); };
  P.stop = function () {
    this.gen++; this.playing = false; this.busy = false; this.touring = false; this.idx = -1; this.only = null;
    if (this.snapshot) this.state = this.snapshot;
    this.snapshot = null;
    this.stage.classList.remove('sd-touring');
    this._clearMarks(); this._hideActors(); this._card(null); this._caption(null); this._curtain(false);
    this.cardWrap.classList.remove('sd-over', 'sd-slide');
    this._render(); this._sync();
  };

  // 跳到第 i 格：回到該段的 keyframe，瞬間重播段內前面各步的 set，再演第 i 格
  P.goTo = async function (i, opt) {
    opt = opt || {};
    if (i < 0 || i >= this.frames.length) return;
    if (!this.touring) {
      this.snapshot = clone(this.state); this.touring = true; this.stage.classList.add('sd-touring');
    }
    var my = ++this.gen, f = this.frames[i], sec = this.sections[f.section];
    var prev = this.frames[this.idx], anim = !opt.instant;
    // 從別段切進來時（例如方案一的總結 → 方案二的介紹），先讓舞台暗到底，趁暗換畫面
    var cut = anim && prev && prev.section !== f.section;
    this.idx = i; this.busy = true;
    if (cut) {
      this._caption(null); this._curtain(true);
      if (!await this._wait(T.cut, my)) return;
      this._card(null); this._hideActors();
    }
    this._clearMarks();
    var st = patch(clone(this.initial), sec.keyframe);
    for (var k = f.start; k < i; k++) if (this.frames[k].type === 'step') patch(st, this.frames[k].step.set);
    this.state = st;
    this._render(); this._sync();
    await frames2();
    if (!this._alive(my)) return;
    if (cut) this._curtain(false); else this._curtain(false, true);

    var ok;
    if (f.type === 'step') {
      this._card(null, !opt.instant); this._caption(f);
      ok = await this._doStep(f.step, my, !!opt.instant);
    } else {
      this._caption(null);
      // 每次進卡片都先重設轉場用的 class：上一段留下的滑入、被打斷的光圈收起都不能殘留
      this.cardWrap.classList.remove('sd-over');
      this.cardWrap.classList.toggle('sd-slide', !!cut && f.type === 'intro');
      if (anim && prev && prev.type === 'step' && this.pt) {
        // 光圈往游標收成一個小點、游標淡出，同時卡片淡入；暗色由光圈接手，卡片背景先透明
        this.cardWrap.classList.add('sd-over');
        this._card(f, true);
        this._instant(false);
        this._spotAt({ left: this.pt.x - 2, top: this.pt.y - 2, width: 4, height: 4 });
        this.cursorEl.style.opacity = '0';
        if (!await this._wait(T.move, my)) return;
        this.cardWrap.classList.remove('sd-over');
      } else {
        this._card(f, anim);
      }
      this._hideActors(); this.cursorEl.style.opacity = ''; ok = true;
    }
    if (!ok || !this._alive(my)) return;
    this.busy = false;
    this._sync();

    if (this.playing && !opt.instant) {
      var hold = f.type === 'step' ? T.hold + String(f.step.say || '').length * T.perChar : f.type === 'summary' ? T.summary : T.card;
      if (!await this._wait(hold, my)) return;
      if (i < this._range()[1]) this.goTo(i + 1);
      else { this.playing = false; this._sync(); }
    }
  };

  // 給檢查腳本用：回報目前這格的游標、spotlight、目標位置（都相對舞台）
  P.probe = function () {
    var f = this.frames[this.idx] || null, res = {
      idx: this.idx, count: this.frames.length, type: f ? f.type : null, busy: this.busy,
      stage: { width: this.stage.clientWidth, height: this.stage.clientHeight },
      cursor: null, spotlight: null, target: null, targetName: null, caption: null, state: clone(this.state)
    };
    if (f && f.type === 'step') {
      var a = this._endAnchors(f.step);
      res.targetName = a.curName;
      res.target = a.cur ? this._rel(a.cur) : null;
      res.targetClipped = a.cur ? this._clipped(a.cur) : false;
    }
    if (this.cursorEl.style.display !== 'none') res.cursor = this.pt;
    if (this.spotEl.style.display !== 'none') res.spotlight = this.spotRect;
    if (this.captionEl.style.display !== 'none') res.caption = this._rel(this.captionEl);
    return res;
  };

  // 目標有沒有被舞台內某個會捲動／裁切的容器切掉一部分（元素還在舞台裡，但觀眾看不到）
  P._clipped = function (el) {
    var r = el.getBoundingClientRect();
    for (var p = el.parentElement; p && p !== this.stage; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      var b = p.getBoundingClientRect();
      if (r.top < b.top - 2 || r.left < b.left - 2 || r.bottom > b.bottom + 2 || r.right > b.right + 2) return true;
    }
    return false;
  };

  // ---------- 一步怎麼演 ----------

  // spotlight 和游標用同樣的時間與速度曲線一起移動：起點時游標在舊框裡、終點時在新框裡，
  // 中間每一刻也都會在移動中的框裡，所以游標永遠不會穿過暗處。接著才做動作。
  P._doStep = async function (s, my, instant) {
    var tgt = this._find(s.target);
    if (!tgt) console.warn('[scripted-demo] 找不到錨點 data-demo="' + s.target + '"');
    var foc = (s.focus && this._find(s.focus)) || tgt;
    // 剛從介紹卡或停止狀態進來時，直接出現在定點，不從舊位置飛過來
    var fresh = this.spotEl.style.display === 'none' || this.cursorEl.style.display === 'none';
    if (tgt && tgt.scrollIntoView) tgt.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    var iris = fresh && !instant && tgt;
    if (iris) {
      // 先瞬間放一個縮在游標尖端的小光圈（整個舞台幾乎全暗，接住卡片的暗背景）和隱形游標，
      // 再一起張開、淡入；游標一直在光圈中心，所以也不會落在暗處
      this._instant(true);
      this._cursor(tgt); this.cursorEl.style.opacity = '0';
      this._spotAt({ left: this.pt.x - 2, top: this.pt.y - 2, width: 4, height: 4 });
      this._instant(false);
    } else {
      this._instant(instant || fresh);
    }
    this._spot(foc);
    this._cursor(tgt);
    this.cursorEl.style.opacity = '';
    if (!await this._wait(fresh && !iris ? T.appear : T.move, my, instant)) return false;

    var act = s.do || 'click';
    if (tgt && act === 'hover') tgt.classList.add('sd-hover');
    if (tgt && act === 'click') {
      if (!instant) this._ripple();
      tgt.classList.add('sd-press');
      if (!await this._wait(T.press, my, instant)) return false;
      tgt.classList.remove('sd-press');
    }
    if (tgt && act === 'type' && !instant) {
      var txt = String(s.text || '');
      for (var c = 1; c <= txt.length; c++) {
        setText(tgt, txt.slice(0, c));
        if (!await this._wait(T.typeChar, my)) return false;
      }
    }
    if (s.set) {
      patch(this.state, s.set); this._render();
      await frames2();
      if (!this._alive(my)) return false;
    }
    this._place(!instant);
    if (!instant && s.after) { if (!await this._wait(T.move, my)) return false; }
    return true;
  };

  // 一步結束時該看哪裡：有 after 就換到 after（例如按鈕按下去後畫面換頁），否則留在目標上
  P._endAnchors = function (s) {
    var after = s.after && this._find(s.after);
    if (after) return { spot: (s.afterFocus && this._find(s.afterFocus)) || after, cur: after, curName: s.after };
    var tgt = this._find(s.target);
    return { spot: (s.focus && this._find(s.focus)) || tgt, cur: tgt, curName: s.target };
  };

  P._place = function (animate) {
    var f = this.frames[this.idx];
    if (!f || f.type !== 'step') return;
    this._instant(!animate);
    var a = this._endAnchors(f.step);
    // 點完換頁後，新焦點可能在捲動區外面；先捲進畫面再對準
    if (a.cur && a.cur.scrollIntoView) a.cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this._spot(a.spot);
    this._cursor(a.cur);
    this._captionSide();
  };

  // ---------- 演員：spotlight、游標、漣漪、旁白、卡片 ----------

  P._buildLayer = function () {
    this.layer = div('sd-layer');
    this.spotEl = div('sd-spot');
    if (this.device === 'phone') this.layer.classList.add('sd-phone');
    this.cursorEl = div('sd-cursor', this.device === 'phone' ? TOUCH_SVG : CURSOR_SVG);
    this.captionEl = div('sd-caption');
    this.cardWrap = div('sd-cardwrap');
    [this.spotEl, this.cursorEl, this.captionEl, this.cardWrap].forEach(function (e) { e.style.display = 'none'; this.layer.appendChild(e); }, this);
    this.curtainEl = div('sd-curtain'); this.layer.appendChild(this.curtainEl);
    this.stage.appendChild(this.layer);
  };

  P._rel = function (e) {
    var r = e.getBoundingClientRect(), s = this.stage.getBoundingClientRect();
    return { left: r.left - s.left - this.stage.clientLeft, top: r.top - s.top - this.stage.clientTop, width: r.width, height: r.height };
  };

  P._spot = function (e) {
    if (!e) { this.spotEl.style.display = 'none'; this.spotRect = null; return; }
    var r = this._rel(e), W = this.stage.clientWidth, H = this.stage.clientHeight;
    var l = Math.max(0, r.left - PAD), t = Math.max(0, r.top - PAD);
    var rr = Math.min(W, r.left + r.width + PAD), bb = Math.min(H, r.top + r.height + PAD);
    this._spotAt({ left: l, top: t, width: Math.max(0, rr - l), height: Math.max(0, bb - t) });
  };
  P._spotAt = function (r) {
    this.spotRect = r;
    var s = this.spotEl.style;
    s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px'; s.display = 'block';
  };

  P._cursor = function (e) {
    if (!e) return;
    var r = this._rel(e), W = this.stage.clientWidth, H = this.stage.clientHeight;
    // 游標箭頭往右下延伸：小目標（icon、小按鈕）把尖端貼在右下角外側（仍在 spotlight 的留白裡），
    // 箭頭整個落在目標外面，不會蓋住 icon；大目標對準中間
    // 手機的手指本來就會蓋住按鈕，直接點正中間
    var touch = this.device === 'phone';
    var x = !touch && r.width < SMALL ? r.left + r.width + TIP : r.left + r.width / 2;
    var y = !touch && r.height < SMALL ? r.top + r.height + TIP : r.top + r.height / 2;
    x = Math.min(Math.max(x, EDGE), W - EDGE);
    y = Math.min(Math.max(y, EDGE), H - EDGE);
    this.pt = { x: x, y: y };
    this.cursorEl.style.left = x + 'px'; this.cursorEl.style.top = y + 'px'; this.cursorEl.style.display = 'block';
  };

  P._ripple = function () {
    if (!this.pt) return;
    var r = div('sd-ripple'); r.style.left = this.pt.x + 'px'; r.style.top = this.pt.y + 'px';
    this.layer.appendChild(r); setTimeout(function () { r.remove(); }, 500);
  };

  P._curtain = function (on, quick) {
    var c = this.curtainEl;
    if (quick) { c.style.transition = 'none'; c.classList.remove('sd-on'); c.offsetWidth; c.style.transition = ''; return; }
    c.style.transitionDuration = Math.round(T.cut / this.speed) + 'ms';
    c.classList.toggle('sd-on', on);
  };

  P._hideActors = function () {
    this.spotEl.style.display = 'none'; this.cursorEl.style.display = 'none'; this.pt = null; this.spotRect = null;
  };

  // 有控制列時旁白寫在控制列裡，不會蓋住舞台；沒有控制列才疊在舞台底部
  P._caption = function (f) {
    var c = this.captionEl;
    if (this.controls || !f) { c.style.display = 'none'; return; }
    var sec = this.sections[f.section];
    c.innerHTML = '<small>' + esc(sec.title) + ' · 第 ' + f.n + ' 步 / 共 ' + f.total + ' 步</small>' + esc(f.step.say || '');
    c.style.display = 'block';
    this._captionSide();
  };

  // 旁白預設在底部；spotlight 靠近底部時改放頂端，避免旁白蓋住正在講的東西
  P._captionSide = function () {
    var H = this.stage.clientHeight, sp = this.spotRect;
    this.captionEl.classList.toggle('sd-top', !!sp && sp.top + sp.height > H - 110);
  };

  P._card = function (f, animate) {
    var w = this.cardWrap;
    clearTimeout(this._cardTimer);
    // 淡出時先關掉卡片的進場動畫，否則拿掉 sd-now 會讓進場動畫重播、卡片直接變透明
    if (!f && w.firstChild) w.firstChild.style.animation = 'none';
    w.classList.toggle('sd-now', !animate);
    if (!f) {
      if (!animate || w.style.display === 'none') { w.style.display = 'none'; w.classList.remove('sd-out'); return; }
      w.classList.add('sd-out');
      this._cardTimer = setTimeout(function () { w.style.display = 'none'; w.classList.remove('sd-out'); }, 300);
      return;
    }
    w.classList.remove('sd-out');
    var sec = this.sections[f.section], html;
    if (f.type === 'intro') {
      html = '<div class="sd-kicker">第 ' + (f.section + 1) + ' 段，共 ' + this.sections.length + ' 段</div><h3>' + esc(sec.title) + '</h3><p>' + esc(sec.intro) + '</p>';
    } else {
      var sm = sec.summary, list = function (a) { return '<ul>' + (a || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
      html = '<div class="sd-kicker">' + esc(sec.title) + '</div><h3>' + esc(sm.title || '這段的重點') + '</h3>';
      if (sm.points) html += list(sm.points);
      if (sm.pros || sm.cons) html += '<div class="sd-cols"><div><b>好處</b>' + list(sm.pros) + '</div><div><b>要注意</b>' + list(sm.cons) + '</div></div>';
      if (sm.table) html += '<table class="sd-table"><tr>' + sm.table.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>' +
        sm.table.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      if (sm.questions) html += '<div class="sd-q"><b>可以討論的問題</b>' + list(sm.questions) + '</div>';
    }
    w.innerHTML = '<div class="sd-card">' + html + '</div>';
    w.style.display = 'flex';
  };

  // ---------- 控制列 ----------

  // 控制列：上排是章節、「自己點點看」與深色／淺色切換，中排是旁白與上一步／播放／下一步／速度，下排是進度條
  P._buildControls = function () {
    var self = this, c = this.controls;
    var chaps = this.sections.map(function (sec, i) { return '<button class="sd-chap" data-sd-sec="' + i + '">' + esc(sec.title) + '</button>'; }).join('');
    c.innerHTML = '<div class="sd-ctl"><div class="sd-row">' + chaps + '<button class="sd-free" data-sd="free">自己點點看</button>' +
      '<button class="sd-theme" data-sd="theme"></button></div>' +
      '<div class="sd-main"><div class="sd-narr"><small></small><div></div></div><div class="sd-tp">' +
      '<button data-sd="prev" title="上一步（←）">◀</button><button class="sd-play" data-sd="toggle">▶ 播放</button>' +
      '<button data-sd="next" title="下一步（→）">▶</button><select data-sd="speed" title="速度">' +
      SPEEDS.map(function (v) { return '<option value="' + v + '">' + v + 'x</option>'; }).join('') + '</select></div></div>' +
      '<div class="sd-dots"></div></div>';
    c.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) {
        var a = b.getAttribute('data-sd');
        if (b.hasAttribute('data-sd-sec')) self.playSection(+b.getAttribute('data-sd-sec'));
        else if (a === 'prev') { self.playing = false; self.prev(); }
        else if (a === 'next') { self.playing = false; self.next(); }
        else if (a === 'toggle') { if (self.playing) self.pause(); else self.play(); }
        else if (a === 'free') { if (self.touring) self.stop(); }
        else if (a === 'theme') self.toggleTheme();
        return;
      }
      var dot = e.target.closest('[data-i]');
      if (dot) { self.playing = false; self.goTo(+dot.getAttribute('data-i')); }
    });
    c.querySelector('[data-sd="speed"]').addEventListener('change', function (e) { self._setSpeed(+e.target.value); });
  };

  P._sync = function () {
    if (!this.controls) return;
    var c = this.controls, f = this.frames[this.idx], r = this._range();
    var small = c.querySelector('.sd-narr small'), text = c.querySelector('.sd-narr div');
    if (!f) {
      small.textContent = '自己點點看，或選一個章節開始導覽';
      text.textContent = '按 ▶ 播放會從頭演一遍；鍵盤 → ← 一步一步看';
    } else {
      var sec = this.sections[f.section];
      if (f.type === 'step') { small.textContent = sec.title + ' · 第 ' + f.n + ' 步 / 共 ' + f.total + ' 步'; text.textContent = f.step.say || ''; }
      else { small.textContent = sec.title + (f.type === 'intro' ? ' · 開始' : ' · 總結'); text.textContent = f.type === 'intro' ? '按 ▶ 播放，或按 → 一步一步看'
        : this.idx >= r[1] ? '導覽結束：點上面的章節重看，或按「自己點點看」自己操作' : '看完重點，按 → 繼續下一段'; }
    }
    c.querySelector('[data-sd="toggle"]').textContent = this.playing ? '❚❚ 暫停' : '▶ 播放';
    c.querySelector('[data-sd="prev"]').disabled = !f || this.idx <= r[0];
    c.querySelector('[data-sd="next"]').disabled = !!f && this.idx >= r[1];
    c.querySelector('[data-sd="speed"]').value = String(this.speed);
    c.querySelector('[data-sd="free"]').classList.toggle('sd-on', !this.touring);
    var th = c.querySelector('[data-sd="theme"]'), dark = this.theme === 'dark';
    th.textContent = dark ? '☀ 淺色' : '☾ 深色';
    th.title = dark ? '切換成淺色畫面' : '切換成深色畫面';
    th.setAttribute('aria-pressed', String(dark));
    c.querySelectorAll('[data-sd-sec]').forEach(function (b) { b.classList.toggle('sd-on', !!f && f.section === +b.getAttribute('data-sd-sec')); });
    var dots = '';
    for (var i = r[0]; i <= r[1]; i++) dots += '<i data-i="' + i + '" class="' + (i < this.idx ? 'sd-done' : i === this.idx ? 'sd-cur' : '') + '"></i>';
    c.querySelector('.sd-dots').innerHTML = f ? dots : '';
  };

  P._setSpeed = function (s) {
    this.speed = s;
    this.layer.style.setProperty('--sd-move', Math.round(T.move / s) + 'ms');
    this._sync();
  };

  // 鍵盤：→ 下一步、← 上一步、空白鍵 播放/暫停、Esc 停止；正在輸入文字時不攔
  P._key = function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (e.key === 'ArrowRight') { this.playing = false; this.next(); }
    else if (e.key === 'ArrowLeft') { this.playing = false; this.prev(); }
    else if (e.key === ' ') { e.preventDefault(); if (this.playing) this.pause(); else this.play(); }
    else if (e.key === 'Escape' && this.touring) this.stop();
  };

  // ---------- 小工具 ----------

  P._range = function () {
    if (this.only === null) return [0, this.frames.length - 1];
    var a = -1, b = -1, si = this.only;
    this.frames.forEach(function (f, i) { if (f.section === si) { if (a < 0) a = i; b = i; } });
    return [a, b];
  };
  P._find = function (name) { return name ? this.stage.querySelector('[data-demo="' + name + '"]') : null; };
  P._alive = function (my) { return my === this.gen; };
  P._wait = function (ms, my, instant) {
    var self = this;
    if (instant) return Promise.resolve(this._alive(my));
    return new Promise(function (r) { setTimeout(function () { r(self._alive(my)); }, ms / self.speed); });
  };
  P._instant = function (on) {
    this.layer.classList.toggle('sd-instant', on);
    if (!on) this.layer.offsetWidth; // 讓瀏覽器先吃下「有動畫」的狀態再改位置
  };
  P._clearMarks = function () {
    this.stage.querySelectorAll('.sd-hover,.sd-press').forEach(function (e) { e.classList.remove('sd-hover', 'sd-press'); });
  };
  P._render = function () { this.renderFn(this.state, this.stage); };

  function setText(e, v) { if ('value' in e) e.value = v; else e.textContent = v; }

  global.ScriptedDemo = {
    create: function (o) { var p = new Player(o); global.__scriptedDemo = p; return p; },
    version: '1.2.0'
  };
})(window);
