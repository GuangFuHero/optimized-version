/*
 * WGTag／WGProgress／WGSelect／WGRadioCards／WGSettingRow —— 規則 TAG-／PRG-／SET- 寫在 wg-ui.css 檔頭。
 * 樣式在 wg-ui.css；這裡只組結構。⚠️ text/babel 腳本不用物件 rest 以外的花樣（見 CLAUDE.md 09-27 _excluded 坑）。
 */

/* tone: neutral|info|success|warning|danger|brand  fill: subtle|solid|quiet  dot: true 或顏色字串 */
function WGTag({ tone = "neutral", fill = "subtle", size = "md", dot, icon = null, strong = false, color, onRemove, removeLabel, children }) {
  if (tone === "primary") tone = "brand"; // 設計系統 Badge 的 primary＝這裡的 brand
  const cls = ["wg-tag", "wg-tag--" + tone, "wg-tag--" + fill, size === "sm" ? "wg-tag--sm" : "", strong ? "wg-tag--strong" : ""].filter(Boolean).join(" ");
  // color：災害類型這種「顏色本身就是資訊」的標籤，用自訂色（字與點同色、底是同色 10%）
  const style = color ? { "--tag-fg": color, "--tag-dot": color, "--tag-bg": color + "1A" } : (typeof dot === "string" ? { "--tag-dot": dot } : undefined);
  return React.createElement("span", { className: cls, style },
    dot ? React.createElement("span", { className: "wg-tag__dot" }) : null,
    icon, children,
    onRemove ? React.createElement("button", { className: "wg-tag__x", onClick: onRemove, "aria-label": removeLabel || "移除" },
      React.createElement(WGIcon, { n: "X", s: 12 })) : null);
}

/* value／max：max 為 0 或空（數量留空）→ 不畫條（PRG-104）。tone: brand|neutral。label 在左、數字在右。 */
/* complete：「人數滿了」不一定等於「做完了」（後台的在途 3/3＝都有人接、還沒完成）—— 這種情況傳 complete={false}，不變綠 */
// 🔒 PRG-105（Sucre 11-01，回 PR #233）文字三種寫法，「已滿」只看人數（現在不會自動額滿，沒招滿就不可能已滿）：
//   還在招人「3/8 · 還缺 5 人」｜人數夠了（含超過）「已滿 8/8」「已滿 10/8」｜已結束但沒滿（ended）「已結束 · 3/8」
//   ❌ 不要用 complete 決定文字 —— complete 只管顏色（綠不綠）
function WGProgress({ value = 0, max, tone = "brand", size = "md", label, valueText, complete, ended }) {
  const has = typeof max === "number" && max > 0;
  const full = has && value >= max;
  const done = complete !== undefined ? complete : full;
  const pct = has ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const text = valueText || (!has ? "已有 " + value + " 人"
    : full ? "已滿 " + value + "/" + max
    : ended ? "已結束 · " + value + "/" + max
    : value + "/" + max + " · 還缺 " + (max - value) + " 人");
  const cls = ["wg-progress", "wg-progress--" + tone, size === "sm" ? "wg-progress--sm" : "", done ? "wg-progress--done" : ""].filter(Boolean).join(" ");
  return React.createElement("div", { className: cls },
    React.createElement("div", { className: "wg-progress__head" }, label ? React.createElement("span", null, label) : null, React.createElement("b", null, text)),
    has ? React.createElement("div", { className: "wg-progress__track", role: "progressbar", "aria-valuenow": value, "aria-valuemin": 0, "aria-valuemax": max, "aria-label": label || text },
      React.createElement("div", { className: "wg-progress__fill", style: { width: pct + "%" } })) : null);
}

/* options: [[value, label]]。其餘屬性（value、onChange、aria-label、data-*…）原樣交給 <select> */
function WGSelect(p) {
  const sel = {};
  Object.keys(p).forEach((k) => { if (["options", "style", "ariaLabel"].indexOf(k) === -1) sel[k] = p[k]; });
  if (p.ariaLabel) sel["aria-label"] = p.ariaLabel;
  return React.createElement("span", { className: "wg-select", style: p.style },
    React.createElement("select", sel,
      p.options.map(([v, l]) => React.createElement("option", { key: v, value: v }, l))),
    React.createElement("span", { className: "wg-select__chev" }, React.createElement(WGIcon, { n: "ChevronDown", s: 18 })));
}

/* options: [{ value, title, desc }] */
function WGRadioCards({ name, options, value, onChange }) {
  return React.createElement("div", { className: "wg-radios", role: "radiogroup" },
    options.map((o) => React.createElement("label", { key: o.value, className: "wg-radio" },
      React.createElement("input", { type: "radio", name, checked: value === o.value, onChange: () => onChange && onChange(o.value) }),
      React.createElement("span", null,
        React.createElement("div", { className: "wg-radio__title" }, o.title),
        o.desc ? React.createElement("div", { className: "wg-radio__desc" }, o.desc) : null))));
}

/* stack：控制項太寬（單選卡、長下拉）時改成上下排 */
function WGSettingRow({ title, desc, stack = false, children }) {
  return React.createElement("div", { className: "wg-setrow" + (stack ? " wg-setrow--stack" : "") },
    React.createElement("div", { className: "wg-setrow__text" },
      React.createElement("div", { className: "wg-setrow__title" }, title),
      desc ? React.createElement("div", { className: "wg-setrow__desc" }, desc) : null),
    children);
}

Object.assign(window, { WGTag, WGProgress, WGSelect, WGRadioCards, WGSettingRow });
