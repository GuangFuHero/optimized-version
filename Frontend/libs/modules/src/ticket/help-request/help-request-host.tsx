'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMutation } from 'urql';

import {
  CreateHelpRequestDocument,
  TicketFieldsFragmentDoc,
  useFragment,
} from '@rescue-frontend/data-access';

import { useOptionalSiteMapRouteState } from '../../map/site/use-site-map-route-state';
import { SiteMapViewportStoreContext } from '../../map/site/use-site-map-viewport-state';
import { createSiteHref } from '../../route/serialize';
import { useSiteRouteState } from '../../route/use-site-route-state';
import { useAuthSession } from '../../session/auth-session';
import { SiteToast } from '../../shell/site/site-toast';
import { announceTicketCreated } from '../ticket-changes';
import {
  readHeldHelpRequest,
  type HeldHelpRequest,
} from './duplicate-suspects';
import { DuplicateWarnDialog } from './duplicate-warn-dialog';
import {
  clearHelpRequestDraft,
  sessionDraftStorage,
} from './help-request-draft';
import { HelpRequestDrawer } from './help-request-drawer';
import {
  toHelpRequestInput,
  type HelpRequestForm,
  type PickedPoint,
} from './help-request-form';
import {
  buildHelpSignInHref,
  readHelpReturn,
  stripHelpReturn,
} from './help-return';
import { onOpenHelpRequest, type HelpRequestSeed } from './open-help-request';
import { submitErrorMessage } from './submit-error';

/** Near enough to see the street the new ticket is on. */
const NEW_TICKET_ZOOM = 16;

interface HelpRequestHostProps {
  isAuthenticated: boolean;
}

interface Opening {
  /** Keys the drawer, so each opening starts from an empty form. */
  id: number;
  seed: PickedPoint | null;
}

interface FiledTicket {
  uuid: string;
  point: PickedPoint;
  needCount: number;
}

/** Held as looking like what is already there, with the form as sent, to send again as it was. */
interface HeldRequest extends HeldHelpRequest {
  form: HelpRequestForm;
}

/**
 * Opens the drawer again for a guest back from signing in (`help=`). Read once, from the
 * router: on the way back the page renders before the address changes, and the map rewrites the
 * address without it soon after — as A's claim does (`NeedClaimProvider`). Kept in its own
 * component, under its own Suspense, so that reading the query does not turn a page without one
 * into a client-only page.
 */
function HelpRequestReturn({
  onReturn,
}: {
  onReturn: (seed: HelpRequestSeed | null) => void;
}) {
  const searchParams = useSearchParams();
  const { status } = useAuthSession();
  const [helpReturn] = useState(() => readHelpReturn(searchParams));
  const handled = useRef(false);

  useEffect(() => {
    if (!helpReturn || handled.current || status === 'loading') {
      return;
    }

    handled.current = true;

    // Off the address either way, so a reload or a copied link does not open it again. A guest
    // here did not sign in — the link came some other way — and has nothing to reopen.
    const address = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const withoutHelp = stripHelpReturn(address);

    if (withoutHelp !== address) {
      window.history.replaceState(window.history.state, '', withoutHelp);
    }

    if (status === 'authenticated') {
      onReturn(helpReturn.seed);
    }
  }, [helpReturn, onReturn, status]);

  return null;
}

/**
 * 請求協助, kept once in the site shell so every page has it, and opened through
 * `openHelpRequest` — or by itself for a guest back from signing in. It also does what
 * follows a ticket filed: the drawer closes, the map and the list are handed the new ticket,
 * the page turns to tickets with it selected, and a toast says it went through. One held as
 * looking like an open need nearby is asked about over the drawer, not stopped.
 */
