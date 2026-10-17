/* @ds-bundle: {"format":3,"namespace":"WanGuardDesignSystem_9c8f68","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"SidebarItem","sourcePath":"components/navigation/SidebarItem.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"a71dc0f83469","components/core/Badge.jsx":"c47c8e9a5697","components/core/Button.jsx":"a1aa5e037849","components/core/Card.jsx":"33c86869c2df","components/core/Chip.jsx":"a92078cd949b","components/feedback/Alert.jsx":"fe42c8ae0080","components/forms/Checkbox.jsx":"17336ef060d4","components/forms/Field.jsx":"e6ebc6f60432","components/forms/Input.jsx":"635392389305","components/forms/Switch.jsx":"5c36a088c591","components/navigation/SidebarItem.jsx":"a0468106d649","components/navigation/Tabs.jsx":"6c4b0e88b46e","ui_kits/console/ConsoleShell.jsx":"664fb9d3bee9","ui_kits/console/DashboardView.jsx":"483f544223d8","ui_kits/console/LoginScreen.jsx":"966d8e90d2c5","ui_kits/console/MapView.jsx":"744b4649a064","ui_kits/console/SupplyView.jsx":"80bd6e5f1846"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WanGuardDesignSystem_9c8f68 = window.WanGuardDesignSystem_9c8f68 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Circular avatar — image with initials fallback.
 */
function Avatar({
  src = "",
  name = "",
  size = 40,
  tone = "primary",
  style,
  ...rest
}) {
  const tones = {
    primary: {
      bg: "var(--color-bg-primary-subtle)",
      fg: "var(--color-brand-primary-subtle)"
    },
    secondary: {
      bg: "var(--color-bg-secondary-subtle)",
      fg: "var(--color-brand-secondary-subtle)"
    },
    neutral: {
      bg: "var(--color-bg-neutral-sunken)",
      fg: "var(--color-fg-neutral-subtle)"
    }
  };
  const t = tones[tone] || tones.primary;
  const initials = name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() : "";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "var(--radius-full)",
      overflow: "hidden",
      background: t.bg,
      color: t.fg,
      font: "var(--font-label-400)",
      fontSize: Math.round(size * 0.36),
      boxShadow: "inset 0 0 0 1px var(--color-border-default)",
      flexShrink: 0,
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials || null);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Compact status / metadata label. Solid or subtle, across the tonal palette.
 */
function Badge({
  tone = "neutral",
  variant = "subtle",
  style,
  children,
  ...rest
}) {
  const tones = {
    neutral: {
      solidBg: "var(--color-bg-neutral-sunken)",
      solidFg: "var(--color-fg-neutral-subtle)",
      subBg: "var(--color-bg-neutral-sunken)",
      subFg: "var(--color-fg-neutral-subtle)"
    },
    primary: {
      solidBg: "var(--color-bg-primary)",
      solidFg: "var(--color-fg-on-primary)",
      subBg: "var(--color-bg-primary-subtle)",
      subFg: "var(--color-brand-primary-subtle)"
    },
    secondary: {
      solidBg: "var(--color-bg-secondary)",
      solidFg: "var(--color-fg-on-secondary)",
      subBg: "var(--color-bg-secondary-subtle)",
      subFg: "var(--color-brand-secondary-subtle)"
    },
    success: {
      solidBg: "var(--color-bg-success)",
      solidFg: "var(--color-fg-on-success)",
      subBg: "var(--color-bg-success-subtle)",
      subFg: "var(--color-fg-success)"
    },
    warning: {
      solidBg: "var(--color-bg-warning)",
      solidFg: "var(--color-fg-on-warning)",
      subBg: "var(--color-bg-warning-subtle)",
      subFg: "var(--color-fg-warning)"
    },
    danger: {
      solidBg: "var(--color-bg-danger)",
      solidFg: "var(--color-fg-on-danger)",
      subBg: "var(--color-bg-danger-subtle)",
      subFg: "var(--color-fg-danger)"
    },
    info: {
      solidBg: "var(--color-bg-info)",
      solidFg: "var(--color-fg-on-info)",
      subBg: "var(--color-bg-info-subtle)",
      subFg: "var(--color-fg-info)"
    }
  };
  const t = tones[tone] || tones.neutral;
  const solid = variant === "solid";
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      height: 22,
      padding: "0 8px",
      borderRadius: "var(--radius-full)",
      background: solid ? t.solidBg : t.subBg,
      color: solid ? t.solidFg : t.subFg,
      font: "var(--font-label-300)",
      fontWeight: 700,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Wan Guard primary action element. Pill-shaped, warm, high-contrast.
 * Primary = Vitality Orange with near-black label (WCAG AAA).
 */
function Button({
  variant = "primary",
  size = "md",
  iconOnly = false,
  startIcon = null,
  endIcon = null,
  disabled = false,
  type = "button",
  style,
  children,
  ...rest
}) {
  const sizes = {
    sm: {
      height: 36,
      padX: 14,
      font: "var(--font-label-400)",
      gap: 6
    },
    md: {
      height: 44,
      padX: 20,
      font: "var(--font-label-500)",
      gap: 8
    },
    lg: {
      height: 52,
      padX: 24,
      font: "var(--font-label-500)",
      gap: 8
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      bg: "var(--color-bg-primary)",
      bgHover: "var(--color-bg-primary-hover)",
      fg: "var(--color-fg-on-primary)",
      border: "transparent"
    },
    secondary: {
      bg: "var(--color-bg-secondary)",
      bgHover: "var(--color-bg-secondary-hover)",
      fg: "var(--color-fg-on-secondary)",
      border: "transparent"
    },
    danger: {
      bg: "var(--color-bg-danger)",
      bgHover: "var(--color-bg-danger-hover)",
      fg: "var(--color-fg-on-danger)",
      border: "transparent"
    },
    outline: {
      bg: "transparent",
      bgHover: "var(--color-bg-primary-subtle)",
      fg: "var(--color-brand-primary-subtle)",
      border: "var(--color-border-accent)"
    },
    ghost: {
      bg: "transparent",
      bgHover: "var(--color-bg-neutral-sunken)",
      fg: "var(--color-fg-neutral-default)",
      border: "transparent"
    }
  };
  const v = variants[variant] || variants.primary;
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: s.height,
    minWidth: iconOnly ? s.height : undefined,
    padding: iconOnly ? 0 : `0 ${s.padX}px`,
    width: iconOnly ? s.height : undefined,
    border: `1.5px solid ${v.border}`,
    borderRadius: "var(--radius-full)",
    background: disabled ? "var(--color-bg-disable)" : v.bg,
    color: disabled ? "var(--color-fg-disable)" : v.fg,
    font: s.font,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform var(--transition-spring), background var(--transition-fast), box-shadow var(--transition-base)",
    boxShadow: variant === "primary" && !disabled ? "var(--shadow-sm)" : "none",
    whiteSpace: "nowrap",
    userSelect: "none",
    ...style
  };
  const onEnter = e => {
    if (disabled) return;
    e.currentTarget.style.background = v.bgHover;
    e.currentTarget.style.transform = "translateY(-2px)";
    if (variant === "primary") e.currentTarget.style.boxShadow = "var(--shadow-md)";
  };
  const onLeave = e => {
    if (disabled) return;
    e.currentTarget.style.background = v.bg;
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = variant === "primary" ? "var(--shadow-sm)" : "none";
  };
  const onDown = e => {
    if (!disabled) e.currentTarget.style.transform = "scale(0.97)";
  };
  const onUp = e => {
    if (!disabled) e.currentTarget.style.transform = "translateY(-2px)";
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    style: base,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onMouseDown: onDown,
    onMouseUp: onUp
  }, rest), startIcon, !iconOnly && children, iconOnly && children, endIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Warm, rounded surface container. The default home for grouped content.
 */
