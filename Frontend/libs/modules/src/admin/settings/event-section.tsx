'use client';

import { Radio } from 'lucide-react';

import { Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import {
  useUpdateProjectSettings,
  type ProjectSettings,
} from '@rescue-frontend/data-access/admin';
import { Button, designTokens, TextInput } from '@rescue-frontend/ui';

import { DisasterTypesRow } from './disaster-types-row';
import { MapViewRow } from './map-view-row';
import { SettingsRow, SettingsSection } from './settings-layout';
import {
  basicsBody,
  NAME_MAX_LENGTH,
  nameProblem,
  SHORT_NAME_MAX_LENGTH,
  type EventBasicsDraft,
} from './settings';
import { StartedAtRow } from './started-at-row';

const { color, typography } = designTokens;

/**
 * 名稱 and 簡稱 edit as one draft and save together; everything else in the section saves on its own
 * (prototype `EventSection`). Keyed on the stored values, so a save resets the draft to them.
 */
function EventBasics({
  saved,
  canEdit,
}: {
  saved: EventBasicsDraft;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(saved);
  const update = useUpdateProjectSettings();
  const nameId = useId();
  const shortNameId = useId();
  const dirty =
    draft.name !== saved.name || draft.shortName !== saved.shortName;
  const problem = nameProblem(draft.name);

  const save = () => {
    if (problem) return;
    update.mutate(
      { body: basicsBody(draft) },
      { onSuccess: () => toast.success('已儲存這次災害的基本資料') },
    );
  };

  return (
    <>
      <SettingsRow
        label="災害名稱"
        help="事件卡與前台都會顯示。"
        htmlFor={nameId}
      >
        <TextInput
          id={nameId}
          value={draft.name}
          disabled={!canEdit}
          // An empty name on a fresh deployment is not a mistake yet: it says so once it is edited.
          error={dirty ? problem : undefined}
          placeholder={canEdit ? '例：花蓮馬太鞍溪堰塞湖專案' : '還沒有設定'}
          inputProps={{ maxLength: NAME_MAX_LENGTH }}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </SettingsRow>
      <SettingsRow
        label="簡稱"
        help="放不下全名時用。不填就顯示全名。"
        htmlFor={shortNameId}
      >
        <TextInput
          id={shortNameId}
          value={draft.shortName}
          disabled={!canEdit}
          placeholder={canEdit ? '例：花蓮馬太鞍溪' : undefined}
          inputProps={{ maxLength: SHORT_NAME_MAX_LENGTH }}
          onChange={(event) =>
            setDraft({ ...draft, shortName: event.target.value })
          }
        />
      </SettingsRow>
      {canEdit && dirty ? (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          <Typography
            sx={{
              ...typography.body[300],
              color: color.fg.warning,
              mr: 'auto',
            }}
          >
            有還沒儲存的修改
          </Typography>
          <Button
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => setDraft(saved)}
          >
            還原
          </Button>
          <Button
            size="sm"
            disabled={Boolean(problem) || update.isPending}
            onClick={save}
          >
            儲存
          </Button>
        </Stack>
      ) : null}
    </>
  );
}

export function EventSection({
  settings,
  canEdit,
}: {
  settings: ProjectSettings;
  canEdit: boolean;
}) {
  const saved = {
    name: settings.name ?? '',
    shortName: settings.short_name ?? '',
  };
  // Before the first save there is no settings row, and the backend wants a name to create one.
  const needsName = settings.uuid == null;

  return (
    <SettingsSection
      id="event"
      icon={Radio}
      title="這次災害"
      who="這一次應變的基本資料。前台與後台所有人都會看到。"
    >
      <EventBasics
        key={`${saved.name}\u0000${saved.shortName}`}
        saved={saved}
        canEdit={canEdit}
      />
      <StartedAtRow
        startedAt={settings.started_at ?? null}
        canEdit={canEdit}
        needsName={needsName}
      />
      <MapViewRow
        saved={settings.map_view ?? null}
        canEdit={canEdit}
        needsName={needsName}
      />
      <DisasterTypesRow
        selected={settings.disaster_types ?? []}
        canEdit={canEdit}
        needsName={needsName}
      />
    </SettingsSection>
  );
}
