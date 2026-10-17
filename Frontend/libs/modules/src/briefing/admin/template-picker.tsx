'use client';

import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import {
  BriefingState,
  useBriefingTemplates,
} from '@rescue-frontend/data-access/admin';
import { Button, Callout, Markdown, designTokens } from '@rescue-frontend/ui';

import { briefingTitle, type BriefingTemplate } from './briefing-content';

const { color, radius, typography } = designTokens;

export function TemplatePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (template?: BriefingTemplate) => void;
}) {
  const query = useBriefingTemplates({ state: BriefingState.Briefing });
  const templates = query.data?.briefingTemplates ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedValue = selectedId ?? templates[0]?.uuid ?? '';
  const selectedTemplate = templates.find(
    (template) => template.uuid === selectedValue,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="briefing-template-title"
    >
      <DialogTitle id="briefing-template-title">新增志工行前資訊</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '260px 1fr' },
            minHeight: { md: 440 },
          }}
        >
          <Stack
            sx={{
              p: 2,
              gap: 1.5,
              bgcolor: color.bg.neutral.subtle,
              maxHeight: { xs: 240, md: 520 },
              overflowY: 'auto',
            }}
          >
            {query.isPending ? (
              <Typography role="status">正在載入範本…</Typography>
            ) : null}
            {query.isError ? (
              <Callout tone="danger">
                範本載入失敗。你可以重試，或從空白開始。
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  重試
                </Button>
              </Callout>
            ) : null}
            {!query.isPending && !query.isError && templates.length === 0 ? (
              <Typography sx={typography.body[300]}>
                目前沒有可用範本，可從空白開始。
              </Typography>
            ) : null}
            <RadioGroup
              aria-label="選擇行前資訊範本"
              value={selectedValue}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {templates.map((template) => (
                <FormControlLabel
                  key={template.uuid}
                  value={template.uuid}
                  control={<Radio />}
                  sx={{
                    m: 0,
                    p: 1,
                    borderRadius: `${radius.md}px`,
                    bgcolor:
                      template.uuid === selectedValue
                        ? color.bg.neutral.default
                        : 'transparent',
                  }}
                  label={
                    <Stack sx={{ gap: 0.5, overflowWrap: 'anywhere' }}>
                      <Typography sx={typography.label[400]}>
                        {briefingTitle(template.content)}
                      </Typography>
                      {template.tags.length ? (
                        <Typography
                          sx={{
                            ...typography.body[300],
                            color: color.fg.neutral.subtle,
                          }}
                        >
                          {template.tags.join('、')}
                        </Typography>
                      ) : null}
                    </Stack>
                  }
                />
              ))}
              <FormControlLabel
                value=""
                control={<Radio />}
                sx={{ m: 0, p: 1 }}
                label="空白開始"
              />
            </RadioGroup>
          </Stack>
          <Stack
            sx={{
              p: { xs: 2, md: 3 },
              gap: 2,
              minWidth: 0,
              maxHeight: 520,
              overflowY: 'auto',
            }}
          >
            {selectedTemplate ? (
              <>
                <Callout tone="warning">
                  請確認範本內容符合本次現場狀況，再儲存公開。
                </Callout>
                <Markdown source={selectedTemplate.content} />
              </>
            ) : (
              <Typography
                sx={{ ...typography.body[400], color: color.fg.neutral.subtle }}
              >
                從空白開始，自行填入如何參與、交通資訊、建議攜帶裝備與行前注意事項。
              </Typography>
            )}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            ...typography.body[300],
            mr: 'auto',
            color: color.fg.neutral.muted,
          }}
        >
          選擇後先進入編輯，確認儲存才會公開。
        </Typography>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          onClick={() => onPick(selectedTemplate)}
          disabled={query.isPending}
        >
          使用{selectedTemplate ? '此範本' : '空白內容'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
