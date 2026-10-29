import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Node } from '@tiptap/pm/model';

const nestedLists = new Set(['bulletList', 'orderedList', 'taskList']);

export interface MarkdownTask {
  key: string;
  label: string;
}

export function markdownTask(node: Node): MarkdownTask {
  const parts: string[] = [];
  node.forEach((child) => {
    if (!nestedLists.has(child.type.name))
      parts.push(child.textBetween(0, child.content.size, ' ', ' '));
  });
  const label = parts.join(' ').replace(/\s+/g, ' ').trim().normalize('NFC');
  return { key: bytesToHex(sha256(utf8ToBytes(label))), label };
}
