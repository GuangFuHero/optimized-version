/** As much of a hast node as the walk below reads. */
export interface TaskNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TaskNode[];
}

export interface TaskItem {
  /** `rehypeCheckboxKey`'s hash of the words: what the label beside the box carries. */
  key: string;
  /** The item's words, as `rehypeCheckboxKey` reads them for the box's `aria-label`. */
  label: string;
}

/**
 * The checklist's items in the order they appear, from the tree libs/ui's Markdown builds: every box
 * `rehypeCheckboxKey` marked (`- [ ]` in the content), with its words. Items with the same words share
 * one key, so they are one item here too.
 */
export function taskItems(node: TaskNode | undefined): TaskItem[] {
  const items = new Map<string, string>();

  const walk = (current: TaskNode) => {
    const key = current.properties?.['data-task-key'];
    const label = current.properties?.ariaLabel;
    if (
      current.tagName === 'input' &&
      typeof key === 'string' &&
      typeof label === 'string' &&
      !items.has(key)
    ) {
      items.set(key, label);
    }
    current.children?.forEach(walk);
  };

  if (node) {
    walk(node);
  }

  return [...items].map(([key, label]) => ({ key, label }));
}
