import type { JSONContent } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import {
  TaskItem,
  TaskList,
  type TaskItemOptions,
} from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import markedCjkFriendly from 'marked-cjk-friendly';

const cjkMarked = marked.use(markedCjkFriendly());

const ChecklistItem = TaskItem.extend({
  addNodeView() {
    const render = this.parent?.();
    if (!render) return null;
    return (props) => {
      const view = render(props);
      const checkbox = view.dom.querySelector('input');
      if (checkbox) checkbox.disabled = !this.options.onReadOnlyChecked;
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
    StarterKit.configure({ underline: false, link: { openOnClick: false } }),
    TaskList,
    ChecklistItem.configure({
      nested: true,
      onReadOnlyChecked,
      a11y: { checkboxLabel: (node) => node.textContent },
    }),
    Image,
    Markdown.configure({ marked: cjkMarked }),
  ];
}
