import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';

export function getServerAuthSession() {
  return getServerSession(authOptions);
}
