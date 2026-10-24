import { signedInLandingAsync } from '@rescue-frontend/modules/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Where a sign-in from the login page goes when no page asked for one — password, Google and LINE
 * alike — on its way to the back office or the map (`signedInLandingAsync`).
 */
export default async function SignedInPage() {
  redirect(await signedInLandingAsync((await headers()).get('cookie')));
}
