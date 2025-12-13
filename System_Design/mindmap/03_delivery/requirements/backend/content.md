DeliveryOrder 資料表：id, disaster_id, type(person/goods), pickup_location, dropoff_location, status, assigned_volunteer
API：建立配送單、列表查詢、接受訂單、更新狀態
基本鎖定機制：同一張單不能被兩位志工同時接（transaction/lock）
未來可與倉庫庫存表整合
