import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Import our own slices and components
import { rootReducer, refreshSession, AuthStatus } from './features/store/store';
import AuthScreen from './features/auth/AuthScreen';
import Dashboard from './features/dashboard/DashboardPage';
import './styles/tokens.css';
import './styles/reset.css';

// Create the Redux store
const store = configureStore({
  reducer: rootReducer
});

// Main App component with route-based rendering
function App() {
  const { status, user } = useSelector(state => state.auth);

  useEffect(() => {
    // On launch, try to reuse a stored session before showing the login form.
    const checkStoredToken = async () => {
      const storedToken = await window.electron.store.get('accessToken');
      if (storedToken) {
        await store.dispatch(refreshSession());
      }
    };
    checkStoredToken();
  }, []);

  if (status !== AuthStatus.AUTHENTICATED) {
    return <AuthScreen />;
  }

  return (
    <Dashboard
      user={user || {}}
      messages={[]}
      unread={0}
      accounts={[]}
      lmsStatus={{ connected: false }}
      gmail={{ email_address: null }}
      outlook={{ email_address: null }}
      busyProvider={null}
      onConnectEmail={() => {}}
      onRefresh={() => {}}
      onNavigate={(page) => {
        console.log('Navigate to:', page);
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
