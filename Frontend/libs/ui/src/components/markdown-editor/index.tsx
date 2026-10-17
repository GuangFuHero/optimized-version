'use client';

import { Box, IconButton, Stack, Tab, Tabs, Tooltip } from '@mui/material';
import {
  Bold,
  Heading2,
  Heading3,
  Image,
  Link,
  List,
  ListChecks,
  ListOrdered,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { designTokens } from '../../theme';
import { Markdown } from '../Markdown';
import { TextInput } from '../TextInput';

const { color, radius } = designTokens;

const tools = [
  { label: '粗體', icon: Bold, before: '**', text: '粗體文字', after: '**' },
  {
    label: '段落標題',
    icon: Heading2,
    before: '\n\n## ',
    text: '段落標題',
    after: '\n',
  },
  {
    label: '小標題',
    icon: Heading3,
    before: '\n\n### ',
    text: '小標題',
    after: '\n',
  },
  { label: '項目清單', icon: List, before: '\n- ', text: '項目', after: '\n' },
  {
    label: '編號清單',
    icon: ListOrdered,
    before: '\n1. ',
    text: '項目',
    after: '\n',
  },
  {
    label: '可勾項目',
    icon: ListChecks,
    before: '\n- [ ] ',
    text: '項目',
    after: '\n',
  },
  {
    label: '連結',
    icon: Link,
    before: '[',
    text: '連結文字',
    after: '](https://)',
  },
  {
    label: '圖片',
    icon: Image,
    before: '![',
    text: '圖片說明',
    after: '](https://)',
  },
];

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  minRows?: number;
}

export function MarkdownEditor({
  value,
  onChange,
  label,
  disabled = false,
  minRows = 18,
}: MarkdownEditorProps) {
  const id = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function insert(before: string, text: string, after: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || text;
    onChange(
      value.slice(0, start) + before + selected + after + value.slice(end),
    );
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }

  return (
    <Stack sx={{ gap: 1.5, minWidth: 0 }}>
      <Tabs value={preview ? 'preview' : 'edit'} aria-label={`${label}模式`}>
        <Tab
          id={`${id}-edit`}
          value="edit"
          label="編輯"
          aria-controls={`${id}-panel`}
          onClick={() => setPreview(false)}
        />
        <Tab
          id={`${id}-preview`}
          value="preview"
          label="預覽"
          aria-controls={`${id}-panel`}
          onClick={() => setPreview(true)}
        />
      </Tabs>
      <Box
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${preview ? 'preview' : 'edit'}`}
      >
        {preview ? (
          <Box
            sx={{
              p: 3,
              minHeight: 420,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            {value.trim() ? <Markdown source={value} /> : '尚無內容。'}
          </Box>
        ) : (
          <Stack sx={{ gap: 1.5 }}>
            <Stack
              direction="row"
              sx={{
                gap: 0.5,
                flexWrap: 'wrap',
                p: 1,
                border: `1px solid ${color.border.default}`,
                borderRadius: `${radius.md}px`,
                bgcolor: color.bg.neutral.default,
              }}
            >
              {tools.map(
                ({ label: toolLabel, icon: Icon, before, text, after }) => (
                  <Tooltip key={toolLabel} title={toolLabel}>
                    <span>
                      <IconButton
                        aria-label={toolLabel}
                        disabled={disabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insert(before, text, after)}
                      >
                        <Icon size={18} />
                      </IconButton>
                    </span>
                  </Tooltip>
                ),
              )}
            </Stack>
            <TextInput
              inputRef={inputRef}
              label={label}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              multiline
              minRows={minRows}
              helperText="支援 Markdown。用段落標題分段，可勾項目請用 - [ ]。連結與圖片請填入完整網址。"
              inputProps={{ style: { padding: '16px 0', lineHeight: 1.85 } }}
            />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
