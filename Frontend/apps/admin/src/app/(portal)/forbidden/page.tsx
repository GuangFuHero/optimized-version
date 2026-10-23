import { AdminErrorPage } from '@rescue-frontend/modules';

export const metadata = { title: '沒有權限訪問此頁 · 島嶼守望管理平台' };

export default function ForbiddenPage() {
  return <AdminErrorPage code="403" />;
}