function Card({
  padding = "var(--space-6)",
  radius = "var(--radius-lg)",
  elevation = "md",
  interactive = false,
  style,
  children,
  ...rest
}) {
  const shadows = {
    none: "none",
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)"
  };
  const base = {
    background: "var(--color-bg-neutral-default)",
    border: "1px solid var(--color-border-default)",
    borderRadius: radius,
    boxShadow: shadows[elevation] ?? shadows.md,
    padding,
    transition: "transform var(--transition-spring), box-shadow var(--transition-base)",
    ...style
  };
  const onEnter = e => {
    if (!interactive) return;
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.boxShadow = "var(--shadow-lg)";
  };
  const onLeave = e => {
    if (!interactive) return;
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow = shadows[elevation] ?? shadows.md;
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: base,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Selectable filter chip — pill with optional check + count, default & active states.
 */
function Chip({
  active = false,
  count = null,
  leadingIcon = null,
  onClick,
  style,
  children,
  ...rest
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    padding: "0 12px",
    borderRadius: "var(--radius-full)",
    background: active ? "var(--color-bg-secondary-subtle)" : "var(--color-bg-neutral-default)",
    boxShadow: active ? "inset 0 0 0 1.5px var(--color-brand-secondary-default)" : "inset 0 0 0 1px var(--color-border-default)",
    color: active ? "var(--color-brand-secondary-subtle)" : "var(--color-fg-neutral-subtle)",
    font: "var(--font-label-400)",
    cursor: "pointer",
    userSelect: "none",
    transition: "background var(--transition-fast), box-shadow var(--transition-fast)",
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    "aria-pressed": active,
    style: base
  }, rest), leadingIcon, /*#__PURE__*/React.createElement("span", null, children), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 20,
      height: 16,
      padding: "0 5px",
      borderRadius: "var(--radius-full)",
      background: active ? "var(--color-brand-secondary-default)" : "var(--color-bg-neutral-sunken)",
      color: active ? "var(--color-fg-on-secondary)" : "var(--color-fg-neutral-subtle)",
      font: "var(--font-data-300)",
      fontWeight: 700
    }
  }, count));
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Inline alert / message banner across the tonal palette.
 */
