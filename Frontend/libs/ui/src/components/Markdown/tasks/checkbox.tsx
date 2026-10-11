import { type InputHTMLAttributes } from 'react';
import { CheckboxProps, useCheckbox } from './hooks';

export function Checkbox({
  articleId,
  checkboxId,
  ...props
}: CheckboxProps & InputHTMLAttributes<HTMLInputElement>) {
  const { checkbox, setCheckbox } = useCheckbox({ articleId, checkboxId });

  return (
    <input
      {...props}
      disabled={false}
      checked={checkbox}
      onChange={(event) => {
        setCheckbox(event.currentTarget.checked);
      }}
    />
  );
}
