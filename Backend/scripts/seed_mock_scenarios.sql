-- =====================================================================
-- Mock data seed v3 — 兩個災害情境,資料符合現在的承接、請求協助、刪除規則
-- =====================================================================
-- Scenario A | 花蓮光復土石流 2024-07-24:站 16、帳號 27(志工 20+NGO 4+官方 3)、單 30+avol01 的 7 張
-- Scenario B | 宜蘭冬山水災   2025-10-03:站 9、帳號 10(志工 4+NGO 5+官方 1)、單 8
-- 聯絡欄位混用電話與 LINE ID。
--
-- 給測試者的帳號(密碼都是 Mock1234!):
--   avol01@mock.test  建單者:我的任務 › 我建立的有 6 張(另有 1 張已刪除,不會出現),可以測刪一筆需求、
--                     刪整張單、再加一件、停止招募;刪掉或改掉的要重跑這支 seed 才回得來
--   avol02@mock.test  志工:我的任務 › 我承接的有 4 筆——開著的、人數已湊滿的(這兩筆可以釋出)、
--                     建單者停止招募的(不能釋出)、單已完成的
--   avol03@mock.test  剛註冊的人:我的任務是空的,可以第一次接、自己送「申請成為後台人員」
--   avol04@mock.test  角色申請審核中(政府單位人員);撤回後要重跑 seed 才回得來
--   avol05@mock.test  角色申請未通過,卡片上有審核回覆(社福團體人員)
--   agov01@mock.test  光復鄉公所的團隊管理員:右上角有「前往後台」
--
-- 規則(第 11 節會檢查,不符就整個回滾):
--   需求只用 pending/fulfilled/canceled(ADR-293)。湊滿的是 fulfilled+completed_at;停止招募的是
--   fulfilled、quantity 改成當下人數、recruiting_stopped_at(ADR-292)。刪除是 soft delete(delete_at):
--   刪掉的需求 canceled、canceled_at=delete_at;刪掉的單 cancelled,需求跟著刪。單的狀態照
--   app/services/ticket_status.py 由需求推導。承接紀錄 status 一律 accepted,人數不超過 quantity(ADR-291)。
--
-- UUID 前綴:users=c…、A 站=a…、B 站=b…、tickets=d…、tasks=e…、assignments=f…、teams=1…、
--   work_zones=2…、team_zone_assign=3…、secondary_locations=4…、photos=5…、role_requests=6…
-- 清除段照前綴刪,也照「建立者/承接者是 mock 帳號」刪:測試者在 staging 用 mock 帳號留下的單、站點、
--   照片、申請會一起清掉,所以可以重跑。
--
-- 登入:全部 37 人,密碼 Mock1234!(salt_frontend=mockdata12345678;
--   前端送出的 password=PBKDF2-HMAC-SHA256('Mock1234!', salt_frontend, 100000)
--   =8c0aefb55114ef12e444543df20424fd9adff2bccfc861a6456386411f6a274c,直接打 API 時用這個值)
-- 先要有 schema 到 alembic head,並跑過 scripts/seed_rbac.py(角色由它建立)。
-- Run (local dev):  psql "host=127.0.0.1 port=5432 user=postgres dbname=postgres" \
--                     -v ON_ERROR_STOP=1 -f scripts/seed_mock_scenarios.sql
-- Run (staging VM): docker compose -f docker-compose.staging.yml exec -T db \
--                     psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/seed_mock_scenarios.sql
--                   (ON_ERROR_STOP=1 is required: without it psql exits 0 on mid-file errors.)
-- =====================================================================

BEGIN;

-- 0. 清除既有 seed,以及測試者用 mock 帳號留下的資料(可重跑)
-- 要刪的帳號、geometry(單、站點、封閉區域)、需求、工作區先各自列出來,下面照外鍵順序刪。
-- geometry 和需求除了看前綴,也看建立者:測試者在 staging 用 mock 帳號建的單、站點、加的需求,
-- UUID 不是前綴開頭,不一起刪的話,刪 mock 帳號時會被外鍵擋住。
CREATE TEMP TABLE mock_users ON COMMIT DROP AS
  SELECT uuid FROM users WHERE uuid::text LIKE 'c0000000-%';
CREATE TEMP TABLE mock_geometries ON COMMIT DROP AS
  SELECT uuid FROM base_geometries
   WHERE uuid::text ~ '^[abd]0000000-' OR created_by IN (SELECT uuid FROM mock_users);
CREATE TEMP TABLE mock_tasks ON COMMIT DROP AS
  SELECT uuid FROM ticket_tasks
   WHERE uuid::text LIKE 'e0000000-%'
      OR ticket_uuid IN (SELECT uuid FROM mock_geometries)
      OR created_by IN (SELECT uuid FROM mock_users);
CREATE TEMP TABLE mock_zones ON COMMIT DROP AS
  SELECT uuid FROM work_zones
   WHERE uuid::text LIKE '20000000-%' OR created_by IN (SELECT uuid FROM mock_users);

DELETE FROM team_zone_assign
 WHERE uuid::text LIKE '30000000-%'
    OR zone_uuid IN (SELECT uuid FROM mock_zones)
    OR team_uuid::text LIKE '10000000-%'
    OR assigned_by IN (SELECT uuid FROM mock_users);
DELETE FROM work_zones WHERE uuid IN (SELECT uuid FROM mock_zones);
DELETE FROM role_requests
 WHERE created_by IN (SELECT uuid FROM mock_users)
    OR reviewed_by IN (SELECT uuid FROM mock_users)
    OR granted_team_uuid::text LIKE '10000000-%';
-- target_uuid 是字串,沒有外鍵。
DELETE FROM station_update_suggestions
 WHERE created_by IN (SELECT uuid FROM mock_users)
    OR reviewed_by IN (SELECT uuid FROM mock_users)
    OR target_uuid IN (SELECT uuid::text FROM mock_geometries);
-- 承接紀錄:mock 的需求上的(含真人接的),以及 mock 帳號接別人的。
DELETE FROM task_assignments
 WHERE uuid::text LIKE 'f0000000-%'
    OR task_uuid IN (SELECT uuid FROM mock_tasks)
    OR actor_uuid IN (SELECT uuid FROM mock_users);
DELETE FROM task_properties WHERE task_uuid IN (SELECT uuid FROM mock_tasks);
DELETE FROM ticket_tasks WHERE uuid IN (SELECT uuid FROM mock_tasks);
DELETE FROM ticket_disaster_details WHERE ticket_uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM tickets WHERE uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM secondary_locations WHERE geometry_uuid IN (SELECT uuid FROM mock_geometries);
-- photos.ref_uuid 沒有外鍵:照它屬於哪張單/哪個站點刪,也照上傳者刪
-- (地址的 pole_photo_uuid 指向照片是 ON DELETE SET NULL,會自己清空)。
DELETE FROM photos
 WHERE ref_uuid IN (SELECT uuid FROM mock_geometries)
    OR created_by IN (SELECT uuid FROM mock_users);
-- 投票可以指向站點的某個分項(item_uuid):要刪的分項上的票,誰投的都一起刪。
DELETE FROM crowd_sourcing
 WHERE station_uuid IN (SELECT uuid FROM mock_geometries)
    OR user_uuid IN (SELECT uuid FROM mock_users)
    OR item_uuid IN (SELECT uuid FROM station_properties
                      WHERE station_uuid IN (SELECT uuid FROM mock_geometries)
                         OR created_by IN (SELECT uuid FROM mock_users));
DELETE FROM station_properties
 WHERE station_uuid IN (SELECT uuid FROM mock_geometries)
    OR created_by IN (SELECT uuid FROM mock_users);
-- 別人的站點留著,只放掉它指向 mock 帳號、mock 站點的欄位。
UPDATE stations SET updated_by = NULL
 WHERE updated_by IN (SELECT uuid FROM mock_users) AND uuid NOT IN (SELECT uuid FROM mock_geometries);
UPDATE stations SET child_station_uuid = NULL
 WHERE child_station_uuid IN (SELECT uuid FROM mock_geometries)
   AND uuid NOT IN (SELECT uuid FROM mock_geometries);
DELETE FROM stations WHERE uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM closure_areas WHERE uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM routes
 WHERE origin_uuid IN (SELECT uuid FROM mock_geometries)
    OR destination_uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM base_geometries WHERE uuid IN (SELECT uuid FROM mock_geometries);
DELETE FROM briefings
 WHERE created_by IN (SELECT uuid FROM mock_users)
    OR template_uuid IN (SELECT uuid FROM briefing_templates
                          WHERE created_by IN (SELECT uuid FROM mock_users));
DELETE FROM briefing_templates WHERE created_by IN (SELECT uuid FROM mock_users);
DELETE FROM announcements WHERE created_by IN (SELECT uuid FROM mock_users);
DELETE FROM user_permission_assign
 WHERE user_uuid IN (SELECT uuid FROM mock_users) OR team_uuid::text LIKE '10000000-%';
DELETE FROM user_role_assign
 WHERE user_uuid IN (SELECT uuid FROM mock_users) OR team_uuid::text LIKE '10000000-%';
DELETE FROM user_identities WHERE user_uuid IN (SELECT uuid FROM mock_users);
DELETE FROM user_contacts WHERE user_uuid IN (SELECT uuid FROM mock_users);
-- notifications 指向 users 是 cascade(收件人)/set null(觸發者),不用另外刪。
DELETE FROM users WHERE uuid IN (SELECT uuid FROM mock_users);
DELETE FROM teams WHERE uuid::text LIKE '10000000-%';

