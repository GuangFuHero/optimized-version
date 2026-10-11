import NextAuth from 'next-auth';
import { authOptions } from '@rescue-frontend/modules/server';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
