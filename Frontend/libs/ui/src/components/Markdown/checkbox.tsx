import {
  InputHTMLAttributes,
  useCallback,
  useEffect
} from 'react';
import { useLocalStorage } from 'usehooks-ts';
import z from 'zod';
import { localStorageKeys } from '../../constant/local-storage-keys';

const checkboxStateSchema = z.record(z.string(), z.boolean());

export type CheckboxProps = {
  articleId: string;
  checkboxId: string;
};

export function useCheckbox({ articleId, checkboxId }: CheckboxProps) {
  const [checkboxes, setCheckboxes] = useLocalStorage<
    z.infer<typeof checkboxStateSchema>
  >(
    localStorageKeys.articleCheckboxes(articleId),
    {},
    {
      initializeWithValue: false,
      deserializer: (value) => checkboxStateSchema.parse(JSON.parse(value)),
    },
  );

  const checkbox = checkboxes[checkboxId];
  const setCheckbox = useCallback(
    (value: boolean) => {
      setCheckboxes({ ...checkboxes, [checkboxId]: value });
    },
    [setCheckboxes, checkboxId, checkboxes],
  );

  useEffect(() => {
    if (checkbox === undefined) {
      setCheckbox(false);
    }
  }, [articleId, checkbox, setCheckbox]);

  return { checkbox, setCheckbox };
}

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