function Alert({
  tone = "info",
  title = null,
  icon = null,
  onClose,
  style,
  children,
  ...rest
}) {
  const tones = {
    info: {
      bg: "var(--color-bg-info-subtle)",
      fg: "var(--color-fg-info)",
      bar: "var(--color-bg-info)"
    },
    success: {
      bg: "var(--color-bg-success-subtle)",
      fg: "var(--color-fg-success)",
      bar: "var(--color-bg-success)"
    },
    warning: {
      bg: "var(--color-bg-warning-subtle)",
      fg: "var(--color-fg-warning)",
      bar: "var(--color-bg-warning)"
    },
    danger: {
      bg: "var(--color-bg-danger-subtle)",
      fg: "var(--color-fg-danger)",
      bar: "var(--color-bg-danger)"
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "alert",
    style: {
      display: "flex",
      gap: 12,
      padding: "14px 16px",
      borderRadius: "var(--radius-md)",
      background: t.bg,
      boxShadow: `inset 3px 0 0 0 ${t.bar}`,
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.fg,
      flexShrink: 0,
      display: "inline-flex",
      marginTop: 1
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--font-body-400)",
      fontWeight: 700,
      color: t.fg,
      marginBottom: children ? 2 : 0
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--font-body-300)",
      color: "var(--color-fg-neutral-subtle)"
    }
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClose,
    "aria-label": "\u95DC\u9589",
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: t.fg,
      lineHeight: 0,
      padding: 2
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox with a rounded square box and brand-orange checked fill.
 */
function Checkbox({
  checked = false,
  disabled = false,
  label = null,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 22,
      height: 22,
      borderRadius: "var(--radius-sm)",
      background: checked ? "var(--color-bg-primary)" : "var(--color-bg-neutral-default)",
      boxShadow: checked ? "none" : "inset 0 0 0 1.5px var(--color-border-default)",
      transition: "background var(--transition-fast), box-shadow var(--transition-fast)"
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    className: "wg-sr-only"
  }, rest)), checked && /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--color-fg-on-primary)",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--font-body-400)",
      color: "var(--color-fg-neutral-default)"
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Form field wrapper: label (+ required mark), control slot, helper / error text.
 */
function Field({
  label,
  required = false,
  helper = null,
  error = null,
  htmlFor,
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      ...style
    }
  }, rest), label && /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      font: "var(--font-label-400)",
      color: "var(--color-fg-neutral-default)",
      display: "inline-flex",
      gap: 2
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--color-fg-danger)"
    },
    "aria-hidden": "true"
  }, "*")), children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--font-body-300)",
      color: "var(--color-fg-danger)"
    }
  }, error) : helper ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--font-body-300)",
      color: "var(--color-fg-neutral-muted)"
    }
  }, helper) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input field. Rounded, generous hit area, clear focus ring.
 */
function Input({
  invalid = false,
  disabled = false,
  leadingIcon = null,
  trailingIcon = null,
  style,
  ...rest
}) {
  const wrap = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 48,
    padding: "0 16px",
    borderRadius: "var(--radius-md)",
    background: disabled ? "var(--color-bg-disable)" : "var(--color-bg-neutral-subtle)",
    boxShadow: invalid ? "inset 0 0 0 1.5px var(--color-bg-danger)" : "inset 0 0 0 1px var(--color-border-default)",
    transition: "box-shadow var(--transition-fast)",
    ...style
  };
  const input = {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    font: "var(--font-body-400)",
    color: "var(--color-fg-neutral-default)"
  };
  const onFocus = e => {
    const w = e.currentTarget.parentElement;
    if (w && !invalid) w.style.boxShadow = "inset 0 0 0 1.5px var(--color-brand-secondary-default)";
  };
  const onBlur = e => {
    const w = e.currentTarget.parentElement;
    if (w && !invalid) w.style.boxShadow = "inset 0 0 0 1px var(--color-border-default)";
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrap
  }, leadingIcon, /*#__PURE__*/React.createElement("input", _extends({
    style: input,
    disabled: disabled,
    "aria-invalid": invalid || undefined,
    onFocus: onFocus,
    onBlur: onBlur
  }, rest)), trailingIcon);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Toggle switch with a spring thumb. On = brand orange.
 */
function Switch({
  checked = false,
  disabled = false,
  onChange,
  label = null,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      width: 44,
      height: 26,
      borderRadius: "var(--radius-full)",
      background: checked ? "var(--color-bg-primary)" : "var(--color-bg-neutral-sunken)",
      boxShadow: checked ? "none" : "inset 0 0 0 1px var(--color-border-default)",
      transition: "background var(--transition-base)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    className: "wg-sr-only"
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 3,
      left: checked ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "var(--radius-full)",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--transition-spring)"
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--font-body-400)",
      color: "var(--color-fg-neutral-default)"
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Sidebar navigation item — icon + label, active & collapsed states.
 * Active uses warm orange-subtle fill, orange label, and a left indicator bar.
 */
function SidebarItem({
  icon = null,
  label,
  active = false,
  collapsed = false,
  onClick,
  style,
  ...rest
}) {
  const base = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: collapsed ? 0 : 12,
    justifyContent: collapsed ? "center" : "flex-start",
    width: collapsed ? 44 : "100%",
    height: 44,
    padding: collapsed ? 0 : "0 16px",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: active ? "var(--color-bg-primary-subtle)" : "transparent",
    color: active ? "var(--color-brand-primary-subtle)" : "var(--color-fg-neutral-subtle)",
    font: "var(--font-label-400)",
    cursor: "pointer",
    transition: "background var(--transition-fast), color var(--transition-fast)",
    textAlign: "left",
    ...style
  };
  const onEnter = e => {
    if (!active) e.currentTarget.style.background = "var(--color-bg-neutral-sunken)";
  };
  const onLeave = e => {
    if (!active) e.currentTarget.style.background = "transparent";
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    "aria-current": active ? "page" : undefined,
    title: collapsed ? label : undefined,
    style: base,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave
  }, rest), active && !collapsed && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 0,
      top: 12,
      width: 3,
      height: 20,
      borderRadius: "var(--radius-full)",
      background: "var(--color-bg-primary)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      flexShrink: 0,
      color: "currentColor"
    }
  }, icon), !collapsed && /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: "nowrap"
    }
  }, label));
}
Object.assign(__ds_scope, { SidebarItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Underline tab bar. The active tab is bold with a brand-orange underline.
 */
function Tabs({
  tabs = [],
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "flex",
      gap: 4,
      borderBottom: "1px solid var(--color-border-default)",
      ...style
    }
  }, rest), tabs.map(t => {
    const id = typeof t === "string" ? t : t.value;
    const lbl = typeof t === "string" ? t : t.label;
    const active = id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(id),
      style: {
        position: "relative",
        padding: "10px 14px",
        border: "none",
        background: "transparent",
        font: "var(--font-label-400)",
        color: active ? "var(--color-fg-neutral-default)" : "var(--color-fg-neutral-muted)",
        cursor: "pointer",
        transition: "color var(--transition-fast)"
      }
    }, lbl, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        left: 8,
        right: 8,
        bottom: -1,
        height: 3,
        borderRadius: "var(--radius-full)",
        background: active ? "var(--color-bg-primary)" : "transparent",
        transition: "background var(--transition-base)"
      }
    }));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/ConsoleShell.jsx
