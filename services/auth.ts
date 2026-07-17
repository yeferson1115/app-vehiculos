import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export const SESSION_KEY = 'auth_session';

const DEFAULT_API_URL = 'https://api.elevaluador.com/api';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
const LOGIN_PATH = process.env.EXPO_PUBLIC_LOGIN_PATH ?? '/login';
let isHandlingExpiredSession = false;

interface ApiLoginResponse {
  access_token?: string;
  data?: {
    access_token?: string;
    plainTextToken?: string;
    token?: string;
    user?: unknown;
  };
  plainTextToken?: string;
  token?: string;
  user?: unknown;
}

export interface AuthSession {
  token: string | null;
  user: unknown;
  raw: ApiLoginResponse;
}

const extractToken = (response: ApiLoginResponse) =>
  response.token ??
  response.access_token ??
  response.plainTextToken ??
  response.data?.token ??
  response.data?.access_token ??
  response.data?.plainTextToken ??
  null;

const extractUser = (response: ApiLoginResponse) => response.user ?? response.data?.user ?? null;

export const login = async (identifier: string, password: string) => {
  const normalizedIdentifier = identifier.trim();
  const { data } = await axios.post<ApiLoginResponse>(`${API_URL}${LOGIN_PATH}`, {
    email: normalizedIdentifier,
    usuario: normalizedIdentifier,
    user: normalizedIdentifier,
    username: normalizedIdentifier,
    password,
  });

  const session: AuthSession = {
    token: extractToken(data),
    user: extractUser(data),
    raw: data,
  };

  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  isHandlingExpiredSession = false;

  return session;
};

export const getSession = async () => {
  const rawSession = await AsyncStorage.getItem(SESSION_KEY);
  return rawSession ? (JSON.parse(rawSession) as AuthSession) : null;
};

export const getAuthHeaders = async () => {
  const session = await getSession();

  return session?.token
    ? {
        Authorization: `Bearer ${session.token}`,
      }
    : undefined;
};

type SessionExpiredListener = () => void;

const sessionExpiredListeners = new Set<SessionExpiredListener>();

const notifySessionExpired = () => {
  sessionExpiredListeners.forEach((listener) => listener());
};

export const subscribeToSessionExpired = (listener: SessionExpiredListener) => {
  sessionExpiredListeners.add(listener);

  return () => {
    sessionExpiredListeners.delete(listener);
  };
};

export const logout = async ({ notify = false }: { notify?: boolean } = {}) => {
  await AsyncStorage.removeItem(SESSION_KEY);

  if (notify) {
    notifySessionExpired();
  }
};

const getMessageFromResponse = (responseData: unknown) => {
  if (!responseData || typeof responseData !== 'object') {
    return null;
  }

  const data = responseData as Record<string, unknown>;

  if (typeof data.message === 'string') {
    return data.message;
  }

  if (data.errors && typeof data.errors === 'object') {
    const [firstError] = Object.values(data.errors as Record<string, unknown>);
    if (Array.isArray(firstError) && typeof firstError[0] === 'string') {
      return firstError[0];
    }
  }

  return null;
};

export const getLoginErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return getMessageFromResponse(error.response?.data) ?? 'No fue posible iniciar sesión';
  }

  return 'No fue posible iniciar sesión. Intenta nuevamente.';
};

export const isUnauthenticatedError = (error: unknown) =>
  axios.isAxiosError(error) && getMessageFromResponse(error.response?.data) === 'Unauthenticated.';

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl = axios.isAxiosError(error) ? error.config?.url : undefined;
    const isLoginRequest = typeof requestUrl === 'string' && requestUrl.endsWith(LOGIN_PATH);

    if (!isLoginRequest && !isHandlingExpiredSession && isUnauthenticatedError(error)) {
      isHandlingExpiredSession = true;
      await logout({ notify: true });
    }

    return Promise.reject(error);
  },
);
