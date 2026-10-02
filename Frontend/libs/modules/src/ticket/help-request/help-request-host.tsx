'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
import { SiteToast } from '../../shell/site/site-toast';
import { announceTicketCreated } from '../ticket-changes';
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
  const { status } = useSession();
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
 * the page turns to tickets with it selected, and a toast says it went through.
 */
export function HelpRequestHost({ isAuthenticated }: HelpRequestHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const siteRoute = useSiteRouteState();
  const mapRoute = useOptionalSiteMapRouteState();
  // Only on the map, whose zoom the new ticket is shown at, unless that is too far out.
  const mapViewport = useContext(SiteMapViewportStoreContext);
  const [, createHelpRequest] = useMutation(CreateHelpRequestDocument);
  const { data: session } = useSession();
  // The account's uuid, as `NeedClaimProvider` reads it: the app's auth options put it there; this
  // library's session type does not know the field.
  const sessionUser = session?.user;
  const userId =
    sessionUser && 'id' in sessionUser && typeof sessionUser.id === 'string'
      ? sessionUser.id
      : null;
  const [opening, setOpening] = useState<Opening | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [filed, setFiled] = useState<FiledTicket | null>(null);

  const openDrawer = useCallback((seed: HelpRequestSeed | null) => {
    setOpening((current) => ({
      id: (current?.id ?? 0) + 1,
      seed: seed ? { ...seed, source: 'seed' } : null,
    }));
    setSubmitError(null);
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

  const submit = async (form: HelpRequestForm) => {
    if (submitting || !form.landmark) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createHelpRequest({
        input: toHelpRequestInput(form),
      });
      const ticket = result.data?.createHelpRequest;

      // What was typed stays for another try.
      if (!ticket) {
        setSubmitError(submitErrorMessage(result.error));
        return;
      }

      const next: FiledTicket = {
        uuid: useFragment(TicketFieldsFragmentDoc, ticket).uuid,
        point: form.landmark,
        needCount: ticket.tasks.length,
      };

      // Filed: nothing is left to bring back the next time it opens.
      if (userId) {
        clearHelpRequestDraft(sessionDraftStorage(), userId);
      }

      setOpen(false);
      // Handed over before the page turns to it, in the same render: the map drops a selection it
      // cannot find among its markers.
      announceTicketCreated(ticket);
      showTicket(next);
      setFiled(next);
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
    </>
  );
}
