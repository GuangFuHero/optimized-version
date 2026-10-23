import type { JSONContent } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import {
  TaskItem,
  TaskList,
  type TaskItemOptions,
} from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { decodeHTML } from 'entities';
import { marked } from 'marked';
import markedCjkFriendly from 'marked-cjk-friendly';

import { markdownTask } from './task';

const cjkMarked = marked.use(markedCjkFriendly(), {
  extensions: [
    {
      name: 'htmlEntity',
      level: 'inline',
      start: (source) => source.indexOf('&'),
      tokenizer(source) {
        const entity = /^&[a-zA-Z][a-zA-Z0-9]+;/.exec(source)?.[0];
        if (!entity) return;
        const decoded = decodeHTML(entity);
        if (decoded === entity) return;
        return {
          type: 'text',
          raw: entity,
          // Tiptap decodes numeric references once, including a literal ampersand.
          text: Array.from(
            decoded,
            (character) => `&#${character.codePointAt(0)};`,
          ).join(''),
        };
      },
    },
  ],
});

const ArticleLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
      rel: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },
}).configure({
  openOnClick: false,
  HTMLAttributes: { target: null, rel: null },
});

const ChecklistItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      updated: {
        default: false,
        renderHTML: (attributes) => ({
          'data-task-updated': String(Boolean(attributes.updated)),
        }),
      },
    };
  },
  addNodeView() {
    const render = this.parent?.();
    if (!render) return null;
    return (props) => {
      const view = render(props);
      const checkbox = view.dom.querySelector('input');
      if (checkbox)
        checkbox.disabled =
          !props.editor.isEditable && !this.options.onReadOnlyChecked;
      return view;
    };
  },
  parseMarkdown(token, helpers) {
    const item = this.parent?.(token, helpers) ?? [];
    if (Array.isArray(item) || 'mark' in item) return item;
    return { ...item, attrs: { ...item.attrs, checked: false } };
  },
  renderMarkdown(node, helpers, context) {
    const [first, ...rest] = node.content ?? [];
    const lines: JSONContent[] = [{ type: 'paragraph', content: [] }];
    for (const inline of first?.content ?? []) {
      if (inline.type === 'hardBreak')
        lines.push({ type: 'paragraph', content: [] });
      else lines.at(-1)?.content?.push(inline);
    }
    return (
      this.parent?.(
        {
          ...node,
          attrs: { ...node.attrs, checked: false },
          content: [...lines, ...rest],
        },
        helpers,
        context,
      ) ?? ''
    );
  },
});

export function markdownExtensions(
  onReadOnlyChecked?: TaskItemOptions['onReadOnlyChecked'],
) {
  return [
    StarterKit.configure({ underline: false, link: false }),
    ArticleLink,
    TableKit,
    TaskList,
    ChecklistItem.configure({
      nested: true,
      onReadOnlyChecked,
      a11y: { checkboxLabel: (node) => markdownTask(node).label },
    }),
    Image,
    Markdown.configure({ marked: cjkMarked }),
  ];
}
