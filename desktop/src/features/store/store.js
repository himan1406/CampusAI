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
  setTokens
} = authSlice.actions;
export const { setHotkey, toggleListening } = hotkeySlice.actions;
export const { setSessionId, addMessage } = sessionSlice.actions;

// Export reducer
export const rootReducer = authSlice.reducer;

// Async thunk for login
export const login = (email, password) => async (dispatch) => {
  dispatch(loginStart());
  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      dispatch(loginSuccess(data));
      // Store tokens in electron-store via IPC
      window.electron.store.set('accessToken', data.access_token);
      window.electron.store.set('refreshToken', data.refresh_token);
    } else {
      dispatch(loginFailure({ error: data.detail || 'Login failed' }));
    }
  } catch (err) {
    dispatch(loginFailure({ error: err.message || 'Network error' }));
  }
};

// Async thunk for refresh
export const refreshSession = () => async (dispatch) => {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok) {
      dispatch(setTokens({ accessToken: data.access_token, refreshToken: data.refresh_token }));
      window.electron.store.set('accessToken', data.access_token);
      window.electron.store.set('refreshToken', data.refresh_token);
    }
  } catch (err) {
    console.error('Refresh error:', err);
  }
};