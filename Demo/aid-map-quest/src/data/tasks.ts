export type TaskType = 'rescue' | 'medical' | 'supply' | 'fire' | 'building' | 'personnel';
export type Urgency = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'active' | 'completed';

export interface FloorData {
  floor: string;
  count: number;
}

export interface UpdateRecord {
  time: string;
  content: string;
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  description: string;
  urgency: Urgency;
  status: TaskStatus;
  lat: number;
  lng: number;
  hasFloorData: boolean;
  floorData?: FloorData[];
  uploaderName: string;
  unitName: string;
  lastUploadTime: string;
  updateRecords: UpdateRecord[];
  assignedRoles: string[];
  pinned: boolean;
  address?: string;
  images?: string[];
}

export const taskTypeConfig: Record<TaskType, { label: string; emoji: string; color: string; cssVar: string }> = {
  rescue: { label: '搜救', emoji: '🆘', color: 'var(--rescue)', cssVar: '--rescue' },
  medical: { label: '醫療', emoji: '🚑', color: 'var(--medical)', cssVar: '--medical' },
  supply: { label: '物資配送', emoji: '📦', color: 'var(--supply)', cssVar: '--supply' },
  fire: { label: '火災', emoji: '🔥', color: 'var(--fire)', cssVar: '--fire' },
  building: { label: '建築檢查', emoji: '🏚', color: 'var(--building)', cssVar: '--building' },
  personnel: { label: '人員統計', emoji: '👥', color: 'var(--personnel)', cssVar: '--personnel' },
};

export const taskTypeBadgeClass: Record<TaskType, string> = {
  rescue: 'bg-rescue/15 text-rescue border-rescue/30',
  medical: 'bg-medical/15 text-medical border-medical/30',
  supply: 'bg-supply/15 text-supply border-supply/30',
  fire: 'bg-fire/15 text-fire border-fire/30',
  building: 'bg-building/15 text-building border-building/30',
  personnel: 'bg-personnel/15 text-personnel border-personnel/30',
};

export const urgencyConfig: Record<Urgency, { label: string; className: string }> = {
  critical: { label: '極度緊急', className: 'bg-destructive text-destructive-foreground' },
  high: { label: '緊急', className: 'bg-primary text-primary-foreground' },
  medium: { label: '中等', className: 'bg-secondary text-secondary-foreground' },
  low: { label: '一般', className: 'bg-muted text-muted-foreground' },
};

export const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  active: { label: '進行中', className: 'bg-supply/15 text-supply border-supply/30' },
  completed: { label: '已結束', className: 'bg-muted text-muted-foreground border-border' },
};

export const urgencyOptions: { value: Urgency | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'critical', label: '極度緊急' },
  { value: 'high', label: '緊急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '一般' },
];

export const PROJECT_NAME = '台南0206地震救災專案';

const types: TaskType[] = ['rescue', 'medical', 'supply', 'fire', 'building', 'personnel'];
const urgencies: Urgency[] = ['critical', 'high', 'medium', 'low'];

const districts = [
  '永康區', '東區', '南區', '北區', '中西區', '安南區', '安平區', '新營區',
  '歸仁區', '仁德區', '善化區', '新化區', '關廟區', '麻豆區', '學甲區',
  '下營區', '安定區', '新市區', '柳營區', '後壁區', '白河區', '鹽水區',
  '六甲區', '官田區', '大內區', '佳里區', '西港區', '七股區', '將軍區',
  '北門區', '南化區', '楠西區', '玉井區', '左鎮區', '山上區', '龍崎區',
];

const uploaderNames = ['王小明', '李美玲', '陳志偉', '林佳蓉', '張大成', '黃淑芬', '吳建宏', '劉怡君', '蔡明哲', '周雅婷'];
const unitNames = ['台南市消防局', '國軍救災部隊', '紅十字會', '慈濟基金會', '台南市政府', '衛生福利部', '內政部營建署', '台南市警察局', '民間志工團', '國家搜救指揮中心'];
const updateContents = ['更新現場狀況回報', '調整人力配置', '物資已送達', '新增受困人員資訊', '現場照片更新', '協調單位已到場', '狀態變更為進行中', '回報處理進度'];

