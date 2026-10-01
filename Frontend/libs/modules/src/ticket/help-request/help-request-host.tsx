'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useContext, useEffect, useState } from 'react';
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
import { HelpRequestDrawer } from './help-request-drawer';
import {
  toHelpRequestInput,
  type HelpRequestForm,
  type PickedPoint,
} from './help-request-form';
import { onOpenHelpRequest } from './open-help-request';

/** Near enough to see the street the new ticket is on. */
const NEW_TICKET_ZOOM = 16;

interface HelpRequestHostProps {
  isAuthenticated: boolean;
  /** Sends a guest to sign in and back to this page (the shell's own). */
  onSignIn?: () => void;
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
 * 請求協助, kept once in the site shell so every page has it, and opened through
 * `openHelpRequest`. It also does what follows a ticket filed (Q12): the drawer closes, the map
 * and the list are handed the new ticket, the page turns to tickets with it selected, and a toast
 * says it went through.
 */
export function HelpRequestHost({
  isAuthenticated,
  onSignIn,
}: HelpRequestHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const siteRoute = useSiteRouteState();
  const mapRoute = useOptionalSiteMapRouteState();
  // Only on the map, whose zoom the new ticket is shown at, unless that is too far out.
  const mapViewport = useContext(SiteMapViewportStoreContext);
  const [, createHelpRequest] = useMutation(CreateHelpRequestDocument);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [filed, setFiled] = useState<FiledTicket | null>(null);

  useEffect(
    () =>
      onOpenHelpRequest((seed) => {
        setOpening((current) => ({
          id: (current?.id ?? 0) + 1,
          seed: seed ? { ...seed, source: 'seed' } : null,
        }));
        setSubmitError(null);
        setOpen(true);
      }),
    [],
  );

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

      // The server's own words are English and about fields; what was typed stays for another try.
      if (!ticket) {
        setSubmitError('送出失敗，請稍後再試一次。');
        return;
      }

      const next: FiledTicket = {
        uuid: useFragment(TicketFieldsFragmentDoc, ticket).uuid,
        point: form.landmark,
        needCount: ticket.tasks.length,
      };

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
          submitting={submitting}
          submitError={submitError}
          onClose={() => setOpen(false)}
          onSignIn={() => {
            setOpen(false);
            onSignIn?.();
          }}
          onSubmit={(form) => void submit(form)}
        />
      ) : null}
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
