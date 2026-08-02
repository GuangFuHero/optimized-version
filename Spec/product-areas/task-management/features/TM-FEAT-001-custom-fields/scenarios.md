# TM-FEAT-001 情境 · Scenarios

**這不是規格。** 產品行為以 [`spec.md`](./spec.md) 為準，已批准的決策以 [`../../decisions.md`](../../decisions.md) 為準。本檔記錄的是產出那些決策的真實情境，供 UX、開發、產品與業務理解「為什麼是這樣」。情境與規格不一致時，規格為準。

**This is not a specification.** [`spec.md`](./spec.md) defines product behavior and [`../../decisions.md`](../../decisions.md) records approved decisions. This file keeps the real-world situations those decisions came from, so design, engineering, product, and field training can see why the rules take the shape they do. Where a scenario and the specification disagree, the specification wins.

每個情境結尾標出它產出的決策與驗收條件。決策改動時，用該 ID 搜尋本檔即可找出需要一併更新的情境。

Each scenario ends with the decisions and acceptance criteria it produced. When a decision changes, search this file for its ID to find the scenarios that need updating with it.

---

### S-01 · 改名之後那 200 筆值
**Renaming a field that already holds values**

超管把搜救單的「受困人數」改名為「受困人數（含兒童）」，因為現場回報時常漏算嬰幼兒。這個欄位已經收了 200 筆值。如果改名等於換一個新欄位，那 200 筆會留在舊名字底下，統計時得知道有兩個欄位、還要自己加總；三個月後沒有人記得這件事。

A Super Admin renames "trapped people" to "trapped people (including children)" on the rescue form, because field reports keep missing infants. The field already holds 200 values. If a rename creates a different field, those 200 stay under the old name, reporting has to know about both, and three months later nobody remembers.

**→ D17 · AC-07 · TM-CF-109**

---

### S-02 · 物資也要知道扛到幾樓
**The same detail matters to more than one kind of work**

「樓層」原本只在搜救單上。超管發現物資配送也需要——扛水上五樓跟放在門口是兩回事。他打開物資類別要加欄位。若欄位綁死在單一類別，他只能再建一個也叫「樓層」的格子，兩個同名欄位從此各走各的，報表撈不到一起。但兩張表單的要求不同：搜救的樓層必填（消防隊沒有樓層不知道上幾樓），物資的樓層選填（放大樓門口也能交差）。

"Floor" started on the rescue form only. Supply delivery needs it too — carrying water to the fifth floor is not the same job as leaving it at the door. If a field belongs to exactly one category, the only option is a second field also called "floor", and the two never reconcile in reporting. But the two forms need different obligations: rescue must have it, supply can do without.

**→ D18 · AC-06 · TM-CF-110**

---

### S-03 · 阿嬤講不出幾個人
**The caller cannot answer the required field**

半夜，阿嬤打電話進來，話務志工代填任務單。阿嬤只知道「樓上還有人」，講不出幾個。「受困人數」是必填。如果存檔被擋，這通電話的資訊就一個字都留不下來——地址、聯絡方式、有人受困，全部消失。

A grandmother calls at night and a phone volunteer fills the form for her. She knows someone is upstairs but cannot say how many. "Trapped people" is required. If the save is blocked, nothing from that call survives — not the address, not the contact, not the fact that someone is trapped.

**→ D20 · AC-09 · TM-CF-106**

---

### S-04 · 半夜加必填欄位，180 張卡死
**A new required field lands on work already finished**

晚上十點，中央要求統計「現場是否有孕婦或行動不便者」。超管在搜救單加了必填欄位「特殊需求人員」。現場有 300 張進行中的任務單，其中 180 張的工作早就結束、隊員已經撤離，回頭問不到。如果新規則立刻對全部生效，這 180 張結不了案，現場的實際反應會是隨便填「無」交差——你拿到 180 筆假資料，比沒有資料更糟。

