'use client';

import { Box, Stack, type BoxProps } from '@mui/material';
import { EditorContent, useEditor } from '@tiptap/react';
import GithubSlugger from 'github-slugger';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { designTokens } from '../../theme';
import { Button } from '../Button';

import { markdownExtensions } from './extensions';
import { markdownSx } from './styles';
import { markdownTask, type MarkdownTask } from './task';

export type { MarkdownTask } from './task';

export interface MarkdownProps {
  source: string;
  className?: string;
  navigation?: boolean;
  checklist?: {
    /** Checked and updated items are identified by their normalized labels. */
    checked: ReadonlySet<string>;
    updated?: ReadonlySet<string>;
    onToggle: (label: string) => void;
  };
  onTasksChange?: (tasks: readonly MarkdownTask[]) => void;
  sx?: BoxProps['sx'];
}

export function Markdown({
  source,
  className,
  navigation = false,
  checklist,
  onTasksChange,
  sx = [],
}: MarkdownProps) {
  const controlled = checklist !== undefined;
  const toggle = useRef(checklist?.onToggle);
  useEffect(() => {
    toggle.current = checklist?.onToggle;
  }, [checklist?.onToggle]);
  const editor = useEditor(
    {
      extensions: markdownExtensions(
        controlled
          ? (node) => {
              const task = markdownTask(node);
              toggle.current?.(task.label);
              return true;
            }
          : undefined,
      ),
      content: source,
      contentType: 'markdown',
      editable: false,
      editorProps: { attributes: { role: 'article', translate: 'yes' } },
      immediatelyRender: false,
    },
    [source, controlled],
  );

  useLayoutEffect(() => {
    if (!editor) return;
    const slugger = new GithubSlugger();
    const tasks = new Map<string, MarkdownTask>();
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'heading') {
        const element = editor.view.nodeDOM(position);
        if (element instanceof HTMLElement)
          element.id = slugger.slug(node.textContent);
      }
      if (node.type.name === 'taskItem') {
        const task = markdownTask(node);
        tasks.set(task.key, task);
      }
    });
    onTasksChange?.([...tasks.values()]);
  }, [editor, onTasksChange]);

  useLayoutEffect(() => {
    if (!editor) return;
    const { tr } = editor.state;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'taskItem') return;
      const task = markdownTask(node);
      const checked = checklist?.checked.has(task.label) ?? false;
      const updated = checklist?.updated?.has(task.label) ?? false;
      if (node.attrs.checked !== checked)
        tr.setNodeAttribute(pos, 'checked', checked);
      if (node.attrs.updated !== updated)
        tr.setNodeAttribute(pos, 'updated', updated);
    });
    if (tr.docChanged) editor.view.dispatch(tr);
  }, [editor, checklist?.checked, checklist?.updated]);

  const headings: { label: string; position: number; level: 2 | 3 }[] = [];
  if (navigation)
    editor?.state.doc.descendants((node, position) => {
      if (
        node.type.name === 'heading' &&
        (node.attrs.level === 2 || node.attrs.level === 3)
      )
        headings.push({
          label: node.textContent,
          position,
          level: node.attrs.level === 2 ? 2 : 3,
        });
    });
  const sectionHeadings = headings.filter((heading) => heading.level === 2);
  const navigationHeadings = sectionHeadings.length
    ? sectionHeadings
    : headings;

  return (
    <Box
      className={className}
      sx={[
        markdownSx,
        { display: 'flex', flexDirection: 'column', gap: '14px' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {navigationHeadings.length > 1 ? (
        <Stack
          component="nav"
          aria-label="文章段落"
          data-markdown-navigation=""
          direction="row"
          sx={{ flexWrap: 'wrap', gap: '6px', mb: '12px' }}
        >
          {navigationHeadings.map((heading) => (
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
                height: 44,
                px: '12px',
                borderRadius: `${designTokens.radius.full}px`,
                '&:hover': {
                  color: designTokens.color.brand.secondary.subtle,
                  bgcolor: designTokens.color.bg.neutral.subtle,
                  transform: 'none',
                  boxShadow: 'none',
                },
                '&:active': { transform: 'none' },
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
