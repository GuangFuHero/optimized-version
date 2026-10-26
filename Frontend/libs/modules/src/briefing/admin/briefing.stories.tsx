import { Button } from '@rescue-frontend/ui';
import { useState } from 'react';

import { TemplatePicker, type TemplatePickerProps } from './template-picker';

function TemplatePickerDemo({
  onClose,
  onPick,
  ...props
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>新增行前資訊</Button>
      {open ? (
        <TemplatePicker
          {...props}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          onPick={(selection) => {
            setOpen(false);
            onPick(selection);
          }}
        />
      ) : null}
    </>
  );
}

const meta = {
  title: 'Modules/Briefing/TemplatePicker',
  component: TemplatePicker,
  render: (args: TemplatePickerProps) => <TemplatePickerDemo {...args} />,
  args: {
    templates: [],
    onClose: () => undefined,
    onPick: () => undefined,
    onRetry: () => undefined,
  } satisfies TemplatePickerProps,
};

export default meta;
export const Default = {};
export const Loading = {
  args: { pending: true } satisfies Partial<TemplatePickerProps>,
};
export const LoadError = {
  args: { error: true } satisfies Partial<TemplatePickerProps>,
};
