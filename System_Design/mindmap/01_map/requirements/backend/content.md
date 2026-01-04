設計 Station 資料表：id, disaster_id, type, name, status, lat, lng, description, photos, capacity, hours, contact
建立 /stations CRUD API（含權限：只有站點負責人或後台可以改）
加上 Geo Index（依經緯度查附近站點）
支援依 disaster_id 切換不同災難資料
站點 Marker 顯示狀態（顏色區分 active / full / closed）
