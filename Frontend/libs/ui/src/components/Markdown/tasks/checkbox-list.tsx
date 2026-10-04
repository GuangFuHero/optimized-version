import { type PropsWithChildren, useEffect } from 'react';
import { useCheckboxes } from './hooks';

export function CheckboxList({
  articleId,
  checkboxKeys,
  children,
}: PropsWithChildren<{ articleId: string; checkboxKeys: string[] }>) {
  const { setCheckboxes } = useCheckboxes(articleId);

  useEffect(() => {
    const keys = new Set(checkboxKeys);
    setCheckboxes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => keys.has(key)),
      ),
    );
  }, [articleId, checkboxKeys, setCheckboxes]);

  return children;
}
