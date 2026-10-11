import type { ComponentType, PropsWithChildren } from 'react';
import type { Components, ExtraProps } from 'react-markdown';
import { z } from 'zod';

import { Checkbox } from './checkbox';
import { CheckboxList } from './checkbox-list';
import { TaskLabel } from './task-label';

type TaskComponents = Components &
  Record<
    'task-list' | 'task-label',
    ComponentType<PropsWithChildren<ExtraProps>>
  >;

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

      return articleId ? (
        <TaskLabel articleId={articleId} checkboxId={checkboxId}>
          {children}
        </TaskLabel>
      ) : (
        <div data-task-key={checkboxId}>{children}</div>
      );
    },
    input: ({ node, ...props }) => {
      const checkboxId = String(node?.properties['data-task-key'] ?? '');
      if (props.type !== 'checkbox' || !articleId || !checkboxId)
        return <input {...props} />;

      return (
        <Checkbox articleId={articleId} checkboxId={checkboxId} {...props} />
      );
    },
  }) satisfies TaskComponents;
