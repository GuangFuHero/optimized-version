/* site-auth.jsx — 前台登入／忘記密碼／重設密碼（原型）
 *
 * 對齊 repo：
 *   libs/modules/src/auth/login/components/{login-form,auth-shell,auth-field,auth-provider-button}
 *   apps/demo/src/modules/auth/login/{login-form,forgot-password-form,reset-password-form}.client.tsx
 *   apps/demo/src/modules/auth/api/error-messages.ts  ← 錯誤文案直接沿用那一份
 *
 * 顏色全部走 DS token，沒有寫死色值。
 *
 * ⚠️ 原型專用：沒有後端、沒有加密、沒有真的寄驗證碼，密碼比對是明碼字串。
 *    正式版走 next-auth ＋ /auth/salt → hash → /auth/login。
 */
(function () {
  const { useState, useEffect, useMemo } = React;
  const { Button, Input, Field, Alert } = window.WanGuardDesignSystem_9c8f68;
  const WGIcon = window.WGIcon;

  /* ── 驗證規則（照 repo 的 identity-validation.ts）──────────────────────── */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /* repo 用 google-libphonenumber 以 TW 為預設區碼轉 E.164；原型不引入那支套件，
     只認 09 開頭十碼與 +8869 兩種。⚠️ 這比正式版寬鬆，不是同一份實作。 */
  const PHONE_RE = /^(09\d{8}|\+8869\d{8})$/;

  const normalizeIdentity = (type, value) => {
    const v = (value || '').trim();
    return type === 'email' ? v.toLowerCase() : v.replace(/[\s-]/g, '');
  };

  const validateIdentity = (type, value) => {
    const v = normalizeIdentity(type, value);
    if (!v) return type === 'email' ? '請輸入電子郵件' : '請輸入手機號碼';
    if (type === 'email') return EMAIL_RE.test(v) ? null : '電子郵件格式不正確';
    return PHONE_RE.test(v) ? null : '手機號碼格式不正確（09 開頭十碼，或 +886 格式）';
  };

  /* ── 後端錯誤碼 → 中文文案。與 repo 的 error-messages.ts 同一份文字 ──────
   * 🔒 這一層存在的理由：後端的 detail 是給 API 使用者看的英文，直接顯示會外洩
   *    實作細節。查不到的碼一律回落通用訊息，不顯示原文。 */
  const MESSAGE_BY_CODE = {
    credentials_invalid: '帳號或密碼不正確。',
    identifier_invalid: '帳號格式有誤，請確認後重新輸入。',
    password_not_set: '你的帳號還沒有設定密碼，請改用「建立密碼」。',
    session_expired: '登入已失效，請重新登入。',
    rate_limited: '系統忙碌中，請等一分鐘後再試。',
    code_invalid: '驗證碼不正確或已過期。請重新輸入，或重新取得一組新的驗證碼。',
  };
  const FALLBACK_MESSAGE = '登入失敗，請確認帳號或密碼。';
  const messageForCode = (code) => MESSAGE_BY_CODE[code] || FALLBACK_MESSAGE;

  /* ── 原型的示範帳號 ────────────────────────────────────────────────────
   * ⚠️ 這兩組帳號、密碼與驗證碼**都是我編的**，不是團隊給的測試資料。
   *    persona id 對得上 site-shell.jsx 的 SITE_PERSONAS —— 切換器與登入是同一套
   *    身份，不要變成兩份。 */
  const DEMO_PASSWORD = 'wanguard';
  const DEMO_CODE = '123456';
  const DEMO_ACCOUNTS = [
    { personaId: 'usr-citizen-01', email: 'wang@example.tw', phone: '0912345678' },
    { personaId: 'usr-citizen-42', email: 'lin@example.tw', phone: '0922333444' },
    /* 兩邊都有的人。用她可以看到「自動進管理平台」與「回原地優先」兩種落點。 */
    { personaId: 'u-huang', email: 'huang@example.tw', phone: '0933555777' },
  ];
  const findDemoAccount = (type, normalized) =>
    DEMO_ACCOUNTS.find((a) => (type === 'email' ? a.email : a.phone) === normalized) || null;

  /* 原型：可以強制演出某一種失敗。實際後端回哪一種取決於帳號狀態，
     但要讓人看到「失敗長什麼樣子」不該逼他真的去把帳號弄成那個狀態。 */
  const FORCED_ERRORS = [
    { code: '', label: '不強制（照帳號密碼判斷）' },
    { code: 'credentials_invalid', label: '帳號或密碼不正確' },
    { code: 'rate_limited', label: '太多次嘗試（429）' },
    { code: 'password_not_set', label: '這個帳號還沒設密碼' },
    { code: 'session_expired', label: '登入已失效' },
  ];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ── 版面 ───────────────────────────────────────────────────────────── */

  /** 左側主視覺。repo 那邊是 Figma 匯出的背景圖 ＋ 三層漸層遮罩；原型沒有那張圖，
   *  改用 DS 的深色底 ＋ 品牌橘光暈，顏色一律走 token。 */
  function AuthHero() {
    return (
      <div className="wg-auth__hero">
        <div aria-hidden="true" className="wg-auth__hero-glow" />
        <div className="wg-auth__hero-brand">
          <img src="assets/logo/mark.svg" alt="" width={44} height={30} style={{ display: 'block' }} />
          <span style={{ font: '700 var(--fs-18)/1.4 var(--font-display)', color: 'var(--prim-color-neutral-white)' }}>
            島嶼守望
          </span>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 420 }}>
          <h1 style={{ margin: 0, font: '700 var(--fs-24)/1.3 var(--font-display)', color: 'var(--prim-color-neutral-white)' }}>
            災民與志工，看同一張地圖
          </h1>
          <p style={{ margin: 0, font: '400 var(--fs-15)/1.7 var(--font-body)', color: 'var(--prim-color-neutral-200)' }}>
            登入之後才能請求協助、承接任務、提出站點的修改建議 ——
            因為志工會依照你留的資訊到現場，來源必須追得到。
          </p>
        </div>

        {/* 🔒 未登入本來就看得到地圖與列表（擋在送出前，不擋在入口前）。
            這條出口要一直在，否則登入頁看起來像一道牆。 */}
        <a href={window.SiteAuth.DEFAULT_BACK} className="wg-auth__hero-exit">
          <WGIcon n="Map" s={16} />
          不登入，先去看地圖
        </a>
      </div>
    );
  }

  function AuthCard({ title, description, children }) {
    return (
      <div style={{
        width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column',
        gap: 'var(--space-4)', padding: 'var(--space-6)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border-default)',
        background: 'var(--color-bg-neutral-default)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <h2 style={{ margin: 0, font: '700 var(--fs-20)/1.3 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>
            {title}
          </h2>
          <p style={{ margin: 0, font: '400 var(--fs-13)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            {description}
          </p>
        </div>
        {children}
      </div>
    );
  }

  /** Email／手機切換。照 repo 的 login-form 那組 pill。 */
  function IdentityToggle({ value, onChange, disabled }) {
    return (
      <div style={{
        display: 'flex', gap: 4, padding: 4, borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-default)',
        background: 'var(--color-bg-neutral-sunken)',
      }}>
        {[{ id: 'email', label: 'Email' }, { id: 'phone', label: '手機號碼' }].map((opt) => {
          const active = value === opt.id;
          return (
            <button key={opt.id} type="button" disabled={disabled} aria-pressed={active}
              onClick={() => onChange(opt.id)}
              style={{
                flex: 1, minHeight: 40, cursor: disabled ? 'not-allowed' : 'pointer',
                borderRadius: 'var(--radius-md)',
                border: active ? '1px solid var(--prim-color-blue-300)' : '1px solid transparent',
                background: active ? 'var(--prim-color-blue-100)' : 'transparent',
                color: 'var(--color-fg-neutral-default)',
                font: '700 var(--fs-13)/1.2 var(--font-latin)',
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  function PasswordField({ label, value, onChange, error, disabled, autoComplete }) {
    const [visible, setVisible] = useState(false);
    return (
      <Field label={label} required error={error}>
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          invalid={!!error}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder="輸入密碼"
          trailingIcon={
            <button type="button" onClick={() => setVisible((v) => !v)}
              aria-label={visible ? '隱藏密碼' : '顯示密碼'}
              style={{
                display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
                border: 0, background: 'none', cursor: 'pointer', borderRadius: 'var(--radius-full)',
                color: 'var(--color-fg-disable)',
              }}>
              <WGIcon n={visible ? 'EyeOff' : 'Eye'} s={18} />
            </button>
          }
        />
      </Field>
    );
  }

  /** 原型專用的說明區塊。虛線框 ＋ 燒瓶圖示，與身份切換器同一個視覺語言 ——
   *  它不是產品的一部分，要看得出來。 */
  function PrototypePanel({ children }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--color-border-accent)',
        background: 'var(--color-bg-primary-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <WGIcon n="FlaskConical" s={12} c="var(--color-fg-warning)" />
          <span style={{ font: '700 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-warning)' }}>
            原型 —— 正式版沒有這一段
          </span>
        </div>
        {children}
      </div>
    );
  }

  /* ── 登入 ──────────────────────────────────────────────────────────── */

  function LoginView({ back, onGoForgot }) {
    const [identityType, setIdentityType] = useState('email');
    const [identity, setIdentity] = useState('');
    const [password, setPassword] = useState('');
    const [touched, setTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(undefined);
    const [successMessage, setSuccessMessage] = useState(undefined);
    const [attempts, setAttempts] = useState(0);
    const [forcedError, setForcedError] = useState('');

    const identityError = touched ? validateIdentity(identityType, identity) : null;
    const passwordError = touched && !password ? '請輸入密碼' : null;
    const canSubmit = !submitting && !!identity.trim() && !!password;

    const resetMessages = () => { setErrorMessage(undefined); setSuccessMessage(undefined); };

    async function handleSubmit() {
      setTouched(true);
      if (validateIdentity(identityType, identity) || !password) return;
      resetMessages();
      setSubmitting(true);
      await sleep(600); // 假的往返延遲 —— 讓「登入中」這個狀態看得到

      const normalized = normalizeIdentity(identityType, identity);
      const account = findDemoAccount(identityType, normalized);
      const nextAttempts = attempts + 1;

      /* 🔒 帳號不存在與密碼錯誤回同一句話 —— 不要讓登入頁變成「這個帳號存不存在」的查詢器。 */
      let code = forcedError || null;
      if (!code && nextAttempts > 3) code = 'rate_limited';
      if (!code && (!account || password !== DEMO_PASSWORD)) code = 'credentials_invalid';

      if (code) {
        setAttempts(nextAttempts);
        setSubmitting(false);
        setErrorMessage(messageForCode(code));
        return;
      }

      const persona = window.SiteAuth.personaById(account.personaId);
      const kind = window.SiteAuth.landingKindFor(persona, back);
      setSuccessMessage(
        kind === 'back' ? '登入成功，正在回到你剛剛那一頁⋯'
          : kind === 'admin' ? '登入成功。你有管理平台的身份，正在帶你過去⋯'
            : '登入成功，正在帶你去公開地圖⋯',
      );
      window.SiteAuth.completeSignIn(persona, back);
    }

    return (
      <AuthCard title="登入" description="用 Email 或手機號碼登入。還沒有帳號可以直接註冊。">
        <IdentityToggle value={identityType} disabled={submitting}
          onChange={(next) => { setIdentityType(next); setIdentity(''); setTouched(false); resetMessages(); }} />

        <Field label={identityType === 'email' ? '電子郵件' : '手機號碼'} required error={identityError}>
          <Input
            type={identityType === 'email' ? 'email' : 'tel'}
            value={identity}
            onChange={(e) => { setIdentity(e.target.value); resetMessages(); }}
            invalid={!!identityError}
            disabled={submitting}
            autoComplete="username"
            placeholder={identityType === 'email' ? 'name@example.tw' : '0912345678'}
          />
        </Field>

        <PasswordField label="密碼" value={password} error={passwordError} disabled={submitting}
          autoComplete="current-password"
          onChange={(v) => { setPassword(v); resetMessages(); }} />

        <button type="button" onClick={onGoForgot} disabled={submitting}
          style={{
            alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 0, background: 'none',
            cursor: 'pointer', font: '700 var(--fs-13)/1.2 var(--font-latin)',
            color: 'var(--color-brand-primary-subtle)', textDecoration: 'underline',
          }}>
          忘記密碼？
        </button>

        {errorMessage ? <Alert tone="danger" title={errorMessage} /> : null}
        {successMessage ? <Alert tone="success" title={successMessage} /> : null}

        <Button variant="primary" disabled={!canSubmit} onClick={handleSubmit}
          style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
          {submitting ? '登入中⋯' : '登入'}
        </Button>

        <Button variant="outline" disabled={submitting}
          onClick={() => setErrorMessage('原型還沒有註冊流程。正式版是「手機／Email → 驗證碼 → 設定密碼」。')}
          style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
          註冊帳號
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--color-border-default)' }} />
          <span style={{ font: '400 var(--fs-11)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-muted)' }}>或</span>
          <span style={{ flex: 1, height: 1, background: 'var(--color-border-default)' }} />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {[{ id: 'google', label: '使用 Google 繼續' }, { id: 'line', label: '使用 LINE 繼續' }].map((p) => (
            <Button key={p.id} variant="outline" size="sm" disabled={submitting}
              onClick={() => setErrorMessage('原型沒有接第三方登入。正式版走 /auth/sso/' + p.id + '。')}
              style={{ flex: 1, borderRadius: 'var(--radius-full)' }}>
              {p.label}
            </Button>
          ))}
        </div>

        <PrototypePanel>
          <span style={{ font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
            示範帳號（密碼都是 <code style={{ font: '700 var(--fs-12)/1.4 var(--font-data)' }}>{DEMO_PASSWORD}</code>）。
            點一下就填好 —— 你選哪一個，登入後就是那個身份。
          </span>
          {DEMO_ACCOUNTS.map((a) => {
            const persona = window.SiteAuth.personaById(a.personaId);
            if (!persona) return null;
            return (
              <button key={a.personaId} type="button" disabled={submitting}
                onClick={() => {
                  setIdentity(identityType === 'email' ? a.email : a.phone);
                  setPassword(DEMO_PASSWORD);
                  setTouched(false);
                  resetMessages();
                }}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                  minHeight: 44, padding: 'var(--space-2) var(--space-3)', cursor: 'pointer',
                  border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-neutral-default)',
                }}>
                <span style={{ font: '700 var(--fs-13)/1.3 var(--font-body)', color: 'var(--color-fg-neutral-default)' }}>
                  {persona.label} · {persona.name}
                </span>
                <span style={{ font: '400 var(--fs-11)/1.4 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
                  {persona.hint} · {identityType === 'email' ? a.email : a.phone}
                </span>
              </button>
            );
          })}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ font: '700 var(--fs-11)/1.4 var(--font-data)', color: 'var(--color-fg-neutral-subtle)' }}>
              示範登入失敗的樣子
            </span>
            <select value={forcedError} onChange={(e) => { setForcedError(e.target.value); resetMessages(); }}
              style={{
                minHeight: 40, padding: '0 var(--space-2)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-neutral-default)',
                font: '400 var(--fs-13)/1.2 var(--font-body)', color: 'var(--color-fg-neutral-default)',
              }}>
              {FORCED_ERRORS.map((o) => <option key={o.code || 'none'} value={o.code}>{o.label}</option>)}
            </select>
          </label>
        </PrototypePanel>
      </AuthCard>
    );
  }

  /* ── 忘記密碼 ──────────────────────────────────────────────────────── */

  function ForgotView({ onGoLogin, onGoReset }) {
    const [identityType, setIdentityType] = useState('email');
    const [identity, setIdentity] = useState('');
    const [touched, setTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);

    const identityError = touched ? validateIdentity(identityType, identity) : null;

    async function handleSubmit() {
      setTouched(true);
      if (validateIdentity(identityType, identity)) return;
      setSubmitting(true);
      await sleep(600);
      setSubmitting(false);
      /* 🔒 不論帳號存不存在都回同一句話 —— 否則這一頁會變成帳號查詢器。 */
      setSent(true);
    }

    return (
      <AuthCard title="忘記密碼"
        description="輸入你的登入識別，我們會發送一次性驗證碼供你重設密碼。">
        <IdentityToggle value={identityType} disabled={submitting || sent}
          onChange={(next) => { setIdentityType(next); setIdentity(''); setTouched(false); setSent(false); }} />

        <Field label={identityType === 'email' ? '電子郵件' : '手機號碼'} required error={identityError}>
          <Input
            type={identityType === 'email' ? 'email' : 'tel'}
            value={identity}
            onChange={(e) => { setIdentity(e.target.value); setSent(false); }}
            invalid={!!identityError}
            disabled={submitting || sent}
            placeholder={identityType === 'email' ? 'name@example.tw' : '0912345678'}
          />
        </Field>

        {sent ? (
          <Alert tone="success" title="驗證碼已送出">
            若這組識別有對應的帳號，驗證碼會在幾分鐘內送到。沒收到請檢查垃圾信件匣，或重新取得一組。
          </Alert>
        ) : null}

        {sent ? (
          <Button variant="primary" onClick={() => onGoReset(identityType)}
            style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
            我收到驗證碼了，去重設密碼
          </Button>
        ) : (
          <Button variant="primary" disabled={submitting || !identity.trim()} onClick={handleSubmit}
            style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
            {submitting ? '送出中⋯' : '寄送驗證碼'}
          </Button>
        )}

        <Button variant="ghost" onClick={onGoLogin} style={{ width: '100%' }}>回到登入</Button>

        {sent ? (
          <PrototypePanel>
            <span style={{ font: '400 var(--fs-12)/1.6 var(--font-body)', color: 'var(--color-fg-neutral-subtle)' }}>
              原型不會真的寄出。下一頁的驗證碼固定是{' '}
              <code style={{ font: '700 var(--fs-12)/1.4 var(--font-data)' }}>{DEMO_CODE}</code>。
            </span>
          </PrototypePanel>
        ) : null}
      </AuthCard>
    );
  }

  /* ── 重設密碼 ──────────────────────────────────────────────────────── */

  function ResetView({ initialType, onGoLogin }) {
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [touched, setTouched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState(undefined);
    const [done, setDone] = useState(false);

    /* ⚠️ 「至少 8 碼」是我訂的，不是規格值 —— 後端目前沒有密碼強度規則。 */
    const passwordError = touched && password.length < 8 ? '密碼至少 8 個字元' : null;
    const confirmError = touched && confirm !== password ? '兩次輸入的密碼不一樣' : null;
    const codeError = touched && !code.trim() ? '請輸入驗證碼' : null;

    async function handleSubmit() {
      setTouched(true);
      if (!code.trim() || password.length < 8 || confirm !== password) return;
      setErrorMessage(undefined);
      setSubmitting(true);
      await sleep(600);
      setSubmitting(false);
      if (code.trim() !== DEMO_CODE) {
        setErrorMessage(messageForCode('code_invalid'));
        return;
      }
      setDone(true);
    }

    if (done) {
      return (
        <AuthCard title="密碼已重設" description="用新密碼登入就可以了。">
          <Alert tone="success" title="完成">
            原型沒有真的改動任何密碼 —— 示範帳號的密碼仍然是 {DEMO_PASSWORD}。
          </Alert>
          <Button variant="primary" onClick={onGoLogin} style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
            回到登入
          </Button>
        </AuthCard>
      );
    }

    return (
      <AuthCard title="重設密碼"
        description={'輸入' + (initialType === 'phone' ? '手機' : 'Email') + '收到的驗證碼與新密碼，完成後請用新密碼登入。'}>
        <Field label="驗證碼" required error={codeError}>
          <Input value={code} onChange={(e) => { setCode(e.target.value); setErrorMessage(undefined); }}
            invalid={!!codeError} disabled={submitting} inputMode="numeric" placeholder="6 位數字" />
        </Field>

        <PasswordField label="新密碼" value={password} error={passwordError} disabled={submitting}
          autoComplete="new-password" onChange={setPassword} />
        <PasswordField label="再次輸入新密碼" value={confirm} error={confirmError} disabled={submitting}
          autoComplete="new-password" onChange={setConfirm} />

        {errorMessage ? <Alert tone="danger" title={errorMessage} /> : null}

        <Button variant="primary" disabled={submitting} onClick={handleSubmit}
          style={{ width: '100%', borderRadius: 'var(--radius-full)' }}>
          {submitting ? '處理中⋯' : '設定新密碼'}
        </Button>
        <Button variant="ghost" onClick={onGoLogin} style={{ width: '100%' }}>回到登入</Button>
      </AuthCard>
    );
  }

  /* ── 頁面 ───────────────────────────────────────────────────────────── */

  /** 三個畫面以這一頁自己的 hash 區分。來源頁的路由狀態在 `?back=` 查詢參數裡，
   *  不會被這裡的 hash 蓋掉 —— 這正是舊做法 `location.hash = '#/sign-in'` 的錯。 */
  function readScreen() {
    const h = (window.location.hash || '').replace(/^#\/?/, '');
    if (h.indexOf('forgot') === 0) return 'forgot';
    if (h.indexOf('reset') === 0) return 'reset';
    return 'login';
  }

  function SiteAuthPage() {
    const [screen, setScreen] = useState(readScreen);
    const [resetType, setResetType] = useState('email');
    const back = useMemo(() => window.SiteAuth.readBack(), []);

    useEffect(() => {
      const on = () => setScreen(readScreen());
      window.addEventListener('hashchange', on);
      return () => window.removeEventListener('hashchange', on);
    }, []);

    const go = (next) => { window.location.hash = '#/' + next; setScreen(next); };

    return (
      <div className="wg-auth">
        {/* 全站橫幅（EA-AB-147）：登入頁也是前台的一頁，公告不能只在地圖上出現。 */}
        {window.WGAnnounceBanner ? <window.WGAnnounceBanner realm="site" /> : null}

        <div className="wg-auth__grid">
          <AuthHero />
          <div className="wg-auth__panel">
            {/* 手機沒有主視覺，品牌與「先看地圖」的出口改在表單上方 ——
                不能只留在 hero 裡，否則手機上那條出口整個消失。 */}
            <div className="wg-auth__head">
              <a href={window.SiteAuth.DEFAULT_BACK}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none', minWidth: 0 }}>
                <img src="assets/logo/mark.svg" alt="" width={38} height={26} style={{ display: 'block' }} />
                <span style={{ font: '700 var(--fs-16)/1.4 var(--font-display)', color: 'var(--color-fg-neutral-default)' }}>
                  島嶼守望
                </span>
              </a>
              <a href={window.SiteAuth.DEFAULT_BACK} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44,
                textDecoration: 'none', font: '700 var(--fs-13)/1.2 var(--font-latin)',
                color: 'var(--color-brand-primary-subtle)', whiteSpace: 'nowrap',
              }}>
                <WGIcon n="Map" s={16} />
                先看地圖
              </a>
            </div>

            {screen === 'forgot' ? (
              <ForgotView onGoLogin={() => go('login')}
                onGoReset={(type) => { setResetType(type); go('reset'); }} />
            ) : screen === 'reset' ? (
              <ResetView initialType={resetType} onGoLogin={() => go('login')} />
            ) : (
              <LoginView back={back} onGoForgot={() => go('forgot')} />
            )}

            {/* 🔒 落點要先講。有管理身份的人如果沒被預告就被換到另一個平台，
                他會以為自己點錯了。 */}
            <span style={{ maxWidth: 440, font: '400 var(--fs-11)/1.5 var(--font-body)',
              color: 'var(--color-fg-neutral-muted)', textAlign: 'center' }}>
              {back
                ? '登入完成後會回到你剛剛那一頁，地圖的位置與篩選都會保留。'
                : '登入完成後會帶你去公開地圖；如果你有管理平台的身份，會直接進管理平台。'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  Object.assign(window, { SiteAuthPage });
})();