try { (() => {
// ConsoleShell — collapsible sidebar + top bar wrapper for the manager console
(function () {
  const {
    SidebarItem,
    Avatar,
    Badge
  } = window.WanGuardDesignSystem_9c8f68;
  const NAV = [["dashboard", "總覽儀表板", "LayoutDashboard"], ["map", "互助地圖", "MapPin"], ["supply", "物資管理", "Package"], ["task", "任務派遣", "ClipboardList"], ["team", "志工團隊", "Users"]];
  function ConsoleShell({
    active,
    onNavigate,
    onLogout,
    children
  }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const Icon = window.WGIcon;
    const title = (NAV.find(n => n[0] === active) || NAV[0])[1];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        minHeight: "100%",
        background: "var(--color-bg-neutral-subtle)"
      }
    }, /*#__PURE__*/React.createElement("aside", {
      style: {
        width: collapsed ? 76 : 244,
        flexShrink: 0,
        background: "var(--color-bg-neutral-default)",
        borderRight: "1px solid var(--color-border-default)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "width var(--transition-base)",
        position: "sticky",
        top: 0,
        height: "100vh"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px 14px",
        justifyContent: collapsed ? "center" : "flex-start"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 28,
        display: "inline-flex",
        color: "var(--color-brand-primary-default)",
        flexShrink: 0
      },
      dangerouslySetInnerHTML: {
        __html: window.WGMark
      }
    }), !collapsed && /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--font-label-500)",
        fontSize: 18,
        color: "var(--color-fg-neutral-default)"
      }
    }, "\u5149\u5FA9\u8D85\u4EBA")), NAV.map(([id, label, icon]) => /*#__PURE__*/React.createElement(SidebarItem, {
      key: id,
      icon: /*#__PURE__*/React.createElement(Icon, {
        n: icon,
        s: 22
      }),
      label: label,
      active: active === id,
      collapsed: collapsed,
      onClick: () => onNavigate(id)
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: "auto"
      }
    }, /*#__PURE__*/React.createElement(SidebarItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        n: collapsed ? "PanelLeftOpen" : "PanelLeftClose",
        s: 22
      }),
      label: "\u6536\u5408\u9078\u55AE",
      collapsed: collapsed,
      onClick: () => setCollapsed(c => !c)
    }), /*#__PURE__*/React.createElement(SidebarItem, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        n: "LogOut",
        s: 22
      }),
      label: "\u767B\u51FA",
      collapsed: collapsed,
      onClick: onLogout
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("header", {
      style: {
        height: 68,
        flexShrink: 0,
        background: "var(--color-bg-neutral-default)",
        borderBottom: "1px solid var(--color-border-default)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 28px",
        position: "sticky",
        top: 0,
        zIndex: 100
      }
    }, /*#__PURE__*/React.createElement("h1", {
      className: "wg-h700",
      style: {
        fontSize: 20
      }
    }, title), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        maxWidth: 360,
        marginLeft: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 14px",
        borderRadius: "var(--radius-full)",
        background: "var(--color-bg-neutral-subtle)",
        boxShadow: "inset 0 0 0 1px var(--color-border-default)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      n: "Search",
      s: 18,
      c: "var(--color-fg-neutral-muted)"
    }), /*#__PURE__*/React.createElement("input", {
      placeholder: "\u641C\u5C0B\u4EFB\u52D9\u3001\u7269\u8CC7\u6216\u5FD7\u5DE5\u2026",
      style: {
        flex: 1,
        border: "none",
        background: "transparent",
        outline: "none",
        font: "var(--font-body-400)",
        color: "var(--color-fg-neutral-default)"
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        position: "relative",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: "var(--color-fg-neutral-subtle)",
        lineHeight: 0
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      n: "Bell",
      s: 22
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "var(--color-bg-danger)",
        border: "2px solid var(--color-bg-neutral-default)"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: "\u9673\u6021\u541B",
      tone: "primary",
      size: 36
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        lineHeight: 1.25
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-label-400)",
        color: "var(--color-fg-neutral-default)"
      }
    }, "\u9673\u6021\u541B"), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-data-300)",
        color: "var(--color-fg-neutral-muted)"
      }
    }, "\u5340\u57DF\u8ABF\u5EA6\u5B98"))))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        padding: 28,
        overflow: "auto"
      }
    }, children)));
  }
  window.ConsoleShell = ConsoleShell;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/ConsoleShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/DashboardView.jsx
