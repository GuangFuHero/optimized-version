// SPDX-License-Identifier: GPL-3.0-only
import { SITE_PATHS } from '@rescue-frontend/modules';
import { redirect } from 'next/navigation';

export default function Index() {
  redirect(SITE_PATHS.map);
}