export function HelpRequestHost({ isAuthenticated }: HelpRequestHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const siteRoute = useSiteRouteState();
  const mapRoute = useOptionalSiteMapRouteState();
  // Only on the map, whose zoom the new ticket is shown at, unless that is too far out.
  const mapViewport = useContext(SiteMapViewportStoreContext);
  const [, createHelpRequest] = useMutation(CreateHelpRequestDocument);
  // The account's uuid, as `NeedClaimProvider` reads it.
  const userId = useAuthSession().user?.uuid ?? null;
  const [opening, setOpening] = useState<Opening | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [filed, setFiled] = useState<FiledTicket | null>(null);
  // Open is kept apart from what is shown, so the dialog keeps its content while it fades out.
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState<HeldRequest | null>(null);
  const [heldError, setHeldError] = useState<string | null>(null);
  const [unsentOpen, setUnsentOpen] = useState(false);

  const openDrawer = useCallback((seed: HelpRequestSeed | null) => {
    setOpening((current) => ({
      id: (current?.id ?? 0) + 1,
      seed: seed ? { ...seed, source: 'seed' } : null,
    }));
    setSubmitError(null);
    setUnsentOpen(false);
    setOpen(true);
  }, []);

  useEffect(() => onOpenHelpRequest(openDrawer), [openDrawer]);

  /** To sign in and back here with the drawer to open again, at the same point if it had one. */
  const signIn = () => {
    const seed = opening?.seed
      ? { lat: opening.seed.lat, lng: opening.seed.lng }
      : null;

    setOpen(false);
    router.push(buildHelpSignInHref(window.location, seed));
  };

  /**
   * The ticket, selected, on tickets with no filter that could hide it: where the person is, on the
   * map or the list. Anywhere else, to the list, whose drawer opens a ticket it has not loaded.
   */
  const showTicket = useCallback(
    ({ uuid, point }: FiledTicket) => {
      const onTickets = {
        dataType: 'ticket' as const,
        subDataTypes: undefined,
        search: undefined,
        selectedMarkerId: uuid,
      };

      if (mapRoute) {
        const zoom = mapViewport?.getSnapshot().position?.zoom ?? 0;

        mapRoute.replace({
          ...mapRoute.state,
          ...onTickets,
          position: {
            center: [point.lat, point.lng],
            zoom: Math.max(zoom, NEW_TICKET_ZOOM),
          },
        });
        return;
      }

      if (pathname.startsWith('/list')) {
        siteRoute.replace({ ...siteRoute.state, ...onTickets });
        return;
      }

      router.push(createSiteHref('list', onTickets));
    },
    [mapRoute, mapViewport, pathname, router, siteRoute],
  );

  /** Sent as filled in, or again as it was once the requester said it is not the same thing. */
  const submit = async (
    form: HelpRequestForm,
    acknowledged?: HeldHelpRequest['acknowledge'],
  ) => {
    if (submitting || !form.landmark) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setHeldError(null);

    try {
      const input = toHelpRequestInput(form, acknowledged);
      const result = await createHelpRequest({ input });
      const answer = result.data?.createHelpRequest;

      // Held: nothing was written. What was typed stays in the drawer, under the dialog.
      if (answer?.__typename === 'DuplicatesSuspected') {
        setHeld({
          form,
          ...readHeldHelpRequest(
            answer.suspects,
            input.tasks.map((task) => task.taskName),
            acknowledged,
          ),
        });
        setHeldOpen(true);
        return;
      }

      // What was typed stays for another try.
      if (answer?.__typename !== 'TicketCreated') {
        const message = submitErrorMessage(result.error);

        if (acknowledged) {
          setHeldError(message);
        } else {
          setSubmitError(message);
        }

        return;
      }

      const next: FiledTicket = {
        uuid: useFragment(TicketFieldsFragmentDoc, answer.ticket).uuid,
        point: form.landmark,
        needCount: answer.tasks.length,
      };

      // Filed: nothing is left to bring back the next time it opens.
      if (userId) {
        clearHelpRequestDraft(sessionDraftStorage(), userId);
      }

      setHeldOpen(false);
      setOpen(false);
      // Handed over before the page turns to it, in the same render: the map drops a selection it
      // cannot find among its markers.
      announceTicketCreated({ ...answer.ticket, tasks: answer.tasks });
      showTicket(next);
      setFiled(next);
      setUnsentOpen(false);
      setToastOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Off to one of the tickets it looks like. The drawer closes as the prototype's does, but what was
   * typed is kept for the tab, and a toast says it was not sent: closing alone looks like sending.
   */
  const leaveHeld = () => {
    setHeldOpen(false);
    setOpen(false);
    setToastOpen(false);
    setUnsentOpen(true);
  };

  // Stable, so a re-render does not restart the toast's timer.
  const closeToast = useCallback(() => setToastOpen(false), []);
  const closeUnsent = useCallback(() => setUnsentOpen(false), []);

  return (
    <>
      {opening ? (
        <HelpRequestDrawer
          key={opening.id}
          open={open}
          seed={opening.seed}
          isAuthenticated={isAuthenticated}
          userId={userId}
          submitting={submitting}
          submitError={submitError}
          onClose={() => setOpen(false)}
          onSignIn={signIn}
          onSubmit={(form) => void submit(form)}
        />
      ) : null}
      {/* Only asks. 回去修改 goes back to the drawer, and sending again checks again; 不是同一件，送出
          sends it as it was. Neither keeps them here (prototype `site-actions.jsx:2191-2197`). */}
      <DuplicateWarnDialog
        open={heldOpen}
        tickets={held?.tickets ?? []}
        act="send"
        from={held?.form.landmark ?? null}
        error={heldError}
        submitting={submitting}
        onBack={() => setHeldOpen(false)}
        onConfirm={() => {
          if (held) {
            void submit(held.form, held.acknowledge);
          }
        }}
        onLeave={leaveHeld}
      />
      <Suspense fallback={null}>
        <HelpRequestReturn onReturn={openDrawer} />
      </Suspense>
      <SiteToast
        open={toastOpen}
        title="你的求助單已送出"
        // What the needs are, said only now: while filling in it was just what they need; that it
        // is several things, each taken up by its own volunteer, is good news afterwards (designer).
        // No ticket number: a uuid tells a resident nothing.
        description={
          filed && filed.needCount > 1
            ? `裡面有 ${filed.needCount} 件事情等人來幫，志工會一件一件承接。`
            : '志工現在就看得到，可以直接承接。'
        }
        action={
          filed
            ? {
                label: '查看',
                onClick: () => {
                  showTicket(filed);
                  closeToast();
                },
              }
            : undefined
        }
        onClose={closeToast}
      />
      <SiteToast
        open={unsentOpen}
        title="你的求助單還沒送出"
        description="填好的都還在，按「請求協助」可以接著填。"
        action={{
          label: '接著填',
          onClick: () => {
            // The drawer brings back what was typed from the tab, whatever point it opens at.
            openDrawer(null);
          },
        }}
        onClose={closeUnsent}
      />
    </>
  );
}