try { (() => {
// DashboardView — KPI stats, active alert, recent tasks
(function () {
  const {
    Card,
    Badge,
    Button,
    Alert
  } = window.WanGuardDesignSystem_9c8f68;
  function StatCard({
    icon,
    tone,
    label,
    value,
    delta,
    deltaTone
  }) {
    const Icon = window.WGIcon;
    return /*#__PURE__*/React.createElement(Card, {
      padding: "20px",
      elevation: "sm",
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        borderRadius: "var(--radius-md)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `var(--color-bg-${tone}-subtle)`,
        color: `var(--color-bg-${tone})`
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      n: icon,
      s: 22
    })), delta && /*#__PURE__*/React.createElement(Badge, {
      tone: deltaTone
    }, delta)), /*#__PURE__*/React.createElement("div", {
      className: "wg-data",
      style: {
        fontSize: 30,
        marginTop: 14
      }
    }, value), /*#__PURE__*/React.createElement("div", {
      className: "wg-caption",
      style: {
        marginTop: 2
      }
    }, label));
  }
  const TASKS = [["#A-1042", "大進村民宅清淤", "災後復原", "warning", "進行中", 8, "光復鄉大進村"], ["#A-1041", "馬太鞍溪堤防沙包堆置", "防汛整備", "danger", "緊急", 14, "馬太鞍溪左岸"], ["#A-1038", "收容所物資配送", "物資調度", "secondary", "待出發", 5, "光復國中"], ["#A-1035", "獨居長者關懷訪視", "在地互助", "success", "已完成", 3, "大富社區"]];
  function DashboardView() {
    const Icon = window.WGIcon;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 22,
        maxWidth: 1100
      }
    }, /*#__PURE__*/React.createElement(Alert, {
      tone: "danger",
      title: "\u99AC\u592A\u978D\u6EAA\u571F\u77F3\u6D41\u7D05\u8272\u8B66\u6212",
      icon: /*#__PURE__*/React.createElement(Icon, {
        n: "TriangleAlert",
        s: 20
      }),
      onClose: () => {}
    }, "\u4E2D\u592E\u6C23\u8C61\u7F72\u91DD\u5C0D\u5149\u5FA9\u9109\u5C71\u5340\u767C\u5E03\u7D05\u8272\u8B66\u6212\uFF0C\u8ACB\u512A\u5148\u8ABF\u5EA6\u4E0A\u6E38 3 \u8655\u4EFB\u52D9\u4EBA\u529B\u64A4\u96E2\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 16,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(StatCard, {
      icon: "UserCheck",
      tone: "primary",
      label: "\u5728\u7DDA\u5FD7\u5DE5",
      value: "1,284",
      delta: "+126",
      deltaTone: "success"
    }), /*#__PURE__*/React.createElement(StatCard, {
      icon: "ClipboardList",
      tone: "secondary",
      label: "\u9032\u884C\u4E2D\u4EFB\u52D9",
      value: "96",
      delta: "+8",
      deltaTone: "success"
    }), /*#__PURE__*/React.createElement(StatCard, {
      icon: "Package",
      tone: "warning",
      label: "\u5F85\u8ABF\u5EA6\u7269\u8CC7",
      value: "312",
      delta: "\u4F4E\u5EAB\u5B58 4",
      deltaTone: "warning"
    }), /*#__PURE__*/React.createElement(StatCard, {
      icon: "Home",
      tone: "info",
      label: "\u958B\u653E\u6536\u5BB9\u64DA\u9EDE",
      value: "18"
    })), /*#__PURE__*/React.createElement(Card, {
      padding: "0",
      style: {
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 22px",
        borderBottom: "1px solid var(--color-border-default)"
      }
    }, /*#__PURE__*/React.createElement("h3", {
      className: "wg-h600"
    }, "\u8FD1\u671F\u4EFB\u52D9"), /*#__PURE__*/React.createElement(Button, {
      variant: "outline",
      size: "sm",
      startIcon: /*#__PURE__*/React.createElement(Icon, {
        n: "Plus",
        s: 16
      })
    }, "\u5EFA\u7ACB\u4EFB\u52D9")), /*#__PURE__*/React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse"
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
      style: {
        font: "var(--font-data-300)",
        color: "var(--color-fg-neutral-muted)",
        textAlign: "left"
      }
    }, /*#__PURE__*/React.createElement("th", {
      style: th
    }, "\u7DE8\u865F"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "\u4EFB\u52D9"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "\u5206\u985E"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "\u72C0\u614B"), /*#__PURE__*/React.createElement("th", {
      style: th
    }, "\u5730\u9EDE"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...th,
        textAlign: "right"
      }
    }, "\u4EBA\u529B"))), /*#__PURE__*/React.createElement("tbody", null, TASKS.map(([id, name, cat, tone, status, ppl, loc]) => /*#__PURE__*/React.createElement("tr", {
      key: id,
      style: {
        borderTop: "1px solid var(--color-bg-neutral-sunken)"
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: td
    }, /*#__PURE__*/React.createElement("span", {
      className: "wg-data-xs",
      style: {
        color: "var(--color-fg-neutral-subtle)"
      }
    }, id)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td,
        font: "var(--font-body-400)",
        fontWeight: 700,
        color: "var(--color-fg-neutral-default)"
      }
    }, name), /*#__PURE__*/React.createElement("td", {
      style: td
    }, /*#__PURE__*/React.createElement("span", {
      className: "wg-caption"
    }, cat)), /*#__PURE__*/React.createElement("td", {
      style: td
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: tone,
      variant: tone === "danger" ? "solid" : "subtle"
    }, status)), /*#__PURE__*/React.createElement("td", {
      style: td
    }, /*#__PURE__*/React.createElement("span", {
      className: "wg-caption",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      n: "MapPin",
      s: 14,
      c: "var(--color-fg-neutral-muted)"
    }), loc)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td,
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "wg-data-sm"
    }, ppl))))))));
  }
  const th = {
    padding: "12px 22px",
    fontWeight: 400
  };
  const td = {
    padding: "14px 22px",
    verticalAlign: "middle"
  };
  window.DashboardView = DashboardView;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/DashboardView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/LoginScreen.jsx
