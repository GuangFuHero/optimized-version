import { useLocalStorage } from 'usehooks-ts';
import z from 'zod';
import { localStorageKeys } from '../../../constant/local-storage-keys';

const checkboxStateSchema = z.record(z.string(), z.boolean());

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
