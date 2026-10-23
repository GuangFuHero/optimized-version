'use client';

import { Stack, Typography } from '@mui/material';
import { Check, FileText } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  Callout,
  Markdown,
  Modal,
  SelectionCard,
  designTokens,
} from '@rescue-frontend/ui';

import {
  briefingTitle,
  type BriefingTemplate,
  type EditorSelection,
} from './briefing-content';

const { color, typography } = designTokens;

export interface TemplatePickerProps {
  templates: BriefingTemplate[];
  pending?: boolean;
  error?: boolean;
  onRetry: () => void;
  onClose: () => void;
  onPick: (selection: Extract<EditorSelection, { kind: 'new' }>) => void;
}

export function TemplatePicker({
  templates,
  pending,
  error,
  onRetry,
  onClose,
  onPick,
}: TemplatePickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedValue = selectedId ?? templates[0]?.uuid ?? '';
  const selected = templates.find(
    (template) => template.uuid === selectedValue,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="新增志工行前資訊"
      description={<>挑一個起點，選擇後可以自由修改內容。</>}
      width={920}
      height={700}
      contentSx={{
        p: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: { mobile: '1fr', tablet: '280px minmax(0, 1fr)' },
        gridTemplateRows: {
          mobile: 'minmax(0, 190px) minmax(0, 1fr)',
          tablet: 'minmax(0, 1fr)',
        },
      }}
      footer={
        <>
          <Button
            startIcon={<Check size={16} />}
            disabled={pending}
            onClick={() =>
              onPick({
                kind: 'new',
                template: selected,
              })
            }
          >
            用{selected ? `「${briefingTitle(selected.content)}」範本` : '空白'}
            建立
          </Button>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Typography
            sx={{
              ...typography.body[300],
              ml: { tablet: 'auto' },
              color: color.fg.neutral.muted,
            }}
          >
            先進入編輯，確認儲存後才會公開。
          </Typography>
        </>
      }
    >
      <Stack
        component="nav"
        aria-label="選擇行前資訊範本"
        sx={{
          p: '12px',
          gap: '6px',
          minHeight: 0,
          overflowY: 'auto',
          bgcolor: color.bg.neutral.subtle,
          borderRight: { tablet: `1px solid ${color.border.default}` },
          borderBottom: {
            mobile: `1px solid ${color.border.default}`,
            tablet: 0,
          },
        }}
      >
        {pending ? (
          <Typography role="status" sx={typography.body[300]}>
            正在載入範本…
          </Typography>
        ) : null}
        {error ? (
          <Callout tone="warning">
            範本載入失敗。你可以重試，或從空白開始。
            <Button variant="ghost" size="sm" onClick={onRetry}>
              重試
            </Button>
          </Callout>
        ) : null}
        {!pending && !error && templates.length === 0 ? (
          <Typography
            sx={{
              ...typography.body[300],
              p: '12px',
              color: color.fg.neutral.muted,
            }}
          >
            目前沒有可用範本，可從空白開始。
          </Typography>
        ) : null}
        {templates.map((template) => (
          <SelectionCard
            key={template.uuid}
            title={briefingTitle(template.content)}
            description={template.tags.join('、')}
            icon={<FileText size={18} />}
            selected={template.uuid === selected?.uuid}
            onClick={() => setSelectedId(template.uuid)}
          />
        ))}
        <SelectionCard
          title="空白開始"
          description="完全空白，連標題都沒有。已經有現成文案要貼進來時用這個。"
          icon={<FileText size={18} />}
          selected={!selected}
          onClick={() => setSelectedId('')}
        />
      </Stack>
      <Stack
        sx={{
          p: { mobile: 2, tablet: '18px 24px' },
          gap: 2,
          minHeight: 0,
          minWidth: 0,
          overflowY: 'auto',
        }}
      >
        {!selected ? (
          <Stack
            sx={{
              alignItems: 'center',
              textAlign: 'center',
              gap: '10px',
              py: 8,
              color: color.fg.neutral.muted,
            }}
          >
            <FileText size={34} />
            <Typography sx={{ ...typography.body[300], lineHeight: 1.8 }}>
              建立出來是完全空白的一份，連段落標題都沒有。
              <br />
              {templates.length
                ? '不確定要寫什麼時，可以先選一份範本。'
                : '可以自行填入如何參與、交通資訊、建議攜帶裝備與行前注意事項。'}
            </Typography>
          </Stack>
        ) : (
          <>
            <Callout tone="warning">
              範本裡的地點、時間、管制範圍都是<strong>示意</strong>
              ，括號的地方要換成本次災害的實況。<strong>不要直接發布</strong>。
            </Callout>
            <Markdown source={selected.content} navigation />
          </>
        )}
      </Stack>
    </Modal>
  );
}