At 10pm the county asks for a count of pregnant or mobility-impaired people on site. The Super Admin adds a required field. Of the 300 open Tasks, 180 finished their field work hours ago and the teams have left; the answer is no longer obtainable. If the new rule applies to all of them, those 180 cannot be closed, and the field will enter "none" to get past it — 180 false records, worse than none.

**→ D19, D20 · AC-10, AC-11 · TM-CF-111, TM-CF-112**

---

### S-05 · 移除「翻譯」，但 12 張已經選了
**Withdrawing a choice that history depends on**

光復鄉是純土石清理，超管整理「需要技能」下拉選單，想刪掉「翻譯」「消防」「醫療」，加上「水電」。但前三天已經有 12 張任務單選了「翻譯」，其中 3 張還在進行中。如果移除選項會連帶清掉或改寫那些值，災後復盤就對不上；如果因為有人用過就不准移除，選單永遠清不乾淨。

The Guangfu operation is pure debris clearing, so the Super Admin trims the "required skill" list — dropping translation, firefighting, and medical, adding electrical. Twelve Tasks already selected translation and three are still open. Clearing or rewriting those values breaks the after-action record; refusing the removal means the list can never be cleaned up.

**→ D22 · AC-13 · TM-CF-114**

---

### S-06 · 200 筆「三個」「2大1小」加不起來
**A field created with the wrong type**

超管圖快，把「受困人數」建成文字欄位。三天下來收到的是「3」「三個」「3-5人」「約5」「不確定，至少2」「2大1小」「一家四口」。第三天要跟縣府報統計數字，發現根本加不起來。如果有值之後就不能改型別，唯一的路是停用舊的、建一個新的「受困人數」——正是 D12 要避免的重複。如果改型別時要求逐筆清理，災害現場沒有人有空改 60 筆。

Taking a shortcut, the Super Admin creates "trapped people" as a text field. Three days of entries read "3", "three", "3-5 people", "about 5", "not sure, at least 2", "2 adults 1 child", "a family of four". On day three the county wants a number and nothing adds up. Locking the type forces a second field with the same name — the duplication D12 exists to prevent. Requiring row-by-row cleanup asks for time nobody has during a response.

**→ D21 · AC-12 · TM-CF-113**

---

### S-07 · 阿明在山上填了 20 分鐘
**A form open while the configuration changes underneath it**

志工阿明在光復鄉山上，收訊斷斷續續。他打開一張搜救任務單填了 20 分鐘，「危害備註」寫了整段：「三樓陽台鋼筋外露，二樓樓梯有塌陷，需要兩人以上進入」。同一時間，超管在辦公室把「危害備註」停用了，理由是覺得沒人在填、表單太長。阿明按下存檔。這段資訊是下一梯隊員的安全依據。

Volunteer A-Ming is on a hillside with intermittent signal. He spends 20 minutes on a rescue form and writes a full paragraph into "hazard note": exposed rebar on the third-floor balcony, a collapsed section of stairs on the second, do not enter alone. Meanwhile the Super Admin deactivates that field from the office, reasoning that nobody fills it and the form is too long. A-Ming saves. That paragraph is the next team's safety brief.

**→ D19 · AC-11 · TM-CF-112**

---

### S-08 · 停用三天後又要用
**Reactivating a field that was required before**

第三天超管覺得搜救單太長，把「特殊需求人員」停用了，它當時是必填。第六天縣府要求統計行動不便者，他重新啟用。如果啟用後預設變成選填，他很可能沒注意到，結果資料又是缺的——而他重新啟用這個欄位的唯一理由就是要拿到這筆資料。

On day three the Super Admin shortens the rescue form by deactivating "special-needs occupants", which was required at the time. On day six the county asks for mobility-impaired counts and he turns it back on. If reactivation silently returns it as optional, he is unlikely to notice, and the data stays missing — which defeats the only reason he switched it back on.

**→ D23 · AC-14 · TM-CF-107**

---

### S-09 · 凌晨兩點點錯災害
**A group applied by mistake under time pressure**

