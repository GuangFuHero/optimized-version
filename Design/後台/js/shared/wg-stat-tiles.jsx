// wg-stat-tiles.jsx — 列表上方的統計數字＋點了就篩選（任務管理、資源站點共用）
//
// 🆕 2026-11-01 Sucre：「staging 上方的統計資料＋點擊可以自動篩選很棒，本地跟進；
//    不要覆蓋太多畫面，也不用凍結在最上面。」
//    staging 的出處：前端 ticket-stats-strip.tsx（任務單，只顯示不能點）、
//    station-stats-strip.tsx（站點，能點；10-31 因設計稿沒有而拿掉，這版補回設計）。
//
// 🔒 STAT-101 一排、矮、左右滿版：每格只有「名稱＋數字」同一行，高 48px，平分整列寬度，窄螢幕自動換行。不做 sticky —— 往下捲就捲走。
// 🔒 STAT-102 數字算的是「目前權限範圍內全部」，不吃篩選與搜尋（同 staging：
//    ticket-board-page「The stats strip counts the whole board in the caller's scope, whatever the filters」）。
//    🔴 不能改成吃篩選：點「待處理」之後其他格會全變 0，就沒辦法看著數字換下一格了。
// 🔒 STAT-103 點一格＝把同一個「狀態」篩選設成那個值（跟篩選面板裡的狀態 chip 是同一個 state，兩邊永遠一致）；
//    再點一次已選的那格、或點「全部」＝清掉狀態篩選。其他篩選與搜尋不動。
// 🔒 STAT-104 被選中的那格要看得出來（品牌色框＋aria-pressed），不然人會以為數字下面那張表是全部。
// 🔒 STAT-105 警示格（例：志工缺口）只顯示、不能點 —— 沒有對應的篩選條件，做成按鈕會讓人以為按了沒反應。
//    沒有載到數字時寫「—」，不寫 0（staging：an unknown count shows as —, never as 0）。
// 🆕 2026-11-02 STAT-109 數字讀不到時（Sucre：照 staging 做，避免設計有出入）：
//    出處 staging PR #232 `stat-tiles.tsx` 的 StatTilesRetry ＋ station-stats-strip.tsx／ticket-stats-strip.tsx。
//    ① 統計排上方一行紅色小字：「⚠ 無法載入統計  重試」（caption 13px、高 24px、不用 Callout 色塊 —— 統計只是附屬，不佔篇幅）
//    ② 下面那排格子照樣出現，數字全部寫「—」（STAT-108），還是可以點來篩選 —— 列表本身可能載得好好的
//    ③ 重試中「重試」停用；重試成功提示消失，失敗就留著
//    🔴 只擋這一排，不擋整頁：統計跟列表是兩支 API，統計壞掉不代表列表壞掉
//    任務管理、資源站點同一個做法。原型模擬：網址加 `?stats=fail`（第一次重試會成功）
(function () {
  const Icon = window.WGIcon;

  function Tile({ label, count, active, onClick, tone, icon, title, wide }) {
    const warn = tone === "warning" && count != null && count !== 0;   // 數字不知道（—）時不上警示色（同 staging）
    // count 可以是 { main, sub }（例：「缺 637 人」＋「14 項需求」）。
    // 🔒 STAT-106 字太長時先縮、再換行，不准撐破格子：
    //    ① 主數字字級跟著格子寬度縮（cqi），最小 16px、最大 20px —— 再小就不像統計數字了
    //    ② 縮到 16px 還放不下，sub 換到第二行（主數字與 sub 各自不斷行），格子長高，不截字
    //    名稱（例：志工缺口）不縮也不截，讓數字那邊先讓。
    const parts = count != null && typeof count === "object" ? count : null;
    const base = {
      display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "6px 16px", minWidth: 0,
      containerType: "inline-size",
      // 2026-11-01 Sucre：左右滿版比較有統計的感覺、高度維持窄窄的。
      // 每格平分整列寬度；寫字比較長的警示格（志工缺口）佔兩份。窄螢幕放不下 120px 就換行。
      flex: wide ? "2 1 220px" : "1 1 120px",
      borderRadius: "var(--radius-md)", boxSizing: "border-box", textAlign: "left",
      border: "1px solid " + (active ? "var(--color-bg-primary)" : warn ? "var(--color-bg-warning-hover)" : "var(--color-border-default)"),
      background: active ? "var(--color-bg-primary-subtle)" : warn ? "var(--color-bg-warning-subtle)" : "var(--color-bg-neutral-default)",
      font: "inherit",
    };
    const inner = (
      <>
        {icon && Icon && <Icon n={icon} s={15} c={warn ? "var(--color-fg-warning)" : "var(--color-fg-neutral-muted)"} />}
        <span className="wg-caption" title={label} style={{ color: active ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
        <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "flex-end", columnGap: 8, rowGap: 2, flex: "1 1 0", minWidth: 0, textAlign: "right" }}>
          <span style={{ font: "var(--font-heading-700)", fontSize: parts ? "clamp(16px, 7cqi, 20px)" : 20, lineHeight: 1.1, color: warn ? "var(--color-fg-warning)" : "var(--color-fg-neutral-default)", whiteSpace: "nowrap" }}>
            {count == null ? "—" : parts ? parts.main : count}
          </span>
          {parts && parts.sub && <span className="wg-caption" style={{ color: warn ? "var(--color-fg-warning)" : "var(--color-fg-neutral-muted)", whiteSpace: "nowrap" }}>{parts.sub}</span>}
        </span>
      </>
    );
    if (!onClick) return <div data-stat-tile={label} title={title} style={base}>{inner}</div>;
    return (
      <button type="button" data-stat-tile={label} aria-pressed={!!active} title={title || (active ? "再點一次取消篩選" : "只看「" + label + "」")}
        onClick={onClick} className="wg-stat-tile" style={{ ...base, cursor: "pointer" }}>
        {inner}
      </button>
    );
  }

  /**
   * items: [{ key, label, count }] —— key "all" 代表全部
   * value / onChange: 狀態篩選目前的值（"all" 或某個 key）
   * extras: [{ label, count, tone, icon, title }] —— 只顯示、不能點（STAT-105）
   */
  /** STAT-109 數字讀不到：統計排自己的一行小提示＋重試 */
  // 🔄 2026-11-02 Sucre：統計只是列表的附屬，提示不要佔篇幅 → 不用 Callout 色塊，
  //    改成一行小字（caption 13px、高 24px）＋文字鈕「重試」，緊貼在格子上方。
  function StatTilesRetry({ retrying, onRetry }) {
    return (
      <div data-stat-retry role="alert" className="wg-caption" style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 24, color: "var(--color-fg-danger)" }}>
        {Icon && <Icon n="CircleAlert" s={14} c="var(--color-fg-danger)" />}
        <span>無法載入統計</span>
        <button type="button" disabled={retrying} onClick={onRetry}
          style={{ border: 0, background: "none", padding: "0 4px", minHeight: 24, font: "inherit", fontWeight: 700,
            color: retrying ? "var(--color-fg-neutral-muted)" : "var(--color-fg-danger)", textDecoration: "underline", cursor: retrying ? "default" : "pointer" }}>
          {retrying ? "重試中…" : "重試"}
        </button>
      </div>
    );
  }

  /**
   * failed / retrying / onRetry：STAT-109（數字讀不到）。failed 時所有格子寫「—」
   */
  function WGStatTiles({ items, value, onChange, extras, failed, retrying, onRetry }) {
    const unknown = (it) => (failed ? Object.assign({}, it, { count: null, title: undefined }) : it);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {failed && <StatTilesRetry retrying={!!retrying} onRetry={onRetry} />}
        <div data-stat-tiles role="group" aria-label="統計（點了篩選狀態）" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <style>{".wg-stat-tile:hover{border-color:var(--color-fg-neutral-muted)}.wg-stat-tile:focus-visible{outline:2px solid var(--color-bg-primary);outline-offset:2px}"}</style>
          {items.map(unknown).map((it) => {
            const active = it.key === "all" ? value === "all" : value === it.key;
            return <Tile key={it.key} label={it.label} count={it.count} active={active} title={it.title}
              onClick={() => onChange(it.key === "all" || active ? "all" : it.key)} />;
          })}
          {(extras || []).map(unknown).map((x) => <Tile key={x.label} wide {...x} />)}
        </div>
      </div>
    );
  }

  /** 原型用：模擬統計 API 讀不到（網址 ?stats=fail），按「重試」等 0.8 秒後成功 */
  function useWGStatLoad() {
    const [failed, setFailed] = React.useState(() => /[?&]stats=fail\b/.test(location.search));
    const [retrying, setRetrying] = React.useState(false);
    const onRetry = () => { setRetrying(true); setTimeout(() => { setRetrying(false); setFailed(false); }, 800); };
    return { failed, retrying, onRetry };
  }

  window.WGStatTiles = WGStatTiles;
  window.useWGStatLoad = useWGStatLoad;
})();