try { (() => {
// LoginScreen — 光復超人 manager console auth (志工 / 單位 tabs, SMS, OAuth)
(function () {
  const {
    Button,
    Tabs,
    Field,
    Input,
    Checkbox
  } = window.WanGuardDesignSystem_9c8f68;
  function LoginScreen({
    onLogin
  }) {
    const [tab, setTab] = React.useState("volunteer");
    const [remember, setRemember] = React.useState(true);
    const Icon = window.WGIcon;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        minHeight: "100%",
        background: "var(--color-bg-neutral-default)"
      }
    }, /*#__PURE__*/React.createElement("aside", {
      style: {
        flex: "0 0 42%",
        background: "var(--color-bg-primary)",
        color: "var(--color-fg-on-primary)",
        padding: "48px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
        zIndex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 52,
        height: 36,
        display: "inline-flex",
        color: "var(--color-fg-on-primary)"
      },
      dangerouslySetInnerHTML: {
        __html: window.WGMark
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--font-label-500)",
        fontSize: 20
      }
    }, "\u5149\u5FA9\u8D85\u4EBA")), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        zIndex: 1
      }
    }, /*#__PURE__*/React.createElement("h1", {
      className: "wg-h900",
      style: {
        color: "var(--color-fg-on-primary)",
        fontSize: 40,
        lineHeight: 1.15
      }
    }, "\u5CF6\u5DBC\u5B88\u671B\uFF0C", /*#__PURE__*/React.createElement("br", null), "\u8207\u4F60\u540C\u884C\u3002"), /*#__PURE__*/React.createElement("p", {
      style: {
        font: "var(--font-body-500)",
        color: "var(--color-fg-on-primary)",
        opacity: .82,
        marginTop: 16,
        maxWidth: 360
      }
    }, "\u4E32\u9023\u5FD7\u5DE5\u3001\u7269\u8CC7\u8207\u5728\u5730\u9700\u6C42\uFF0C\u8B93\u6BCF\u4E00\u4EFD\u5584\u610F\uFF0C\u90FD\u80FD\u6E96\u78BA\u62B5\u9054\u6700\u9700\u8981\u7684\u89D2\u843D\u3002")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 28,
        position: "relative",
        zIndex: 1
      }
    }, [["1,284", "在線志工"], ["96", "進行中任務"], ["18", "收容據點"]].map(([n, l]) => /*#__PURE__*/React.createElement("div", {
      key: l
    }, /*#__PURE__*/React.createElement("div", {
      className: "wg-data",
      style: {
        color: "var(--color-fg-on-primary)",
        fontSize: 24
      }
    }, n), /*#__PURE__*/React.createElement("div", {
      style: {
        font: "var(--font-label-300)",
        color: "var(--color-fg-on-primary)",
        opacity: .8
      }
    }, l)))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        right: -80,
        top: -60,
        width: 280,
        height: 280,
        borderRadius: "48% 52% 60% 40%",
        background: "rgba(255,255,255,.12)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        right: 40,
        bottom: -90,
        width: 200,
        height: 200,
        borderRadius: "52% 48% 40% 60%",
        background: "rgba(255,255,255,.10)"
      }
    })), /*#__PURE__*/React.createElement("main", {
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 380,
        maxWidth: "100%"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      className: "wg-h800"
    }, "\u767B\u5165\u5B88\u8B77\u5E73\u53F0"), /*#__PURE__*/React.createElement("p", {
      className: "wg-body",
      style: {
        marginTop: 6,
        marginBottom: 22
      }
    }, "\u6B61\u8FCE\u56DE\u4F86\uFF0C\u8ACB\u9078\u64C7\u60A8\u7684\u8EAB\u5206\u767B\u5165\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement(Tabs, {
      value: tab,
      onChange: setTab,
      tabs: [{
        value: "volunteer",
        label: "志工登入"
      }, {
        value: "org",
        label: "單位登入"
      }]
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Field, {
      label: tab === "org" ? "單位帳號 / Email" : "手機號碼 / Email",
      htmlFor: "acct"
    }, /*#__PURE__*/React.createElement(Input, {
      id: "acct",
      leadingIcon: /*#__PURE__*/React.createElement(Icon, {
        n: tab === "org" ? "Building2" : "Smartphone",
        s: 18,
        c: "var(--color-fg-neutral-muted)"
      }),
      placeholder: tab === "org" ? "name@org.gov.tw" : "0912 345 678"
    })), /*#__PURE__*/React.createElement(Field, {
      label: "\u5BC6\u78BC",
      htmlFor: "pw"
    }, /*#__PURE__*/React.createElement(Input, {
      id: "pw",
      type: "password",
      leadingIcon: /*#__PURE__*/React.createElement(Icon, {
        n: "Lock",
        s: 18,
        c: "var(--color-fg-neutral-muted)"
      }),
      defaultValue: "password"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement(Checkbox, {
      checked: remember,
      onChange: e => setRemember(e.target.checked),
      label: "\u8A18\u4F4F\u6211"
    }), /*#__PURE__*/React.createElement("a", {
      href: "#",
      style: {
        font: "var(--font-label-400)",
        color: "var(--color-brand-secondary-subtle)",
        textDecoration: "none"
      }
    }, "\u5FD8\u8A18\u5BC6\u78BC\uFF1F")), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      style: {
        width: "100%"
      },
      onClick: onLogin
    }, "\u767B\u5165"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        font: "var(--font-label-300)",
        color: "var(--color-brand-secondary-subtle)"
      }
    }, "\u4F7F\u7528\u7C21\u8A0A\u9A57\u8B49\u78BC\u767B\u5165"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "4px 0"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--color-border-default)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--font-body-300)",
        color: "var(--color-fg-neutral-muted)"
      }
    }, "\u6216"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--color-border-default)"
      }
    })), /*#__PURE__*/React.createElement(OAuthButton, {
      src: "../../assets/social/google.svg",
      label: "\u4EE5 Google \u5E33\u865F\u7E7C\u7E8C",
      onClick: onLogin
    }), /*#__PURE__*/React.createElement(OAuthButton, {
      src: "../../assets/social/line.svg",
      label: "\u4EE5 LINE \u5E33\u865F\u7E7C\u7E8C",
      onClick: onLogin
    })))));
  }
  function OAuthButton({
    src,
    label,
    onClick
  }) {
    return /*#__PURE__*/React.createElement("button", {
      type: "button",
      onClick: onClick,
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        height: 44,
        borderRadius: "var(--radius-full)",
        border: "1.5px solid var(--color-border-default)",
        background: "var(--color-bg-neutral-default)",
        font: "var(--font-label-400)",
        color: "var(--color-fg-neutral-default)",
        cursor: "pointer",
        transition: "background var(--transition-fast)"
      },
      onMouseEnter: e => e.currentTarget.style.background = "var(--color-bg-neutral-sunken)",
      onMouseLeave: e => e.currentTarget.style.background = "var(--color-bg-neutral-default)"
    }, /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: "",
      width: "20",
      height: "20"
    }), label);
  }
  window.LoginScreen = LoginScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/MapView.jsx
