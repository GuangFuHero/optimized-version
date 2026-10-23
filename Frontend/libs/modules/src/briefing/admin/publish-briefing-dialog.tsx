'use client';

import type { ComponentProps } from 'react';

import { Callout, Dialog } from '@rescue-frontend/ui';
import { BriefingPreview } from './briefing-preview';

export function PublishBriefingDialog({
  hasPublished,
  nextVersion,
  savingChanges = false,
  content,
  ...props
}: Pick<
  ComponentProps<typeof Dialog>,
  'open' | 'onClose' | 'onConfirm' | 'submitting' | 'error' | 'confirmDisabled'
> & {
  hasPublished: boolean;
  nextVersion: number;
  savingChanges?: boolean;
  content: string;
}) {
  return (
    <Dialog
      {...props}
      title="確認發布到前台？"
      confirmLabel={props.submitting ? '發布中…' : '確認發布'}
      cancelLabel="返回修改"
    >
      <Callout tone="warning">
        發布後，所有志工與未登入的人都會立即看到這份內容。
        {hasPublished
          ? '目前公開的內容會整份被取代，舊內容保留在「已發布版本」。'
          : '這會是第一份公開的行前資訊。'}
      </Callout>
      {savingChanges ? (
        <Callout>尚未儲存的修改會先存成草稿，再發布到前台。</Callout>
      ) : null}
      <BriefingPreview
        content={content}
        title={`即將發布：第 ${nextVersion} 版`}
      />
    </Dialog>
  );
}