凌晨兩點，超管點了「加開水災」，一次帶進 4 個欄位：救援的積水深度與是否斷電、人力的需要抽水機、物資的需要沙包。點完才發現花蓮這次是地震引發的土石流，不是水災。如果套用不可逆，他得一個一個停用，而停用的欄位還會永遠躺在設定畫面最下面標著〔水災組〕〔已停用〕。但如果三天後、已經有人填了資料才撤銷，現場表單會突然少四格，而那些值的去向也沒有人講得清楚。

At 2am the Super Admin applies the flood group, pulling in four fields at once. Only afterwards does he realise this event is an earthquake-triggered landslide, not a flood. If the application cannot be undone he must deactivate each one, and they stay parked at the bottom of the configuration screen forever. But reverting three days later, after people have entered data, would strip four fields off live forms with no clear account of where those values went.

**→ D25 · AC-03 · TM-CF-116**

---

### S-10 · 阿華下山之後才發現少一格
**The person who can answer has already left**

下午三點超管新增了「特殊需求人員」。志工阿華三點半建了一張新任務單，沒注意到表單上多了一格，現場處理完就收工回家。晚上十點協調者要結案，被擋住：「特殊需求人員 未填」。協調者不在現場，阿華在家裡，那戶人家有沒有孕婦現在問不到了。需要知道「現在多收一項資訊」的是**現場填單的人**，不是被擋住的協調者。

The field is added at 3pm. Volunteer A-Hua creates a Task at 3:30 without noticing the extra box, finishes on site, and goes home. At 10pm a coordinator tries to close it and is blocked on the empty field. The coordinator was never on site and A-Hua is at home; whether that household had a pregnant occupant is no longer answerable. The person who needed to know about the change was the one filling the form, not the one blocked by it.

**→ D28 · AC-16 · TM-CF-118**

---

### S-11 · 兩個超管同時在改
**Two administrators editing from screens loaded minutes apart**

十點整，縣府的超管 A 和前進指揮所的超管 B 各自打開設定畫面，兩人看到的都是 6 個欄位。十點零三分，B 新增了「土石淤積深度」。十點零五分，A 的畫面還停在 6 個，他把「樓層」拖到最上面按儲存。如果儲存的意思是「把我畫面上這份完整清單寫回去」，B 剛加的第 7 個就被洗掉了，而且兩個人都不會知道。

At 10:00 two Super Admins — one at the county office, one at the forward command post — each open the configuration and see six fields. At 10:03 one adds a new field. At 10:05 the other, still looking at six, drags "floor" to the top and saves. If saving means writing back the whole list as it appears on screen, the new field disappears and neither of them finds out.

**→ D27 · AC-15 · TM-CF-117**

---

### S-12 · 18 個格子，下雨，戴手套
**A long form in the conditions it is actually used in**

光復鄉同時開了地震和土石流兩個欄位組，加上超管手動加的三個，搜救單有 18 個格子。志工在山上，手機一屏看得到 5～6 格，要滑三四屏才到底，下雨，戴手套，訊號不穩。結案時擋的是必填欄位，所以現場最該先填完的就是那幾格；如果它們散在 18 格中間，人會滑到一半放棄。但把選填全部收合起來，就等於宣告那些欄位不會有人填。

Two disaster groups plus three manual additions bring the rescue form to 18 fields. The volunteer is on a hillside, six fields fit on screen, it is raining, he is wearing gloves, and the signal drops. Closure depends on the required fields, so those are what must be reachable first; scattered through 18 boxes, people give up halfway. But collapsing every optional field out of sight is a decision that they will not be filled.

**→ D28 · AC-16 · TM-CF-118**

---

### S-13 · 醫療任務單一個格子都沒有
**A category that ships with nothing**

搜救、人力、物資出廠時都帶了預設欄位，醫療沒有。（種子資料裡確實有一組 medical 欄位，但那是「醫療站」的站點欄位，跟醫療任務單是兩張表。）如果系統因為某個類別沒有設定欄位就把它隱藏或停用，醫療任務就變成建不了；但每個欄位都是某人在某個時點加上去的，空類別其實是所有類別的起始狀態，不是缺陷。

