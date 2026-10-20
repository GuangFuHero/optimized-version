import { Box } from '@mui/material';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Markdown } from './index';

const meta = {
  title: 'Components/Markdown',
  component: Markdown,
  args: {
    source: `## 如何參與

災區人力需求每天不同，**出發前先確認今天還缺不缺人**，不要直接前往。

1. 在本平台的地圖或列表找一筆需求，按「接任務」
2. 抵達後**一律先到報到處**，不要直接進災戶
3. 報到後由各隊帶隊，請跟著自己的隊伍行動
4. 身體不適請及早到醫療站，不要撐
5. 離開前把髒污衣物袋裝丟棄，不要帶回住處

現場聯絡窗口：大進國小報到處（08:00–17:00）

## 交通資訊

台鐵光復站下車，站前有志工接駁點，班距約 20 分鐘，直達大進國小報到處。

- 自行開車：台 9 線南下轉大進街，**大進街以南管制，範圍今日擴大到中正路口**，請停在糖廠停車場再步行。
- **出發前就先訂好回程車票。**末班接駁 17:30，錯過只能自行叫車，而當地叫不到車。

## 建議攜帶裝備

### 衣物與防護

- [ ] 長袖、長褲\\
  較佳 — 快乾透氣材質（聚酯纖維、運動布料）、深色耐髒\\
  避免 — 牛仔褲、厚棉衣物、白色淺色衣物
- [ ] 厚襪子\\
  避免雨鞋磨破腳
- [ ] 帽子
- [ ] 口罩\\
  較佳 — 外科手術口罩，退水後揚塵嚴重
- [ ] 防蚊液\\
  較佳 — 可防小黑蚊、含派卡瑞丁成分者
- [ ] 乾淨的替換衣物與鞋子\\
  回程換用，裝防水袋

### 鞋具與手部

- [ ] 長筒雨鞋\\
  較佳 — 綁帶款，無綁帶者建議高度過小腿\\
  泥可能深及膝，避免被吸住或進水
- [ ] 鐵鞋墊\\
  防踩到釘子與碎玻璃
- [ ] 防滑手套、輪胎手套
- [ ] 乳膠手套\\
  戴在裡層，隔絕污水

### 醫療與藥品

- [ ] 個人常用藥
- [ ] 酒精（消毒用）
- [ ] 簡易急救包

### 食物與補給

- [ ] 飲用水\\
  2 公升以上，現場的水不一定能喝
- [ ] 簡易乾糧、零食
- [ ] 鹽糖或電解質補給品
- [ ] 環保餐具

### 清淤工具

- [ ] 方鏟
- [ ] 耙子
- [ ] 鐵畚箕、小水桶
- [ ] 大塑膠袋、垃圾袋

### 其他

- [ ] 行動電源與充電線
- [ ] 頭燈\\
  天黑得比想像快
- [ ] 透明防水袋、夾鏈袋
- [ ] 記得剪指甲

## 行前注意事項

- **安全第一：**上游堰塞湖仍有潰堤風險，聽到警報立刻依指示撤離。
- **結伴同行：**不要單獨行動，尤其進入結構受損的建物。
- **保持聯繫：**手機保持電量，與隊伍約好集合時間與地點。
- **飲水：**消防車運送的民生用水**僅供清潔，不可飲用**。
- **身心調適：**現場景象與體力消耗都超乎預期，量力而為，累了就休息。
- **保險：**請於報到時確認，未投保者不得進入結構受損建物。`,
  },
  decorators: [
    (Story) => (
      <Box
        sx={{
          width: '100%',
          maxWidth: 720,
          p: { xs: '20px', sm: '28px' },
        }}
      >
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Briefing: Story = { args: { articleId: 'briefing' } };

export const Formatting: Story = {
  args: {
    source: `# Markdown formatting

## Heading with **emphasis** and a [link](https://example.com)

Regular text, *emphasis*, **strong text**, ~~deleted text~~, and inline \`code\`.

### Nested lists

- Main item
  - Nested item
  - Another nested item
- Another main item

### Table

| Item | Quantity | Note |
| :--- | ---: | :---: |
| Water | 2 | Bring your own |
| Gloves | 1 | Wear a pair |

### Code block

\`\`\`typescript
const ready = true;
\`\`\`

---

An autolink: https://example.com

A footnote reference.[^note]

[^note]: Footnotes stay within the document.

## Repeated heading

First occurrence.

## Repeated heading

Second occurrence gets its own anchor.`,
  },
};

export const Empty: Story = { args: { source: '' } };
