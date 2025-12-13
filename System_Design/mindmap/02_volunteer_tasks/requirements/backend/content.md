Task 資料表：id, disaster_id, type, description, photos, location, status, verify_pin, created_at
API：建立任務、查詢列表、依驗證碼修改、志工更新狀態
狀態機制：未處理 → 進行中 → 完成（含權限檢查）
基本濫用防護（同 IP 過度送出時限流）
