export interface paths {
  '/api/v1/auth/salt/{value}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get User Salt
     * @description Return the frontend salt for an identifier's password identity, or a deterministic fake salt.
     */
    get: operations['get_user_salt_api_v1_auth_salt__value__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/register': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Register
     * @description Verify-then-create: store a pending registration and send a 6-digit code by email or SMS.
     *
     *     Never writes an unverified DB row.
     */
    post: operations['register_api_v1_auth_register_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Verify
     * @description Consume a 6-digit code, create the account, and issue a session (verify == login).
     */
    post: operations['verify_api_v1_auth_verify_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/resend-verification': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Resend Verification
     * @description Resend the 6-digit code for a still-pending email or phone registration (rate limited).
     */
    post: operations['resend_verification_api_v1_auth_resend_verification_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Login
     * @description Email/phone + password login: contact → user → password identity → verify.
     */
    post: operations['login_api_v1_auth_login_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/refresh': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Refresh
     * @description 以 refresh token 換發新的 access token，並 rotate refresh token。
     *
     *     The identity is validated BEFORE rotating (ADR-096). `rotate()` burns the old refresh
     *     token the moment it runs, so refusing afterwards would leave the caller holding a dead
     *     token with no replacement — and their retry would read as a replay and revoke the whole
     *     session. Reading the record first is side-effect free.
     *
     *     **The identity comes from the session when the caller does not name one** (ADR-188).
     *     `body.identity` still wins, so a client that tracks it keeps deciding; but a client that
     *     does not — or forgets on one request — no longer gets silently returned to its platform
     *     identity, which for a super_admin acting as a team member was a silent re-escalation
     *     every time an access token expired.
     *
     *     Rotation is also where `users.last_activity_at` is recorded (ADR-093). Access tokens
     *     live 15 minutes, so an active user rotates about that often — precise enough to answer
     *     "has this account been used lately?", which is all the admin console needs. It is
     *     deliberately NOT updated per request: `users` is in AUDITED_TABLES, so that would append
     *     one `audit_logs` row per request and bury the audit trail under activity noise.
     *
     *     `SessionRepository` stays a pure Redis component — the DB write happens here, not there.
     *
     *     The write is deliberately best-effort. By the time `rotate()` returns it has already
     *     burned the old refresh token (`session_repository.py:78` claims the `refresh_used:` flag),
     *     so letting a DB error escape would 500 the request *after* the old token died: the client
     *     never receives `new_refresh`, retries with the old one, and `rotate()` reads that as a
     *     replay and revokes the entire session. A transient DB outage would sign the device out
     *     permanently. `last_activity_at` is observability — it is not worth a user's session.
     */
    post: operations['refresh_api_v1_auth_refresh_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/switch-identity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Switch Identity
     * @description Act as a different identity you already hold; returns a re-signed access token.
     *
     *     Deliberately gated by nothing but being logged in. Requiring a capability here would let
     *     a user downgrade into an identity that cannot switch back, locking themselves out of
     *     their own permissions (ADR-070).
     *
     *     Only re-signs the access token — the session is untouched and the refresh token is not
     *     rotated, because switching is not a credential event.
     *
     *     **The session it re-signs from has to still exist** (ADR-183). This mints a fresh
     *     access token with a fresh expiry, so without that check the endpoint is a token
     *     refresher gated on nothing but holding an unexpired token: after `logout` or
     *     `logout-all`, `/auth/refresh` correctly refuses, but calling this before each expiry
     *     would keep a revoked session alive indefinitely. Rate limited for the same reason —
     *     it mints credentials, and `login` and `refresh` both are.
     */
    post: operations['switch_identity_api_v1_auth_switch_identity_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Logout
     * @description Log out the CURRENT device only: revoke this session (its refresh token).
     *
     *     Idempotent (ADR-190): this endpoint asks for the end state "this device is signed out",
     *     and a token whose session is already gone — a second logout, or one issued from a 401
     *     interceptor — is asking for a state that already holds. `revoke_session` no-ops on a
     *     session that is not there, so both cases answer 204. A token that never carried a `sid`
     *     is the same case: there is nothing to revoke and nothing to report.
     *
     *     Use /auth/logout-all to sign out every device.
     */
    post: operations['logout_api_v1_auth_logout_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/logout-all': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Logout All
     * @description Log out EVERY device: revoke all of the user's sessions.
     *
     *     Idempotent for the same reason `logout` is, but it cannot simply revoke and let the
     *     no-op handle it: unlike `logout`, this acts on sessions OTHER than the caller's. A token
     *     whose own session has already been revoked must not reach them (ADR-180) — otherwise an
     *     intruder holding a stolen-then-revoked token can keep calling this to kick the victim out
     *     of every session they create afterwards, for the rest of the token's 15 minutes. So the
     *     caller's own session has to be live for this to revoke anything; when it is not, the
     *     answer is still 204, because "every device is signed out" is what the caller asked for
     *     and this token's own device already is (ADR-190).
     */
    post: operations['logout_all_api_v1_auth_logout_all_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/sso/google': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Sso Google
     * @description Verify a Google id_token; log in an existing google identity or create the account on first login.
     */
    post: operations['sso_google_api_v1_auth_sso_google_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/link/google': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Link Google
     * @description Attach a verified Google identity to the current account, proof first (ADR-217).
     *
     *     The id_token proves the caller holds that Google account. It is not proof that they hold
     *     *this* one, so the account is asked for the same channel proof a first password needs —
     *     otherwise a stolen session plus the attacker's own Google account is a permanent way in
     *     that no password change or session revocation can take back.
     */
    post: operations['link_google_api_v1_auth_link_google_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/sso/line': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Sso Line
     * @description Verify a LINE id_token; log in an existing line identity or create the account on first login.
     */
    post: operations['sso_line_api_v1_auth_sso_line_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/link/line': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Link Line
     * @description Attach a verified LINE identity to the current account. Same contract as `link_google`.
     */
    post: operations['link_line_api_v1_auth_link_line_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/link/{provider}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Unlink Identity
     * @description Remove one SSO login method from the current account (ADR-218).
     *
     *     The half that was missing: `/users/me` has always listed the account's login methods, but
     *     nothing could take one off, so a provider attached by someone else was permanent.
     */
    delete: operations['unlink_identity_api_v1_auth_link__provider__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/change-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Change Password
     * @description Verify the old password, write the new hash, revoke every session, tell the owner.
     *
     *     The notification is ADR-218's rule applied here too: every change to how this account can
     *     be signed into reaches the owner's own channels. `change-password` is the one path where
     *     knowing the current password is already required, so it is the least likely to be an
     *     attacker — but "least likely" is not a reason for the owner to hear nothing.
     */
    post: operations['change_password_api_v1_auth_change_password_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/set-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Set Password
     * @description Create a first password identity for an SSO-only account, proof first.
     *
     *     There is no old password to check here, so before ADR-215 a session was the only thing
     *     between a caller and a brand-new credential. Revoking every session afterwards (ADR-160)
     *     does not close that on its own: the password outlives the session, and whoever minted it
     *     signs straight back in with it. So the proof happens *before* the credential exists —
     *     `require_step_up_for_first_password` delivers a code to the account's own contact, and
     *     the first call answers 422 asking for it back.
     *
     *     The revocation stays (ADR-160): it aligns with `/auth/change-password`, which has always
     *     revoked, and it means a session that watched a password being set does not keep running
     *     on the strength of it. The owner is told afterwards, because a first password on an
     *     SSO-only account is a new permanent way in and must not appear silently.
     */
    post: operations['set_password_api_v1_auth_set_password_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/forgot-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Forgot Password
     * @description Start a logged-out password reset. Always 202 (anti-enumeration).
     *
     *     Real accounts with a password get a 6-digit reset code; SSO-only accounts get a generic
     *     "use third-party sign-in" notice. Unknown/unreachable identifiers get nothing. The HTTP response is
     *     identical in every branch; only the owner's inbox/phone sees what differs.
     *
     *     Delivery is dispatched via BackgroundTasks so every branch returns in ~constant time — otherwise the
     *     awaited send on the account-exists branch leaks account existence via response latency once a real
     *     email/SMS provider is wired (the response body is already identical across branches).
     */
    post: operations['forgot_password_api_v1_auth_forgot_password_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/reset-password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reset Password
     * @description Complete a logged-out reset: consume the code, write the new password, revoke all sessions.
     */
    post: operations['reset_password_api_v1_auth_reset_password_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/contacts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add Contact
     * @description Start adding or replacing a contact: send a 6-digit code to the new value.
     *
     *     Replacing an existing contact of the same type additionally requires step-up (ADR-085).
     *     For an SSO-only account, the first call without `step_up` is what delivers the code to
     *     the OLD channel, and answers 422 asking for it back.
     */
    post: operations['add_contact_api_v1_auth_contacts_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/contacts/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Verify Contact
     * @description Verify a 6-digit code and attach — or atomically swap in — the verified contact.
     *
     *     The change notification to the old channel is dispatched via BackgroundTasks (ADR-162):
     *     the swap has already committed by then, so a provider failure must not unwind the request
     *     — nor sit in front of the response while it times out.
     */
    post: operations['verify_contact_api_v1_auth_contacts_verify_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/contacts/{type}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Delete Contact
     * @description Remove one of the caller's contacts, refusing to leave the account unreachable.
     *
     *     Removing a login channel needs the same step-up as replacing one (ADR-159), so this
     *     takes an optional body carrying the proof. A stripped or absent body simply means no
     *     proof was supplied and answers 422 — the failure mode is closed, not open (ADR-161).
     */
    delete: operations['delete_contact_api_v1_auth_contacts__type__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/contacts/resend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Resend Contact
     * @description Resend the contact-verification code for a still-pending add/replace (rate limited).
     */
    post: operations['resend_contact_api_v1_auth_contacts_resend_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/users/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read User Me
     * @description 獲取當前登入使用者的個人資料，含可切換的身分清單、聯絡方式與登入方式。
     */
    get: operations['read_user_me_api_v1_users_me_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update User Me
     * @description 更新當前登入使用者的個人資料（僅 name；電話與信箱走 /auth/contacts 流程）。
     */
    patch: operations['update_user_me_api_v1_users_me_patch'];
    trace?: never;
  };
  '/api/v1/notifications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Notifications
     * @description 取得當前登入使用者的分頁通知列表 (依建立時間降序排序)。
     */
    get: operations['list_notifications_api_v1_notifications_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/notifications/unread-count': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Unread Count
     * @description 取得當前使用者之未讀通知數量與是否存在 urgent 等級未讀通知。
     */
    get: operations['get_unread_count_api_v1_notifications_unread_count_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/notifications/{uuid}/read': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Mark Notification Read
     * @description 標記單筆通知為已讀。
     *
     *     安全性保證：若該通知不存在或不屬於當前使用者，一律回傳 404 (防止跨使用者探測 ID)。
     */
    patch: operations['mark_notification_read_api_v1_notifications__uuid__read_patch'];
    trace?: never;
  };
  '/api/v1/notifications/read-all': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Mark All Notifications Read
     * @description 一鍵將當前使用者的所有未讀通知標記為已讀。
     */
    patch: operations['mark_all_notifications_read_api_v1_notifications_read_all_patch'];
    trace?: never;
  };
  '/api/v1/admin/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List Users
     * @description List users with every identity they hold, plus last login/activity and live sessions.
     *
     *     Feature 010 replaced the single platform/team role pair with the full identity list
     *     (ADR-073); feature 013 added the activity columns and the session count (ADR-093/094).
     *     Both land in the same row.
     */
    get: operations['list_users_api_v1_admin_users_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/project-settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 讀取專案（災害）設定
     * @description Return what disaster this deployment is responding to (ADR-090).
     */
    get: operations['get_project_settings_api_v1_admin_project_settings_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * 更新專案（災害）設定
     * @description Upsert the single settings row; changing disaster_types re-scopes the dynamic fields.
     *
     *     `exclude_unset` gives real PATCH semantics: an omitted field keeps its stored value,
     *     while an explicit `"started_at": null` clears it. `name` / `disaster_types` are NOT NULL
     *     columns, so an explicit null there is dropped rather than written.
     */
    patch: operations['update_project_settings_api_v1_admin_project_settings_patch'];
    trace?: never;
  };
  '/api/v1/admin/users/{user_uuid}/role': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Assign Role
     * @description Grant a user a PLATFORM role, replacing the one they hold.
     *
     *     Team roles go through POST /teams/{team_uuid}/members, where the team is unambiguous —
     *     granting a team role IS joining that team (ADR-072).
     */
    post: operations['assign_role_api_v1_admin_users__user_uuid__role_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{user_uuid}/revoke-sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * 強制登出使用者的所有 session
     * @description Sign a user out of every device; their access tokens stop working immediately.
     *
     *     Returns 204 with no body on purpose. How many sessions were ended tells the caller how
     *     many devices the target has online, which is not theirs to know and not something they
     *     need — it goes to the log instead (ADR-103).
     *
     *     The persisted trail is the audit row the service writes (ADR-191); this log line is an
     *     operational echo of it, and names the actor for the same reason the row does.
     */
    post: operations['revoke_user_sessions_api_v1_admin_users__user_uuid__revoke_sessions_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/teams': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 列出 team
     * @description List teams filtered by the caller's team.view scope (all / own team / none).
     */
    get: operations['list_teams_api_v1_admin_teams_get'];
    put?: never;
    /**
     * 建立 team
     * @description Create a gov/ngo team (super_admin only, via team.edit).
     */
    post: operations['create_team_api_v1_admin_teams_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/teams/{team_uuid}/members': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add Team Member
     * @description Add a user to a team by granting them a role in it (defaults to `member`).
     *
     *     A user may belong to several teams at once; this replaces only the role they held in
     *     THIS team (ADR-072/073).
     */
    post: operations['add_team_member_api_v1_admin_teams__team_uuid__members_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/teams/{team_uuid}/members/{user_uuid}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Remove Team Member
     * @description Remove a user from a team by revoking every grant scoped to it (ADR-072).
     */
    delete: operations['remove_team_member_api_v1_admin_teams__team_uuid__members__user_uuid__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/rbac/capabilities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Capabilities
     * @description Capability catalog + scope values for the frontend's dropdowns (read-only).
     */
    get: operations['get_capabilities_api_v1_admin_rbac_capabilities_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/rbac/matrix': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Matrix
     * @description The full role × capability × scope grid.
     */
    get: operations['get_matrix_api_v1_admin_rbac_matrix_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/rbac/roles/{role_uuid}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Role
     * @description One role and its grants.
     */
    get: operations['get_role_api_v1_admin_rbac_roles__role_uuid__get'];
    put?: never;
    post?: never;
    /**
     * Delete Role
     * @description Delete a role and its grants (super_admin only, via rbac.edit).
     */
    delete: operations['delete_role_api_v1_admin_rbac_roles__role_uuid__delete'];
    options?: never;
    head?: never;
    /**
     * Rename Role
     * @description Rename a role (super_admin only, via rbac.edit).
     */
    patch: operations['rename_role_api_v1_admin_rbac_roles__role_uuid__patch'];
    trace?: never;
  };
  '/api/v1/admin/users/{user_uuid}/permissions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get User Permissions
     * @description A user's roles, direct grants, and resolved effective permissions.
     */
    get: operations['get_user_permissions_api_v1_admin_users__user_uuid__permissions_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/rbac/roles/{role_uuid}/permissions/{cap}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Set Role Permission
     * @description Upsert one role×capability matrix cell (super_admin only, via rbac.edit).
     */
    put: operations['set_role_permission_api_v1_admin_rbac_roles__role_uuid__permissions__cap__put'];
    post?: never;
    /**
     * Revoke Role Permission
     * @description Revoke one role×capability matrix cell (super_admin only, via rbac.edit).
     */
    delete: operations['revoke_role_permission_api_v1_admin_rbac_roles__role_uuid__permissions__cap__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{user_uuid}/permissions/{cap}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Set User Permission
     * @description Add/update one per-user additive grant (super_admin only, via rbac.assign).
     *
     *     `team_uuid` binds the grant to that team's identity; omitted, it binds to the platform
     *     identity (ADR-073) — a grant scoped `team` or `zone` means nothing without one.
     */
    put: operations['set_user_permission_api_v1_admin_users__user_uuid__permissions__cap__put'];
    post?: never;
    /**
     * Revoke User Permission
     * @description Remove one per-user grant from one identity (super_admin only, via rbac.assign).
     */
    delete: operations['revoke_user_permission_api_v1_admin_users__user_uuid__permissions__cap__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/rbac/roles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create Role
     * @description Create a new empty role (super_admin only, via rbac.edit).
     */
    post: operations['create_role_api_v1_admin_rbac_roles_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{user_uuid}/role/{role_uuid}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Unassign User Role
     * @description Remove one identity from a user (super_admin only, via rbac.assign).
     *
     *     `team_uuid` picks which identity when the role is held in several teams; omitted, it
     *     means the platform identity (ADR-073).
     */
    delete: operations['unassign_user_role_api_v1_admin_users__user_uuid__role__role_uuid__delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/rbac-test/public': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Public Api
     * @description 公開 API：不需要任何權限。
     */
    get: operations['public_api_api_v1_rbac_test_public_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/rbac-test/map-view': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Map View Api
     * @description 地圖檢視 API：需要 'map.view' 權限。
     */
    get: operations['map_view_api_api_v1_rbac_test_map_view_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/rbac-test/map-create': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Map Create Api
     * @description 建立標記 API：需要 'map.add' 權限。
     */
    get: operations['map_create_api_api_v1_rbac_test_map_create_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/rbac-test/admin-only': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Admin Only Api
     * @description 管理員專用 API：需要 'user.view' 權限。
     */
    get: operations['admin_only_api_api_v1_rbac_test_admin_only_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/stations/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 匯出資源站點（CSV / XLSX）
     * @description Export one station type's rows, limited to what the caller's scope reaches.
     */
    get: operations['export_stations_api_v1_bulk_stations_export_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/tickets/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 匯出求助單（CSV / XLSX）
     * @description Export one task type's rows; contact fields are masked per row (ADR-109).
     */
    get: operations['export_tickets_api_v1_bulk_tickets_export_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/stations/import/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * 預覽資源站點匯入（不寫入）
     * @description Dry-run the file and report every problem at once. Writes nothing (ADR-112).
     */
    post: operations['preview_station_import_api_v1_bulk_stations_import_preview_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/tickets/import/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * 預覽求助單匯入（不寫入）
     * @description Dry-run the file. Same contract as the station preview.
     */
    post: operations['preview_ticket_import_api_v1_bulk_tickets_import_preview_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/stations/import/commit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * 執行資源站點匯入
     * @description Write the file row by row; failed rows come back as a downloadable report.
     */
    post: operations['commit_station_import_api_v1_bulk_stations_import_commit_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/bulk/tickets/import/commit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * 執行求助單匯入
     * @description Write the file row by row. Same contract as the station commit.
     */
    post: operations['commit_ticket_import_api_v1_bulk_tickets_import_commit_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/history/tickets/{uuid}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 求助單的異動時間軸
     * @description Who created, edited and staffed this help request, newest first.
     *
     *     Covers the ticket itself, its address, its tasks, their dynamic fields and their
     *     assignments — including assignments that were later cancelled, which no longer exist in
     *     `task_assignments` at all (ADR-132).
     */
    get: operations['ticket_history_api_v1_history_tickets__uuid__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/history/stations/{uuid}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * 資源站點的異動時間軸
     * @description Who created and edited this station, and how its stock levels moved, newest first.
     */
    get: operations['station_history_api_v1_history_stations__uuid__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/map/tile/{type_}/{source}/{z}/{x}/{y}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Tile
     * @description Proxy a map tile from an upstream source with 7-day Redis caching.
     *
     *     **type** — `satellite` or `road`
     *
     *     **source** — one of:
     *     - satellite: `nasa_gibs` (image/jpeg), `eox` (image/jpeg), `nlsc` (image/png), `sinica` (image/png)
     *     - road: `osm` (image/png), `carto` (image/png)
     *
     *     **z/x/y** — Standard XYZ slippy map tile coordinates (z: 0–19)
     *
     *     **layer** — Required only for `source=sinica`. Pass the Sinica layer name
     *     (e.g. `EARTH`, `TAIWAN_MOSAIC`). See https://gis.sinica.edu.tw/worldmap/
     *     for available layers. Ignored for all other sources.
     *
     *     Returns the raw tile image bytes with the upstream Content-Type header.
     *     On upstream error, returns a 1×1 transparent PNG.
     */
    get: operations['get_tile_api_v1_map_tile__type____source___z___x___y__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/map/attribution/{type_}/{source}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Attribution Info
     * @description Return attribution metadata for a given tile source.
     *
     *     The frontend should display `attribution_text` on the map.
     *     When `requires_logo` is true, also render the logo from `logo_url`.
     */
    get: operations['get_attribution_info_api_v1_map_attribution__type____source__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analytics/catalog': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Analytics Catalog
     * @description Machine-readable y-metric catalog: valid `x` values and chart types per metric.
     *
     *     The source of truth behind the "ignore x when it doesn't apply" behavior on both
     *     chart endpoints below — build x/y dropdowns from this response instead of
     *     hardcoding the rules client-side.
     *
     *     Authentication only, no capability: the response is a static description of this
     *     API's own shape and contains no records. Gating it on ticket.view (as it originally
     *     was) locked a station-only role out of the station catalog it is allowed to chart.
     */
    get: operations['get_analytics_catalog_api_v1_analytics_catalog_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analytics/tickets/chart': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Ticket Chart
     * @description Render one ticket/task metric as a Plotly chart.
     *
     *     See the module docstring for the x/y model and example queries, and GET
     *     /analytics/catalog for the full per-metric rules.
     *
     *     `scope` is a bound parameter, not a `dependencies=[]` entry, because FastAPI discards a
     *     dependency's return value there. The permission check is the same either way, but the
     *     resolved scope is needed to narrow the rows — otherwise a caller holding `ticket.view`
     *     at `own` gets totals for the whole table.
     */
    get: operations['get_ticket_chart_api_v1_analytics_tickets_chart_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analytics/tickets/value': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Ticket Value
     * @description One ticket/task metric's ungrouped aggregate as a number — what a KPI card shows.
     */
    get: operations['get_ticket_value_api_v1_analytics_tickets_value_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analytics/stations/chart': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Station Chart
     * @description Render one station metric as a Plotly chart.
     *
     *     See the module docstring for the x/y model and example queries, and GET
     *     /analytics/catalog for the full per-metric rules. `scope` is a bound parameter rather
     *     than a route dependency for the reason given on the ticket endpoint above.
     */
    get: operations['get_station_chart_api_v1_analytics_stations_chart_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/analytics/stations/value': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get Station Value
     * @description One station metric's ungrouped aggregate as a number — what a KPI card shows.
     */
    get: operations['get_station_value_api_v1_analytics_stations_value_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/graphql': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Handle Http Get */
    get: operations['handle_http_get_graphql_get'];
    put?: never;
    /** Handle Http Post */
    post: operations['handle_http_post_graphql_post'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Root
     * @description Return a welcome message confirming the API is online.
     */
    get: operations['root__get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Health Check
     * @description Return a simple health check response.
     */
    get: operations['health_check_health_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/readyz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Readiness Check
     * @description Readiness probe: 200 only when DB and Redis are reachable. Used as the deploy gate.
     */
    get: operations['readiness_check_readyz_get'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /**
     * AccessTokenResponse
     * @description A re-signed access token, with no refresh token.
     *
     *     Switching identity does not rotate the refresh token (ADR-070), and the server only ever
     *     stores its hash, so there is nothing to echo back — the client keeps the one it has.
     *
     *     `identity` names what the new token acts as (ADR-205), so a client can confirm the switch
     *     landed without decoding the token it just received.
     */
    AccessTokenResponse: {
      /** Access Token */
      access_token: string;
      /**
       * Token Type
       * @default bearer
       */
      token_type: string;
      /** Expires In */
      expires_in: number;
      identity?: components['schemas']['IdentityView'] | null;
    };
    /**
     * ActorResponse
     * @description Who acted.
     *
     *     `uuid` and `name` are both null for a system write — app.current_user_id is only set on
     *     HTTP requests, so seeds, migrations and background jobs land unattributed (ADR-136).
     *     There is no "unknown" state: users are soft-deleted, so a uuid here always resolves.
     */
    ActorResponse: {
      /**
       * Uuid
       * @description 操作者 UUID；系統寫入為 null
       */
      uuid: string | null;
      /**
       * Name
       * @description 操作者顯示名稱；系統寫入為 null
       */
      name: string | null;
      /**
       * Kind
       * @description user / system / crawler / gov / ngo（後三者僅建立事件，ADR-137）
       */
      kind: string;
      /**
       * Is Removed
       * @description 該使用者是否已被移除（仍顯示姓名，ADR-136）
       */
      is_removed: boolean;
    };
    /**
     * AddContactRequest
     * @description Body to start adding — or replacing — a contact (email/phone) on the current account.
     */
    AddContactRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * AdminUserListItem
     * @description One row of the admin user list.
     *
     *     `identities` replaces the old single-valued `team_uuid` / `team_role`: a user can now
     *     hold a role in several teams at once, so one column cannot describe them (ADR-073).
     */
    AdminUserListItem: {
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /** Name */
      name: string;
      /** Platform Role */
      platform_role: string | null;
      /** Identities */
      identities?: components['schemas']['IdentitySummary'][];
      /** Last Login At */
      last_login_at?: string | null;
      /** Last Activity At */
      last_activity_at?: string | null;
      /** Active Session Count */
      active_session_count?: number | null;
    };
    /**
     * AssignRoleRequest
     * @description Body naming the role to grant a user (replaces any existing role of the same kind).
     */
    AssignRoleRequest: {
      /** Role Name */
      role_name: string;
    };
    /**
     * AssignRoleResponse
     * @description Confirms which user now holds which role.
     */
    AssignRoleResponse: {
      /**
       * User Uuid
       * Format: uuid
       */
      user_uuid: string;
      /**
       * Role Uuid
       * Format: uuid
       */
      role_uuid: string;
    };
    /**
     * AttributionResponse
     * @description Schema for map tile source attribution metadata.
     */
    AttributionResponse: {
      /** Source */
      source: string;
      /** Type */
      type: string;
      /** Name */
      name: string;
      /** License */
      license: string;
      /** Attribution Text */
      attribution_text: string;
      /** Attribution Url */
      attribution_url: string;
      /** Image Format */
      image_format: string;
      /** Commercial Use */
      commercial_use: boolean;
      /** Requires Logo */
      requires_logo: boolean;
      /** Logo Url */
      logo_url?: string | null;
      /** Notes */
      notes?: string | null;
    };
    /** Body_commit_station_import_api_v1_bulk_stations_import_commit_post */
    Body_commit_station_import_api_v1_bulk_stations_import_commit_post: {
      /**
       * File
       * @description 與 preview 相同的那份檔
       */
      file: string;
      /**
       * Mapping
       * @description preview 確認過的欄位映射 JSON
       */
      mapping?: string | null;
    };
    /** Body_commit_ticket_import_api_v1_bulk_tickets_import_commit_post */
    Body_commit_ticket_import_api_v1_bulk_tickets_import_commit_post: {
      /**
       * File
       * @description 與 preview 相同的那份檔
       */
      file: string;
      /**
       * Mapping
       * @description preview 確認過的欄位映射 JSON
       */
      mapping?: string | null;
    };
    /** Body_login_api_v1_auth_login_post */
    Body_login_api_v1_auth_login_post: {
      /** Grant Type */
      grant_type?: string | null;
      /** Username */
      username: string;
      /**
       * Password
       * Format: password
       */
      password: string;
      /**
       * Scope
       * @default
       */
      scope: string;
      /** Client Id */
      client_id?: string | null;
      /**
       * Client Secret
       * Format: password
       */
      client_secret?: string | null;
    };
    /** Body_preview_station_import_api_v1_bulk_stations_import_preview_post */
    Body_preview_station_import_api_v1_bulk_stations_import_preview_post: {
      /**
       * File
       * @description CSV 或 XLSX
       */
      file: string;
      /**
       * Mapping
       * @description 欄位映射 JSON；第一次呼叫可省略
       */
      mapping?: string | null;
    };
    /** Body_preview_ticket_import_api_v1_bulk_tickets_import_preview_post */
    Body_preview_ticket_import_api_v1_bulk_tickets_import_preview_post: {
      /**
       * File
       * @description CSV 或 XLSX
       */
      file: string;
      /**
       * Mapping
       * @description 欄位映射 JSON；第一次呼叫可省略
       */
      mapping?: string | null;
    };
    /**
     * BulkImportResponse
     * @description What `commit` reports afterwards.
     */
    BulkImportResponse: {
      /**
       * Batch Id
       * @description 這次匯入的識別碼；目前只在這個回應裡（ADR-124）
       */
      batch_id: string;
      /** Created */
      created: number;
      /** Updated */
      updated: number;
      /** Failed */
      failed: number;
      /** Errors */
      errors: components['schemas']['RowErrorResponse'][];
      error_report?: components['schemas']['ErrorReportResponse'] | null;
      /**
       * Partial Rows
       * @description 主資料已寫入、但後續步驟因權限失敗的列號——這幾列處於半完成狀態
       */
      partial_rows?: number[];
    };
    /**
     * BulkPreviewResponse
     * @description What `preview` reports before anything is written.
     */
    BulkPreviewResponse: {
      /** Detected Headers */
      detected_headers: string[];
      /**
       * Suggested Mapping
       * @description 檔案欄位 → 系統欄位的自動配對
       */
      suggested_mapping: {
        [key: string]: string;
      };
      /**
       * Unmapped Headers
       * @description 配不到系統欄位的檔案欄位
       */
      unmapped_headers: string[];
      /** Sample Rows */
      sample_rows: {
        [key: string]: string;
      }[];
      /** Row Count */
      row_count: number;
      /** To Create */
      to_create: number;
      /** To Update */
      to_update: number;
      /** Errors */
      errors: components['schemas']['RowErrorResponse'][];
      /**
       * Skipped Columns
       * @description 設定裡有、但這種檔案存不下的動態欄位（ADR-118）
       */
      skipped_columns?: {
        [key: string]: string;
      }[];
    };
    /**
     * CapabilityCatalogResponse
     * @description The full capability catalog + allowed scope values (read-only, ADR-057).
     */
    CapabilityCatalogResponse: {
      /** Scopes */
      scopes: string[];
      /** Capabilities */
      capabilities: components['schemas']['CapabilityInfo'][];
    };
    /**
     * CapabilityInfo
     * @description One capability key, split for display.
     *
     *     `public` = in PUBLIC_PERMS. `team_gov_only` (ADR-064) = held by a team-kind role it only
     *     takes effect on gov-type teams (work_zone.py `_require_gov_zone_authority`), so the matrix
     *     grant alone overstates what an ngo admin can do; the frontend shows a "gov teams only" note.
     *     `team_gov_widened` (ADR-285) = a `team` grant on it reaches every station when held by a gov
     *     team, so the matrix's `team` understates what a gov admin can do.
     */
    CapabilityInfo: {
      /** Key */
      key: string;
      /** Resource */
      resource: string;
      /** Action */
      action: string;
      /** Public */
      public: boolean;
      /**
       * Team Gov Only
       * @default false
       */
      team_gov_only: boolean;
      /**
       * Team Gov Widened
       * @default false
       */
      team_gov_widened: boolean;
    };
    /**
     * CatalogResponse
     * @description The full y-metric catalog, per domain — source of truth for GET /analytics/catalog.
     */
    CatalogResponse: {
      /** Tickets */
      tickets: {
        [key: string]: components['schemas']['YMetricSpec'];
      };
      /** Stations */
      stations: {
        [key: string]: components['schemas']['YMetricSpec'];
      };
      /** @description What the chart endpoints render with when `style` is omitted. */
      default_style: components['schemas']['ChartStyle'];
    };
    /**
     * ChangePasswordRequest
     * @description Request body for changing password (all values already frontend-hashed).
     */
    ChangePasswordRequest: {
      /** Old Password */
      old_password: string;
      /** New Password */
      new_password: string;
      /**
       * Salt Frontend
       * @description Frontend salt for the new password
       */
      salt_frontend: string;
    };
    /**
     * ChangeResponse
     * @description One field that moved.
     *
     *     `before` / `after` are null with `changed=true` when the caller may know that the value
     *     moved but not what it moved to — a withheld address, or any geometry (ADR-141/142).
     *     Values are raw; Chinese labels and status wording belong to the frontend (ADR-145).
     */
    ChangeResponse: {
      /** Field */
      field: string;
      /** Before */
      before?: unknown | null;
      /** After */
      after?: unknown | null;
      /**
       * Changed
       * @description true 代表有變更但不揭露值
       */
      changed?: boolean | null;
    };
    /**
     * ChartMargin
     * @description Figure margins in px — the space around the plot area for axis labels and legend.
     */
    ChartMargin: {
      /**
       * Left
       * @default 48
       */
      left: number;
      /**
       * Right
       * @default 16
       */
      right: number;
      /**
       * Top
       * @default 8
       */
      top: number;
      /**
       * Bottom
       * @default 40
       */
      bottom: number;
    };
    /**
     * ChartResponse
     * @description A rendered Plotly chart as a partial HTML div (no embedded plotly.js).
     */
    ChartResponse: {
      /** Html */
      html: string;
    };
    /**
     * ChartStyle
     * @description Presentation knobs for a rendered chart; defaults reproduce the ops dashboard mock.
     *
     *     Passed JSON-encoded as the `style` query param. Anything not covered here goes through
     *     `layout_overrides`, which is applied after this and wins.
     */
    ChartStyle: {
      /**
       * Palette
       * @description Series colours, cycled in trace order (Plotly `colorway`/`piecolorway`).
       * @default [
       *       "#E3791E",
       *       "#2592B9",
       *       "#2E7D32",
       *       "#8B5CF6",
       *       "#D32F2F",
       *       "#62BADA",
       *       "#F57C00",
       *       "#64748B"
       *     ]
       */
      palette: string[];
      /**
       * Font Family
       * @default Inter, Noto Sans TC, sans-serif
       */
      font_family: string;
      /**
       * Font Size
       * @default 12
       */
      font_size: number;
      /**
       * Font Color
       * @default #475569
       */
      font_color: string;
      /**
       * Grid Color
       * @default #EDF2F7
       */
      grid_color: string;
      /**
       * Legend
       * @default bottom
       * @enum {string}
       */
      legend: 'bottom' | 'right' | 'none';
      /**
       * Line Width
       * @default 2.5
       */
      line_width: number;
      /**
       * Line Shape
       * @default spline
       * @enum {string}
       */
      line_shape: 'spline' | 'linear';
      /**
       * Pie Hole
       * @description 0 for a full pie, up to <1 for a donut.
       * @default 0.5
       */
      pie_hole: number;
      /**
       * @default {
       *       "left": 48,
       *       "right": 16,
       *       "top": 8,
       *       "bottom": 40
       *     }
       */
      margin: components['schemas']['ChartMargin'];
      /**
       * Modebar
       * @description Show Plotly's hover toolbar (zoom/pan/download).
       * @default false
       */
      modebar: boolean;
    };
    /**
     * ChartType
     * @description Plotly chart shape.
     *
     *     See https://plotly.com/python/bar-charts/, https://plotly.com/python/line-charts/,
     *     https://plotly.com/python/pie-charts/. Unlike `x`, an unsupported chart_type for
     *     the chosen y-metric is a 400, not silently ignored — see GET /analytics/catalog
     *     for each metric's allowed_chart_types.
     * @enum {string}
     */
    ChartType: 'bar' | 'line' | 'pie';
    /**
     * ChartX
     * @description How to slice the chosen y-metric (the X axis).
     *
     *     Omit this param entirely for a single aggregate value/pie. Whether a given value
     *     is valid for a given y-metric is enforced by app.services.chart_render.resolve()
     *     — an inapplicable x is silently ignored (falls back to aggregate, or to the
     *     metric's forced grouping if it has one), never rejected. See GET
     *     /api/v1/analytics/catalog for which x values are valid per y-metric.
     * @enum {string}
     */
    ChartX: 'date' | 'category';
    /**
     * ChartXGranularity
     * @description Bucket size when x=date. Ignored otherwise.
     * @enum {string}
     */
    ChartXGranularity: 'day' | 'week';
    /**
     * ContactOut
     * @description One of the caller's own contact methods. Not masked — this is your own profile.
     */
    ContactOut: {
      /** Type */
      type: string;
      /** Value */
      value: string;
      /** Verified */
      verified: boolean;
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
    };
    /**
     * CreateRoleRequest
     * @description Create-role body; kind is fixed to platform|team, name is trimmed and 1..50 chars.
     */
    CreateRoleRequest: {
      /** Name */
      name: string;
      /**
       * Kind
       * @enum {string}
       */
      kind: 'platform' | 'team';
    };
    /**
     * CreateTeamRequest
     * @description Body for creating a gov/ngo team.
     */
    CreateTeamRequest: {
      /** Name */
      name: string;
      /**
       * Type
       * @enum {string}
       */
      type: 'gov' | 'ngo';
      /** Tax Id */
      tax_id?: string | null;
    };
    /**
     * DeleteContactRequest
     * @description Body for `DELETE /auth/contacts/{type}` — carries the step-up proof (ADR-159/161).
     *
     *     Its own model rather than a reuse of `AddContactRequest`: delete takes its type from the
     *     path and has no `value`, so sharing the schema would advertise two fields the endpoint
     *     ignores. The body is optional — the first call is expected to arrive without one, which
     *     is what makes the backend name the proof it wants.
     */
    DeleteContactRequest: {
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * DirectGrant
     * @description One per-user grant and the identity it binds to (NULL team = the platform identity).
     */
    DirectGrant: {
      /** Capability */
      capability: string;
      /** Scope */
      scope: string;
      /** Team Uuid */
      team_uuid: string | null;
    };
    /**
     * ErrorReportResponse
     * @description The failed rows rendered back in the uploaded format, base64-encoded.
     *
     *     Carried inline rather than behind a download URL: the endpoints are stateless (ADR-114),
     *     and the report describes *this* run — after a commit, re-deriving it from the same file
     *     would not produce the same answer, because some of those rows now exist.
     */
    ErrorReportResponse: {
      /** Filename */
      filename: string;
      /** Media Type */
      media_type: string;
      /** Content Base64 */
      content_base64: string;
    };
    /**
     * ForgotPasswordRequest
     * @description Body to request a logged-out password reset code.
     */
    ForgotPasswordRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
    };
    /**
     * GoogleSsoRequest
     * @description Body carrying a Google id_token for SSO login / first-login create.
     */
    GoogleSsoRequest: {
      /** Id Token */
      id_token: string;
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components['schemas']['ValidationError'][];
    };
    /**
     * HistoryEventResponse
     * @description One transaction, folded into a single event (ADR-134).
     */
    HistoryEventResponse: {
      /**
       * Event Type
       * @description CREATED / UPDATED / DELETED / RESTORED / ASSIGNED / UNASSIGNED
       */
      event_type: string;
      /**
       * At
       * Format: date-time
       */
      at: string;
      /** Entity */
      entity: string;
      actor: components['schemas']['ActorResponse'];
      /** Changes */
      changes: components['schemas']['ChangeResponse'][];
      /**
       * Raw
       * @description 原始 audit 負載；僅持有 audit.view 時附上（ADR-130）
       */
      raw?:
        | {
            [key: string]: unknown;
          }[]
        | null;
    };
    /**
     * HistoryMeta
     * @description Paging information. Slicing happens in the application layer (ADR-139).
     */
    HistoryMeta: {
      /**
       * Total
       * @description 合併後的事件總數
       */
      total: number;
      /**
       * Truncated
       * @description 超過抓取上限而截斷（ADR-139）
       */
      truncated: boolean;
      /** Limit */
      limit: number;
      /** Offset */
      offset: number;
    };
    /**
     * HistoryResponse
     * @description The project's standard envelope around a page of timeline events.
     */
    HistoryResponse: {
      /**
       * Success
       * @default true
       */
      success: boolean;
      /** Data */
      data: components['schemas']['HistoryEventResponse'][];
      meta: components['schemas']['HistoryMeta'];
    };
    /**
     * IdTokenRequest
     * @description Body carrying a provider id_token (LINE SSO / link).
     *
     *     `step_up` is ignored on the SSO login path and required on the link path (ADR-217).
     */
    IdTokenRequest: {
      /** Id Token */
      id_token: string;
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * IdentityOption
     * @description An identity the caller may switch to (ADR-068).
     */
    IdentityOption: {
      /**
       * Role Uuid
       * Format: uuid
       */
      role_uuid: string;
      /** Role */
      role: string;
      /** Team Uuid */
      team_uuid?: string | null;
      /** Team */
      team?: string | null;
    };
    /**
     * IdentityPermissions
     * @description One identity a user holds, and what it can actually do (ADR-178).
     */
    IdentityPermissions: {
      /**
       * Role Uuid
       * Format: uuid
       */
      role_uuid: string;
      /** Role */
      role: string;
      /** Kind */
      kind: string;
      /** Team Uuid */
      team_uuid: string | null;
      /** Team */
      team: string | null;
      /** Effective */
      effective: {
        [key: string]: string;
      };
    };
    /**
     * IdentitySummary
     * @description One identity a user may act as: a role, and the team it applies to if team-kind.
     */
    IdentitySummary: {
      /**
       * Role Uuid
       * Format: uuid
       */
      role_uuid: string;
      /** Role */
      role: string;
      /** Team Uuid */
      team_uuid?: string | null;
      /** Team */
      team?: string | null;
    };
    /**
     * IdentityView
     * @description Which identity the returned token acts as (ADR-205).
     *
     *     Names travel with the uuids for the same reason `audit_logs.context` snapshots them: a
     *     role can be renamed or hard-deleted, and a client showing "acting as 花蓮縣府 / 管理員"
     *     should not have to resolve two uuids to do it.
     */
    IdentityView: {
      /** Role Uuid */
      role_uuid: string;
      /** Role */
      role: string;
      /** Team Uuid */
      team_uuid?: string | null;
      /** Team */
      team?: string | null;
    };
    /**
     * LinkGoogleRequest
     * @description Body carrying a Google id_token to link to the current account, plus its proof.
     *
     *     The id_token proves the caller holds *that Google account*; it says nothing about the
     *     account being linked to. `step_up` is the other half (ADR-217), and is optional in the
     *     schema for the same reason `DeleteContactRequest`'s is: the first call is what delivers
     *     the code and answers 422 asking for it back.
     */
    LinkGoogleRequest: {
      /** Id Token */
      id_token: string;
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * LoginMethodOut
     * @description One of the caller's login methods.
     *
     *     Deliberately only `provider`: `provider_subject` is the SSO provider's internal
     *     identifier and the frontend has no use for it (ADR-089).
     */
    LoginMethodOut: {
      /** Provider */
      provider: string;
    };
    /**
     * MarkAllReadResponse
     * @description Response returned after marking all notifications as read.
     */
    MarkAllReadResponse: {
      /**
       * Updated Count
       * @description Number of notifications marked as read
       */
      updated_count: number;
    };
    /**
     * MatrixResponse
     * @description The whole role × capability × scope grid.
     */
    MatrixResponse: {
      /** Roles */
      roles: components['schemas']['RoleGrants'][];
    };
    /**
     * NotificationItem
     * @description Schema representing a single notification item.
     */
    NotificationItem: {
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /**
       * Recipient Uuid
       * Format: uuid
       */
      recipient_uuid: string;
      /** Actor Uuid */
      actor_uuid?: string | null;
      /**
       * Type
       * @description Notification event type
       */
      type: string;
      /**
       * Priority
       * @description Priority: urgent, high, medium, info
       */
      priority: string;
      /**
       * Ref Type
       * @description Polymorphic entity type
       */
      ref_type?: string | null;
      /**
       * Ref Uuid
       * @description Polymorphic entity UUID
       */
      ref_uuid?: string | null;
      /**
       * Title
       * @description Notification title
       */
      title: string;
      /**
       * Body
       * @description Notification body content
       */
      body: string;
      /**
       * Read
       * @description Read status
       */
      read: boolean;
      /**
       * Read At
       * @description Timestamp when read
       */
      read_at?: string | null;
      /**
       * Created At
       * @description Creation timestamp
       */
      created_at?: string | null;
    };
    /**
     * NotificationListResponse
     * @description Paginated list of notifications.
     */
    NotificationListResponse: {
      /** Items */
      items: components['schemas']['NotificationItem'][];
      /**
       * Total
       * @description Total matching notifications count
       */
      total: number;
      /**
       * Page
       * @description Current page number (1-indexed)
       */
      page: number;
      /**
       * Page Size
       * @description Items per page
       */
      page_size: number;
      /**
       * Has More
       * @description Whether there are more items
       */
      has_more: boolean;
    };
    /**
     * Perm
     * @description A capability key. Every RBAC check (checkpoint 1) is keyed on one of these.
     * @enum {string}
     */
    Perm:
      | 'ticket.view'
      | 'ticket.view_pii'
      | 'ticket.view_detail'
      | 'ticket.view_history'
      | 'ticket.add'
      | 'ticket.edit'
      | 'ticket.delete'
      | 'ticket.assign'
      | 'ticket.review'
      | 'ticket.export'
      | 'ticket.import'
      | 'station.view'
      | 'station.view_pii'
      | 'station.view_history'
      | 'station.add'
      | 'station.edit'
      | 'station.delete'
      | 'station.review'
      | 'station.assign'
      | 'station.contribute'
      | 'station.export'
      | 'station.import'
      | 'map.view'
      | 'map.add'
      | 'map.edit'
      | 'map.delete'
      | 'ai_duplicate.view'
      | 'ai_duplicate.review'
      | 'user.view'
      | 'user.add'
      | 'user.edit'
      | 'user.delete'
      | 'team.view'
      | 'team.edit'
      | 'team.member.manage'
      | 'work_zone.view'
      | 'work_zone.add'
      | 'work_zone.edit'
      | 'work_zone.assign'
      | 'work_zone.delete'
      | 'dynamic_field.view'
      | 'dynamic_field.add'
      | 'dynamic_field.edit'
      | 'dynamic_field.delete'
      | 'project.view'
      | 'project.edit'
      | 'announcement.view'
      | 'announcement.publish'
      | 'announcement.edit'
      | 'announcement.delete'
      | 'pre_departure.view'
      | 'pre_departure.publish'
      | 'pre_departure.edit'
      | 'pre_departure.delete'
      | 'audit.view'
      | 'rbac.view'
      | 'rbac.assign'
      | 'rbac.edit';
    /**
     * ProjectSettingsResponse
     * @description The deployment's single project settings row, or its unset shape before first write.
     */
    ProjectSettingsResponse: {
      /** Uuid */
      uuid?: string | null;
      /** Name */
      name?: string | null;
      /** Disaster Types */
      disaster_types?: string[];
      /** Started At */
      started_at?: string | null;
      /** Warnings */
      warnings?: string[];
    };
    /**
     * ProjectSettingsUpdate
     * @description PATCH body: every field optional; omitted fields keep their stored value.
     */
    ProjectSettingsUpdate: {
      /** Name */
      name?: string | null;
      /** Disaster Types */
      disaster_types?: string[] | null;
      /** Started At */
      started_at?: string | null;
    };
    /**
     * RefreshRequest
     * @description Request body carrying a refresh token to exchange.
     *
     *     `identity` is the identity the client is currently acting as, read off its own access
     *     token. Without it the new token would fall back to the platform identity and silently
     *     bounce the user out of their team identity every 15 minutes (ADR-069).
     */
    RefreshRequest: {
      /** Refresh Token */
      refresh_token: string;
      /** Identity */
      identity?: string | null;
    };
    /**
     * RegisterRequest
     * @description Verify-then-create registration for email or phone.
     */
    RegisterRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
      /** Password */
      password: string;
      /**
       * Salt Frontend
       * @description Frontend salt (hex)
       */
      salt_frontend: string;
      /** Name */
      name: string;
    };
    /**
     * RenameRoleRequest
     * @description Rename-role body (name only; kind is immutable).
     */
    RenameRoleRequest: {
      /** Name */
      name: string;
    };
    /**
     * ResendVerificationRequest
     * @description Request to resend a verification message for a pending registration.
     */
    ResendVerificationRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
    };
    /**
     * ResetPasswordRequest
     * @description Body to complete a logged-out password reset (new_password already frontend-hashed).
     */
    ResetPasswordRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
      /** Code */
      code: string;
      /** New Password */
      new_password: string;
      /**
       * Salt Frontend
       * @description Frontend salt (hex)
       */
      salt_frontend: string;
    };
    /**
     * RoleGrants
     * @description A role and its capability->scope grants.
     */
    RoleGrants: {
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /** Name */
      name: string;
      /** Kind */
      kind: string;
      /** Grants */
      grants: {
        [key: string]: string;
      };
    };
    /**
     * RowErrorResponse
     * @description One problem with one row, addressed the way the user sees the file.
     */
    RowErrorResponse: {
      /**
       * Line
       * @description 試算表的列號，表頭是第 1 列
       */
      line: number;
      /**
       * Column
       * @description 出問題的欄位；`-` 代表整列層級的問題
       */
      column: string;
      /** Message */
      message: string;
    };
    /**
     * Scope
     * @description Data-boundary scope. Ordering (narrowest → widest) is defined by WIDTH below.
     * @enum {string}
     */
    Scope: 'none' | 'own' | 'team' | 'zone' | 'all';
    /**
     * SetGrantRequest
     * @description Upsert body for a single matrix cell; `scope` is validated against the Scope enum.
     */
    SetGrantRequest: {
      scope: components['schemas']['Scope'];
    };
    /**
     * SetPasswordRequest
     * @description Body for SSO-only users to set a first password (no old password).
     *
     *     `step_up` carries the code delivered to the account's own contact (ADR-215). It is
     *     optional in the schema because the first call is expected to arrive without one — that
     *     call is what sends the code and answers 422 asking for it back, the same shape
     *     `DeleteContactRequest` uses.
     */
    SetPasswordRequest: {
      /** Password */
      password: string;
      /**
       * Salt Frontend
       * @description Frontend salt (hex)
       */
      salt_frontend: string;
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * StationYMetric
     * @description What to measure (the Y axis) for a station chart — see app/services/station_analytics.py.
     * @enum {string}
     */
    StationYMetric:
      | 'station_count'
      | 'station_status_count'
      | 'station_freshness_trend';
    /**
     * StepUp
     * @description Extra proof required to REPLACE or DELETE a contact (ADR-086/159).
     *
     *     Which field is required is decided by the backend, never by the client: an account with
     *     a password must send `password`; an SSO-only account must send `old_channel_code`, the
     *     code delivered to the contact being changed.
     *
     *     `password` is **already frontend-hashed**, exactly like every other password field on
     *     this API, and carries the same `min_length=6` (ADR-166). `_require_step_up` feeds it to
     *     `verify_password` against a hash derived from the frontend hash, so a plaintext value
     *     can only ever come back as "wrong password".
     */
    StepUp: {
      /** Password */
      password?: string | null;
      /** Old Channel Code */
      old_channel_code?: string | null;
      /** Id Token */
      id_token?: string | null;
    };
    /**
     * SwitchIdentityRequest
     * @description Body naming the identity to switch to. Must be one the caller already holds.
     */
    SwitchIdentityRequest: {
      /**
       * Role Uuid
       * Format: uuid
       */
      role_uuid: string;
      /** Team Uuid */
      team_uuid?: string | null;
    };
    /**
     * TeamMemberRequest
     * @description Body naming the user to add to a team, with an optional team-kind role.
     */
    TeamMemberRequest: {
      /**
       * User Uuid
       * Format: uuid
       */
      user_uuid: string;
      /** Team Role Name */
      team_role_name?: string | null;
    };
    /**
     * TeamMemberResponse
     * @description Confirms a user's team membership after an add/remove operation.
     */
    TeamMemberResponse: {
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /** Team Uuid */
      team_uuid: string | null;
    };
    /**
     * TeamResponse
     * @description A team's identity and status.
     */
    TeamResponse: {
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /** Name */
      name: string;
      /** Type */
      type: string;
      /** Status */
      status: string;
      /** Tax Id */
      tax_id?: string | null;
    };
    /**
     * TicketYMetric
     * @description What to measure (the Y axis) for a ticket/task chart — see app/services/ticket_analytics.py.
     * @enum {string}
     */
    TicketYMetric:
      | 'total_tickets'
      | 'ongoing_tickets'
      | 'unassigned_tickets'
      | 'completed_tickets'
      | 'canceled_tickets'
      | 'completion_rate'
      | 'age_distribution'
      | 'time_to_completion'
      | 'net_backlog_change'
      | 'task_completion_distribution'
      | 'duplicate_count';
    /**
     * TokenPair
     * @description Access + refresh token pair returned by login/refresh.
     *
     *     `identity` names the identity the access token carries (ADR-205). It is not always the
     *     one the client asked for — `login` with a `scope` naming an identity the user no longer
     *     holds falls back to the platform default and still returns 200 (ADR-069) — and without
     *     this field the only way to notice was to decode the JWT or call `GET /users/me`.
     *
     *     None means the token carries no identity at all: an account holding no grants.
     */
    TokenPair: {
      /** Access Token */
      access_token: string;
      /** Refresh Token */
      refresh_token: string;
      /**
       * Token Type
       * @default bearer
       */
      token_type: string;
      /** Expires In */
      expires_in: number;
      identity?: components['schemas']['IdentityView'] | null;
    };
    /**
     * UnlinkIdentityRequest
     * @description Body for `DELETE /auth/link/{provider}` — carries the step-up proof (ADR-161/218).
     *
     *     Same shape and same reasoning as `DeleteContactRequest`: the proof rides in an optional
     *     body rather than the URL, and the first call is expected to arrive without one.
     */
    UnlinkIdentityRequest: {
      step_up?: components['schemas']['StepUp'] | null;
    };
    /**
     * UnreadCountResponse
     * @description Lightweight unread count response with urgent flag for UI badge and toast.
     */
    UnreadCountResponse: {
      /**
       * Unread Count
       * @description Count of unread active notifications
       */
      unread_count: number;
      /**
       * Has Urgent
       * @description Whether any unread notification has urgent priority
       */
      has_urgent: boolean;
    };
    /**
     * UserPermissionsResponse
     * @description A user's identities with each one's effective permissions, plus their direct grants.
     *
     *     Effective permissions are reported per identity rather than as one merged set, because
     *     after ADR-068 a user only ever exercises one identity at a time — a single merged answer
     *     would describe a state the user is never actually in (ADR-178).
     */
    UserPermissionsResponse: {
      /**
       * User Uuid
       * Format: uuid
       */
      user_uuid: string;
      /** Identities */
      identities: components['schemas']['IdentityPermissions'][];
      /** Direct Grants */
      direct_grants: components['schemas']['DirectGrant'][];
    };
    /**
     * UserResponse
     * @description Full user profile response, including which identity is in effect (ADR-068).
     *
     *     Two different things live here and the names have to keep them apart:
     *     `identities` / `active_identity` are the RBAC identities the user can act as — role plus
     *     optional team (feature 010) — while `login_methods` is how they authenticate, one entry
     *     per password/google/line credential (feature 012, ADR-089). The latter also tells the
     *     frontend whether the account is SSO-only, which decides which step-up it must collect
     *     before replacing a contact.
     */
    UserResponse: {
      /** Name */
      name: string;
      /** Credibility Score */
      credibility_score: number;
      /**
       * Uuid
       * Format: uuid
       */
      uuid: string;
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      /** Identities */
      identities?: components['schemas']['IdentityOption'][];
      active_identity?: components['schemas']['IdentityOption'] | null;
      /** Contacts */
      contacts?: components['schemas']['ContactOut'][];
      /** Login Methods */
      login_methods?: components['schemas']['LoginMethodOut'][];
    };
    /**
     * UserSaltResponse
     * @description Response containing the frontend salt for client-side password hashing.
     */
    UserSaltResponse: {
      /** Salt Frontend */
      salt_frontend: string;
    };
    /**
     * UserUpdate
     * @description Request body for partial user profile updates.
     */
    UserUpdate: {
      /** Name */
      name?: string | null;
    };
    /** ValidationError */
    ValidationError: {
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
      /** Input */
      input?: unknown;
      /** Context */
      ctx?: Record<string, never>;
    };
    /**
     * ValueResponse
     * @description A metric's single ungrouped aggregate — the number a KPI card shows.
     */
    ValueResponse: {
      /**
       * Value
       * @description In the metric's catalog `unit`; completion_rate is 0–100.
       */
      value: number;
    };
    /**
     * VerifyContactRequest
     * @description Body to verify a contact-add with the 6-digit code.
     */
    VerifyContactRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
      /** Code */
      code: string;
    };
    /**
     * VerifyRequest
     * @description Body for unified verification: identifier + 6-digit code.
     */
    VerifyRequest: {
      /**
       * Type
       * @default email
       * @enum {string}
       */
      type: 'email' | 'phone';
      /** Value */
      value: string;
      /** Code */
      code: string;
    };
    /**
     * YMetricSpec
     * @description One y-metric's display glossary plus its valid x-axis values and chart types.
     *
     *     The machine-readable form of app.services.chart_render.resolve()'s rules — build
     *     x/y dropdowns from this instead of hardcoding the catalog client-side.
     */
    YMetricSpec: {
      /**
       * Label
       * @description Display name (zh-TW).
       */
      label: string;
      /**
       * Unit
       * @description Unit suffix for the `/value` number, e.g. '件', '%', '天'.
       */
      unit: string;
      /**
       * Description
       * @description One-line explanation of what the metric measures.
       */
      description: string;
      /**
       * Allowed X
       * @description Valid values for the `x` query param on this y-metric: any of 'date', 'category', 'none' (aggregate/no grouping — omit `x` entirely). An `x` outside this list is silently ignored (falls back to 'none', or to this metric's forced value if 'none' isn't in the list), never rejected with 400.
       */
      allowed_x: string[];
      /**
       * Default Chart Type
       * @description chart_type used when the param is omitted.
       */
      default_chart_type: string;
      /**
       * Allowed Chart Types
       * @description Valid values for `chart_type` on this y-metric — unlike `x`, an unsupported chart_type is rejected with 400.
       */
      allowed_chart_types: string[];
      /**
       * Requires Date Range
       * @description When true, `start_date` and `end_date` are mandatory for this y-metric and omitting either is a 400 — the underlying query is too expensive to run unbounded. Currently only `duplicate_count`.
       */
      requires_date_range: boolean;
      /**
       * Max Range Days
       * @description Widest allowed span between `start_date` and `end_date` for this y-metric, in days; a wider range is a 400. Null means no limit. Clamp the date picker to this instead of waiting for the error.
       */
      max_range_days?: number | null;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  get_user_salt_api_v1_auth_salt__value__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        value: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserSaltResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  register_api_v1_auth_register_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RegisterRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  verify_api_v1_auth_verify_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['VerifyRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenPair'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  resend_verification_api_v1_auth_resend_verification_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ResendVerificationRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  login_api_v1_auth_login_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/x-www-form-urlencoded': components['schemas']['Body_login_api_v1_auth_login_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenPair'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  refresh_api_v1_auth_refresh_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RefreshRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenPair'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  switch_identity_api_v1_auth_switch_identity_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SwitchIdentityRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AccessTokenResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  logout_api_v1_auth_logout_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  logout_all_api_v1_auth_logout_all_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  sso_google_api_v1_auth_sso_google_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['GoogleSsoRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenPair'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  link_google_api_v1_auth_link_google_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LinkGoogleRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  sso_line_api_v1_auth_sso_line_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IdTokenRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenPair'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  link_line_api_v1_auth_link_line_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IdTokenRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  unlink_identity_api_v1_auth_link__provider__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json':
          | components['schemas']['UnlinkIdentityRequest']
          | null;
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  change_password_api_v1_auth_change_password_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ChangePasswordRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  set_password_api_v1_auth_set_password_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetPasswordRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  forgot_password_api_v1_auth_forgot_password_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ForgotPasswordRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  reset_password_api_v1_auth_reset_password_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ResetPasswordRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  add_contact_api_v1_auth_contacts_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AddContactRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  verify_contact_api_v1_auth_contacts_verify_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['VerifyContactRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_contact_api_v1_auth_contacts__type__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        type: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json':
          | components['schemas']['DeleteContactRequest']
          | null;
      };
    };
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  resend_contact_api_v1_auth_contacts_resend_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AddContactRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  read_user_me_api_v1_users_me_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserResponse'];
        };
      };
    };
  };
  update_user_me_api_v1_users_me_patch: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UserUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  list_notifications_api_v1_notifications_get: {
    parameters: {
      query?: {
        /** @description 頁碼 (1-based) */
        page?: number;
        /** @description 每頁筆數 (上限 100) */
        page_size?: number;
        /** @description 僅篩選未讀通知 */
        unread_only?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationListResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_unread_count_api_v1_notifications_unread_count_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UnreadCountResponse'];
        };
      };
    };
  };
  mark_notification_read_api_v1_notifications__uuid__read_patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotificationItem'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  mark_all_notifications_read_api_v1_notifications_read_all_patch: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MarkAllReadResponse'];
        };
      };
    };
  };
  list_users_api_v1_admin_users_get: {
    parameters: {
      query?: {
        skip?: number;
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminUserListItem'][];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_project_settings_api_v1_admin_project_settings_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectSettingsResponse'];
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  update_project_settings_api_v1_admin_project_settings_patch: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectSettingsUpdate'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectSettingsResponse'];
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  assign_role_api_v1_admin_users__user_uuid__role_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        user_uuid: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AssignRoleRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AssignRoleResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  revoke_user_sessions_api_v1_admin_users__user_uuid__revoke_sessions_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        user_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Permission Denied / target is a super_admin */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description User not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Cannot revoke your own sessions */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      /** @description Session store is unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  list_teams_api_v1_admin_teams_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamResponse'][];
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  create_team_api_v1_admin_teams_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTeamRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamResponse'];
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  add_team_member_api_v1_admin_teams__team_uuid__members_post: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        team_uuid: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TeamMemberRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamMemberResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  remove_team_member_api_v1_admin_teams__team_uuid__members__user_uuid__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        team_uuid: string;
        user_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TeamMemberResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_capabilities_api_v1_admin_rbac_capabilities_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CapabilityCatalogResponse'];
        };
      };
    };
  };
  get_matrix_api_v1_admin_rbac_matrix_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MatrixResponse'];
        };
      };
    };
  };
  get_role_api_v1_admin_rbac_roles__role_uuid__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        role_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RoleGrants'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  delete_role_api_v1_admin_rbac_roles__role_uuid__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        role_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  rename_role_api_v1_admin_rbac_roles__role_uuid__patch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        role_uuid: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RenameRoleRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RoleGrants'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_user_permissions_api_v1_admin_users__user_uuid__permissions_get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        user_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserPermissionsResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  set_role_permission_api_v1_admin_rbac_roles__role_uuid__permissions__cap__put: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        role_uuid: string;
        cap: components['schemas']['Perm'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetGrantRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RoleGrants'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  revoke_role_permission_api_v1_admin_rbac_roles__role_uuid__permissions__cap__delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        role_uuid: string;
        cap: components['schemas']['Perm'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  set_user_permission_api_v1_admin_users__user_uuid__permissions__cap__put: {
    parameters: {
      query?: {
        team_uuid?: string | null;
      };
      header?: never;
      path: {
        user_uuid: string;
        cap: components['schemas']['Perm'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetGrantRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserPermissionsResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  revoke_user_permission_api_v1_admin_users__user_uuid__permissions__cap__delete: {
    parameters: {
      query?: {
        team_uuid?: string | null;
      };
      header?: never;
      path: {
        user_uuid: string;
        cap: components['schemas']['Perm'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  create_role_api_v1_admin_rbac_roles_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateRoleRequest'];
      };
    };
    responses: {
      /** @description Successful Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RoleGrants'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  unassign_user_role_api_v1_admin_users__user_uuid__role__role_uuid__delete: {
    parameters: {
      query?: {
        team_uuid?: string | null;
      };
      header?: never;
      path: {
        user_uuid: string;
        role_uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  public_api_api_v1_rbac_test_public_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  map_view_api_api_v1_rbac_test_map_view_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  map_create_api_api_v1_rbac_test_map_create_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  admin_only_api_api_v1_rbac_test_admin_only_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  export_stations_api_v1_bulk_stations_export_get: {
    parameters: {
      query: {
        /** @description 要匯出的站點型別，例如 shelter */
        station_type: string;
        /** @description 檔案格式：csv / xlsx */
        format?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  export_tickets_api_v1_bulk_tickets_export_get: {
    parameters: {
      query: {
        /** @description 要匯出的任務型別，例如 rescue */
        task_type: string;
        /** @description 檔案格式：csv / xlsx */
        format?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  preview_station_import_api_v1_bulk_stations_import_preview_post: {
    parameters: {
      query: {
        /** @description 這份檔案的站點型別 */
        station_type: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_preview_station_import_api_v1_bulk_stations_import_preview_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BulkPreviewResponse'];
        };
      };
      /** @description 檔案無法解析或超過上限 */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  preview_ticket_import_api_v1_bulk_tickets_import_preview_post: {
    parameters: {
      query: {
        /** @description 這份檔案的任務型別 */
        task_type: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_preview_ticket_import_api_v1_bulk_tickets_import_preview_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BulkPreviewResponse'];
        };
      };
      /** @description 檔案無法解析或超過上限 */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  commit_station_import_api_v1_bulk_stations_import_commit_post: {
    parameters: {
      query: {
        /** @description 這份檔案的站點型別 */
        station_type: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_commit_station_import_api_v1_bulk_stations_import_commit_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BulkImportResponse'];
        };
      };
      /** @description 檔案無法解析或超過上限 */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  commit_ticket_import_api_v1_bulk_tickets_import_commit_post: {
    parameters: {
      query: {
        /** @description 這份檔案的任務型別 */
        task_type: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'multipart/form-data': components['schemas']['Body_commit_ticket_import_api_v1_bulk_tickets_import_commit_post'];
      };
    };
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BulkImportResponse'];
        };
      };
      /** @description 檔案無法解析或超過上限 */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Permission Denied */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  ticket_history_api_v1_history_tickets__uuid__get: {
    parameters: {
      query?: {
        limit?: number;
        offset?: number;
      };
      header?: never;
      path: {
        uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HistoryResponse'];
        };
      };
      /** @description Permission Denied（未持有 ticket.view_history，或 own 不符） */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Not Found（不存在，或 zone 不符 — ADR-023） */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  station_history_api_v1_history_stations__uuid__get: {
    parameters: {
      query?: {
        limit?: number;
        offset?: number;
      };
      header?: never;
      path: {
        uuid: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HistoryResponse'];
        };
      };
      /** @description Permission Denied（未持有 station.view_history，或 own 不符） */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Not Found（不存在，或 zone 不符 — ADR-023） */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_tile_api_v1_map_tile__type____source___z___x___y__get: {
    parameters: {
      query?: {
        layer?: string | null;
      };
      header?: never;
      path: {
        type_: string;
        source: string;
        z: number;
        x: number;
        y: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_attribution_info_api_v1_map_attribution__type____source__get: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        type_: string;
        source: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AttributionResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_analytics_catalog_api_v1_analytics_catalog_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogResponse'];
        };
      };
    };
  };
  get_ticket_chart_api_v1_analytics_tickets_chart_get: {
    parameters: {
      query: {
        /** @description What to measure — see GET /analytics/catalog for the full list and which `x` values / chart types each one supports. */
        y: components['schemas']['TicketYMetric'];
        /** @description How to slice `y`: 'date' (day/week trend) or 'category' (breakdown by type). Omit for a single aggregate value. An `x` that doesn't apply to the chosen `y` or `chart_type` is silently ignored rather than rejected — see GET /analytics/catalog. */
        x?: components['schemas']['ChartX'] | null;
        /** @description Bucket size when x=date. Ignored for every other x. */
        x_granularity?: components['schemas']['ChartXGranularity'];
        /** @description Overrides the y-metric's default chart shape. Unlike `x`, an unsupported chart_type for the chosen `y` is rejected with 400 — see GET /analytics/catalog. */
        chart_type?: components['schemas']['ChartType'] | null;
        /** @description Inclusive range start, local to `tz`. */
        start_date?: string | null;
        /** @description Inclusive range end, local to `tz`. */
        end_date?: string | null;
        /** @description IANA timezone name (e.g. 'Asia/Taipei', 'America/New_York'), default UTC. Controls day/week bucket boundaries when x=date and how start_date/end_date are interpreted (local midnight in this timezone, not UTC midnight) — duration-based metrics like age_distribution/time_to_completion ignore it. */
        tz?: string;
        /** @description JSON-encoded ChartStyle: palette, font, legend position, line/pie shape, margin, modebar. Every field is optional; omitted ones take the defaults published as `default_style` on GET /analytics/catalog. Unknown fields are a 400. */
        style?: string | null;
        /** @description Figure width in px, at least 10; omit for Plotly's default. */
        width?: number | null;
        /** @description Figure height in px, at least 10; omit for Plotly's default. */
        height?: number | null;
        /** @description JSON-encoded object merged into the figure's layout after `style` — any key from https://plotly.com/python/reference/layout/, e.g. '{"title": {"text": "Custom title"}}'. */
        layout_overrides?: string | null;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChartResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_ticket_value_api_v1_analytics_tickets_value_get: {
    parameters: {
      query: {
        /** @description Which metric's total to return. Only single-number metrics are accepted (ticket counts, completion_rate, duplicate_count, station_count); a forced-shape or multi-series metric such as age_distribution or net_backlog_change is a 400. The number is in the metric's catalog `unit` — completion_rate is 0–100, not a fraction. */
        y: components['schemas']['TicketYMetric'];
        /** @description Inclusive range start, local to `tz`. */
        start_date?: string | null;
        /** @description Inclusive range end, local to `tz`. */
        end_date?: string | null;
        /** @description IANA timezone name (e.g. 'Asia/Taipei', 'America/New_York'), default UTC. Controls day/week bucket boundaries when x=date and how start_date/end_date are interpreted (local midnight in this timezone, not UTC midnight) — duration-based metrics like age_distribution/time_to_completion ignore it. */
        tz?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValueResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_station_chart_api_v1_analytics_stations_chart_get: {
    parameters: {
      query: {
        /** @description What to measure — see GET /analytics/catalog for the full list and which `x` values / chart types each one supports. */
        y: components['schemas']['StationYMetric'];
        /** @description How to slice `y`: 'date' (day/week trend) or 'category' (breakdown by type). Omit for a single aggregate value. An `x` that doesn't apply to the chosen `y` or `chart_type` is silently ignored rather than rejected — see GET /analytics/catalog. */
        x?: components['schemas']['ChartX'] | null;
        /** @description Bucket size when x=date. Ignored for every other x. */
        x_granularity?: components['schemas']['ChartXGranularity'];
        /** @description Overrides the y-metric's default chart shape. Unlike `x`, an unsupported chart_type for the chosen `y` is rejected with 400 — see GET /analytics/catalog. */
        chart_type?: components['schemas']['ChartType'] | null;
        /** @description Inclusive range start, local to `tz`. */
        start_date?: string | null;
        /** @description Inclusive range end, local to `tz`. */
        end_date?: string | null;
        /** @description IANA timezone name (e.g. 'Asia/Taipei', 'America/New_York'), default UTC. Controls day/week bucket boundaries when x=date and how start_date/end_date are interpreted (local midnight in this timezone, not UTC midnight) — duration-based metrics like age_distribution/time_to_completion ignore it. */
        tz?: string;
        /** @description JSON-encoded ChartStyle: palette, font, legend position, line/pie shape, margin, modebar. Every field is optional; omitted ones take the defaults published as `default_style` on GET /analytics/catalog. Unknown fields are a 400. */
        style?: string | null;
        /** @description Figure width in px, at least 10; omit for Plotly's default. */
        width?: number | null;
        /** @description Figure height in px, at least 10; omit for Plotly's default. */
        height?: number | null;
        /** @description JSON-encoded object merged into the figure's layout after `style` — any key from https://plotly.com/python/reference/layout/, e.g. '{"title": {"text": "Custom title"}}'. */
        layout_overrides?: string | null;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChartResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  get_station_value_api_v1_analytics_stations_value_get: {
    parameters: {
      query: {
        /** @description Which metric's total to return. Only single-number metrics are accepted (ticket counts, completion_rate, duplicate_count, station_count); a forced-shape or multi-series metric such as age_distribution or net_backlog_change is a 400. The number is in the metric's catalog `unit` — completion_rate is 0–100, not a fraction. */
        y: components['schemas']['StationYMetric'];
        /** @description Inclusive range start, local to `tz`. */
        start_date?: string | null;
        /** @description Inclusive range end, local to `tz`. */
        end_date?: string | null;
        /** @description IANA timezone name (e.g. 'Asia/Taipei', 'America/New_York'), default UTC. Controls day/week bucket boundaries when x=date and how start_date/end_date are interpreted (local midnight in this timezone, not UTC midnight) — duration-based metrics like age_distribution/time_to_completion ignore it. */
        tz?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ValueResponse'];
        };
      };
      /** @description Validation Error */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
    };
  };
  handle_http_get_graphql_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The GraphiQL integrated development environment. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
      /** @description Not found if GraphiQL or query via GET are not enabled. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  handle_http_post_graphql_post: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  root__get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  health_check_health_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
  readiness_check_readyz_get: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successful Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': unknown;
        };
      };
    };
  };
}
