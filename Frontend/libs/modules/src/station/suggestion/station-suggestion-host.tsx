'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';

import { CreateStationSuggestionDocument } from '@rescue-frontend/data-access';

import { useAuthSession } from '../../session/auth-session';
import { SiteToast } from '../../shell/site/site-toast';
import { stationSuggestionErrorMessage } from './error';
import {
  toCreateStationSuggestionInput,
  type StationSuggestionForm,
} from './fields';
import { onOpenStationSuggestion } from './open-station-suggestion';
import { StationSuggestionDrawer } from './station-suggestion-drawer';
import {
  buildSuggestionSignInHref,
  readSuggestionReturn,
  stripSuggestionReturn,
} from './suggestion-return';

interface StationSuggestionHostProps {
  isAuthenticated: boolean;
}

interface Opening {
  /** Keys the drawer, so each opening starts from the station as it is and an untouched form. */
  id: number;
  stationUuid: string;
}

/**
 * Opens the drawer again for a guest back from signing in (`suggest=`). Read once, from the
 * router, as 請求協助's way back is (`HelpRequestReturn`), and under its own Suspense for the same
 * reason: reading the query must not turn a page without one into a client-only page.
 */
function StationSuggestionReturn({
  onReturn,
}: {
  onReturn: (stationUuid: string) => void;
}) {
  const searchParams = useSearchParams();
  const { status } = useAuthSession();
  const [stationUuid] = useState(() => readSuggestionReturn(searchParams));
  const handled = useRef(false);

  useEffect(() => {
    if (!stationUuid || handled.current || status === 'loading') {
      return;
    }

    handled.current = true;

    // Off the address either way, so a reload or a copied link does not open it again. A guest
    // here did not sign in — the link came some other way — and has nothing to reopen.
    const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const withoutSuggest = stripSuggestionReturn(address);

    if (withoutSuggest !== address) {
      window.history.replaceState(window.history.state, '', withoutSuggest);
    }

    if (status === 'authenticated') {
      onReturn(stationUuid);
    }
  }, [onReturn, stationUuid, status]);

  return null;
}

/**
 * 修改建議, kept once in the site shell and opened through `openStationSuggestion` — or by itself
 * for a guest back from signing in. Sent, the drawer closes and a toast says it waits for review:
 * the station itself does not change until a reviewer takes it (QA WG-122).
 */
export function StationSuggestionHost({
  isAuthenticated,
}: StationSuggestionHostProps) {
  const router = useRouter();
  const [, createStationSuggestion] = useMutation(
    CreateStationSuggestionDocument,
  );
  const [opening, setOpening] = useState<Opening | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const openDrawer = useCallback((stationUuid: string) => {
    setOpening((current) => ({ id: (current?.id ?? 0) + 1, stationUuid }));
    setSubmitError(null);
    setOpen(true);
  }, []);

  useEffect(() => onOpenStationSuggestion(openDrawer), [openDrawer]);

  /** To sign in and back here with the drawer to open again on the same station. */
  const signIn = () => {
    if (!opening) {
      return;
    }

    setOpen(false);
    router.push(
      buildSuggestionSignInHref(window.location, opening.stationUuid),
    );
  };

  const submit = async (form: StationSuggestionForm) => {
    if (!opening || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createStationSuggestion({
        input: toCreateStationSuggestionInput(opening.stationUuid, form),
      });

      // What was typed stays for another try.
      if (!result.data?.createStationSuggestion) {
        setSubmitError(stationSuggestionErrorMessage(result.error ?? {}));
        return;
      }

      setOpen(false);
      setToastOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  // Stable, so a re-render does not restart the toast's timer.
  const closeToast = useCallback(() => setToastOpen(false), []);

  return (
    <>
      {opening ? (
        <StationSuggestionDrawer
          key={opening.id}
          open={open}
          stationUuid={opening.stationUuid}
          isAuthenticated={isAuthenticated}
          submitting={submitting}
          submitError={submitError}
          onClose={() => setOpen(false)}
          onSignIn={signIn}
          onSubmit={(form) => void submit(form)}
        />
      ) : null}
      <Suspense fallback={null}>
        <StationSuggestionReturn onReturn={openDrawer} />
      </Suspense>
      <SiteToast
        open={toastOpen}
        title="修改建議已送出"
        description="等待審核，通過後站點資訊才會更新。"
        onClose={closeToast}
      />
    </>
  );
}