try { (() => {
// MapView — 互助地圖: stylized coordination map with request pins + side list
(function () {
  const {
    Card,
    Badge,
    Button,
    Avatar
  } = window.WanGuardDesignSystem_9c8f68;
  const PINS = [["danger", 32, 38, "馬太鞍溪左岸", "防汛 · 緊急"], ["warning", 54, 26, "大進村民宅", "清淤 · 進行中"], ["secondary", 46, 62, "光復國中收容所", "物資 · 待出發"], ["success", 70, 48, "大富社區", "關懷 · 已完成"], ["warning", 22, 64, "馬太鞍服務站", "人力 · 招募中"]];
  function MapView() {
    const Icon = window.WGIcon;
    const [sel, setSel] = React.useState(0);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: 20,
        maxWidth: 1120,
        height: 560
      }
    }, /*#__PURE__*/React.createElement(Card, {
      padding: "0",
      style: {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px 18px",
        borderBottom: "1px solid var(--color-border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("h3", {
      className: "wg-h600",
      style: {
        fontSize: 17
      }
    }, "\u9130\u8FD1\u9700\u6C42"), /*#__PURE__*/React.createElement(Badge, {
      tone: "primary",
      variant: "solid"
    }, PINS.length)), /*#__PURE__*/React.createElement("div", {
      style: {
        overflow: "auto"
      }
    }, PINS.map(([tone,,, name, meta], i) => /*#__PURE__*/React.createElement("button", {
      key: name,
      onClick: () => setSel(i),
      style: {
        width: "100%",
        textAlign: "left",
        border: "none",
        cursor: "pointer",
        background: sel === i ? "var(--color-bg-primary-subtle)" : "transparent",
        borderBottom: "1px solid var(--color-bg-neutral-sunken)",
        padding: "14px 18px",
        display: "flex",
        gap: 12,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: `var(--color-bg-${tone})`,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        font: "var(--font-label-400)",
        color: "var(--color-fg-neutral-default)"
      }
    }, name), /*#__PURE__*/React.createElement("span", {
      className: "wg-caption"
    }, meta)), /*#__PURE__*/React.createElement(Icon, {
      n: "ChevronRight",
      s: 18,
      c: "var(--color-fg-neutral-muted)"
    }))))), /*#__PURE__*/React.createElement(Card, {
      padding: "0",
      style: {
        position: "relative",
        overflow: "hidden",
        background: "var(--color-bg-secondary-subtle)"
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "100%",
      height: "100%",
      viewBox: "0 0 100 100",
      preserveAspectRatio: "xMidYMid slice",
      style: {
        position: "absolute",
        inset: 0
      }
    }, /*#__PURE__*/React.createElement("rect", {
      width: "100",
      height: "100",
      fill: "var(--color-bg-secondary-subtle)"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M0 60 Q20 50 40 58 T80 56 T100 62 V100 H0 Z",
      fill: "var(--prim-color-blue-100)",
      opacity: "0.7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M0 74 Q30 66 55 72 T100 74 V100 H0 Z",
      fill: "var(--prim-color-green-50)"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 0 L20 40 L8 70 L26 100",
      stroke: "var(--prim-color-blue-200)",
      strokeWidth: "2.5",
      fill: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M62 0 L56 34 L70 62 L60 100",
      stroke: "var(--prim-color-blue-200)",
      strokeWidth: "2.5",
      fill: "none"
    })), PINS.map(([tone, x, y, name], i) => /*#__PURE__*/React.createElement("button", {
      key: name,
      onClick: () => setSel(i),
      title: name,
      style: {
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%,-100%)",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        lineHeight: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sel === i ? 38 : 30,
        height: sel === i ? 38 : 30,
        borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)",
        background: `var(--color-bg-${tone})`,
        boxShadow: "var(--shadow-md)",
        border: "2.5px solid #fff",
        transition: "all var(--transition-spring)"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      n: "MapPin",
      s: 16,
      c: "#fff",
      style: {
        transform: "rotate(45deg)"
      }
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: 20,
        bottom: 20,
        right: 20,
        maxWidth: 380
      }
    }, /*#__PURE__*/React.createElement(Card, {
      padding: "16px",
      elevation: "lg"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("h4", {
      className: "wg-h600",
      style: {
        fontSize: 17
      }
    }, PINS[sel][3]), /*#__PURE__*/React.createElement(Badge, {
      tone: PINS[sel][0],
      variant: PINS[sel][0] === "danger" ? "solid" : "subtle"
    }, PINS[sel][4].split(" · ")[1])), /*#__PURE__*/React.createElement("p", {
      className: "wg-caption",
      style: {
        margin: "6px 0 12px"
      }
    }, PINS[sel][4].split(" · ")[0], "\u4EFB\u52D9 \xB7 \u9700\u8981\u5FD7\u5DE5\u5354\u52A9\uFF0C\u9810\u4F30 3 \u5C0F\u6642\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex"
      }
    }, ["王", "李", "張"].map((n, j) => /*#__PURE__*/React.createElement(Avatar, {
      key: j,
      name: n,
      tone: "primary",
      size: 28,
      style: {
        marginLeft: j ? -8 : 0,
        boxShadow: "0 0 0 2px #fff"
      }
    }))), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "sm",
      endIcon: /*#__PURE__*/React.createElement(Icon, {
        n: "ArrowRight",
        s: 16
      })
    }, "\u6D3E\u9063\u5FD7\u5DE5"))))));
  }
  window.MapView = MapView;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/MapView.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/SupplyView.jsx