Rescue, human resources, and supply all ship with a starting set of fields. Medical does not. (The seed data does contain medical fields, but those belong to medical *stations* — a different table from medical *Tasks*.) If the system hid or disabled a category for having no configured fields, medical Tasks could not be created at all; yet every field was added by someone at some point, so an empty category is where every category begins rather than a defect.

**→ D29 · AC-17 · TM-CF-119**

---

### S-14 · 第一個到現場的人不會檢傷
**The first person on scene has no triage training**

醫療類別最初的設計是四個檢傷分級人數：紅、黃、綠、黑。這是大量傷患事故的國際標準，派遣看一眼就知道要派幾台車、哪種等級。

問題是**誰在填這張單**。第一個發現的通常是隔壁鄰居、路過的志工、來送物資的人，不是救護技術員。綠黃紅黑是跑完一套判斷流程之後的**結論**，把結論當成欄位，等於要求回報者先受過訓練。實際會發生兩件事，都很糟：他亂猜，你拿到看起來精確但不可信的分級，而且它會直接驅動派遣；或者他不敢填，任務單卡住，甚至乾脆不回報。

但那套流程的**輸入**不需要訓練——能不能自己走、有沒有呼吸、叫不叫得醒，任何人都看得出來，而受過訓練的人從這三個答案就推得出分級。所以問題從「他是紅還是黃」改成「最嚴重的那個人現在什麼狀況」，並且一定要有「不確定」這個選項：如果選項只有臨床狀態，答不出來的人就會猜，而「未知」跟「錯的分級」對派遣的意義完全不同。

The medical category was first designed around four triage counts — immediate, delayed, minor, expectant. That is the international standard for mass-casualty incidents, and dispatch can read it at a glance.

The problem is who fills the form. The first person there is usually a neighbour, a passing volunteer, someone dropping off supplies — not a paramedic. The four colours are the *conclusion* of an assessment procedure, so making them fields requires the reporter to have been trained. Two things follow, both bad: they guess, and dispatch acts on a precise-looking classification that is not true; or they do not dare answer, and the report stalls or never happens.

The *inputs* to that procedure need no training at all — can they walk, are they breathing, can they be roused. Anyone can see those, and a trained reader recovers the classification from them. So the question changed from "is this one red or yellow" to "what is the worst affected person doing right now", with "not sure" always on the list: if every choice is a clinical state, someone who cannot answer will guess, and an unknown means something entirely different to dispatch than a wrong classification.

**→ D30 · AC-18 · TM-CF-120**

---

### S-15 · 救護員沒有手可以填表單
**A crew working a casualty has no hands for a form**

把分級人數降為選填、留給到場的專業人員補，聽起來安全——不用的話零成本。但實際上救護人員到場後正在處理傷患，沒有人會停下來開網站填檢傷分類；他們用無線電。所以那四格會永遠是空的，只是讓表單變長。

真正的問題不是「要不要留欄位」，而是「專業評估到底怎麼進到系統裡」——可能是後方接收無線電的人代輸，可能根本不該用同一張任務單，可能需要完全不同的權限與介面。這個場景還沒想清楚，所以不是把欄位設成選填就算解決，而是獨立成 `TM-FEAT-007` 重新想。

Keeping the triage counts as optional fields for professionals to fill in later sounds safe — free if unused. In practice a crew that has reached a casualty is working on them; nobody stops to open a website and enter a triage breakdown. They use the radio. Those four boxes would stay empty forever and only make the form longer.

The real question is not whether to keep the fields but how a professional assessment reaches the system at all — possibly typed by whoever is receiving the radio traffic, possibly not on this Task at all, possibly needing a different interface and a different permission. That is unresolved, so making the fields optional does not settle it. It moves to `TM-FEAT-007` to be thought through properly.

**→ D30 · TM-FEAT-007**
