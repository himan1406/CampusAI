import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Import our own slices and components
import { rootReducer } from './features/store/store';
import AuthScreen from './features/auth/AuthScreen';
import Dashboard from './features/dashboard/DashboardPage';
import Inbox from './features/inbox/InboxPage';
import LmsPage from './features/lms/LmsPage';
import CampusAI from './features/campus-ai/CampusAIPage';
import Connections from './features/connections/ConnectionsPage';
import Profile from './features/profile/ProfilePage';
import Settings from './features/settings/SettingsPage';
import './styles/tokens.css';
import './styles/reset.css';

// Create the Redux store
const store = configureStore({
  reducer: rootReducer
});

// Main App component with route-based rendering
function App() {
  const { status, accessToken, user } = useSelector(state => state);
  const [showAuth, setShowAuth] = useState(true);

  useEffect(() => {
    // Check if we have a stored token
    const checkStoredToken = async () => {
      const storedToken = window.electron.store.get('accessToken');
      if (storedToken) {
        // Try to refresh and use the token
        try {
          const res = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            window.electron.store.set('accessToken', data.access_token);
            setShowAuth(false);
          } else {
            setShowAuth(true);
          }
        } catch (err) {
          setShowAuth(true);
        }
      } else {
        setShowAuth(true);
      }
    };
    checkStoredToken();
  }, [accessToken]);

  if (showAuth) {
    return <AuthScreen />;
  }

  return (
    <Dashboard
      user={user}
      messages={[]}
      unread={0}
      accounts={[]}
      lmsStatus={{ connected: false }}
      gmail={{ email_address: null }}
      outlook={{ email_address: null }}
      busyProvider={null}
      onConnectEmail={(type) => {}}
      onRefresh={() => {}}
      onNavigate={(page) => {
        // Handle navigation
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