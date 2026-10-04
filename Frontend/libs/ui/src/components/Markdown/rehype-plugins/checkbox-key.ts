import hash from '@emotion/hash';
import type { Root } from 'hast';
import { toText } from 'hast-util-to-text';
import { visit } from 'unist-util-visit';

export function rehypeCheckboxKey() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'li') return;

      const checkbox = node.children
        .flatMap((child) =>
          child.type === 'element' && child.tagName === 'p'
            ? child.children
            : [child],
        )
        .find(
          (child) =>
            child.type === 'element' &&
            child.tagName === 'input' &&
            child.properties.type === 'checkbox',
        );

      if (checkbox?.type !== 'element') return;

      const label = toText({
        ...node,
        children: node.children.filter(
          (child) =>
            child.type !== 'element' ||
            (child.tagName !== 'ul' && child.tagName !== 'ol'),
        ),
      })
        .replace(/\s+/g, ' ')
        .trim();

      checkbox.properties['data-task-key'] = hash(label);
      checkbox.properties.ariaLabel = label;
    });
  };
}
