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
(function () {
  const Icon = window.WGIcon;

  function Tile({ label, count, active, onClick, tone, icon, title, wide }) {
    const warn = tone === "warning" && count !== 0;
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
  function WGStatTiles({ items, value, onChange, extras }) {
    return (
      <div data-stat-tiles role="group" aria-label="統計（點了篩選狀態）" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <style>{".wg-stat-tile:hover{border-color:var(--color-fg-neutral-muted)}.wg-stat-tile:focus-visible{outline:2px solid var(--color-bg-primary);outline-offset:2px}"}</style>
        {items.map((it) => {
          const active = it.key === "all" ? value === "all" : value === it.key;
          return <Tile key={it.key} label={it.label} count={it.count} active={active} title={it.title}
            onClick={() => onChange(it.key === "all" || active ? "all" : it.key)} />;
        })}
        {(extras || []).map((x) => <Tile key={x.label} wide {...x} />)}
      </div>
    );
  }

  window.WGStatTiles = WGStatTiles;
})();
