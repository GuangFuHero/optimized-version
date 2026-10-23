'use client';

import { Box, Stack, type BoxProps } from '@mui/material';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Node } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';
import { designTokens } from '../../theme';
import { Button } from '../Button';

import { markdownExtensions } from './extensions';
import { markdownSx } from './styles';
import { useCheckboxes } from './tasks/hooks';

const nestedLists = new Set(['bulletList', 'orderedList', 'taskList']);

function taskKey(node: Node) {
  const parts: string[] = [];
  node.forEach((child) => {
    if (!nestedLists.has(child.type.name)) parts.push(child.textContent);
  });
  const label = parts.join(' ').replace(/\s+/g, ' ').trim().normalize('NFC');
  return bytesToHex(sha256(utf8ToBytes(label)));
}

export interface MarkdownProps {
  source: string;
  articleId?: string;
  className?: string;
  navigation?: boolean;
  sx?: BoxProps['sx'];
}

export function Markdown({
  source,
  articleId,
  className,
  navigation = false,
  sx = [],
}: MarkdownProps) {
  const { checkboxes, setCheckboxes } = useCheckboxes(articleId ?? '');
  const editor = useEditor(
    {
      extensions: markdownExtensions(
        articleId
          ? (node, checked) => {
              setCheckboxes((current) => ({
                ...current,
                [taskKey(node)]: checked,
              }));
              return true;
            }
          : undefined,
      ),
      content: source,
      contentType: 'markdown',
      editable: false,
      editorProps: { attributes: { role: 'article' } },
      immediatelyRender: false,
    },
    [source, articleId],
  );

  useEffect(() => {
    if (!editor || !articleId) return;
    const keys = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'taskItem') keys.add(taskKey(node));
    });
    setCheckboxes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => keys.has(key)),
      ),
    );
  }, [editor, articleId, setCheckboxes]);

  useEffect(() => {
    if (!editor) return;
    const { tr } = editor.state;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'taskItem') return;
      const checked = checkboxes[taskKey(node)] ?? false;
      if (node.attrs.checked !== checked)
        tr.setNodeAttribute(pos, 'checked', checked);
    });
    if (tr.docChanged) editor.view.dispatch(tr);
  }, [editor, checkboxes]);

  const headings: { label: string; position: number }[] = [];
  if (navigation)
    editor?.state.doc.descendants((node, position) => {
      if (node.type.name === 'heading' && node.attrs.level === 2)
        headings.push({ label: node.textContent, position });
    });

  return (
    <Box
      className={className}
      sx={[markdownSx, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {headings.length > 1 ? (
        <Stack
          component="nav"
          aria-label="文章段落"
          direction="row"
          sx={{ flexWrap: 'wrap', gap: '6px', mb: '12px' }}
        >
          {headings.map((heading) => (
            <Button
              key={heading.position}
              variant="ghost"
              size="sm"
              sx={{
                border: `1px solid ${designTokens.color.border.default}`,
                bgcolor: designTokens.color.bg.neutral.subtle,
                color: designTokens.color.fg.neutral.subtle,
                fontSize: 13,
                minHeight: 44,
              }}
              onClick={() => {
                const node = editor?.view.nodeDOM(heading.position);
                if (node instanceof HTMLElement)
                  node.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
            >
              {heading.label}
            </Button>
          ))}
        </Stack>
      ) : null}
      <EditorContent editor={editor} />
    </Box>
  );
}
