'use client';

import { useReturnQuery } from '../../route/use-return-query';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  CreateStationSuggestionDocument,
  type GraphqlError,
} from '@rescue-frontend/data-access';

import { useAuthSession } from '../../session/auth-session';
import { siteGraphqlMutation } from '../../session/site-clients';
import { SiteToast } from '../../shell/site/site-toast';
import { stationSuggestionErrorMessage } from './error';
import {
  toCreateStationSuggestionInput,
  type StationSuggestionForm,
} from './fields';
import {
  openStationSuggestion,
  useStationSuggestionState,
} from './open-station-suggestion';
import { StationSuggestionDrawer } from './station-suggestion-drawer';
import {
  buildSuggestionSignInHref,
  readSuggestionReturn,
} from './suggestion-return';

interface StationSuggestionHostProps {
  isAuthenticated: boolean;
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
  const consumeReturn = useReturnQuery();
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
    consumeReturn(['suggest']);

    if (status === 'authenticated') {
      onReturn(stationUuid);
    }
  }, [consumeReturn, onReturn, stationUuid, status]);

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
  const { mutateAsync: createStationSuggestion } = useMutation(
    siteGraphqlMutation(CreateStationSuggestionDocument),
  );
  const { opening, open, submitError } = useStationSuggestionState();
  // The opening whose suggestion is on its way: a drawer opened after it is not kept waiting on it.
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  useEffect(
    () => () =>
      useStationSuggestionState.setState({ open: false, submitError: null }),
    [],
  );

  /** To sign in and back here with the drawer to open again on the same station. */
  const signIn = () => {
    if (!opening) {
      return;
    }

    useStationSuggestionState.setState({ open: false });
    router.push(
      buildSuggestionSignInHref(window.location, opening.stationUuid),
    );
  };

  const submit = async (form: StationSuggestionForm) => {
    if (!opening || submittingId === opening.id) {
      return;
    }

    const { id } = opening;
    const stillOpen = () =>
      useStationSuggestionState.getState().opening?.id === id;

    setSubmittingId(id);
    useStationSuggestionState.setState({ submitError: null });

    try {
      const refusal = await createStationSuggestion({
        input: toCreateStationSuggestionInput(opening.stationUuid, form),
      }).then(
        () => null,
        (failure: GraphqlError) => failure,
      );

      // What was typed stays for another try.
      if (refusal) {
        if (stillOpen()) {
          useStationSuggestionState.setState({
            submitError: stationSuggestionErrorMessage(refusal),
          });
        }
        return;
      }

      if (stillOpen()) {
        useStationSuggestionState.setState({ open: false });
      }

      // Sent all the same, wherever the drawer went meanwhile.
      setToastOpen(true);
    } finally {
      setSubmittingId((current) => (current === id ? null : current));
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
          submitting={submittingId === opening.id}
          submitError={submitError}
          onClose={() => useStationSuggestionState.setState({ open: false })}
          onSignIn={signIn}
          onSubmit={(form) => void submit(form)}
        />
      ) : null}
      <Suspense fallback={null}>
        <StationSuggestionReturn onReturn={openStationSuggestion} />
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
