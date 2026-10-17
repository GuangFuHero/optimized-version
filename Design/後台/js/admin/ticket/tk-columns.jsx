// tk-columns.jsx — 動態欄位的解析與排序（純邏輯，無 UI）
// TM-FS-101：欄位順序與「哪些欄位當列表欄位」是同一組全域設定，唯一維護處是欄位設定頁。
//            任務單頁面只讀取並套用，不提供任何欄位控制。
// TM-FS-102 / TM-FS-103：沒有拖曳、沒有上移／下移、沒有個人釘選（無 user-level override）。
(function () {

  // 動態欄位聯集：同名欄位合併，記錄來源災害（用於色點）
  function tkFieldSet(types) {
    const out = [];
    const byKey = {};
    (types || []).forEach((ty) => {
      (window.TK_DISASTER_FIELDS[ty] || []).forEach((f) => {
        if (byKey[f.key]) { byKey[f.key].sources.push(ty); return; }
        byKey[f.key] = { ...f, sources: [ty] };
        out.push(byKey[f.key]);
      });
    });
    return out;
  }

  // 依全域設定排序（TM-FS-101）。沒有個人偏好這一層。
  function tkOrderFields(fields, order) {
    const idx = (k) => { const i = (order || []).indexOf(k); return i < 0 ? 999 : i; };
    return [...fields].sort((a, b) => idx(a.key) - idx(b.key));
  }

  // 停用欄位（TM-FS-107 / TM-FS-112）：欄位只會被停用、不會被刪除。
  // 停用來源＝該欄位所屬的災害類型已從當前事件移除。
  // 回傳全部欄位（含已停用並標記），由呼叫端依「該單有無值」決定怎麼顯示。
  function tkFieldSetAll(actTypes, activeTypes) {
    const all = tkFieldSet((actTypes || []).map((a) => a.key));
    const live = new Set(tkFieldSet(activeTypes).map((f) => f.key));
    return all.map((f) => ({ ...f, disabled: !live.has(f.key) }));
  }

  Object.assign(window, { tkFieldSet, tkFieldSetAll, tkOrderFields });
})();