const streetNames = ['中華路', '復興路', '大學路', '民族路', '勝利路', '成功路', '健康路', '長榮路', '東門路', '府前路'];

const ROLE_IDS = ['victim', 'command', 'rescue', 'fire', 'medical', 'drone', 'local', 'online_volunteer', 'field_volunteer'];

const ROLE_BY_TYPE: Record<TaskType, string[]> = {
  rescue: ['rescue', 'fire', 'field_volunteer'],
  medical: ['medical', 'field_volunteer'],
  supply: ['local', 'field_volunteer', 'online_volunteer'],
  fire: ['fire', 'rescue'],
  building: ['rescue', 'drone', 'local'],
  personnel: ['local', 'online_volunteer', 'field_volunteer'],
};

const taskTemplates: Record<TaskType, { names: string[]; descs: string[] }> = {
  rescue: {
    names: ['搜救行動', '人員搜尋', '困人救援', '道路搶通', '淹水救援', '建物搜救', '搜救犬部署', '疏散行動'],
    descs: ['建築倒塌，多人受困，需緊急搜救。', '民宅倒塌，搜尋失聯居民。', '道路遭落石阻斷，需搶通。', '堤防破損，局部淹水需救援。', '安養中心建築受損，需緊急疏散。', '工廠倒塌，派遣搜救犬尋找受困者。'],
  },
  medical: {
    names: ['臨時醫療站', '醫療巡迴', '傷患後送', '心理輔導站', '藥品補給', '急救站設置', '醫療支援'],
    descs: ['設立臨時醫療站處理傷患。', '各避難所醫療巡迴服務。', '重傷患者後送至醫院。', '設立心理輔導站協助災後心理創傷。', '緊急醫療藥品配送與補給。'],
  },
  supply: {
    names: ['飲用水發放', '物資配送', '食物發放', '臨時收容所', '發電機配送', '物資集散站', '生活物資補給', '帳篷搭設'],
    descs: ['供水中斷，需發放飲用水。', '配送緊急物資至各避難所。', '災民食物發放與登記。', '開設臨時收容所安置災民。', '停電區域需配送發電機。', '設立物資集散站統一調配。'],
  },
  fire: {
    names: ['住宅火災', '瓦斯外洩處理', '工廠火災', '電線走火', '化學品洩漏', '火場搜救'],
    descs: ['地震引發瓦斯管線破裂，造成火災。', '瓦斯管線破裂外洩，需緊急關閉。', '化學工廠因地震引發火災。', '電線斷裂走火，需消防支援。'],
  },
  building: {
    names: ['建築安全檢查', '結構檢測', '橋樑檢查', '古蹟檢查', '餘震監測', '大樓傾斜監測', '學校檢測', '危樓標記'],
    descs: ['檢查多棟建築結構安全。', '設置餘震監測設備。', '檢查橋樑結構安全。', '檢查歷史古蹟受損狀況。', '監測傾斜大樓是否有進一步倒塌危險。'],
  },
  personnel: {
    names: ['人員統計', '人員清查', '志工調度', '住戶清點', '員工確認', '居民登記'],
    descs: ['公寓大樓人員清點與統計。', '園區工廠人員安全確認與清查。', '志工人力調度與分配。', '老舊社區住戶安全確認。', '居民登記與安全確認。'],
  },
};

