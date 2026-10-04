import {
  useCallback,
  useEffect
} from 'react';
import { useLocalStorage } from 'usehooks-ts';
import z from 'zod';
import { localStorageKeys } from '../../../constant/local-storage-keys';


const checkboxStateSchema = z.record(z.string(), z.boolean());

export type CheckboxProps = {
  articleId: string;
  checkboxId: string;
  defaultChecked?: boolean;
};

export function useCheckboxes(articleId: string) {
  return useLocalStorage<z.infer<typeof checkboxStateSchema>>(
    localStorageKeys.articleCheckboxes(articleId),
    {},
    {
      initializeWithValue: false,
      deserializer: (value) => checkboxStateSchema.parse(JSON.parse(value)),
    },
  );
}

export function useCheckbox({
  articleId,
  checkboxId,
  defaultChecked = false,
}: CheckboxProps) {
  const [checkboxes, setCheckboxes] = useCheckboxes(articleId);
  const checkbox = checkboxes[checkboxId];
  const setCheckbox = useCallback(
    (value: boolean) => {
      setCheckboxes((current) => ({ ...current, [checkboxId]: value }));
    },
    [setCheckboxes, checkboxId],
  );

  useEffect(() => {
    if (checkbox === undefined) {
      setCheckboxes((current) =>
        current[checkboxId] === undefined
          ? { ...current, [checkboxId]: defaultChecked }
          : current,
      );
    }
  }, [articleId, checkboxId, checkbox, defaultChecked, setCheckboxes]);

  return { checkbox: checkbox ?? defaultChecked, setCheckbox };
}