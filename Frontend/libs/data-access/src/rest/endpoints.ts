const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api';

const API_ENDPOINTS = {
  auth: {
    login: `${API_BASE_URL}/v1/auth/login`,
    register: `${API_BASE_URL}/v1/auth/register`,
    verify: `${API_BASE_URL}/v1/auth/verify`,
    resendVerification: `${API_BASE_URL}/v1/auth/resend-verification`,
    salt: (username: string) =>
      `${API_BASE_URL}/v1/auth/salt/${encodeURIComponent(username)}`,
    refresh: `${API_BASE_URL}/v1/auth/refresh`,
    logout: `${API_BASE_URL}/v1/auth/logout`,
    logoutAll: `${API_BASE_URL}/v1/auth/logout-all`,
    sso: {
      google: `${API_BASE_URL}/v1/auth/sso/google`,
      line: `${API_BASE_URL}/v1/auth/sso/line`,
    },
    link: {
      google: `${API_BASE_URL}/v1/auth/link/google`,
      line: `${API_BASE_URL}/v1/auth/link/line`,
    },
    changePassword: `${API_BASE_URL}/v1/auth/change-password`,
    setPassword: `${API_BASE_URL}/v1/auth/set-password`,
    forgotPassword: `${API_BASE_URL}/v1/auth/forgot-password`,
    resetPassword: `${API_BASE_URL}/v1/auth/reset-password`,
    contacts: `${API_BASE_URL}/v1/auth/contacts`,
    verifyContact: `${API_BASE_URL}/v1/auth/contacts/verify`,
    resendContact: `${API_BASE_URL}/v1/auth/contacts/resend`,
  },
  users: {
    me: `${API_BASE_URL}/v1/users/me`,
  },
};

export default API_ENDPOINTS;
