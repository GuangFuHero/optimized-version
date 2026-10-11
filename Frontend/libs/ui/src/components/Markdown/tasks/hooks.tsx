import { useCallback } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import z from 'zod';
import { localStorageKeys } from '../../../constant/local-storage-keys';

const checkboxStateSchema = z.record(z.string(), z.boolean());

export type CheckboxProps = {
  articleId: string;
  checkboxId: string;
};

export function useCheckboxes(articleId: string) {
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

  return { checkboxes, setCheckboxes };
}

export function useCheckbox({ articleId, checkboxId }: CheckboxProps) {
  const { checkboxes, setCheckboxes } = useCheckboxes(articleId);
  const checkbox = checkboxes[checkboxId];
  const setCheckbox = useCallback(
    (value: boolean) => {
      setCheckboxes((current) => ({ ...current, [checkboxId]: value }));
    },
    [setCheckboxes, checkboxId],
  );

  return { checkbox: checkbox ?? false, setCheckbox };
}
