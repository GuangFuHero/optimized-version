// SPDX-License-Identifier: GPL-3.0-only
import { ADMIN_PATHS } from '@rescue-frontend/modules';
import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect(ADMIN_PATHS.dashboard);
}