try { (() => {
// SupplyView — 物資管理: filter chips + resource request cards
(function () {
  const {
    Card,
    Chip,
    Badge,
    Button
  } = window.WanGuardDesignSystem_9c8f68;
  const SUPPLIES = [["飲用水 600ml", "drink", "warning", "急需", 240, 1000, "光復國中收容所"], ["鏟子 / 圓鍬", "tool", "secondary", "調度中", 86, 120, "大進村集結點"], ["雨鞋 (各尺寸)", "wear", "success", "充足", 410, 400, "馬太鞍服務站"], ["除濕機", "tool", "danger", "缺貨", 4, 60, "大富社區中心"], ["睡袋 / 毛毯", "wear", "warning", "急需", 130, 500, "光復鄉公所"], ["乾糧 / 即食餐", "drink", "secondary", "調度中", 620, 800, "光復國中收容所"]];
  function Bar({
    value,
    total,
    tone
  }) {
    const pct = Math.min(100, Math.round(value / total * 100));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height: 8,
        borderRadius: "var(--radius-full)",
        background: "var(--color-bg-neutral-sunken)",
        overflow: "hidden",
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: pct + "%",
        height: "100%",
        borderRadius: "var(--radius-full)",
        background: `var(--color-bg-${tone})`
      }
    }));
  }
  function SupplyView() {
    const [filter, setFilter] = React.useState("all");
    const Icon = window.WGIcon;
    const cats = [["all", "全部", null], ["drink", "飲食", 2], ["tool", "工具", 2], ["wear", "衣物", 2]];
    const list = SUPPLIES.filter(s => filter === "all" || s[1] === filter);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 1100
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 20,
        flexWrap: "wrap"
      }
    }, cats.map(([id, label, n]) => /*#__PURE__*/React.createElement(Chip, {
      key: id,
      active: filter === id,
      count: n,
      onClick: () => setFilter(id)
    }, label)), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "sm",
      style: {
        marginLeft: "auto"
      },
      startIcon: /*#__PURE__*/React.createElement(Icon, {
        n: "Plus",
        s: 16
      })
    }, "\u65B0\u589E\u7269\u8CC7\u9700\u6C42")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16
      }
    }, list.map(([name, cat, tone, status, value, total]) => {
      const pct = Math.round(value / total * 100);
      return /*#__PURE__*/React.createElement(Card, {
        key: name,
        interactive: true,
        padding: "20px"
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "wg-h600",
        style: {
          fontSize: 18
        }
      }, name), /*#__PURE__*/React.createElement("div", {
        className: "wg-caption",
        style: {
          marginTop: 4,
          display: "inline-flex",
          alignItems: "center",
          gap: 4
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        n: "Warehouse",
        s: 14,
        c: "var(--color-fg-neutral-muted)"
      }), SUPPLIES.find(s => s[0] === name)[6])), /*#__PURE__*/React.createElement(Badge, {
        tone: tone,
        variant: tone === "danger" ? "solid" : "subtle"
      }, status)), /*#__PURE__*/React.createElement(Bar, {
        value: value,
        total: total,
        tone: tone
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginTop: 10
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "wg-data-sm",
        style: {
          color: `var(--color-bg-${tone})`
        }
      }, value.toLocaleString(), " ", /*#__PURE__*/React.createElement("span", {
        className: "wg-caption"
      }, "/ ", total.toLocaleString())), /*#__PURE__*/React.createElement("span", {
        className: "wg-data-xs",
        style: {
          color: "var(--color-fg-neutral-muted)"
        }
      }, pct, "% \u5DF2\u9054\u6A19")));
    })));
  }
  window.SupplyView = SupplyView;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/SupplyView.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.SidebarItem = __ds_scope.SidebarItem;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
