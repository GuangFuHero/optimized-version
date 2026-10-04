import { type Components } from 'react-markdown';
import { z } from 'zod';

import { Checkbox } from './checkbox';
import { CheckboxList } from './checkbox-list';
import { TaskLabel } from './task-label';

export const taskComponents = (articleId: string) =>
  ({
    'task-list': ({ node, children }) =>
      articleId ? (
        <CheckboxList
          key={articleId}
          articleId={articleId}
          checkboxKeys={z
            .array(z.string())
            .parse(node?.properties['data-task-keys'])}
        >
          {children}
        </CheckboxList>
      ) : (
        children
      ),
    'task-label': ({ node, children }) => {
      const checkboxId = z.string().parse(node?.properties['data-task-key']);
      const defaultChecked = node?.properties['data-task-checked'] === true;

      return articleId ? (
        <TaskLabel
          articleId={articleId}
          checkboxId={checkboxId}
          defaultChecked={defaultChecked}
        >
          {children}
        </TaskLabel>
      ) : (
        <div data-task-key={checkboxId} data-task-checked={defaultChecked}>
          {children}
        </div>
      );
    },
    input: ({ node, checked, ...props }) => {
      const checkboxId = String(node?.properties['data-task-key'] ?? '');
      if (props.type !== 'checkbox' || !articleId || !checkboxId)
        return <input {...props} checked={checked} />;

      return (
        <Checkbox
          articleId={articleId}
          checkboxId={checkboxId}
          defaultChecked={checked}
          {...props}
        />
      );
    },
  }) satisfies Components;