const latMin = 22.92;
const latMax = 23.25;
const lngMin = 120.18;
const lngMax = 120.42;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function generateTasks(count: number): Task[] {
  const result: Task[] = [];
  for (let i = 0; i < count; i++) {
    const r1 = seededRandom(i * 7 + 1);
    const r2 = seededRandom(i * 7 + 2);
    const r3 = seededRandom(i * 7 + 3);
    const r4 = seededRandom(i * 7 + 4);
    const r5 = seededRandom(i * 7 + 5);
    const r6 = seededRandom(i * 7 + 6);
    const r7 = seededRandom(i * 7 + 7);

    const type = types[Math.floor(r1 * types.length)];
    const urgency = urgencies[Math.floor(r2 * urgencies.length)];
    const district = districts[Math.floor(r3 * districts.length)];
    const tmpl = taskTemplates[type];
    const nameBase = tmpl.names[Math.floor(r4 * tmpl.names.length)];
    const desc = tmpl.descs[Math.floor(r5 * tmpl.descs.length)];
    const lat = latMin + r6 * (latMax - latMin);
    const lng = lngMin + r7 * (lngMax - lngMin);
    const hasFloorData = type === 'personnel' || type === 'rescue' || type === 'building' ? r6 > 0.6 : false;

    const floorData: FloorData[] | undefined = hasFloorData
      ? Array.from({ length: Math.floor(seededRandom(i * 3) * 5) + 2 }, (_, fi) => ({
          floor: `${fi + 1}F`,
          count: Math.floor(seededRandom(i * 11 + fi) * 20),
        }))
      : undefined;

    const uploaderName = uploaderNames[Math.floor(seededRandom(i * 13 + 1) * uploaderNames.length)];
    const unitName = unitNames[Math.floor(seededRandom(i * 13 + 2) * unitNames.length)];

    const hour = Math.floor(seededRandom(i * 13 + 3) * 24);
    const minute = Math.floor(seededRandom(i * 13 + 4) * 60);
    const day = 6 + Math.floor(seededRandom(i * 13 + 5) * 3);
    const lastUploadTime = `2016-02-0${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const recordCount = Math.floor(seededRandom(i * 13 + 6) * 4) + 1;
    const updateRecords: UpdateRecord[] = Array.from({ length: recordCount }, (_, ri) => {
      const rHour = Math.floor(seededRandom(i * 17 + ri * 3) * 24);
      const rMin = Math.floor(seededRandom(i * 17 + ri * 3 + 1) * 60);
      const rDay = 6 + Math.floor(seededRandom(i * 17 + ri * 3 + 2) * 3);
      const content = updateContents[Math.floor(seededRandom(i * 19 + ri) * updateContents.length)];
      return {
        time: `02/${rDay} ${String(rHour).padStart(2, '0')}:${String(rMin).padStart(2, '0')}`,
        content,
      };
    });

    const baseRoles = ROLE_BY_TYPE[type];
    const assignedRoles = ['command', ...baseRoles];
    if (seededRandom(i * 23) > 0.7) assignedRoles.push('victim');
    const uniqueRoles = [...new Set(assignedRoles)];

    const status: TaskStatus = seededRandom(i * 29) > 0.25 ? 'active' : 'completed';

    const streetName = streetNames[Math.floor(seededRandom(i * 31) * streetNames.length)];
    const streetNum = Math.floor(seededRandom(i * 37) * 200) + 1;
    const address = `台南市${district}${streetName}${streetNum}號`;

    const imgCount = Math.floor(seededRandom(i * 41) * 4);
    const images = imgCount > 0
      ? Array.from({ length: imgCount }, (_, ii) =>
          `https://picsum.photos/seed/task${i}img${ii}/400/300`
        )
      : undefined;

    result.push({
      id: `t${i + 1}`,
      name: `${district}${nameBase}`,
      type,
      description: `${district}${desc}`,
      urgency,
      status,
      lat,
      lng,
      hasFloorData,
      floorData,
      uploaderName,
      unitName,
      lastUploadTime,
      updateRecords,
      assignedRoles: uniqueRoles,
      pinned: false,
      address,
      images,
    });
  }

  if (result.length > 0) { result[0].pinned = true; result[0].urgency = 'critical'; result[0].status = 'active'; }
  if (result.length > 1) { result[1].pinned = true; result[1].urgency = 'critical'; result[1].status = 'active'; }

  return result;
}

export const tasks: Task[] = generateTasks(150);
