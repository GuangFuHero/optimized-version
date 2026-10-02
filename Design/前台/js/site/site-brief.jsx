/* site-brief.jsx — 前台「志工行前資訊」閱覽頁（VB-FEAT-001）
 *
 * 讀者：**還沒出發、對現場一無所知的人**，多半在火車上用手機看。
 *   這與資源站點早就確立的原則是同一個（CLAUDE.md 2026-08-11 第 7 節）：
 *   「地圖資訊的主要讀者是遠方還沒去過現場的人；現場的人已經很熟，反而不需要。」
 *   所以這一頁的版面是**單欄、字大、可以一直往下滑**，不是儀表板。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔒 2026-09-07 裁示：**前台只有一份，沒有災害類型切換。**
 *
 *    Sucre：「前台就只需要一個資訊，而不是民眾要自己切換風災跟水災。」
 *
 *    災害類型是**維護端**的分類，不是讀者的問題。志工打開這一頁想知道的是
 *    「我要帶什麼」，不是「我這場算水災還是風災」——
 *    要他先做一次分類判斷才看得到內容，等於把後台的工作推給他。
 *
 *    因此本檔**沒有**：頁籤、類型切換、`#/brief/<type>` 路由。
 *    災害類型只剩一個**不可點的小標記**，用途是說明這份是針對什麼寫的（裁示同日）。
 *
 *    ⚠️ 不要「順便」把切換加回來。要加回來得先推翻上面那句裁示，
 *       而且資料層也不允許 —— `vbPublicCurrent()` 只回傳一筆。
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔒 2026-09-19 加了三件事，共同的設計原則是
 *    **結構從內容的形狀推導，不新增欄位**：
 *      · 「建議攜帶裝備」段的 `<li>` → 可勾的一列（只存本地）
 *      · 任何段的 `<h3>`            → 段內錨點（取代「交通分頁」）
 *      · 整篇                      → 可列印（不做 PDF 產生器）
 *    後台不用學新東西：寫 li 就有框、寫 h3 就有錨點。
 *
 * 🔒 資料只從 `vbPublicCurrent()` 來。那支讀不到草稿 ——
 *    表 23「前臺顯示的永遠是已審閱過的版本」在這裡是靠「沒有別條路徑」保證的，
 *    不是靠這一頁自己記得要過濾。**不要在這裡直接呼叫 vbRead()。**
 */
(function () {
  const { useState, useEffect } = React;
  const { Card, Badge, Button } = window.WanGuardDesignSystem_9c8f68;
  const Icon = window.WGIcon;

  function EmptyState() {
    return (
      <Card padding="var(--space-8)" style={{ display: "flex", flexDirection: "column", alignItems: "center",
        gap: 12, textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
        <Icon n="BookOpen" s={38} c="var(--color-fg-neutral-muted)" />
        <div style={{ font: "var(--font-heading-700)", fontSize: 18, color: "var(--color-fg-neutral-subtle)" }}>
          目前還沒有發布行前資訊
        </div>
        <div className="wg-caption" style={{ color: "var(--color-fg-neutral-muted)", lineHeight: 1.8 }}>
          協調單位還在整理。出發前請先看地圖上的任務與站點，
          或直接聯繫你要前往的團隊確認交通與裝備。
        </div>
        <Button variant="secondary" onClick={() => { window.location.href = encodeURI("前台地圖 Site Map.html") + "#/map"; }}>
          回到地圖
        </Button>
      </Card>
    );
  }

  function SiteBriefingView() {
    const [current, setCurrent] = useState(() => (window.vbPublicCurrent ? window.vbPublicCurrent() : null));
    // 🔒 勾選狀態的**單一來源**：進度列與文章吃同一份。
    //    （分開各讀一次 localStorage 會讓進度不同步，而且會互相吃掉「已重置」的提示。）
    // 2026-09-20：整份只有一塊內容；可勾項目由作者標記，可能落在任何地方。
    const checklist = window.useBriefChecklist((current && current.content) || "");

    // 後台一發布，這一頁就跟著換（原型靠 localStorage 事件；正式版是重新取資料）。
    // 換掉的可能是內容，也可能是**整份被另一種災害取代** —— 對這一頁都一樣，重讀就是了。
    useEffect(() => {
      if (!window.vbSubscribe) return;
      return window.vbSubscribe(() => setCurrent(window.vbPublicCurrent()));
    }, []);

    return (
      <div style={{ height: "100%", overflowY: "auto", background: "var(--color-bg-neutral-subtle)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "var(--space-6) var(--space-4) 64px",
          display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

          <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ margin: 0, font: "var(--font-heading-800)", fontSize: 26, lineHeight: 1.3,
              color: "var(--color-fg-neutral-default)" }}>志工行前資訊</h1>
            <p style={{ margin: 0, font: "var(--font-body-400)", lineHeight: 1.8, color: "var(--color-fg-neutral-subtle)" }}>
              出發前先看這一頁：怎麼參與、怎麼過來、帶什麼、到了要注意什麼。
              由協調單位維護，<strong>不是志工群組裡的轉傳訊息</strong>。
            </p>
          </header>

          {!current ? <EmptyState /> : (
            <React.Fragment>
              {/* 打包進度 ＋ 全部清除 ＋ 列印。放在文章**上面** ——
                  志工回到這一頁多半是要繼續打包，先看到「還剩幾項」比較有用。 */}
              <window.ChecklistTools checklist={checklist} at={current.at} version={current.version} />

              <Card padding="var(--space-6)" data-vb-article="briefing" data-vb-print-source
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

                {/* 2026-09-14 裁示：**災害類型標記也拿掉了。**
                    上一版（09-07）留了一個「水災」小標記當上下文。這一版連它一起移除 ——
                    裁示定了「建立後不保留這份是從哪個範本來的」，系統根本不知道類型是什麼。
                    而且那個標記留著會慢慢變成謊言：內容改到面目全非之後沒人記得回頭改它。
                    志工要的上下文是「哪一場災害」，那個側邊欄的事件名已經在講了。 */}

                {/* 更新時間放在內容**前面**：志工要先知道這份新不新，
                    才決定要不要照著它打包。放在文末等於沒放。 */}
                <window.BriefingStamp at={current.at} version={current.version} />

                <div style={{ height: 1, background: "var(--color-border-default)" }} />

                {/* changed／at：只標「這一次發布真的動到的 h2 區塊」，且 72 小時內。
                    2026-09-06 裁示以此取代更新通知 —— 回頭看的人一眼知道哪裡變了，
                    而通知只能告訴他「有東西變了」。 */}
                {/* checkable：**只有前台可以勾**。後台預覽看得到框（那是志工看到的樣子），
                    但不可勾也不寫入 —— 協調者在預覽裡勾一勾，不該變成他手機上的打包進度。 */}
                <window.BriefingArticle content={current.content}
                  changed={current.changed} at={current.at} checklist={checklist} />
              </Card>

              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px",
                borderRadius: "var(--radius-md)", background: "var(--color-bg-neutral-default)",
                boxShadow: "inset 0 0 0 1px var(--color-border-default)" }}>
                <Icon n="Info" s={16} c="var(--color-fg-neutral-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span className="wg-caption" style={{ color: "var(--color-fg-neutral-subtle)", lineHeight: 1.8 }}>
                  現場狀況變動很快。出發前後都建議再看一次這一頁，
                  以及地圖上的<a href={encodeURI("前台地圖 Site Map.html") + "#/map"}>資源站點與任務</a>。
                  緊急情況以頁面最上方的紅色<strong>緊急公告</strong>為準。
                </span>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    );
  }

  Object.assign(window, { SiteBriefingView });
})();
