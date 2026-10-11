import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Root } from 'hast';
import { toText } from 'hast-util-to-text';
import { visit } from 'unist-util-visit';

export function rehypeCheckboxKey() {
  return (tree: Root) => {
    const checkboxKeys = new Set<string>();

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
        .trim()
        .normalize('NFC');
      const key = bytesToHex(sha256(utf8ToBytes(label)));

      checkboxKeys.add(key);
      checkbox.properties['data-task-key'] = key;
      checkbox.properties.ariaLabel = label;
      delete checkbox.properties.checked;

      const children = node.children
        .filter((child) => child !== checkbox)
        .map((child) =>
          child.type === 'element' && child.tagName === 'p'
            ? {
                ...child,
                children: child.children.filter((child) => child !== checkbox),
              }
            : child,
        );

      node.children = [checkbox];
      for (const child of children) {
        if (
          child.type === 'element' &&
          (child.tagName === 'ul' || child.tagName === 'ol')
        ) {
          node.children.push(child);
          continue;
        }

        const previous = node.children.at(-1);
        if (previous?.type === 'element' && previous.tagName === 'task-label') {
          previous.children.push(child);
        } else if (child.type === 'text' && /^\s*$/.test(child.value)) {
          node.children.push(child);
        } else {
          node.children.push({
            type: 'element',
            tagName: 'task-label',
            properties: { 'data-task-key': key },
            children: [child],
          });
        }
      }
    });

    tree.children = [
      {
        type: 'element',
        tagName: 'task-list',
        properties: { 'data-task-keys': [...checkboxKeys] },
        children: tree.children.filter((child) => child.type !== 'doctype'),
      },
    ];
  };
}
