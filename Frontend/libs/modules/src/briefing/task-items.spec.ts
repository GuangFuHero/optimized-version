import { describe, expect, it } from 'vitest';

import { taskItems, type TaskNode } from './task-items';

/** An `<li>` as `rehypeCheckboxKey` (libs/ui Markdown) leaves it: the box, then its words. */
function task(key: string, label: string, nested: TaskNode[] = []): TaskNode {
  return {
    type: 'element',
    tagName: 'li',
    properties: { className: ['task-list-item'] },
    children: [
      {
        type: 'element',
        tagName: 'input',
        properties: {
          type: 'checkbox',
          disabled: true,
          'data-task-key': key,
          ariaLabel: label,
        },
        children: [],
      },
      {
        type: 'element',
        tagName: 'task-label',
        properties: { 'data-task-key': key },
        children: [{ type: 'text' }],
      },
      ...nested,
    ],
  };
}

function list(...items: TaskNode[]): TaskNode {
  return { type: 'element', tagName: 'ul', properties: {}, children: items };
}

describe('taskItems', () => {
  it('lists every box in the order it appears, nested lists and all', () => {
    const tree: TaskNode = {
      type: 'element',
      tagName: 'task-list',
      properties: {},
      children: [
        { type: 'element', tagName: 'h2', properties: {}, children: [] },
        list(
          task('a', '雨鞋'),
          task('b', '手套', [list(task('c', '工作手套'))]),
        ),
        { type: 'element', tagName: 'p', properties: {}, children: [] },
        list(task('d', '頭燈')),
      ],
    };

    expect(taskItems(tree)).toEqual([
      { key: 'a', label: '雨鞋' },
      { key: 'b', label: '手套' },
      { key: 'c', label: '工作手套' },
      { key: 'd', label: '頭燈' },
    ]);
  });

  it('counts two items with the same words once, as they share one box’s state', () => {
    const tree = list(task('a', '雨鞋'), task('a', '雨鞋'));

    expect(taskItems(tree)).toEqual([{ key: 'a', label: '雨鞋' }]);
  });

  it('leaves out a plain list, and a checkbox the Markdown did not mark as a task', () => {
    const tree: TaskNode = {
      type: 'element',
      tagName: 'ul',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'li',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'input',
              properties: { type: 'checkbox' },
              children: [],
            },
          ],
        },
      ],
    };

    expect(taskItems(tree)).toEqual([]);
    expect(taskItems(undefined)).toEqual([]);
  });
});
