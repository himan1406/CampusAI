import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Types
export const AuthStatus = {
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error'
};

// Store slice for auth
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    status: AuthStatus.UNAUTHENTICATED,
    accessToken: null,
    refreshToken: null,
    user: null,
    error: null
  },
  reducers: {
    loginStart: (state) => {
      state.status = AuthStatus.AUTHENTICATING;
      state.error = null;
    },
    loginSuccess: (state, action) => {
      state.status = AuthStatus.AUTHENTICATED;
      state.accessToken = action.payload.access_token;
      state.refreshToken = action.payload.refresh_token;
      state.user = action.payload.user;
    },
    loginFailure: (state, action) => {
      state.status = AuthStatus.ERROR;
      state.error = action.payload.error;
    },
    logout: (state) => {
      state.status = AuthStatus.UNAUTHENTICATED;
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
    },
    setTokens: (state, action) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.status = AuthStatus.AUTHENTICATED;
    },
    setUser: (state, action) => {
      state.user = action.payload.user;
    }
  }
});

// Hotkey slice
const hotkeySlice = createSlice({
  name: 'hotkey',
  initialState: { combo: 'F12', isListening: false },
  reducers: {
    setHotkey: (state, action) => {
      state.combo = action.payload.combo;
    },
    toggleListening: (state) => {
      state.isListening = !state.isListening;
    }
  }
});

// Session slice
const sessionSlice = createSlice({
  name: 'session',
  initialState: { id: null, messages: [] },
  reducers: {
    setSessionId: (state, action) => {
      state.id = action.payload.id;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload.message);
    }
  }
});

// Export actions
export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  setTokens,
  setUser
} = authSlice.actions;
export const { setHotkey, toggleListening } = hotkeySlice.actions;
export const { setSessionId, addMessage } = sessionSlice.actions;

// Export reducer — combine all slices
import { combineReducers } from '@reduxjs/toolkit';
export const rootReducer = combineReducers({
  auth: authSlice.reducer,
  hotkey: hotkeySlice.reducer,
  session: sessionSlice.reducer,
});

// The API returns either { error: 'message' } or a Zod flatten of field errors.
function readError(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === 'string') return data.error;
  const fieldErrors = data.error?.fieldErrors;
  if (fieldErrors) {
    const entry = Object.entries(fieldErrors).find(([, messages]) => messages?.length);
    if (entry) return `${entry[0].replace(/_/g, ' ')}: ${entry[1][0]}`;
  }
  const formErrors = data.error?.formErrors;
  if (formErrors?.length) return formErrors[0];
  return data.detail || fallback;
}

async function authenticate(dispatch, call, fallback) {
  dispatch(loginStart());
  try {
    const { ok, data } = await call();
    if (ok && data?.access_token) {
      dispatch(loginSuccess(data));
      return true;
    }
    dispatch(loginFailure({ error: readError(data, fallback) }));
    return false;
  } catch (err) {
    dispatch(loginFailure({ error: err.message || 'Could not reach the CampusOS server.' }));
    return false;
  }
}

// Async thunks (both run in the main process via IPC)
export const login = (credentials) => (dispatch) =>
  authenticate(dispatch, () => window.electron.auth.login(credentials), 'Login failed');

export const signup = (account) => (dispatch) =>
  authenticate(dispatch, () => window.electron.auth.signup(account), 'Could not create your account');

// Async thunk for refresh (runs in the main process via IPC)
export const refreshSession = () => async (dispatch) => {
  try {
    const { ok, data } = await window.electron.auth.refresh();
    if (!ok || !data) return false;
    dispatch(setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token }));
    const me = await window.electron.auth.me();
    if (me.ok && me.data?.user) dispatch(setUser({ user: me.data.user }));
    return true;
  } catch (err) {
    console.error('Refresh error:', err);
    return false;
  }
};