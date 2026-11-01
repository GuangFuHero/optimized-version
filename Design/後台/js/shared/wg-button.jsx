/*
 * WGButton —— 共用按鈕。規則 BTN-101〜108 寫在 wg-button.css 檔頭。
 *
 * 與設計系統 Button 的差異（這份才是之後前後台、前端 libs/ui 都要對齊的）：
 *   + loading   + tone="danger"（紅字次要鈕）  + selected   + block
 *   + sm 的可點範圍補到 44px   + 鍵盤焦點兩圈外框
 *   ～ hover／active 改走 CSS（原本用 inline onMouseEnter，鍵盤與觸控拿不到狀態）
 *   ～ 圓角鎖死膠囊，style 傳 borderRadius 會被忽略
 *
 * props: variant primary|secondary|outline|ghost|danger  tone "danger"  size sm|md|lg
 *        iconOnly（要 aria-label）  loading  selected  block  startIcon  endIcon  as="a"
 */
// ⚠️ 不用物件 rest（...rest）：Babel standalone 會在全域宣告 _excluded，跟其他 text/babel 腳本撞名 → 整頁白畫面（CLAUDE.md 09-27）
const WG_BTN_OWN = ["variant", "tone", "size", "iconOnly", "loading", "selected", "block", "startIcon", "endIcon", "disabled", "as", "type", "className", "style", "children"];
function WGButton(p) {
  const variant = p.variant || "primary", tone = p.tone, size = p.size || "md";
  const iconOnly = !!p.iconOnly, loading = !!p.loading, selected = p.selected, block = !!p.block;
  const startIcon = p.startIcon || null, endIcon = p.endIcon || null, disabled = !!p.disabled;
  const As = p.as || "button", type = p.type || "button", className = p.className || "", style = p.style, children = p.children;
  const rest = {};
  Object.keys(p).forEach((k) => { if (WG_BTN_OWN.indexOf(k) === -1) rest[k] = p[k]; });
  if (iconOnly && !rest["aria-label"] && window.console) console.warn("WGButton iconOnly 需要 aria-label（BTN-106）");
  const cls = [
    "wg-btn", "wg-btn--" + variant, "wg-btn--" + size,
    tone === "danger" ? "wg-btn--tone-danger" : "",
    iconOnly ? "wg-btn--icon" : "", block ? "wg-btn--block" : "",
    selected ? "wg-btn--selected" : "", className,
  ].filter(Boolean).join(" ");
  // BTN-101：圓角鎖死，不接受外部覆寫
  const safeStyle = Object.assign({}, style);
  delete safeStyle.borderRadius;
  const props = Object.assign({}, rest, {
    className: cls, style: safeStyle,
    "aria-busy": loading ? "true" : undefined,
    "aria-pressed": selected === undefined ? undefined : !!selected,
  });
  // loading 不用 disabled 屬性（會套上停用的灰色），改用 aria-busy＋擋掉點擊，顏色維持原樣
  if (loading && rest.onClick) props.onClick = (e) => e.preventDefault();
  if (As === "button") { props.type = type; props.disabled = disabled; }
  else if (disabled) { props["aria-disabled"] = "true"; props.className += " is-disabled"; }
  return React.createElement(As, props,
    React.createElement("span", { className: "wg-btn__content" }, startIcon, children, endIcon),
    loading ? React.createElement("span", { className: "wg-btn__spin", "aria-hidden": "true" }) : null);
}

/* 按鈕內的計數（BTN-110）。n 為 0 或空就不顯示。 */
function WGCount({ n, tone }) {
  if (!n) return null;
  return React.createElement("span", { className: "wg-btn__count" + (tone === "warning" ? " wg-btn__count--warning" : "") }, String(n));
}

/*
 * WGSplitButton —— 「新增 ▾」拆分按鈕（BTN-112）。
 * 主體點了做最常用的事（新增一筆）；箭頭開選單（例：從 CSV 匯入）。
 * ❌ 不要把主體改成開選單：最常用的動作會多一次點擊。
 * items 沒給（沒有匯入權限）→ 只剩一顆一般按鈕，連箭頭都不 render。
 * items: [{ icon, label, onClick }]
 */
function WGSplitButton({ label, icon = null, onClick, items, menuLabel = "更多新增方式", size = "md", defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (!items || !items.length) return React.createElement(WGButton, { size, startIcon: icon, onClick }, label);
  return React.createElement("span", { className: "wg-split" },
    React.createElement(WGButton, { size, startIcon: icon, onClick, className: "wg-split__main" }, label),
    React.createElement(WGButton, { size, iconOnly: true, className: "wg-split__arrow", "aria-label": menuLabel, "aria-expanded": open, "aria-haspopup": "menu", onClick: () => setOpen((o) => !o) },
      React.createElement(WGIcon, { n: open ? "ChevronUp" : "ChevronDown", s: 18 })),
    open && React.createElement(React.Fragment, null,
      React.createElement("span", { onClick: () => setOpen(false), style: { position: "fixed", inset: 0, zIndex: 400 } }),
      React.createElement("span", { className: "wg-split__menu", role: "menu" },
        items.map((it) => React.createElement("button", { key: it.label, role: "menuitem", className: "wg-split__item",
          onClick: () => { setOpen(false); it.onClick && it.onClick(); } }, it.icon, it.label)))));
}

/* WGSearch —— 膠囊搜尋框（INP-103）。一般輸入框請用 DS 的 Input（radius-md）。 */
function WGSearch(p) {
  const input = { type: "search" };
  Object.keys(p).forEach((k) => { if (["size", "icon", "className", "style"].indexOf(k) === -1) input[k] = p[k]; });
  return React.createElement("label", { className: "wg-search" + (p.size === "sm" ? " wg-search--sm" : "") + (p.className ? " " + p.className : ""), style: p.style },
    p.icon || null, React.createElement("input", input));
}

Object.assign(window, { WGButton, WGSearch, WGCount, WGSplitButton });
