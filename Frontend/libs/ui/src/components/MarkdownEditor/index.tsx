'use client';

import { Box, IconButton, Stack, Tab, Tooltip } from '@mui/material';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import {
  Bold,
  ExternalLink,
  Heading2,
  Heading3,
  Image,
  Link,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Pilcrow,
  RemoveFormatting,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { designTokens } from '../../theme';
import { Button } from '../Button';
import { Markdown } from '../Markdown';
import { markdownExtensions } from '../Markdown/extensions';
import { markdownSx } from '../Markdown/styles';
import { TextInput } from '../TextInput';
import { SegmentedTabs } from '../segmented-tabs';

const { color, radius, typography } = designTokens;

const frameSx = {
  '& .ProseMirror': {
    minHeight: 420,
    p: '18px 20px',
    border: `1px solid ${color.border.default}`,
    borderRadius: `${radius.md}px`,
    bgcolor: color.bg.neutral.default,
    outline: 'none',
  },
  '& .ProseMirror-focused': { borderColor: color.brand.secondary.default },
};

const tools: {
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
}[] = [
  {
    label: '粗體',
    icon: Bold,
    run: (editor) => editor.chain().focus().toggleBold().run(),
    active: (editor) => editor.isActive('bold'),
  },
  {
    label: '段落標題',
    icon: Heading2,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (editor) => editor.isActive('heading', { level: 2 }),
  },
  {
    label: '小標題',
    icon: Heading3,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (editor) => editor.isActive('heading', { level: 3 }),
  },
  {
    label: '一般段落',
    icon: Pilcrow,
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    label: '項目清單',
    icon: List,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    active: (editor) => editor.isActive('bulletList'),
  },
  {
    label: '編號清單',
    icon: ListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    active: (editor) => editor.isActive('orderedList'),
  },
  {
    label: '可勾項目',
    icon: ListChecks,
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
    active: (editor) => editor.isActive('taskList'),
  },
  {
    label: '移除連結',
    icon: Link2Off,
    run: (editor) =>
      editor.chain().focus().extendMarkRange('link').unsetLink().run(),
  },
  {
    label: '清除格式',
    icon: RemoveFormatting,
    run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
  },
];

const urlPrompts = {
  link: {
    label: '連結網址',
    placeholder: 'https://example.tw/notice',
    pattern: /^(https?:\/\/|mailto:|tel:)/i,
    error: '連結要以 http://、https://、mailto: 或 tel: 開頭。',
    confirm: '套用連結',
  },
  image: {
    label: '圖片網址',
    placeholder: 'https://example.tw/map.png',
    pattern: /^https?:\/\//i,
    error: '圖片網址要以 http:// 或 https:// 開頭。',
    confirm: '插入圖片',
  },
};

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          sx={{
            borderRadius: `${radius.md}px`,
            bgcolor: pressed ? color.bg.secondary.subtle : 'transparent',
            color: pressed
              ? color.brand.secondary.subtle
              : color.fg.neutral.subtle,
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export interface MarkdownEditorProps {
  defaultValue: string;
  onChange: (value: string) => void;
  label: string;
  helperText?: ReactNode;
  disabled?: boolean;
  preview?: ReactNode;
  previewLabel?: string;
}

export function MarkdownEditor({
  defaultValue,
  onChange,
  label,
  helperText,
  disabled = false,
  preview,
  previewLabel = '預覽',
}: MarkdownEditorProps) {
  const id = useId();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [prompt, setPrompt] = useState<keyof typeof urlPrompts | null>(null);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const initialContent = useRef({
    source: defaultValue,
    markdown: defaultValue,
  });
  const editor = useEditor({
    extensions: markdownExtensions(),
    content: defaultValue,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        translate: 'yes',
      },
    },
    onCreate: ({ editor }) => {
      initialContent.current.markdown = editor.getMarkdown();
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      onChange(
        markdown === initialContent.current.markdown
          ? initialContent.current.source
          : markdown,
      );
    },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      tools.map((tool) => (editor && tool.active?.(editor)) ?? false),
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  function openPrompt(kind: keyof typeof urlPrompts) {
    setPrompt(prompt === kind ? null : kind);
    setUrl('');
    setUrlError('');
  }

  function applyUrl() {
    if (disabled || !editor || !prompt) return;
    const value = url.trim();
    if (!urlPrompts[prompt].pattern.test(value)) {
      setUrlError(urlPrompts[prompt].error);
      return;
    }
    const chain = editor.chain().focus();
    if (prompt === 'image') chain.setImage({ src: value }).run();
    else if (editor.state.selection.empty)
      chain
        .insertContent({
          type: 'text',
          text: value,
          marks: [{ type: 'link', attrs: { href: value } }],
        })
        .run();
    else chain.extendMarkRange('link').setLink({ href: value }).run();
    setPrompt(null);
  }

  return (
    <Stack sx={{ gap: 1.5, width: '100%', minWidth: 0 }}>
      <SegmentedTabs
        value={mode}
        onChange={(_, value: typeof mode) => setMode(value)}
        aria-label={`${label}模式`}
      >
        <Tab
          id={`${id}-edit`}
          value="edit"
          label="編輯"
          aria-controls={`${id}-panel`}
        />
        <Tab
          id={`${id}-preview`}
          value="preview"
          label={previewLabel}
          aria-controls={`${id}-panel`}
        />
      </SegmentedTabs>
      <Box role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${mode}`}>
        {mode === 'preview'
          ? (preview ?? (
              <Markdown
                source={editor?.getMarkdown() ?? defaultValue}
                sx={frameSx}
                navigation
              />
            ))
          : null}
        <Stack sx={{ gap: 1.5, display: mode === 'edit' ? 'flex' : 'none' }}>
          <Stack
            direction="row"
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              gap: 0.5,
              flexWrap: 'wrap',
              p: 1,
              border: `1px solid ${color.border.default}`,
              borderRadius: `${radius.md}px`,
              bgcolor: color.bg.neutral.default,
            }}
          >
            {tools.map(({ label: toolLabel, icon: Icon, run }, index) => (
              <ToolButton
                key={toolLabel}
                label={toolLabel}
                pressed={active?.[index]}
                disabled={disabled || !editor}
                onClick={() => editor && run(editor)}
              >
                <Icon size={18} />
              </ToolButton>
            ))}
            <ToolButton
              label="插入連結"
              pressed={prompt === 'link'}
              disabled={disabled || !editor}
              onClick={() => openPrompt('link')}
            >
              <Link size={18} />
            </ToolButton>
            <ToolButton
              label="插入圖片"
              pressed={prompt === 'image'}
              disabled={disabled || !editor}
              onClick={() => openPrompt('image')}
            >
              <Image size={18} />
            </ToolButton>
          </Stack>
          {helperText ? (
            <Box
              sx={{ ...typography.body[300], color: color.fg.neutral.muted }}
            >
              {helperText}
            </Box>
          ) : null}
          {prompt ? (
            <Stack
              component="form"
              sx={{
                gap: 1.5,
                p: 1.5,
                borderRadius: `${radius.md}px`,
                bgcolor: color.bg.neutral.subtle,
              }}
              onSubmit={(event) => {
                event.preventDefault();
                applyUrl();
              }}
            >
              <TextInput
                autoFocus
                disabled={disabled}
                label={urlPrompts[prompt].label}
                placeholder={urlPrompts[prompt].placeholder}
                value={url}
                error={urlError || undefined}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError('');
                }}
              />
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                <Button size="sm" type="submit" disabled={disabled}>
                  {urlPrompts[prompt].confirm}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPrompt(null)}
                >
                  取消
                </Button>
              </Stack>
              {prompt === 'image' ? (
                <Box
                  sx={{
                    ...typography.body[300],
                    color: color.fg.neutral.muted,
                  }}
                >
                  還沒有圖片網址？
                  <Box
                    component="a"
                    href="https://duk.tw/"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      color: color.brand.secondary.subtle,
                    }}
                  >
                    到 duk.tw 上傳
                    <ExternalLink size={13} />
                  </Box>
                  ，上傳後複製它給的網址貼回這裡。圖片存在外部網站：拿到網址的人都看得到，平台刪不掉，也保證不了它明天還在。
                </Box>
              ) : null}
            </Stack>
          ) : null}
          <Box sx={[markdownSx, frameSx]}>
            <EditorContent editor={editor} />
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
