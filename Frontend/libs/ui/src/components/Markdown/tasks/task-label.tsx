import { type PropsWithChildren } from 'react';
import { CheckboxProps, useCheckbox } from './hooks';

export function TaskLabel({
  articleId,
  checkboxId,
  children,
}: PropsWithChildren<CheckboxProps>) {
  const { checkbox } = useCheckbox({ articleId, checkboxId });

  return (
    <div data-task-key={checkboxId} data-task-checked={checkbox}>
      {children}
    </div>
  );
}