-- 1. USERS — 37 人(A:志工20+NGO4+官方3;B:志工4+NGO5+官方1)
INSERT INTO users (uuid, name, credibility_score, created_at, updated_at) VALUES
 ('c0000000-0000-4000-8000-000000000001', '志工-陳冠宇', 55, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000002', '志工-林雅婷', 38, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000003', '志工-黃建宏', 35, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000004', '志工-張淑芬', 58, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000005', '志工-李俊賢', 43, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000006', '志工-吳佩珊', 42, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000007', '志工-劉家豪', 42, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000008', '志工-蔡欣怡', 39, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000009', '志工-楊宗翰', 58, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000010', '志工-許美玲', 38, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000011', '志工-鄭文傑', 56, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000012', '志工-謝雅雯', 58, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000013', '志工-洪志強', 63, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000014', '志工-郭怡君', 52, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000015', '志工-曾國銘', 37, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000016', '志工-邱詩涵', 53, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000017', '志工-賴建志', 48, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000018', '志工-周淑惠', 36, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000019', '志工-簡嘉文', 35, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000020', '志工-葉芳如', 37, '2024-07-23 08:00+08', '2024-07-23 08:00+08'),
 ('c0000000-0000-4000-8000-000000000021', '慈濟基金會-花蓮聯絡處', 81, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000022', '紅十字會-花蓮支會', 81, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000023', '世界展望會-東區辦事處', 86, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000024', '法鼓山慈善基金會', 87, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000025', '光復鄉公所-災防課', 85, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000026', '花蓮縣消防局-鳳林大隊', 93, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000027', '光復鄉大同村村長', 88, '2024-07-22 08:00+08', '2024-07-22 08:00+08'),
 ('c0000000-0000-4000-8000-000000000028', '志工-江明翰', 57, '2025-10-02 18:00+08', '2025-10-02 18:00+08'),
 ('c0000000-0000-4000-8000-000000000029', '志工-蘇怡靜', 55, '2025-10-02 18:00+08', '2025-10-02 18:00+08'),
 ('c0000000-0000-4000-8000-000000000030', '志工-范植偉', 57, '2025-10-02 18:00+08', '2025-10-02 18:00+08'),
 ('c0000000-0000-4000-8000-000000000031', '志工-彭麗華', 52, '2025-10-02 18:00+08', '2025-10-02 18:00+08'),
 ('c0000000-0000-4000-8000-000000000032', '慈濟基金會-羅東聯絡處', 84, '2025-10-01 09:00+08', '2025-10-01 09:00+08'),
 ('c0000000-0000-4000-8000-000000000033', '紅十字會-宜蘭支會', 81, '2025-10-01 09:00+08', '2025-10-01 09:00+08'),
 ('c0000000-0000-4000-8000-000000000034', '宜蘭縣社福聯盟', 85, '2025-10-01 09:00+08', '2025-10-01 09:00+08'),
 ('c0000000-0000-4000-8000-000000000035', '佛光山蘭陽別院', 87, '2025-10-01 09:00+08', '2025-10-01 09:00+08'),
 ('c0000000-0000-4000-8000-000000000036', '善牧基金會-宜蘭', 82, '2025-10-01 09:00+08', '2025-10-01 09:00+08'),
 ('c0000000-0000-4000-8000-000000000037', '冬山鄉公所-民政課', 85, '2025-10-01 09:00+08', '2025-10-01 09:00+08');

-- 1b. 登入憑證(email+密碼 Mock1234!+user 平台角色)
INSERT INTO user_contacts (uuid, user_uuid, type, value, verified, verified_at, created_at) VALUES
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000001', 'email', 'avol01@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000002', 'email', 'avol02@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000003', 'email', 'avol03@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000004', 'email', 'avol04@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000005', 'email', 'avol05@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000006', 'email', 'avol06@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000007', 'email', 'avol07@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000008', 'email', 'avol08@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000009', 'email', 'avol09@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000010', 'email', 'avol10@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000011', 'email', 'avol11@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000012', 'email', 'avol12@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000013', 'email', 'avol13@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000014', 'email', 'avol14@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000015', 'email', 'avol15@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000016', 'email', 'avol16@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000017', 'email', 'avol17@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000018', 'email', 'avol18@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000019', 'email', 'avol19@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000020', 'email', 'avol20@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000021', 'email', 'ango01@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000022', 'email', 'ango02@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000023', 'email', 'ango03@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000024', 'email', 'ango04@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000025', 'email', 'agov01@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000026', 'email', 'agov02@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000027', 'email', 'agov03@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000028', 'email', 'bvol01@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000029', 'email', 'bvol02@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000030', 'email', 'bvol03@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000031', 'email', 'bvol04@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000032', 'email', 'bngo01@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000033', 'email', 'bngo02@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000034', 'email', 'bngo03@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000035', 'email', 'bngo04@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000036', 'email', 'bngo05@mock.test', true, now(), now()),
 (gen_random_uuid(), 'c0000000-0000-4000-8000-000000000037', 'email', 'bgov01@mock.test', true, now(), now());
INSERT INTO user_identities (uuid, user_uuid, provider, provider_subject, password_hash, created_at)
-- The password is hashed twice. The login form derives
--   pbkdf2_hmac('sha256', 'Mock1234!', salt_frontend, 100000)
-- (Frontend/apps/demo/src/modules/auth/login/credentials.ts) and sends that hex as the password;
-- app/core/security.py:PBKDF2SHA256Handler.verify then runs it through
--   pbkdf2_hmac('sha256', <that hex>, salt_backend, 600000)
-- and compares with the value below.
--
-- This is f28d64e's value. db63a0b swapped it for one built on sha256('Mock1234!' + salt_frontend)
-- instead of the frontend's PBKDF2, which made every mock account impossible to log into from the
-- login page. It went unnoticed because it was checked with curl against /api/v1/auth/login using
-- the sha256 digest as the password — that proves the backend agrees with itself, not that the
-- login page works. Verify a change here by logging in through the browser.
SELECT gen_random_uuid(), u.uuid, 'password', NULL, 'pbkdf2_sha256$600000$mockdata12345678$22c5f18b05a3da2d9b73ce908b1b0209$99a483d62cf51799d5cb4ce03dd460c8b3414b9fd1d12f816d8b35fe724d6479', now()
FROM users u WHERE u.uuid::text LIKE 'c0000000-%';
-- ADR-026 dropped the Group/Policy model: the old 'Login User' group is now the `user` platform
-- role that every registered account gets (see scripts/seed_rbac.py). role_uuid is NOT NULL, so
-- this fails loudly rather than silently if seed_rbac.py has not been run on this database first.
-- role_kind 與 team_uuid 是 ADR-073 之後的必填欄位:平台角色的 kind='platform'、team_uuid 必須為
-- NULL(ck_ura_role_team_kind),而 role_kind 另有複合 FK 指向 roles(uuid, kind),寫錯會被擋下。
INSERT INTO user_role_assign (uuid, user_uuid, role_uuid, role_kind, team_uuid)
SELECT gen_random_uuid(), u.uuid,
       (SELECT uuid FROM roles WHERE name='user' AND kind='platform'), 'platform', NULL
FROM users u WHERE u.uuid::text LIKE 'c0000000-%';

-- 1c. TEAMS — RBAC v1 組織身分(13 個:官方 4 + NGO 9,每個官方/NGO 帳號一個)
INSERT INTO teams (uuid, name, type, tax_id, status) VALUES
 ('10000000-0000-4000-8000-000000000001','慈濟基金會-花蓮聯絡處','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000002','紅十字會-花蓮支會','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000003','世界展望會-東區辦事處','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000004','法鼓山慈善基金會','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000005','光復鄉公所-災防課','gov',NULL,'active'),
 ('10000000-0000-4000-8000-000000000006','花蓮縣消防局-鳳林大隊','gov',NULL,'active'),
 ('10000000-0000-4000-8000-000000000007','光復鄉大同村村長','gov',NULL,'active'),
 ('10000000-0000-4000-8000-000000000008','慈濟基金會-羅東聯絡處','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000009','紅十字會-宜蘭支會','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000010','宜蘭縣社福聯盟','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000011','佛光山蘭陽別院','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000012','善牧基金會-宜蘭','ngo',NULL,'active'),
 ('10000000-0000-4000-8000-000000000013','冬山鄉公所-民政課','gov',NULL,'active');

-- 1d. 13 個官方/NGO 帳號取得所屬 team 的 admin 身分(團隊協調者,帶 zone-scoped 授權)。
-- ADR-068/073:「屬於哪個 team」不再是 users 的欄位(users.team_uuid 已被 90c93167fa66 移除),
-- 而是 user_role_assign 這一列的性質——一筆 team 角色的授予就是一個身分。
-- 24 個志工帳號不拿 team 身分,只有 1b 給的 user 平台角色,才會與官方/NGO 形成對比。
INSERT INTO user_role_assign (uuid, user_uuid, role_uuid, role_kind, team_uuid)
SELECT gen_random_uuid(), m.user_uuid::uuid, r.uuid, 'team', m.team_uuid::uuid
FROM (VALUES
 ('c0000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000002'),
 ('c0000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000003'),
 ('c0000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000004'),
 ('c0000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000005'),
 ('c0000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000006'),
 ('c0000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000007'),
 ('c0000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000008'),
 ('c0000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000009'),
 ('c0000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000010'),
 ('c0000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000011'),
 ('c0000000-0000-4000-8000-000000000036','10000000-0000-4000-8000-000000000012'),
 ('c0000000-0000-4000-8000-000000000037','10000000-0000-4000-8000-000000000013')
) AS m(user_uuid, team_uuid)
CROSS JOIN (SELECT uuid FROM roles WHERE name='admin' AND kind='team') r;

-- 2. STATIONS — base_geometries + stations + EAV + 投票
INSERT INTO base_geometries (uuid, property_name, geometry, created_by, created_at, updated_at) VALUES
 ('a0000000-0000-4000-8000-000000000001','station',ST_SetSRID(ST_MakePoint(121.4219,23.6696),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 07:30+08','2024-07-24 16:00+08'),
 ('a0000000-0000-4000-8000-000000000002','station',ST_SetSRID(ST_MakePoint(121.4232,23.6668),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 07:40+08','2024-07-24 15:30+08'),
 ('a0000000-0000-4000-8000-000000000003','station',ST_SetSRID(ST_MakePoint(121.4152,23.6748),4326),'c0000000-0000-4000-8000-000000000021','2024-07-24 08:10+08','2024-07-24 15:00+08'),
 ('a0000000-0000-4000-8000-000000000004','station',ST_SetSRID(ST_MakePoint(121.4275,23.6585),4326),'c0000000-0000-4000-8000-000000000001','2024-07-24 11:20+08','2024-07-24 11:20+08'),
 ('a0000000-0000-4000-8000-000000000005','station',ST_SetSRID(ST_MakePoint(121.4206,23.6686),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 07:35+08','2024-07-24 14:00+08'),
 ('a0000000-0000-4000-8000-000000000006','station',ST_SetSRID(ST_MakePoint(121.4052,23.5902),4326),'c0000000-0000-4000-8000-000000000022','2024-07-24 09:00+08','2024-07-24 14:30+08'),
 ('a0000000-0000-4000-8000-000000000007','station',ST_SetSRID(ST_MakePoint(121.4382,23.6608),4326),'c0000000-0000-4000-8000-000000000021','2024-07-24 09:20+08','2024-07-24 13:40+08'),
 ('a0000000-0000-4000-8000-000000000008','station',ST_SetSRID(ST_MakePoint(121.4222,23.6712),4326),'c0000000-0000-4000-8000-000000000026','2024-07-24 07:50+08','2024-07-24 16:10+08'),
 ('a0000000-0000-4000-8000-000000000009','station',ST_SetSRID(ST_MakePoint(121.3772,23.4978),4326),'c0000000-0000-4000-8000-000000000026','2024-07-24 08:30+08','2024-07-24 14:50+08'),
 ('a0000000-0000-4000-8000-000000000010','station',ST_SetSRID(ST_MakePoint(121.4248,23.6652),4326),'c0000000-0000-4000-8000-000000000023','2024-07-24 10:00+08','2024-07-24 17:00+08'),
 ('a0000000-0000-4000-8000-000000000011','station',ST_SetSRID(ST_MakePoint(121.4522,23.7452),4326),'c0000000-0000-4000-8000-000000000023','2024-07-24 10:30+08','2024-07-24 16:40+08'),
 ('a0000000-0000-4000-8000-000000000012','station',ST_SetSRID(ST_MakePoint(121.4212,23.6702),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 ('a0000000-0000-4000-8000-000000000013','station',ST_SetSRID(ST_MakePoint(121.4228,23.6678),4326),'c0000000-0000-4000-8000-000000000021','2024-07-24 07:10+08','2024-07-24 17:10+08'),
 ('a0000000-0000-4000-8000-000000000014','station',ST_SetSRID(ST_MakePoint(121.4262,23.6662),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 06:40+08','2024-07-24 18:00+08'),
 ('a0000000-0000-4000-8000-000000000015','station',ST_SetSRID(ST_MakePoint(121.4532,23.7442),4326),'c0000000-0000-4000-8000-000000000022','2024-07-24 09:50+08','2024-07-24 16:20+08'),
 ('a0000000-0000-4000-8000-000000000016','station',ST_SetSRID(ST_MakePoint(121.4188,23.6722),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 08:00+08','2024-07-24 15:40+08'),
 ('b0000000-0000-4000-8000-000000000001','station',ST_SetSRID(ST_MakePoint(121.7922,24.6372),4326),'c0000000-0000-4000-8000-000000000037','2025-10-03 08:00+08','2025-10-03 09:00+08'),
 ('b0000000-0000-4000-8000-000000000002','station',ST_SetSRID(ST_MakePoint(121.7906,24.6346),4326),'c0000000-0000-4000-8000-000000000028','2025-10-03 07:00+08','2025-10-03 07:30+08'),
 ('b0000000-0000-4000-8000-000000000003','station',ST_SetSRID(ST_MakePoint(121.7788,24.6228),4326),'c0000000-0000-4000-8000-000000000029','2025-10-03 06:30+08','2025-10-03 06:30+08'),
 ('b0000000-0000-4000-8000-000000000004','station',ST_SetSRID(ST_MakePoint(121.7668,24.677),4326),'c0000000-0000-4000-8000-000000000032','2025-10-03 07:00+08','2025-10-03 12:00+08'),
 ('b0000000-0000-4000-8000-000000000005','station',ST_SetSRID(ST_MakePoint(121.792,24.634),4326),'c0000000-0000-4000-8000-000000000030','2025-10-03 08:00+08','2025-10-03 08:30+08'),
 ('b0000000-0000-4000-8000-000000000006','station',ST_SetSRID(ST_MakePoint(121.7968,24.642),4326),'c0000000-0000-4000-8000-000000000030','2025-10-03 06:00+08','2025-10-03 06:00+08'),
 ('b0000000-0000-4000-8000-000000000007','station',ST_SetSRID(ST_MakePoint(121.8016,24.6606),4326),'c0000000-0000-4000-8000-000000000031','2025-10-02 18:00+08','2025-10-02 19:00+08'),
 ('b0000000-0000-4000-8000-000000000008','station',ST_SetSRID(ST_MakePoint(121.8017,24.6607),4326),'c0000000-0000-4000-8000-000000000030','2025-10-03 09:00+08','2025-10-03 09:00+08'),
 ('b0000000-0000-4000-8000-000000000009','station',ST_SetSRID(ST_MakePoint(121.7222,24.7448),4326),'c0000000-0000-4000-8000-000000000029','2025-10-03 08:00+08','2025-10-03 08:00+08');

INSERT INTO stations (uuid, type, name, description, op_hour, level, comment, source, visibility, verification_status, is_duplicate, dedup_group_id, is_temporary, expires_at, is_official, updated_by) VALUES
 ('a0000000-0000-4000-8000-000000000001','supply','光復鄉公所前進物資集散站','凱米颱風後設立之主要物資集散點,供應台九線中斷區受困聚落','24h',2,'官方主站,物資充足','gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('a0000000-0000-4000-8000-000000000002','supply','光復國小物資發放站','設於光復國小操場,集中發放食物與民生物資','24h',1,NULL,'gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('a0000000-0000-4000-8000-000000000003','supply','馬太鞍部落物資站','馬太鞍部落自救會與公所合作設立','06:00-22:00',1,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000021'),
 ('a0000000-0000-4000-8000-000000000004','supply','大農社區自發物資點',NULL,'unknown',0,'居民自發回報,資料不完整,現場已滿載','user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000005','toilet','光復車站流動廁所區','車站旁臨時流動廁所,土石中斷期間無自來水','24h',0,NULL,'gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('a0000000-0000-4000-8000-000000000006','toilet','大富火車站公廁','大富車站旁公廁,供南段受困居民使用','24h',0,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000022'),
 ('a0000000-0000-4000-8000-000000000007','toilet','太巴塱活動中心廁所','太巴塱部落活動中心,可沖水','06:00-22:00',0,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000021'),
 ('a0000000-0000-4000-8000-000000000008','water','光復淨水加水點','軍方水車駐點供應飲用水','24h',1,NULL,'gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000026'),
 ('a0000000-0000-4000-8000-000000000009','water','瑞穗鄉公所加水站','瑞穗端加水點,供南段聚落','08:00-20:00',0,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000026'),
 ('a0000000-0000-4000-8000-000000000010','shower','光復國中洗澡點','設置簡易淋浴間,提供熱水','16:00-22:00',0,NULL,'gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000023'),
 ('a0000000-0000-4000-8000-000000000011','shower','鳳林鎮立體育館洗澡點','鳳林端淋浴設施','17:00-21:00',0,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000023'),
 ('a0000000-0000-4000-8000-000000000012','medical','光復鄉衛生所醫療站','24 小時醫療站,具門診與藥局','24h',2,'官方主醫療站','gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('a0000000-0000-4000-8000-000000000013','medical','慈濟人醫會醫療站','慈濟人醫會行動醫療,提供急救與義診','24h',2,NULL,'gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000021'),
 ('a0000000-0000-4000-8000-000000000014','shelter','光復商工避難收容所','主要收容中心,孤立人口大量湧入,目前已滿載','24h',2,'已滿載,床位為 0,群眾回報擁擠','gov','public','human_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('a0000000-0000-4000-8000-000000000015','shelter','鳳林國小避難所','鳳林端收容點,尚有空床','24h',1,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000022'),
 ('a0000000-0000-4000-8000-000000000016','gas_station','光復中油加油站','維持供油,救災車輛優先','06:00-20:00',0,NULL,'gov','public','ai_verified',false,NULL,true,'2024-08-31 23:59+08',true,'c0000000-0000-4000-8000-000000000025'),
 ('b0000000-0000-4000-8000-000000000001','transport','冬山鄉公所防災接駁站','鄉公所安排接駁車往返羅東轉運站','07:00-19:00',1,NULL,'gov','public','ai_verified',false,NULL,true,NULL,true,'c0000000-0000-4000-8000-000000000037'),
 ('b0000000-0000-4000-8000-000000000002','shelter','冬山國小避難收容所','里民自發協助開設,資訊未必即時','24h',1,'里民回報,更新較慢','user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000028'),
 ('b0000000-0000-4000-8000-000000000003','shelter','廣興社區活動中心避難點','廣興里自發收容點','24h',0,NULL,'user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000029'),
 ('b0000000-0000-4000-8000-000000000004','medical','羅東臨時醫療站','羅東端臨時醫療支援','24h',1,NULL,'gov','public','ai_verified',false,NULL,true,NULL,true,'c0000000-0000-4000-8000-000000000032'),
 ('b0000000-0000-4000-8000-000000000005','charge','冬山車站充電服務站','提供手機充電','08:00-20:00',0,NULL,'user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000030'),
 ('b0000000-0000-4000-8000-000000000006','toilet','親水公園流動廁所','退水後已撤站,但回報未更新','—',0,'水退後已撤站,記錄未更新 (stale)','user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000030'),
 ('b0000000-0000-4000-8000-000000000007','supply','三奇里物資集散點','三奇里長協助設立','08:00-20:00',0,NULL,'user','public','unverified',false,'dup-sanqi-supply',true,NULL,false,'c0000000-0000-4000-8000-000000000031'),
 ('b0000000-0000-4000-8000-000000000008','supply','三奇里物資站 (重複回報)','疑似與三奇里物資集散點為同一站,重複回報','08:00-20:00',0,'與 b…07 疑似重複','user','public','unverified',true,'dup-sanqi-supply',true,NULL,false,'c0000000-0000-4000-8000-000000000030'),
 ('b0000000-0000-4000-8000-000000000009','water','員山鄉加水站','員山端加水點','24h',0,NULL,'user','public','unverified',false,NULL,true,NULL,false,'c0000000-0000-4000-8000-000000000029');

-- 2a. 站點指派(ADR-285):比照「以 team 身分建立就指派給那個 team」,依建立者的 team 身分回填
-- (1d 每個官方/NGO 帳號恰好一個)。志工只有平台身分,他們建的站維持未指派,
-- demo 上 gov 的待指派清單才有東西可看。
UPDATE stations s
SET team_uuid = ura.team_uuid
FROM base_geometries bg
JOIN user_role_assign ura ON ura.user_uuid = bg.created_by AND ura.role_kind = 'team'
WHERE bg.uuid = s.uuid
  AND (s.uuid::text LIKE 'a0000000-%' OR s.uuid::text LIKE 'b0000000-%');

INSERT INTO station_properties (uuid, station_uuid, property_type, property_name, quantity, comment, status, weightings, created_by, created_at, updated_at) VALUES
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001','supply','supply_types',NULL,'food,water,daily_items,repair_tool','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 07:30+08','2024-07-24 16:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001','supply','supply_rationed',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 07:30+08','2024-07-24 16:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002','supply','supply_types',NULL,'food,water,medicine,daily_items','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 07:40+08','2024-07-24 15:30+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000003','supply','supply_types',NULL,'food,water,daily_items','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 08:10+08','2024-07-24 15:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000003','supply','supply_rationed',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 08:10+08','2024-07-24 15:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000003','supply','supply_condition',NULL,'每戶限領一份','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 08:10+08','2024-07-24 15:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000004','supply','supply_types',NULL,'food,water','pending',1.0,'c0000000-0000-4000-8000-000000000001','2024-07-24 11:20+08','2024-07-24 11:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000005','facility','has_flush',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 07:35+08','2024-07-24 14:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000006','facility','has_flush',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000022','2024-07-24 09:00+08','2024-07-24 14:30+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000007','facility','has_flush',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 09:20+08','2024-07-24 13:40+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000008','supply','is_potable',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000026','2024-07-24 07:50+08','2024-07-24 16:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000008','facility','water_level',NULL,'full','verified',1.5,'c0000000-0000-4000-8000-000000000026','2024-07-24 07:50+08','2024-07-24 16:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000009','supply','is_potable',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000026','2024-07-24 08:30+08','2024-07-24 14:50+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000009','facility','water_level',NULL,'partial','verified',1.5,'c0000000-0000-4000-8000-000000000026','2024-07-24 08:30+08','2024-07-24 14:50+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000010','facility','gender_limit',NULL,'mixed','verified',1.5,'c0000000-0000-4000-8000-000000000023','2024-07-24 10:00+08','2024-07-24 17:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000010','facility','has_hot_water',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000023','2024-07-24 10:00+08','2024-07-24 17:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000011','facility','gender_limit',NULL,'female_only','verified',1.5,'c0000000-0000-4000-8000-000000000023','2024-07-24 10:30+08','2024-07-24 16:40+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000011','facility','has_hot_water',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000023','2024-07-24 10:30+08','2024-07-24 16:40+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012','service','medical_level',NULL,'clinic','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012','service','has_staff',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012','service','vet_available',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012','service','specialties',NULL,'trauma,pharmacy','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012','service','capacity_available',30,NULL,'verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:50+08','2024-07-24 17:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000013','service','medical_level',NULL,'first_aid','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 07:10+08','2024-07-24 17:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000013','service','has_staff',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 07:10+08','2024-07-24 17:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000013','service','vet_available',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 07:10+08','2024-07-24 17:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000013','service','specialties',NULL,'trauma,pediatric','verified',1.5,'c0000000-0000-4000-8000-000000000021','2024-07-24 07:10+08','2024-07-24 17:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014','facility','beds_available',0,NULL,'verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:40+08','2024-07-24 18:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014','facility','capacity_total',200,NULL,'verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:40+08','2024-07-24 18:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014','service','has_medical_support',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 06:40+08','2024-07-24 18:00+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000015','facility','beds_available',45,NULL,'verified',1.5,'c0000000-0000-4000-8000-000000000022','2024-07-24 09:50+08','2024-07-24 16:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000015','facility','capacity_total',150,NULL,'verified',1.5,'c0000000-0000-4000-8000-000000000022','2024-07-24 09:50+08','2024-07-24 16:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000015','service','has_medical_support',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000022','2024-07-24 09:50+08','2024-07-24 16:20+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000016','service','is_open',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 08:00+08','2024-07-24 15:40+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000016','service','is_onsale',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 08:00+08','2024-07-24 15:40+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000016','supply','fuel_types',NULL,'92,95,diesel','verified',1.5,'c0000000-0000-4000-8000-000000000025','2024-07-24 08:00+08','2024-07-24 15:40+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000001','service','is_operational',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000037','2025-10-03 08:00+08','2025-10-03 09:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000001','service','destination',NULL,'羅東轉運站','verified',1.5,'c0000000-0000-4000-8000-000000000037','2025-10-03 08:00+08','2025-10-03 09:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000001','service','frequency',NULL,'每30分鐘一班','verified',1.5,'c0000000-0000-4000-8000-000000000037','2025-10-03 08:00+08','2025-10-03 09:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000002','facility','beds_available',20,NULL,'pending',1.0,'c0000000-0000-4000-8000-000000000028','2025-10-03 07:00+08','2025-10-03 07:30+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000002','facility','capacity_total',80,NULL,'pending',1.0,'c0000000-0000-4000-8000-000000000028','2025-10-03 07:00+08','2025-10-03 07:30+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000003','facility','beds_available',15,NULL,'pending',1.0,'c0000000-0000-4000-8000-000000000029','2025-10-03 06:30+08','2025-10-03 06:30+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000004','service','medical_level',NULL,'clinic','verified',1.5,'c0000000-0000-4000-8000-000000000032','2025-10-03 07:00+08','2025-10-03 12:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000004','service','has_staff',NULL,'true','verified',1.5,'c0000000-0000-4000-8000-000000000032','2025-10-03 07:00+08','2025-10-03 12:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000004','service','vet_available',NULL,'false','verified',1.5,'c0000000-0000-4000-8000-000000000032','2025-10-03 07:00+08','2025-10-03 12:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000005','facility','connector_types',NULL,'usb_c,lightning,ac_110v','pending',1.0,'c0000000-0000-4000-8000-000000000030','2025-10-03 08:00+08','2025-10-03 08:30+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000005','facility','available_ports',8,NULL,'pending',1.0,'c0000000-0000-4000-8000-000000000030','2025-10-03 08:00+08','2025-10-03 08:30+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000006','facility','has_flush',NULL,'false','pending',1.0,'c0000000-0000-4000-8000-000000000030','2025-10-03 06:00+08','2025-10-03 06:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000007','supply','supply_types',NULL,'food,water,daily_items','pending',1.0,'c0000000-0000-4000-8000-000000000031','2025-10-02 18:00+08','2025-10-02 19:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000008','supply','supply_types',NULL,'food,water','pending',1.0,'c0000000-0000-4000-8000-000000000030','2025-10-03 09:00+08','2025-10-03 09:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000009','supply','is_potable',NULL,'true','pending',1.0,'c0000000-0000-4000-8000-000000000029','2025-10-03 08:00+08','2025-10-03 08:00+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000009','facility','water_level',NULL,'partial','pending',1.0,'c0000000-0000-4000-8000-000000000029','2025-10-03 08:00+08','2025-10-03 08:00+08');

-- 投票 (crowd_sourcing) — 無自評、credibility 與 user 一致
INSERT INTO crowd_sourcing (uuid, station_uuid, item_uuid, user_uuid, user_credibility_score, rating, n_updates, distance_from_geometry, created_at, updated_at) VALUES
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',NULL,'c0000000-0000-4000-8000-000000000006',42,'up',0,214,'2024-07-24 11:17+08','2024-07-24 11:17+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',NULL,'c0000000-0000-4000-8000-000000000023',86,'up',0,119,'2024-07-24 12:13+08','2024-07-24 12:13+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',NULL,'c0000000-0000-4000-8000-000000000014',52,'up',0,212,'2024-07-24 13:06+08','2024-07-24 13:06+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',NULL,'c0000000-0000-4000-8000-000000000003',35,'up',0,89,'2024-07-24 11:22+08','2024-07-24 11:22+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',NULL,'c0000000-0000-4000-8000-000000000013',63,'up',0,216,'2024-07-24 12:38+08','2024-07-24 12:38+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000003',NULL,'c0000000-0000-4000-8000-000000000009',58,'up',0,62,'2024-07-24 11:46+08','2024-07-24 11:46+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000004',NULL,'c0000000-0000-4000-8000-000000000016',53,'down',0,233,'2024-07-24 11:05+08','2024-07-24 11:05+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000004',NULL,'c0000000-0000-4000-8000-000000000019',35,'down',0,322,'2024-07-24 12:18+08','2024-07-24 12:18+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000004',NULL,'c0000000-0000-4000-8000-000000000005',43,'down',0,361,'2024-07-24 13:39+08','2024-07-24 13:39+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000005',NULL,'c0000000-0000-4000-8000-000000000012',58,'up',0,335,'2024-07-24 11:12+08','2024-07-24 11:12+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000008',NULL,'c0000000-0000-4000-8000-000000000023',86,'up',0,63,'2024-07-24 11:42+08','2024-07-24 11:42+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000008',NULL,'c0000000-0000-4000-8000-000000000003',35,'up',0,156,'2024-07-24 12:49+08','2024-07-24 12:49+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012',NULL,'c0000000-0000-4000-8000-000000000010',38,'up',0,91,'2024-07-24 11:24+08','2024-07-24 11:24+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012',NULL,'c0000000-0000-4000-8000-000000000003',35,'up',0,182,'2024-07-24 12:29+08','2024-07-24 12:29+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000012',NULL,'c0000000-0000-4000-8000-000000000008',39,'neutral',0,365,'2024-07-24 13:53+08','2024-07-24 13:53+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000013',NULL,'c0000000-0000-4000-8000-000000000012',58,'up',0,123,'2024-07-24 11:23+08','2024-07-24 11:23+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014',NULL,'c0000000-0000-4000-8000-000000000012',58,'down',0,399,'2024-07-24 11:59+08','2024-07-24 11:59+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014',NULL,'c0000000-0000-4000-8000-000000000007',42,'down',0,389,'2024-07-24 12:41+08','2024-07-24 12:41+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014',NULL,'c0000000-0000-4000-8000-000000000022',81,'down',0,76,'2024-07-24 13:38+08','2024-07-24 13:38+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000014',NULL,'c0000000-0000-4000-8000-000000000009',58,'neutral',0,365,'2024-07-24 14:10+08','2024-07-24 14:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000015',NULL,'c0000000-0000-4000-8000-000000000018',36,'up',0,165,'2024-07-24 11:10+08','2024-07-24 11:10+08'),
 (gen_random_uuid(),'a0000000-0000-4000-8000-000000000016',NULL,'c0000000-0000-4000-8000-000000000015',37,'up',0,234,'2024-07-24 11:17+08','2024-07-24 11:17+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000001',NULL,'c0000000-0000-4000-8000-000000000036',82,'up',0,400,'2025-10-03 9:20+08','2025-10-03 9:20+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000001',NULL,'c0000000-0000-4000-8000-000000000031',52,'neutral',0,443,'2025-10-03 10:49+08','2025-10-03 10:49+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000002',NULL,'c0000000-0000-4000-8000-000000000029',55,'down',0,66,'2025-10-03 9:51+08','2025-10-03 9:51+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000002',NULL,'c0000000-0000-4000-8000-000000000030',57,'neutral',0,211,'2025-10-03 10:25+08','2025-10-03 10:25+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000003',NULL,'c0000000-0000-4000-8000-000000000033',81,'down',0,83,'2025-10-03 9:13+08','2025-10-03 9:13+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000004',NULL,'c0000000-0000-4000-8000-000000000034',85,'up',0,158,'2025-10-03 9:41+08','2025-10-03 9:41+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000005',NULL,'c0000000-0000-4000-8000-000000000036',82,'up',0,252,'2025-10-03 9:56+08','2025-10-03 9:56+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000006',NULL,'c0000000-0000-4000-8000-000000000036',82,'down',0,185,'2025-10-03 9:08+08','2025-10-03 9:08+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000006',NULL,'c0000000-0000-4000-8000-000000000029',55,'down',0,176,'2025-10-03 10:47+08','2025-10-03 10:47+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000007',NULL,'c0000000-0000-4000-8000-000000000033',81,'up',0,432,'2025-10-03 9:37+08','2025-10-03 9:37+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000008',NULL,'c0000000-0000-4000-8000-000000000035',87,'down',0,254,'2025-10-03 9:23+08','2025-10-03 9:23+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000008',NULL,'c0000000-0000-4000-8000-000000000033',81,'neutral',0,162,'2025-10-03 10:08+08','2025-10-03 10:08+08'),
 (gen_random_uuid(),'b0000000-0000-4000-8000-000000000009',NULL,'c0000000-0000-4000-8000-000000000036',82,'neutral',0,96,'2025-10-03 9:48+08','2025-10-03 9:48+08');

-- 3. TICKETS — A:30+avol01 的 7 張 / B:8(聯絡欄位混用電話與 LINE ID;無類型 ticket 的 task_type 為 NULL)
--    建單者在 base_geometries.created_by。status 先一律寫 pending,第 10 節照需求推導。
INSERT INTO base_geometries (uuid, property_name, geometry, created_by, created_at, updated_at) VALUES
 ('d0000000-0000-4000-8000-000000000001','request',ST_SetSRID(ST_MakePoint(121.4364,23.6817),4326),'c0000000-0000-4000-8000-000000000014','2024-07-24 14:55+08','2024-07-24 14:55+08'),
 ('d0000000-0000-4000-8000-000000000002','request',ST_SetSRID(ST_MakePoint(121.4107,23.6854),4326),'c0000000-0000-4000-8000-000000000022','2024-07-24 13:46+08','2024-07-24 13:46+08'),
 ('d0000000-0000-4000-8000-000000000003','request',ST_SetSRID(ST_MakePoint(121.4304,23.6543),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 9:48+08','2024-07-24 9:48+08'),
 ('d0000000-0000-4000-8000-000000000004','request',ST_SetSRID(ST_MakePoint(121.4509,23.674),4326),'c0000000-0000-4000-8000-000000000016','2024-07-24 11:56+08','2024-07-24 11:56+08'),
 ('d0000000-0000-4000-8000-000000000005','request',ST_SetSRID(ST_MakePoint(121.4416,23.6826),4326),'c0000000-0000-4000-8000-000000000022','2024-07-24 15:55+08','2024-07-24 15:55+08'),
 ('d0000000-0000-4000-8000-000000000006','request',ST_SetSRID(ST_MakePoint(121.4514,23.6802),4326),'c0000000-0000-4000-8000-000000000027','2024-07-24 17:28+08','2024-07-24 17:28+08'),
 ('d0000000-0000-4000-8000-000000000007','request',ST_SetSRID(ST_MakePoint(121.4174,23.6526),4326),'c0000000-0000-4000-8000-000000000007','2024-07-24 8:57+08','2024-07-24 8:57+08'),
 ('d0000000-0000-4000-8000-000000000008','request',ST_SetSRID(ST_MakePoint(121.4307,23.6611),4326),'c0000000-0000-4000-8000-000000000016','2024-07-24 16:50+08','2024-07-24 16:50+08'),
 ('d0000000-0000-4000-8000-000000000009','request',ST_SetSRID(ST_MakePoint(121.4097,23.6764),4326),'c0000000-0000-4000-8000-000000000012','2024-07-24 17:03+08','2024-07-24 17:03+08'),
 ('d0000000-0000-4000-8000-000000000010','request',ST_SetSRID(ST_MakePoint(121.4174,23.6576),4326),'c0000000-0000-4000-8000-000000000015','2024-07-24 8:54+08','2024-07-24 8:54+08'),
 ('d0000000-0000-4000-8000-000000000011','request',ST_SetSRID(ST_MakePoint(121.4376,23.6716),4326),'c0000000-0000-4000-8000-000000000007','2024-07-24 9:13+08','2024-07-24 9:13+08'),
 ('d0000000-0000-4000-8000-000000000012','request',ST_SetSRID(ST_MakePoint(121.4239,23.6894),4326),'c0000000-0000-4000-8000-000000000009','2024-07-24 18:42+08','2024-07-24 18:42+08'),
 ('d0000000-0000-4000-8000-000000000013','request',ST_SetSRID(ST_MakePoint(121.4198,23.6887),4326),'c0000000-0000-4000-8000-000000000019','2024-07-24 7:58+08','2024-07-24 7:58+08'),
 ('d0000000-0000-4000-8000-000000000014','request',ST_SetSRID(ST_MakePoint(121.453,23.6532),4326),'c0000000-0000-4000-8000-000000000006','2024-07-24 13:37+08','2024-07-24 13:37+08'),
 ('d0000000-0000-4000-8000-000000000015','request',ST_SetSRID(ST_MakePoint(121.4091,23.6763),4326),'c0000000-0000-4000-8000-000000000019','2024-07-24 18:15+08','2024-07-24 18:15+08'),
 ('d0000000-0000-4000-8000-000000000016','request',ST_SetSRID(ST_MakePoint(121.4386,23.662),4326),'c0000000-0000-4000-8000-000000000011','2024-07-24 16:34+08','2024-07-24 16:34+08'),
 ('d0000000-0000-4000-8000-000000000017','request',ST_SetSRID(ST_MakePoint(121.4116,23.664),4326),'c0000000-0000-4000-8000-000000000010','2024-07-24 15:41+08','2024-07-24 15:41+08'),
 ('d0000000-0000-4000-8000-000000000018','request',ST_SetSRID(ST_MakePoint(121.4459,23.662),4326),'c0000000-0000-4000-8000-000000000026','2024-07-24 8:09+08','2024-07-24 8:09+08'),
 ('d0000000-0000-4000-8000-000000000019','request',ST_SetSRID(ST_MakePoint(121.4155,23.6637),4326),'c0000000-0000-4000-8000-000000000026','2024-07-24 7:53+08','2024-07-24 7:53+08'),
 ('d0000000-0000-4000-8000-000000000020','request',ST_SetSRID(ST_MakePoint(121.4217,23.6552),4326),'c0000000-0000-4000-8000-000000000009','2024-07-24 15:56+08','2024-07-24 15:56+08'),
 ('d0000000-0000-4000-8000-000000000021','request',ST_SetSRID(ST_MakePoint(121.4467,23.6733),4326),'c0000000-0000-4000-8000-000000000005','2024-07-24 7:13+08','2024-07-24 7:13+08'),
 ('d0000000-0000-4000-8000-000000000022','request',ST_SetSRID(ST_MakePoint(121.4227,23.6724),4326),'c0000000-0000-4000-8000-000000000014','2024-07-24 10:11+08','2024-07-24 10:11+08'),
 ('d0000000-0000-4000-8000-000000000023','request',ST_SetSRID(ST_MakePoint(121.4418,23.6633),4326),'c0000000-0000-4000-8000-000000000014','2024-07-24 11:06+08','2024-07-24 11:06+08'),
 ('d0000000-0000-4000-8000-000000000024','request',ST_SetSRID(ST_MakePoint(121.4161,23.6827),4326),'c0000000-0000-4000-8000-000000000015','2024-07-24 10:42+08','2024-07-24 10:42+08'),
 ('d0000000-0000-4000-8000-000000000025','request',ST_SetSRID(ST_MakePoint(121.4189,23.6528),4326),'c0000000-0000-4000-8000-000000000022','2024-07-24 15:56+08','2024-07-24 15:56+08'),
 ('d0000000-0000-4000-8000-000000000026','request',ST_SetSRID(ST_MakePoint(121.4531,23.6606),4326),'c0000000-0000-4000-8000-000000000004','2024-07-24 13:24+08','2024-07-24 13:24+08'),
 ('d0000000-0000-4000-8000-000000000027','request',ST_SetSRID(ST_MakePoint(121.4072,23.6674),4326),'c0000000-0000-4000-8000-000000000017','2024-07-24 18:23+08','2024-07-24 18:23+08'),
 ('d0000000-0000-4000-8000-000000000028','request',ST_SetSRID(ST_MakePoint(121.451,23.6749),4326),'c0000000-0000-4000-8000-000000000026','2024-07-24 11:44+08','2024-07-24 11:44+08'),
 ('d0000000-0000-4000-8000-000000000029','request',ST_SetSRID(ST_MakePoint(121.4146,23.6766),4326),'c0000000-0000-4000-8000-000000000013','2024-07-24 11:00+08','2024-07-24 11:00+08'),
 ('d0000000-0000-4000-8000-000000000030','request',ST_SetSRID(ST_MakePoint(121.4265,23.6732),4326),'c0000000-0000-4000-8000-000000000025','2024-07-24 15:50+08','2024-07-24 15:50+08'),
 ('d0000000-0000-4000-8000-000000000031','request',ST_SetSRID(ST_MakePoint(121.7492,24.6406),4326),'c0000000-0000-4000-8000-000000000037','2025-10-03 17:12+08','2025-10-03 17:12+08'),
 ('d0000000-0000-4000-8000-000000000032','request',ST_SetSRID(ST_MakePoint(121.7572,24.639),4326),'c0000000-0000-4000-8000-000000000029','2025-10-03 18:15+08','2025-10-03 18:15+08'),
 ('d0000000-0000-4000-8000-000000000033','request',ST_SetSRID(ST_MakePoint(121.7453,24.65),4326),'c0000000-0000-4000-8000-000000000029','2025-10-03 18:29+08','2025-10-03 18:29+08'),
 ('d0000000-0000-4000-8000-000000000034','request',ST_SetSRID(ST_MakePoint(121.7909,24.6249),4326),'c0000000-0000-4000-8000-000000000030','2025-10-03 16:39+08','2025-10-03 16:39+08'),
 ('d0000000-0000-4000-8000-000000000035','request',ST_SetSRID(ST_MakePoint(121.7865,24.6419),4326),'c0000000-0000-4000-8000-000000000030','2025-10-03 10:33+08','2025-10-03 10:33+08'),
 ('d0000000-0000-4000-8000-000000000036','request',ST_SetSRID(ST_MakePoint(121.7587,24.6231),4326),'c0000000-0000-4000-8000-000000000032','2025-10-03 8:09+08','2025-10-03 8:09+08'),
 ('d0000000-0000-4000-8000-000000000037','request',ST_SetSRID(ST_MakePoint(121.7526,24.6286),4326),'c0000000-0000-4000-8000-000000000034','2025-10-03 10:37+08','2025-10-03 10:37+08'),
 ('d0000000-0000-4000-8000-000000000038','request',ST_SetSRID(ST_MakePoint(121.764,24.6202),4326),'c0000000-0000-4000-8000-000000000033','2025-10-03 13:34+08','2025-10-03 13:34+08'),
 ('d0000000-0000-4000-8000-000000000039','request',ST_SetSRID(ST_MakePoint(121.4322,23.6748),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 8:30+08','2024-07-25 8:30+08'),
 ('d0000000-0000-4000-8000-000000000040','request',ST_SetSRID(ST_MakePoint(121.4258,23.6681),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 8:45+08','2024-07-25 8:45+08'),
 ('d0000000-0000-4000-8000-000000000041','request',ST_SetSRID(ST_MakePoint(121.4401,23.6793),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 9:05+08','2024-07-25 9:05+08'),
 ('d0000000-0000-4000-8000-000000000042','request',ST_SetSRID(ST_MakePoint(121.4185,23.6702),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 9:20+08','2024-07-25 9:20+08'),
 ('d0000000-0000-4000-8000-000000000043','request',ST_SetSRID(ST_MakePoint(121.4463,23.6667),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 9:40+08','2024-07-25 9:40+08'),
 ('d0000000-0000-4000-8000-000000000044','request',ST_SetSRID(ST_MakePoint(121.429,23.6598),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 10:00+08','2024-07-25 10:00+08'),
 ('d0000000-0000-4000-8000-000000000045','request',ST_SetSRID(ST_MakePoint(121.4351,23.6635),4326),'c0000000-0000-4000-8000-000000000001','2024-07-25 10:15+08','2024-07-25 10:15+08');

INSERT INTO tickets (uuid, title, description, contact_name, contact_email, contact_phone, status, priority, task_type, visibility, verification_status) VALUES
 ('d0000000-0000-4000-8000-000000000001','光復鄉中正路一段31號有住戶受困,需要救援',NULL,'志工-郭怡君',NULL,'0977-357-666','pending','medium','rescue','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000002','光復鄉中正路一段177號民宅遭土石掩埋一半,屋內有人',NULL,'紅十字會-花蓮支會',NULL,'0930-564-103','pending','critical','rescue','public','unverified'),
 ('d0000000-0000-4000-8000-000000000003','光復鄉大富村明德路131號有住戶受困,需要救援',NULL,'光復鄉公所-災防課',NULL,'LINE: help_2024','pending','medium','rescue','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000004','光復鄉林森路141號民宅遭土石掩埋一半,屋內有人',NULL,'志工-邱詩涵',NULL,'0940-159-346','pending','low','rescue','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000005','光復鄉武昌街23號有住戶受困,需要救援',NULL,'紅十字會-花蓮支會',NULL,'0931-371-640','pending','high','rescue','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000006','光復鄉武昌街111號需要清理污泥',NULL,'光復鄉大同村村長',NULL,'LINE: help_2024','pending','high','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000007','鳳林鎮光復路118號需要清理污泥',NULL,'志工-劉家豪',NULL,'0917-334-169','pending','high','hr','public','unverified'),
 ('d0000000-0000-4000-8000-000000000008','光復鄉中正路一段87號需要清理污泥',NULL,'志工-邱詩涵',NULL,'0983-584-348','pending','high','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000009','瑞穗鄉中山路一段107號需要清理污泥',NULL,'志工-謝雅雯',NULL,'LINE: guangfu_rescue01','pending','medium','hr','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000010','光復鄉大同村佛祖街89號需要清理污泥',NULL,'志工-曾國銘',NULL,'0966-927-982','pending','high','hr','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000011','鳳林鎮光復路28號需要清理污泥',NULL,'志工-劉家豪',NULL,'0962-597-592','pending','low','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000012','光復鄉大同村佛祖街18號需要清理污泥',NULL,'志工-楊宗翰',NULL,'LINE: yilan_vol','pending','low','hr','public','unverified'),
 ('d0000000-0000-4000-8000-000000000013','瑞穗鄉中山路一段42號需要清理污泥',NULL,'志工-簡嘉文',NULL,'0984-588-614','pending','high','hr','public','unverified'),
 ('d0000000-0000-4000-8000-000000000014','鳳林鎮光復路43號需要清理污泥',NULL,'志工-吳佩珊',NULL,'0925-683-352','pending','high','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000015','光復鄉武昌街13號民宅院子土石清除',NULL,'志工-簡嘉文',NULL,'LINE: help_2024','pending','low','hr','public','unverified'),
 ('d0000000-0000-4000-8000-000000000016','光復鄉大富村明德路104號需要物資補給',NULL,'志工-鄭文傑',NULL,'0982-202-175','pending','low','supply','public','unverified'),
 ('d0000000-0000-4000-8000-000000000017','光復鄉大全街132號社區需要飲用水與乾糧',NULL,'志工-許美玲',NULL,'0948-726-926','pending','medium','supply','public','unverified'),
 ('d0000000-0000-4000-8000-000000000018','鳳林鎮光復路5號收容點需要民生物資',NULL,'花蓮縣消防局-鳳林大隊',NULL,'LINE: yilan_vol','pending','low','supply','public','unverified'),
 ('d0000000-0000-4000-8000-000000000019','光復鄉大富村明德路75號收容點需要民生物資',NULL,'花蓮縣消防局-鳳林大隊',NULL,'0921-749-533','pending','high','supply','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000020','光復鄉大富村明德路14號需要物資補給',NULL,'志工-楊宗翰',NULL,'0911-214-177','pending','medium','supply','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000021','光復鄉林森路142號需要物資補給',NULL,'志工-李俊賢',NULL,'LINE: help_2024','pending','high','supply','public','unverified'),
 ('d0000000-0000-4000-8000-000000000022','光復鄉大全街173號需要物資補給',NULL,'志工-郭怡君',NULL,'0930-919-930','pending','medium','supply','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000023','光復鄉大同村佛祖街9號需要物資補給',NULL,'志工-郭怡君',NULL,'0930-906-818','pending','low','supply','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000024','光復鄉大同村佛祖街12號附近災情回報,待釐清',NULL,'志工-曾國銘',NULL,'LINE: guangfu_rescue01','pending','low',NULL,'public','human_verified'),
 ('d0000000-0000-4000-8000-000000000025','光復鄉大全街105號附近災情回報,待釐清',NULL,'紅十字會-花蓮支會',NULL,'0952-128-218','pending','medium',NULL,'public','unverified'),
 ('d0000000-0000-4000-8000-000000000026','光復鄉大富村明德路48號有災損,需求尚未確認',NULL,'志工-張淑芬',NULL,'0987-623-218','pending','medium',NULL,'public','human_verified'),
 ('d0000000-0000-4000-8000-000000000027','光復鄉武昌街51號附近災情回報,待釐清',NULL,'志工-賴建志',NULL,'LINE: aming_tw','pending','medium',NULL,'public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000028','光復鄉大同村佛祖街20號有災損,需求尚未確認',NULL,'花蓮縣消防局-鳳林大隊',NULL,'0962-434-512','pending','medium',NULL,'public','unverified'),
 ('d0000000-0000-4000-8000-000000000029','光復鄉大富村明德路144號回報災情,情況不明',NULL,'志工-洪志強',NULL,'0961-661-953','pending','low',NULL,'public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000030','光復鄉大富村明德路76號回報災情,情況不明',NULL,'光復鄉公所-災防課',NULL,'LINE: ds_flood_help','pending','medium',NULL,'public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000031','冬山鄉香和路46號民宅遭土石掩埋一半,屋內有人',NULL,'冬山鄉公所-民政課',NULL,'0949-330-925','pending','critical','rescue','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000032','冬山鄉三奇路9號有住戶受困,需要救援',NULL,'志工-蘇怡靜',NULL,'0959-606-509','pending','low','rescue','public','ai_verified'),
 ('d0000000-0000-4000-8000-000000000033','冬山鄉三奇路170號需協助抽水',NULL,'志工-蘇怡靜',NULL,'LINE: yilan_vol','pending','high','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000034','冬山鄉冬山路二段145號積水退後需清掃淤泥',NULL,'志工-范植偉',NULL,'0950-873-553','pending','medium','hr','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000035','冬山鄉香和路132號需要人力搬運泡水家具',NULL,'志工-范植偉',NULL,'0945-884-896','pending','medium','hr','public','unverified'),
 ('d0000000-0000-4000-8000-000000000036','冬山鄉永興路一段163號需要物資補給',NULL,'慈濟基金會-羅東聯絡處',NULL,'LINE: aming_tw','pending','medium','supply','public','human_verified'),
 ('d0000000-0000-4000-8000-000000000037','冬山鄉三奇路101號收容點需要民生物資',NULL,'宜蘭縣社福聯盟',NULL,'0963-498-888','pending','medium','supply','public','unverified'),
 ('d0000000-0000-4000-8000-000000000038','員山鄉員山路一段8號有災損,需求尚未確認',NULL,'紅十字會-宜蘭支會',NULL,'0978-865-852','pending','medium',NULL,'public','human_verified'),
 ('d0000000-0000-4000-8000-000000000039','光復鄉中山路二段45號一樓積泥需要清理','一樓客廳和廚房都是泥，屋主年紀大，家具搬不動。','陳冠宇',NULL,'0912-345-678','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000040','光復鄉大安村大安路6號圍牆倒塌需要搬運','圍牆倒在巷子裡，車子進不來。','林先生',NULL,'0928-117-405','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000041','光復鄉大全街88號泥水已清，需要消毒和搬運','屋內泥水已經清掉，需要消毒，泡水的床墊要搬出來。','陳冠宇',NULL,'0912-345-678','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000042','光復鄉建國路一段20號後院土石堆積','後院土石大約半層樓高，現場照片在下面。','陳冠宇',NULL,'LINE: chen_gy','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000043','光復鄉中正路二段77號長者獨居需要協助整理','阿嬤一個人住，早上九點到下午三點都在家。','王阿嬤',NULL,'0938-552-017','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000044','光復鄉林森路200號店面淤泥清運','淤泥已經鏟到門口，需要人力和車輛載走。','李小姐',NULL,'0955-260-381','pending','medium','hr','public',NULL),
 ('d0000000-0000-4000-8000-000000000045','光復鄉中華路3號需要沙包','巷口積水，需要沙包擋水。','陳冠宇',NULL,'0912-345-678','pending','medium','supply','public',NULL);

-- (g) 建單者後來把整張單刪了:soft delete,狀態在第 10 節變成 cancelled,需求在 4b 跟著刪。
UPDATE base_geometries SET delete_at = '2024-07-25 12:00+08', updated_at = '2024-07-25 12:00+08'
 WHERE uuid = 'd0000000-0000-4000-8000-000000000045';

-- 3b. 地址 — avol01 的單照網站「請求協助」的寫法:地址整行放 landmark_note,樓層、戶另外放。
INSERT INTO secondary_locations (uuid, geometry_uuid, location_type, landmark_note, floor, room) VALUES
 ('40000000-0000-4000-8000-000000000039','d0000000-0000-4000-8000-000000000039','address','花蓮縣光復鄉中山路二段45號','1樓',NULL),
 ('40000000-0000-4000-8000-000000000040','d0000000-0000-4000-8000-000000000040','address','花蓮縣光復鄉大安村大安路6號',NULL,NULL),
 ('40000000-0000-4000-8000-000000000041','d0000000-0000-4000-8000-000000000041','address','花蓮縣光復鄉大全街88號',NULL,NULL),
 ('40000000-0000-4000-8000-000000000042','d0000000-0000-4000-8000-000000000042','address','花蓮縣光復鄉建國路一段20號',NULL,NULL),
 ('40000000-0000-4000-8000-000000000043','d0000000-0000-4000-8000-000000000043','address','花蓮縣光復鄉中正路二段77號','3樓','302室'),
 ('40000000-0000-4000-8000-000000000044','d0000000-0000-4000-8000-000000000044','address','花蓮縣光復鄉林森路200號',NULL,NULL),
 ('40000000-0000-4000-8000-000000000045','d0000000-0000-4000-8000-000000000045','address','花蓮縣光復鄉中華路3號',NULL,NULL);

-- 3c. 照片 — 網站只存網址:ref_type 'geometry'、ref_uuid=單、created_by=建單者,created_at 錯開保持順序。
--     avol01 的 (d) 兩張載得出來(picsum.photos/seed/… 每次回同一張圖)、一張載不出來(主機在,圖不在);
--     另有兩張背景單各一張。
INSERT INTO photos (uuid, ref_uuid, ref_type, url, created_by, created_at, updated_at) VALUES
 ('50000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000042','geometry','https://picsum.photos/seed/wg-d042a/640/420','c0000000-0000-4000-8000-000000000001','2024-07-25 9:20:00.000000+08','2024-07-25 9:20+08'),
 ('50000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000042','geometry','https://picsum.photos/seed/wg-d042b/640/420','c0000000-0000-4000-8000-000000000001','2024-07-25 9:20:00.000001+08','2024-07-25 9:20+08'),
 ('50000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000042','geometry','https://duk.tw/not-there.jpg','c0000000-0000-4000-8000-000000000001','2024-07-25 9:20:00.000002+08','2024-07-25 9:20+08'),
 ('50000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000005','geometry','https://picsum.photos/seed/wg-d005/640/420','c0000000-0000-4000-8000-000000000022','2024-07-24 15:55+08','2024-07-24 15:55+08'),
 ('50000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000033','geometry','https://picsum.photos/seed/wg-d033/640/420','c0000000-0000-4000-8000-000000000029','2025-10-03 18:29+08','2025-10-03 18:29+08');

-- 4. TASKS — 每張 ticket 1–2 個。status 先一律寫 pending,承接湊滿的由第 10 節改成 fulfilled。
INSERT INTO ticket_tasks (uuid, ticket_uuid, route_uuid, task_type, task_name, task_description, quantity, status, source, progress_note, is_duplicate, dedup_group_id, moderation_status, visibility, review_note, created_by, created_at, updated_at) VALUES
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',NULL,'rescue','長者後送',NULL,1,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000014','2024-07-24 14:55+08','2024-07-24 14:55+08'),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002',NULL,'rescue','長者後送',NULL,3,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000022','2024-07-24 13:46+08','2024-07-24 13:46+08'),
 ('e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002',NULL,'rescue','受困人員救援',NULL,6,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000022','2024-07-24 13:46+08','2024-07-24 13:46+08'),
 ('e0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000003',NULL,'rescue','受困人員救援',NULL,5,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000025','2024-07-24 9:48+08','2024-07-24 9:48+08'),
 ('e0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000004',NULL,'rescue','受困人員救援',NULL,4,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000016','2024-07-24 11:56+08','2024-07-24 11:56+08'),
 ('e0000000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000005',NULL,'rescue','長者後送',NULL,2,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000022','2024-07-24 15:55+08','2024-07-24 15:55+08'),
 ('e0000000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000005',NULL,'rescue','受困人員救援',NULL,2,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000022','2024-07-24 15:55+08','2024-07-24 15:55+08'),
 ('e0000000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000006',NULL,'hr','搬運志工',NULL,8,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000027','2024-07-24 17:28+08','2024-07-24 17:28+08'),
 ('e0000000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000007',NULL,'hr','清淤人力',NULL,16,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000007','2024-07-24 8:57+08','2024-07-24 8:57+08'),
 ('e0000000-0000-4000-8000-000000000010','d0000000-0000-4000-8000-000000000008',NULL,'hr','挖土機支援',NULL,1,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000016','2024-07-24 16:50+08','2024-07-24 16:50+08'),
 ('e0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000009',NULL,'hr','清淤人力',NULL,19,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000012','2024-07-24 17:03+08','2024-07-24 17:03+08'),
 ('e0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000010',NULL,'hr','挖土機支援',NULL,2,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000015','2024-07-24 8:54+08','2024-07-24 8:54+08'),
 ('e0000000-0000-4000-8000-000000000013','d0000000-0000-4000-8000-000000000010',NULL,'hr','搬運志工',NULL,14,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000015','2024-07-24 8:54+08','2024-07-24 8:54+08'),
 ('e0000000-0000-4000-8000-000000000014','d0000000-0000-4000-8000-000000000011',NULL,'hr','挖土機支援',NULL,1,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000007','2024-07-24 9:13+08','2024-07-24 9:13+08'),
 ('e0000000-0000-4000-8000-000000000015','d0000000-0000-4000-8000-000000000011',NULL,'hr','清淤人力',NULL,30,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000007','2024-07-24 9:13+08','2024-07-24 9:13+08'),
 ('e0000000-0000-4000-8000-000000000016','d0000000-0000-4000-8000-000000000012',NULL,'hr','挖土機支援',NULL,1,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000009','2024-07-24 18:42+08','2024-07-24 18:42+08'),
 ('e0000000-0000-4000-8000-000000000017','d0000000-0000-4000-8000-000000000012',NULL,'hr','搬運志工',NULL,4,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000009','2024-07-24 18:42+08','2024-07-24 18:42+08'),
 ('e0000000-0000-4000-8000-000000000018','d0000000-0000-4000-8000-000000000013',NULL,'hr','搬運志工',NULL,12,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000019','2024-07-24 7:58+08','2024-07-24 7:58+08'),
 ('e0000000-0000-4000-8000-000000000019','d0000000-0000-4000-8000-000000000013',NULL,'hr','清淤人力',NULL,20,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000019','2024-07-24 7:58+08','2024-07-24 7:58+08'),
 ('e0000000-0000-4000-8000-000000000020','d0000000-0000-4000-8000-000000000014',NULL,'hr','搬運志工',NULL,14,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000006','2024-07-24 13:37+08','2024-07-24 13:37+08'),
 ('e0000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000014',NULL,'hr','挖土機支援',NULL,1,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000006','2024-07-24 13:37+08','2024-07-24 13:37+08'),
 ('e0000000-0000-4000-8000-000000000022','d0000000-0000-4000-8000-000000000015',NULL,'hr','挖土機支援',NULL,2,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000019','2024-07-24 18:15+08','2024-07-24 18:15+08'),
 ('e0000000-0000-4000-8000-000000000023','d0000000-0000-4000-8000-000000000015',NULL,'hr','搬運志工',NULL,9,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000019','2024-07-24 18:15+08','2024-07-24 18:15+08'),
 ('e0000000-0000-4000-8000-000000000024','d0000000-0000-4000-8000-000000000016',NULL,'supply','便當',NULL,84,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000011','2024-07-24 16:34+08','2024-07-24 16:34+08'),
 ('e0000000-0000-4000-8000-000000000025','d0000000-0000-4000-8000-000000000016',NULL,'supply','飲用水(箱)',NULL,55,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000011','2024-07-24 16:34+08','2024-07-24 16:34+08'),
 ('e0000000-0000-4000-8000-000000000026','d0000000-0000-4000-8000-000000000017',NULL,'supply','飲用水(箱)',NULL,36,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000010','2024-07-24 15:41+08','2024-07-24 15:41+08'),
 ('e0000000-0000-4000-8000-000000000027','d0000000-0000-4000-8000-000000000017',NULL,'supply','沙包',NULL,99,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000010','2024-07-24 15:41+08','2024-07-24 15:41+08'),
 ('e0000000-0000-4000-8000-000000000028','d0000000-0000-4000-8000-000000000018',NULL,'supply','推車',NULL,8,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000026','2024-07-24 8:09+08','2024-07-24 8:09+08'),
 ('e0000000-0000-4000-8000-000000000029','d0000000-0000-4000-8000-000000000019',NULL,'supply','沙包',NULL,75,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000026','2024-07-24 7:53+08','2024-07-24 7:53+08'),
 ('e0000000-0000-4000-8000-000000000030','d0000000-0000-4000-8000-000000000019',NULL,'supply','飲用水(箱)',NULL,38,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000026','2024-07-24 7:53+08','2024-07-24 7:53+08'),
 ('e0000000-0000-4000-8000-000000000031','d0000000-0000-4000-8000-000000000020',NULL,'supply','飲用水(箱)',NULL,20,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000009','2024-07-24 15:56+08','2024-07-24 15:56+08'),
 ('e0000000-0000-4000-8000-000000000032','d0000000-0000-4000-8000-000000000021',NULL,'supply','飲用水(箱)',NULL,22,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000005','2024-07-24 7:13+08','2024-07-24 7:13+08'),
 ('e0000000-0000-4000-8000-000000000033','d0000000-0000-4000-8000-000000000022',NULL,'supply','推車',NULL,6,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000014','2024-07-24 10:11+08','2024-07-24 10:11+08'),
 ('e0000000-0000-4000-8000-000000000034','d0000000-0000-4000-8000-000000000022',NULL,'supply','便當',NULL,103,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000014','2024-07-24 10:11+08','2024-07-24 10:11+08'),
 ('e0000000-0000-4000-8000-000000000035','d0000000-0000-4000-8000-000000000023',NULL,'supply','便當',NULL,53,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000014','2024-07-24 11:06+08','2024-07-24 11:06+08'),
 ('e0000000-0000-4000-8000-000000000036','d0000000-0000-4000-8000-000000000023',NULL,'supply','飲用水(箱)',NULL,36,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000014','2024-07-24 11:06+08','2024-07-24 11:06+08'),
 ('e0000000-0000-4000-8000-000000000037','d0000000-0000-4000-8000-000000000024',NULL,'supply','圓鍬',NULL,16,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000015','2024-07-24 10:42+08','2024-07-24 10:42+08'),
 ('e0000000-0000-4000-8000-000000000038','d0000000-0000-4000-8000-000000000025',NULL,'hr','清淤人力',NULL,28,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000022','2024-07-24 15:56+08','2024-07-24 15:56+08'),
 ('e0000000-0000-4000-8000-000000000039','d0000000-0000-4000-8000-000000000026',NULL,'hr','挖土機支援',NULL,2,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000004','2024-07-24 13:24+08','2024-07-24 13:24+08'),
 ('e0000000-0000-4000-8000-000000000040','d0000000-0000-4000-8000-000000000027',NULL,'supply','沙包',NULL,128,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000017','2024-07-24 18:23+08','2024-07-24 18:23+08'),
 ('e0000000-0000-4000-8000-000000000041','d0000000-0000-4000-8000-000000000027',NULL,'supply','便當',NULL,37,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000017','2024-07-24 18:23+08','2024-07-24 18:23+08'),
 ('e0000000-0000-4000-8000-000000000042','d0000000-0000-4000-8000-000000000028',NULL,'hr','挖土機支援',NULL,1,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000026','2024-07-24 11:44+08','2024-07-24 11:44+08'),
 ('e0000000-0000-4000-8000-000000000043','d0000000-0000-4000-8000-000000000029',NULL,'hr','清淤人力',NULL,27,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000013','2024-07-24 11:00+08','2024-07-24 11:00+08'),
 ('e0000000-0000-4000-8000-000000000044','d0000000-0000-4000-8000-000000000030',NULL,'supply','沙包',NULL,124,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000025','2024-07-24 15:50+08','2024-07-24 15:50+08'),
 ('e0000000-0000-4000-8000-000000000045','d0000000-0000-4000-8000-000000000030',NULL,'supply','便當',NULL,66,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000025','2024-07-24 15:50+08','2024-07-24 15:50+08'),
 ('e0000000-0000-4000-8000-000000000046','d0000000-0000-4000-8000-000000000031',NULL,'rescue','受困人員救援',NULL,4,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000037','2025-10-03 17:12+08','2025-10-03 17:12+08'),
 ('e0000000-0000-4000-8000-000000000047','d0000000-0000-4000-8000-000000000031',NULL,'rescue','長者後送',NULL,3,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000037','2025-10-03 17:12+08','2025-10-03 17:12+08'),
 ('e0000000-0000-4000-8000-000000000048','d0000000-0000-4000-8000-000000000032',NULL,'rescue','受困人員救援',NULL,3,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000029','2025-10-03 18:15+08','2025-10-03 18:15+08'),
 ('e0000000-0000-4000-8000-000000000049','d0000000-0000-4000-8000-000000000033',NULL,'hr','抽水機操作人力',NULL,3,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000029','2025-10-03 18:29+08','2025-10-03 18:29+08'),
 ('e0000000-0000-4000-8000-000000000050','d0000000-0000-4000-8000-000000000034',NULL,'hr','搬運志工',NULL,6,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000030','2025-10-03 16:39+08','2025-10-03 16:39+08'),
 ('e0000000-0000-4000-8000-000000000051','d0000000-0000-4000-8000-000000000034',NULL,'hr','清掃志工',NULL,18,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000030','2025-10-03 16:39+08','2025-10-03 16:39+08'),
 ('e0000000-0000-4000-8000-000000000052','d0000000-0000-4000-8000-000000000035',NULL,'hr','搬運志工',NULL,10,'pending','user',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000030','2025-10-03 10:33+08','2025-10-03 10:33+08'),
 ('e0000000-0000-4000-8000-000000000053','d0000000-0000-4000-8000-000000000036',NULL,'supply','便當',NULL,96,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000032','2025-10-03 8:09+08','2025-10-03 8:09+08'),
 ('e0000000-0000-4000-8000-000000000054','d0000000-0000-4000-8000-000000000037',NULL,'supply','推車',NULL,12,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000034','2025-10-03 10:37+08','2025-10-03 10:37+08'),
 ('e0000000-0000-4000-8000-000000000055','d0000000-0000-4000-8000-000000000037',NULL,'supply','便當',NULL,90,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000034','2025-10-03 10:37+08','2025-10-03 10:37+08'),
 ('e0000000-0000-4000-8000-000000000056','d0000000-0000-4000-8000-000000000038',NULL,'supply','圓鍬',NULL,15,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000033','2025-10-03 13:34+08','2025-10-03 13:34+08'),
 ('e0000000-0000-4000-8000-000000000057','d0000000-0000-4000-8000-000000000038',NULL,'supply','推車',NULL,12,'pending','gov',NULL,false,NULL,'approved','public',NULL,'c0000000-0000-4000-8000-000000000033','2025-10-03 13:34+08','2025-10-03 13:34+08');

-- 4b. avol01 的需求 — 網站建的:source 'user'、moderation_status 'pending_review',同一張單的 created_at 錯開。
--     停止招募、刪除的需求在這裡直接寫好(欄位照 services/ticket.py 的 stop_recruiting、delete_ticket_task);
--     湊滿的由第 10 節照承接人數改成 fulfilled。
INSERT INTO ticket_tasks (uuid, ticket_uuid, task_type, task_name, task_description, quantity, status, source, moderation_status, visibility, created_by, created_at, updated_at, completed_at, canceled_at, recruiting_stopped_at, delete_at) VALUES
 -- (a) 兩筆都沒人;第二筆沒填數量
 ('e0000000-0000-4000-8000-000000000058','d0000000-0000-4000-8000-000000000039','hr','清淤人力','一樓客廳和廚房',4,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 8:30:00.000000+08','2024-07-25 8:30+08',NULL,NULL,NULL,NULL),
 ('e0000000-0000-4000-8000-000000000059','d0000000-0000-4000-8000-000000000039','supply','飲用水(箱)',NULL,NULL,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 8:30:00.000001+08','2024-07-25 8:30+08',NULL,NULL,NULL,NULL),
 -- (b) 搬運 2 人會湊滿(avol02+另一人);清淤 5 人只有 1 人
 ('e0000000-0000-4000-8000-000000000060','d0000000-0000-4000-8000-000000000040','hr','搬運志工','搬開倒塌的圍牆磚塊',2,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 8:45:00.000000+08','2024-07-25 8:45+08',NULL,NULL,NULL,NULL),
 ('e0000000-0000-4000-8000-000000000061','d0000000-0000-4000-8000-000000000040','hr','清淤人力',NULL,5,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 8:45:00.000001+08','2024-07-25 8:45+08',NULL,NULL,NULL,NULL),
 -- (c) 兩筆都會湊滿 → 單已完成;再加一件會重新開啟
 ('e0000000-0000-4000-8000-000000000062','d0000000-0000-4000-8000-000000000041','hr','消毒人力',NULL,1,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:05:00.000000+08','2024-07-25 9:05+08',NULL,NULL,NULL,NULL),
 ('e0000000-0000-4000-8000-000000000063','d0000000-0000-4000-8000-000000000041','hr','搬運志工','泡水的床墊搬到路邊',2,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:05:00.000001+08','2024-07-25 9:05+08',NULL,NULL,NULL,NULL),
 -- (d) 帶照片(3c),兩筆都沒人
 ('e0000000-0000-4000-8000-000000000064','d0000000-0000-4000-8000-000000000042','hr','清淤人力',NULL,3,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:20:00.000000+08','2024-07-25 9:20+08',NULL,NULL,NULL,NULL),
 ('e0000000-0000-4000-8000-000000000065','d0000000-0000-4000-8000-000000000042','hr','挖土機支援',NULL,1,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:20:00.000001+08','2024-07-25 9:20+08',NULL,NULL,NULL,NULL),
 -- (e) 一筆開著;另一筆已刪除(avol02 接過,承接紀錄保留,哪裡都看不到)
 ('e0000000-0000-4000-8000-000000000066','d0000000-0000-4000-8000-000000000043','hr','打掃志工',NULL,3,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:40:00.000000+08','2024-07-25 9:40+08',NULL,NULL,NULL,NULL),
 ('e0000000-0000-4000-8000-000000000067','d0000000-0000-4000-8000-000000000043','hr','搬運家具',NULL,2,'canceled','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 9:40:00.000001+08','2024-07-25 11:30+08',NULL,'2024-07-25 11:30+08',NULL,'2024-07-25 11:30+08'),
 -- (f) 清淤原本要 5 人,2 人時建單者停止招募(quantity 改成 2);載運車輛還開著
 ('e0000000-0000-4000-8000-000000000068','d0000000-0000-4000-8000-000000000044','hr','清淤人力',NULL,2,'fulfilled','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 10:00:00.000000+08','2024-07-25 13:00+08','2024-07-25 13:00+08',NULL,'2024-07-25 13:00+08',NULL),
 ('e0000000-0000-4000-8000-000000000069','d0000000-0000-4000-8000-000000000044','supply','載運車輛','小貨車一台',1,'pending','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 10:00:00.000001+08','2024-07-25 10:00+08',NULL,NULL,NULL,NULL),
 -- (g) 整張單已刪除,需求跟著刪
 ('e0000000-0000-4000-8000-000000000070','d0000000-0000-4000-8000-000000000045','supply','沙包',NULL,30,'canceled','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 10:15:00.000000+08','2024-07-25 12:00+08',NULL,'2024-07-25 12:00+08',NULL,'2024-07-25 12:00+08'),
 ('e0000000-0000-4000-8000-000000000071','d0000000-0000-4000-8000-000000000045','hr','搬運志工',NULL,2,'canceled','user','pending_review','public','c0000000-0000-4000-8000-000000000001','2024-07-25 10:15:00.000001+08','2024-07-25 12:00+08',NULL,'2024-07-25 12:00+08',NULL,'2024-07-25 12:00+08');

INSERT INTO task_properties (uuid, task_uuid, property_name, property_value, quantity, status, comment, created_at, updated_at) VALUES
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000001','people_count','4',NULL,NULL,NULL,'2024-07-24 14:55+08','2024-07-24 14:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000001','floor_level','1',NULL,NULL,NULL,'2024-07-24 14:55+08','2024-07-24 14:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000002','people_count','4',NULL,NULL,NULL,'2024-07-24 13:46+08','2024-07-24 13:46+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000002','floor_level','2',NULL,NULL,NULL,'2024-07-24 13:46+08','2024-07-24 13:46+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000003','people_count','4',NULL,NULL,NULL,'2024-07-24 13:46+08','2024-07-24 13:46+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000003','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2024-07-24 13:46+08','2024-07-24 13:46+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000004','people_count','4',NULL,NULL,NULL,'2024-07-24 9:48+08','2024-07-24 9:48+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000004','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2024-07-24 9:48+08','2024-07-24 9:48+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000005','people_count','2',NULL,NULL,NULL,'2024-07-24 11:56+08','2024-07-24 11:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000005','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2024-07-24 11:56+08','2024-07-24 11:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000006','people_count','4',NULL,NULL,NULL,'2024-07-24 15:55+08','2024-07-24 15:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000006','floor_level','3',NULL,NULL,NULL,'2024-07-24 15:55+08','2024-07-24 15:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000007','people_count','5',NULL,NULL,NULL,'2024-07-24 15:55+08','2024-07-24 15:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000007','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2024-07-24 15:55+08','2024-07-24 15:55+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000008','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 17:28+08','2024-07-24 17:28+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000008','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 17:28+08','2024-07-24 17:28+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000009','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 8:57+08','2024-07-24 8:57+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000009','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 8:57+08','2024-07-24 8:57+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000009','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 8:57+08','2024-07-24 8:57+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000010','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 16:50+08','2024-07-24 16:50+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000010','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 16:50+08','2024-07-24 16:50+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000011','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 17:03+08','2024-07-24 17:03+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000011','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 17:03+08','2024-07-24 17:03+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000011','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 17:03+08','2024-07-24 17:03+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000012','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 8:54+08','2024-07-24 8:54+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000012','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 8:54+08','2024-07-24 8:54+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000013','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 8:54+08','2024-07-24 8:54+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000013','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 8:54+08','2024-07-24 8:54+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000014','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 9:13+08','2024-07-24 9:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000014','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 9:13+08','2024-07-24 9:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000015','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 9:13+08','2024-07-24 9:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000015','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 9:13+08','2024-07-24 9:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000015','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 9:13+08','2024-07-24 9:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000016','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 18:42+08','2024-07-24 18:42+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000016','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 18:42+08','2024-07-24 18:42+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000017','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 18:42+08','2024-07-24 18:42+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000017','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 18:42+08','2024-07-24 18:42+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000018','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 7:58+08','2024-07-24 7:58+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000018','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 7:58+08','2024-07-24 7:58+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000019','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 7:58+08','2024-07-24 7:58+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000019','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 7:58+08','2024-07-24 7:58+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000019','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 7:58+08','2024-07-24 7:58+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000020','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 13:37+08','2024-07-24 13:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000020','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 13:37+08','2024-07-24 13:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000021','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 13:37+08','2024-07-24 13:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000021','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 13:37+08','2024-07-24 13:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000022','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 18:15+08','2024-07-24 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000022','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 18:15+08','2024-07-24 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000023','required_skill','logistics',NULL,NULL,NULL,'2024-07-24 18:15+08','2024-07-24 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000023','cargo_type','supplies',NULL,NULL,NULL,'2024-07-24 18:15+08','2024-07-24 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000024','item_name','便當',NULL,NULL,NULL,'2024-07-24 16:34+08','2024-07-24 16:34+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000025','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 16:34+08','2024-07-24 16:34+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000026','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 15:41+08','2024-07-24 15:41+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000027','item_name','沙包',NULL,NULL,NULL,'2024-07-24 15:41+08','2024-07-24 15:41+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000028','item_name','推車',NULL,NULL,NULL,'2024-07-24 8:09+08','2024-07-24 8:09+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000029','item_name','沙包',NULL,NULL,NULL,'2024-07-24 7:53+08','2024-07-24 7:53+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000030','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 7:53+08','2024-07-24 7:53+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000031','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 15:56+08','2024-07-24 15:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000032','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 7:13+08','2024-07-24 7:13+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000033','item_name','推車',NULL,NULL,NULL,'2024-07-24 10:11+08','2024-07-24 10:11+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000034','item_name','便當',NULL,NULL,NULL,'2024-07-24 10:11+08','2024-07-24 10:11+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000035','item_name','便當',NULL,NULL,NULL,'2024-07-24 11:06+08','2024-07-24 11:06+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000036','item_name','瓶裝水',NULL,NULL,NULL,'2024-07-24 11:06+08','2024-07-24 11:06+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000037','item_name','圓鍬',NULL,NULL,NULL,'2024-07-24 10:42+08','2024-07-24 10:42+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000038','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 15:56+08','2024-07-24 15:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000038','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 15:56+08','2024-07-24 15:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000038','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 15:56+08','2024-07-24 15:56+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000039','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 13:24+08','2024-07-24 13:24+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000039','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 13:24+08','2024-07-24 13:24+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000040','item_name','沙包',NULL,NULL,NULL,'2024-07-24 18:23+08','2024-07-24 18:23+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000041','item_name','便當',NULL,NULL,NULL,'2024-07-24 18:23+08','2024-07-24 18:23+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000042','required_tool','excavator',NULL,NULL,NULL,'2024-07-24 11:44+08','2024-07-24 11:44+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000042','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 11:44+08','2024-07-24 11:44+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000043','required_skill','cleaning',NULL,NULL,NULL,'2024-07-24 11:00+08','2024-07-24 11:00+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000043','cleanup_type','mud',NULL,NULL,NULL,'2024-07-24 11:00+08','2024-07-24 11:00+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000043','required_tool','shovel',NULL,NULL,NULL,'2024-07-24 11:00+08','2024-07-24 11:00+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000044','item_name','沙包',NULL,NULL,NULL,'2024-07-24 15:50+08','2024-07-24 15:50+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000045','item_name','便當',NULL,NULL,NULL,'2024-07-24 15:50+08','2024-07-24 15:50+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000046','people_count','5',NULL,NULL,NULL,'2025-10-03 17:12+08','2025-10-03 17:12+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000046','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2025-10-03 17:12+08','2025-10-03 17:12+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000047','people_count','2',NULL,NULL,NULL,'2025-10-03 17:12+08','2025-10-03 17:12+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000047','floor_level','4',NULL,NULL,NULL,'2025-10-03 17:12+08','2025-10-03 17:12+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000048','people_count','2',NULL,NULL,NULL,'2025-10-03 18:15+08','2025-10-03 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000048','hazard_note','土石不穩,需專業評估',NULL,NULL,NULL,'2025-10-03 18:15+08','2025-10-03 18:15+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000049','required_tool','pump',NULL,NULL,NULL,'2025-10-03 18:29+08','2025-10-03 18:29+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000049','cleanup_type','sewage',NULL,NULL,NULL,'2025-10-03 18:29+08','2025-10-03 18:29+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000050','required_skill','logistics',NULL,NULL,NULL,'2025-10-03 16:39+08','2025-10-03 16:39+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000050','cargo_type','supplies',NULL,NULL,NULL,'2025-10-03 16:39+08','2025-10-03 16:39+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000051','required_skill','cleaning',NULL,NULL,NULL,'2025-10-03 16:39+08','2025-10-03 16:39+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000051','cleanup_type','mud',NULL,NULL,NULL,'2025-10-03 16:39+08','2025-10-03 16:39+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000052','required_skill','logistics',NULL,NULL,NULL,'2025-10-03 10:33+08','2025-10-03 10:33+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000052','cargo_type','supplies',NULL,NULL,NULL,'2025-10-03 10:33+08','2025-10-03 10:33+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000053','item_name','便當',NULL,NULL,NULL,'2025-10-03 8:09+08','2025-10-03 8:09+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000054','item_name','推車',NULL,NULL,NULL,'2025-10-03 10:37+08','2025-10-03 10:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000055','item_name','便當',NULL,NULL,NULL,'2025-10-03 10:37+08','2025-10-03 10:37+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000056','item_name','圓鍬',NULL,NULL,NULL,'2025-10-03 13:34+08','2025-10-03 13:34+08'),
 (gen_random_uuid(),'e0000000-0000-4000-8000-000000000057','item_name','推車',NULL,NULL,NULL,'2025-10-03 13:34+08','2025-10-03 13:34+08');

-- 5. TASK ASSIGNMENTS — 承接紀錄:status 一律 accepted,人數不超過 quantity。avol02 是給測試者用的志工;
--    avol01(建單者)、avol03(剛註冊的人)沒有任何承接。
INSERT INTO task_assignments (uuid, task_uuid, actor_uuid, role, status, assigned_at) VALUES
 -- 背景單
 ('f0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000002','volunteer','accepted','2024-07-24 17:40+08'),  -- avol02:光復鄉武昌街111號 搬運 3/8,可以釋出
 ('f0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000019','volunteer','accepted','2024-07-24 17:45+08'),
 ('f0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000020','volunteer','accepted','2024-07-24 18:02+08'),
 ('f0000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000005','volunteer','accepted','2024-07-24 9:10+08'),
 ('f0000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000008','volunteer','accepted','2024-07-24 9:12+08'),
 ('f0000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000020','volunteer','accepted','2024-07-24 9:30+08'),
 ('f0000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000016','volunteer','accepted','2024-07-24 9:41+08'),
 ('f0000000-0000-4000-8000-000000000008','e0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000012','volunteer','accepted','2024-07-24 17:05+08'),  -- 挖土機 1/1 湊滿,單已完成
 ('f0000000-0000-4000-8000-000000000009','e0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000019','volunteer','accepted','2024-07-24 9:02+08'),
 ('f0000000-0000-4000-8000-000000000010','e0000000-0000-4000-8000-000000000013','c0000000-0000-4000-8000-000000000004','volunteer','accepted','2024-07-24 9:20+08'),
 ('f0000000-0000-4000-8000-000000000011','e0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000012','volunteer','accepted','2024-07-24 9:25+08'),
 ('f0000000-0000-4000-8000-000000000012','e0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000016','volunteer','accepted','2024-07-24 9:35+08'),
 ('f0000000-0000-4000-8000-000000000013','e0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000004','volunteer','accepted','2024-07-24 9:50+08'),
 ('f0000000-0000-4000-8000-000000000014','e0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000014','volunteer','accepted','2024-07-24 10:05+08'),
 ('f0000000-0000-4000-8000-000000000015','e0000000-0000-4000-8000-000000000016','c0000000-0000-4000-8000-000000000009','volunteer','accepted','2024-07-24 18:50+08'),
 ('f0000000-0000-4000-8000-000000000016','e0000000-0000-4000-8000-000000000017','c0000000-0000-4000-8000-000000000009','volunteer','accepted','2024-07-24 18:55+08'),  -- 搬運 4/4 湊滿,單已完成
 ('f0000000-0000-4000-8000-000000000017','e0000000-0000-4000-8000-000000000017','c0000000-0000-4000-8000-000000000011','volunteer','accepted','2024-07-24 19:02+08'),
 ('f0000000-0000-4000-8000-000000000018','e0000000-0000-4000-8000-000000000017','c0000000-0000-4000-8000-000000000008','volunteer','accepted','2024-07-24 19:10+08'),
 ('f0000000-0000-4000-8000-000000000019','e0000000-0000-4000-8000-000000000017','c0000000-0000-4000-8000-000000000010','volunteer','accepted','2024-07-24 19:21+08'),
 ('f0000000-0000-4000-8000-000000000020','e0000000-0000-4000-8000-000000000018','c0000000-0000-4000-8000-000000000011','volunteer','accepted','2024-07-24 8:05+08'),
 ('f0000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000018','c0000000-0000-4000-8000-000000000013','volunteer','accepted','2024-07-24 8:20+08'),
 ('f0000000-0000-4000-8000-000000000022','e0000000-0000-4000-8000-000000000018','c0000000-0000-4000-8000-000000000016','volunteer','accepted','2024-07-24 8:31+08'),
 ('f0000000-0000-4000-8000-000000000023','e0000000-0000-4000-8000-000000000019','c0000000-0000-4000-8000-000000000012','volunteer','accepted','2024-07-24 8:40+08'),
 ('f0000000-0000-4000-8000-000000000024','e0000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-000000000018','volunteer','accepted','2024-07-24 13:45+08'),
 ('f0000000-0000-4000-8000-000000000025','e0000000-0000-4000-8000-000000000020','c0000000-0000-4000-8000-000000000020','volunteer','accepted','2024-07-24 14:02+08'),
 ('f0000000-0000-4000-8000-000000000026','e0000000-0000-4000-8000-000000000021','c0000000-0000-4000-8000-000000000016','volunteer','accepted','2024-07-24 13:50+08'),
 ('f0000000-0000-4000-8000-000000000027','e0000000-0000-4000-8000-000000000023','c0000000-0000-4000-8000-000000000010','volunteer','accepted','2024-07-24 18:30+08'),
 ('f0000000-0000-4000-8000-000000000028','e0000000-0000-4000-8000-000000000039','c0000000-0000-4000-8000-000000000008','volunteer','accepted','2024-07-24 13:30+08'),
 ('f0000000-0000-4000-8000-000000000029','e0000000-0000-4000-8000-000000000039','c0000000-0000-4000-8000-000000000002','volunteer','accepted','2024-07-24 13:52+08'),  -- avol02:挖土機 2/2,單已完成
 ('f0000000-0000-4000-8000-000000000030','e0000000-0000-4000-8000-000000000042','c0000000-0000-4000-8000-000000000009','volunteer','accepted','2024-07-24 11:58+08'),  -- 挖土機 1/1 湊滿,單已完成
 ('f0000000-0000-4000-8000-000000000031','e0000000-0000-4000-8000-000000000048','c0000000-0000-4000-8000-000000000028','volunteer','accepted','2025-10-03 18:20+08'),
 ('f0000000-0000-4000-8000-000000000032','e0000000-0000-4000-8000-000000000048','c0000000-0000-4000-8000-000000000030','volunteer','accepted','2025-10-03 18:24+08'),
 ('f0000000-0000-4000-8000-000000000033','e0000000-0000-4000-8000-000000000048','c0000000-0000-4000-8000-000000000031','volunteer','accepted','2025-10-03 18:33+08'),
 ('f0000000-0000-4000-8000-000000000034','e0000000-0000-4000-8000-000000000049','c0000000-0000-4000-8000-000000000030','volunteer','accepted','2025-10-03 18:35+08'),
 ('f0000000-0000-4000-8000-000000000035','e0000000-0000-4000-8000-000000000049','c0000000-0000-4000-8000-000000000029','volunteer','accepted','2025-10-03 18:41+08'),
 ('f0000000-0000-4000-8000-000000000036','e0000000-0000-4000-8000-000000000049','c0000000-0000-4000-8000-000000000028','volunteer','accepted','2025-10-03 18:52+08'),
 ('f0000000-0000-4000-8000-000000000037','e0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000031','volunteer','accepted','2025-10-03 16:50+08'),
 ('f0000000-0000-4000-8000-000000000038','e0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000028','volunteer','accepted','2025-10-03 17:02+08'),
 ('f0000000-0000-4000-8000-000000000039','e0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000030','volunteer','accepted','2025-10-03 17:15+08'),
 ('f0000000-0000-4000-8000-000000000040','e0000000-0000-4000-8000-000000000051','c0000000-0000-4000-8000-000000000030','volunteer','accepted','2025-10-03 16:55+08'),
 ('f0000000-0000-4000-8000-000000000041','e0000000-0000-4000-8000-000000000051','c0000000-0000-4000-8000-000000000028','volunteer','accepted','2025-10-03 17:05+08'),
 ('f0000000-0000-4000-8000-000000000042','e0000000-0000-4000-8000-000000000051','c0000000-0000-4000-8000-000000000031','volunteer','accepted','2025-10-03 17:20+08'),
 ('f0000000-0000-4000-8000-000000000043','e0000000-0000-4000-8000-000000000051','c0000000-0000-4000-8000-000000000029','volunteer','accepted','2025-10-03 17:31+08'),
 -- avol01 的單
 ('f0000000-0000-4000-8000-000000000044','e0000000-0000-4000-8000-000000000060','c0000000-0000-4000-8000-000000000002','volunteer','accepted','2024-07-25 9:10+08'),  -- avol02:(b) 搬運 2/2 湊滿,可以釋出,釋出後重開
 ('f0000000-0000-4000-8000-000000000045','e0000000-0000-4000-8000-000000000060','c0000000-0000-4000-8000-000000000006','volunteer','accepted','2024-07-25 9:32+08'),
 ('f0000000-0000-4000-8000-000000000046','e0000000-0000-4000-8000-000000000061','c0000000-0000-4000-8000-000000000011','volunteer','accepted','2024-07-25 9:15+08'),
 ('f0000000-0000-4000-8000-000000000047','e0000000-0000-4000-8000-000000000062','c0000000-0000-4000-8000-000000000013','volunteer','accepted','2024-07-25 9:30+08'),
 ('f0000000-0000-4000-8000-000000000048','e0000000-0000-4000-8000-000000000063','c0000000-0000-4000-8000-000000000014','volunteer','accepted','2024-07-25 9:45+08'),
 ('f0000000-0000-4000-8000-000000000049','e0000000-0000-4000-8000-000000000063','c0000000-0000-4000-8000-000000000015','volunteer','accepted','2024-07-25 10:02+08'),
 ('f0000000-0000-4000-8000-000000000050','e0000000-0000-4000-8000-000000000066','c0000000-0000-4000-8000-000000000017','volunteer','accepted','2024-07-25 10:20+08'),
 ('f0000000-0000-4000-8000-000000000051','e0000000-0000-4000-8000-000000000067','c0000000-0000-4000-8000-000000000002','volunteer','accepted','2024-07-25 10:25+08'),  -- avol02:(e) 這筆後來被刪除;紀錄保留,我承接的不列
 ('f0000000-0000-4000-8000-000000000052','e0000000-0000-4000-8000-000000000068','c0000000-0000-4000-8000-000000000002','volunteer','accepted','2024-07-25 10:40+08'),  -- avol02:(f) 停止招募,名單已固定,不能釋出
 ('f0000000-0000-4000-8000-000000000053','e0000000-0000-4000-8000-000000000068','c0000000-0000-4000-8000-000000000009','volunteer','accepted','2024-07-25 11:05+08');

-- 6. WORK ZONES — 每個情境一個,官方帳號劃設(work_zones.created_by),涵蓋該情境站點/tickets 座標範圍。
-- geometry 欄位是 Geometry("MULTIPOLYGON", srid=4326)(見 app/models/team.py),故用 ST_Multi 包住
-- ST_MakeEnvelope 產生的 polygon,型別才吃得下。
INSERT INTO work_zones (uuid, name, geometry, created_by) VALUES
 ('20000000-0000-4000-8000-000000000001','花蓮光復救災範圍',
  ST_Multi(ST_MakeEnvelope(121.35,23.48,121.47,23.76,4326)),'c0000000-0000-4000-8000-000000000025'),
 ('20000000-0000-4000-8000-000000000002','宜蘭冬山救災範圍',
  ST_Multi(ST_MakeEnvelope(121.70,24.60,121.82,24.76,4326)),'c0000000-0000-4000-8000-000000000037');

-- 7. TEAM ZONE ASSIGN — 每個情境的 zone 委派給一個同情境 NGO team;assigned_by 是劃設該 zone 的官方帳號
-- (與 app/services/work_zone.py 的真實服務層行為一致)。
INSERT INTO team_zone_assign (uuid, team_uuid, zone_uuid, assigned_by) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000025'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000008',
  '20000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000037');

-- 8. 災害類型(功能 018:disaster_types 陣列,參照 disaster_types.key):光復是土石流,冬山是水災。
UPDATE tickets SET disaster_types = ARRAY['landslide']
 WHERE uuid::text LIKE 'd0000000-%'
   AND (right(uuid::text,12)::bigint <= 30 OR right(uuid::text,12)::bigint >= 39);
UPDATE tickets SET disaster_types = ARRAY['flood']
 WHERE uuid::text LIKE 'd0000000-%' AND right(uuid::text,12)::bigint BETWEEN 31 AND 38;

-- 9. 角色申請(功能 019):一筆審核中、一筆未通過附回覆,讓抽屜的兩種卡片一登入就看得到。
--    兩個帳號都只有 user 身分;一個人同時只能有一筆審核中。審核人填資料庫裡現有的 super admin,
--    沒有就留空(前台卡片只顯示回覆)。
INSERT INTO role_requests (uuid, requested_role, reason, contact, status, created_by, created_at, updated_at) VALUES
 ('60000000-0000-4000-8000-000000000001','government',
  '我是光復鄉公所約聘的災防人員，負責整理各村回報的災情和物資需求。希望有後台權限，幫忙更新站點資料、合併重複的任務單。',
  '光復鄉公所災防課 03-870-1234 分機 215','pending','c0000000-0000-4000-8000-000000000004',
  now() - interval '1 day', now() - interval '1 day');
INSERT INTO role_requests (uuid, requested_role, reason, contact, status, review_note, reviewed_by, closed_at, created_by, created_at, updated_at)
SELECT '60000000-0000-4000-8000-000000000002','ngo',
       '我是光復鄉社區關懷協會的志工幹部，想在後台協助管理收容點的物資需求，並把志工排班和任務單對起來。',
       NULL,'rejected','請附上單位證明後再申請。',
       (SELECT ura.user_uuid FROM user_role_assign ura JOIN roles r ON r.uuid = ura.role_uuid
         WHERE r.name = 'super_admin' AND r.kind = 'platform' ORDER BY ura.user_uuid LIMIT 1),
       now() - interval '2 days','c0000000-0000-4000-8000-000000000005',
       now() - interval '3 days', now() - interval '2 days';

-- 10. 狀態照規則推導,跟網站做的一樣。
-- 需求:承接人數到了 quantity 就是湊滿(services/ticket.py 的 assign_task_actor),
--      completed_at 是最後一位承接的時間。
--      停止招募、刪除的在 4b 已經寫好,不動。
UPDATE ticket_tasks t
   SET status = 'fulfilled',
       completed_at = (SELECT max(a.assigned_at) FROM task_assignments a WHERE a.task_uuid = t.uuid),
       updated_at = (SELECT max(a.assigned_at) FROM task_assignments a WHERE a.task_uuid = t.uuid)
 WHERE t.uuid::text LIKE 'e0000000-%'
   AND t.status = 'pending'
   AND t.delete_at IS NULL
   AND t.quantity IS NOT NULL
   AND (SELECT count(*) FROM task_assignments a WHERE a.task_uuid = t.uuid) >= t.quantity;
-- 單(app/services/ticket_status.py):被刪的 cancelled;沒有開著的需求 completed;
-- 開著而且有人接任何一筆 in_progress;其餘 pending。
UPDATE tickets t
   SET status = CASE
         WHEN g.delete_at IS NOT NULL THEN 'cancelled'
         WHEN NOT EXISTS (SELECT 1 FROM ticket_tasks k
                           WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL
                             AND k.status IN ('pending', 'in_progress')) THEN 'completed'
         WHEN EXISTS (SELECT 1 FROM task_assignments a JOIN ticket_tasks k ON k.uuid = a.task_uuid
                       WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL) THEN 'in_progress'
         ELSE 'pending'
       END
  FROM base_geometries g
 WHERE g.uuid = t.uuid AND t.uuid::text LIKE 'd0000000-%';

-- 11. 檢查 — 任何一條不符合就報錯,整個 transaction 回滾,壞資料不會寫進去。
DO $$
DECLARE
  bad text;
BEGIN
  SELECT uuid::text INTO bad FROM ticket_tasks
   WHERE uuid::text LIKE 'e0000000-%' AND status NOT IN ('pending', 'fulfilled', 'canceled') LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: need % is not pending, fulfilled or canceled (ADR-293)', bad;
  END IF;

  SELECT uuid::text INTO bad FROM tickets
   WHERE uuid::text LIKE 'd0000000-%' AND status NOT IN ('pending', 'in_progress', 'completed', 'cancelled')
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: ticket % has a status the site does not use', bad;
  END IF;

  SELECT t.uuid::text INTO bad FROM ticket_tasks t
   WHERE t.uuid::text LIKE 'e0000000-%' AND t.quantity IS NOT NULL
     AND (SELECT count(*) FROM task_assignments a WHERE a.task_uuid = t.uuid) > t.quantity
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: need % has more people than its quantity (ADR-291)', bad;
  END IF;

  SELECT t.uuid::text INTO bad FROM ticket_tasks t
   WHERE t.uuid::text LIKE 'e0000000-%' AND t.status = 'pending' AND t.quantity IS NOT NULL
     AND (SELECT count(*) FROM task_assignments a WHERE a.task_uuid = t.uuid) >= t.quantity
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: need % is full but still pending (ADR-291)', bad;
  END IF;

  -- 湊滿的:人數=quantity;停止招募的也一樣(quantity 改成了當下人數)。兩種都要有 completed_at。
  SELECT t.uuid::text INTO bad FROM ticket_tasks t
   WHERE t.uuid::text LIKE 'e0000000-%' AND t.status = 'fulfilled'
     AND (t.completed_at IS NULL OR t.quantity IS NULL
          OR (SELECT count(*) FROM task_assignments a WHERE a.task_uuid = t.uuid) <> t.quantity)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: fulfilled need % is neither full nor stopped at its headcount', bad;
  END IF;

  SELECT uuid::text INTO bad FROM ticket_tasks
   WHERE uuid::text LIKE 'e0000000-%' AND recruiting_stopped_at IS NOT NULL AND status <> 'fulfilled'
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: need % stopped recruiting but is not fulfilled (ADR-292)', bad;
  END IF;

  -- 取消就是刪除:canceled 一定有 delete_at,刪掉的一定是 canceled、canceled_at=delete_at。
  SELECT uuid::text INTO bad FROM ticket_tasks
   WHERE uuid::text LIKE 'e0000000-%'
     AND ((status = 'canceled') <> (delete_at IS NOT NULL)
          OR (delete_at IS NOT NULL AND (canceled_at IS DISTINCT FROM delete_at OR completed_at IS NOT NULL)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: need % is canceled without being deleted, or deleted the wrong way', bad;
  END IF;

  SELECT t.uuid::text INTO bad FROM tickets t JOIN base_geometries g ON g.uuid = t.uuid
   WHERE t.uuid::text LIKE 'd0000000-%'
     AND ((t.status = 'cancelled') <> (g.delete_at IS NOT NULL)
          OR (g.delete_at IS NOT NULL
              AND EXISTS (SELECT 1 FROM ticket_tasks k WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: ticket % is cancelled without being deleted, or deleted with needs left', bad;
  END IF;

  SELECT t.uuid::text INTO bad FROM tickets t JOIN base_geometries g ON g.uuid = t.uuid
   WHERE t.uuid::text LIKE 'd0000000-%' AND g.delete_at IS NULL
     AND t.status <> CASE
           WHEN NOT EXISTS (SELECT 1 FROM ticket_tasks k
                             WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL
                               AND k.status IN ('pending', 'in_progress')) THEN 'completed'
           WHEN EXISTS (SELECT 1 FROM task_assignments a JOIN ticket_tasks k ON k.uuid = a.task_uuid
                         WHERE k.ticket_uuid = t.uuid AND k.delete_at IS NULL) THEN 'in_progress'
           ELSE 'pending'
         END
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: ticket % does not have the status its needs give it', bad;
  END IF;

  SELECT uuid::text INTO bad FROM task_assignments
   WHERE uuid::text LIKE 'f0000000-%' AND status <> 'accepted' LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: assignment % is not accepted, the only status the site writes', bad;
  END IF;

  SELECT ref_uuid::text INTO bad FROM photos
   WHERE ref_uuid::text LIKE 'd0000000-%' GROUP BY ref_uuid HAVING count(*) > 10 LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: ticket % has more than 10 photos', bad;
  END IF;

  SELECT uuid::text INTO bad FROM photos
   WHERE uuid::text LIKE '50000000-%' AND (btrim(url) !~ '^https://[^/]+' OR char_length(url) > 500)
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'mock seed: photo % is not an https link of at most 500 characters', bad;
  END IF;
END $$;

COMMIT;
