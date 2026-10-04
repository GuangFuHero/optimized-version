import {
  type PropsWithChildren
} from 'react';
import { CheckboxProps, useCheckbox } from './hooks';

export function TaskLabel({
  articleId,
  checkboxId,
  defaultChecked,
  children,
}: PropsWithChildren<CheckboxProps>) {
  const { checkbox } = useCheckbox({ articleId, checkboxId, defaultChecked });

  return (
    <div data-task-key={checkboxId} data-task-checked={checkbox}>
      {children}
    </div>
  );
}
