import React from 'react';
import { ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';

export default function ConnectionsPage({ accounts, syncing, busyProvider, onSyncEmail, onDisconnectEmail, onConnectEmail }) {
  return <>
    <section className="page-heading"><div><h1>Accounts and connections</h1><p>Authorize CampusOS to read selected email data. You can disconnect at any time.</p></div></section>
    <div className="connection-grid">
      {[{ provider: 'gmail', name: 'Gmail', description: 'Read inbox messages through the Gmail API.', logo: 'G' }, { provider: 'outlook', name: 'Outlook', description: 'Read inbox messages through Microsoft Graph.', logo: 'O' }].map(item => {
        const account = accounts.find(value => value.provider === item.provider);
        return <div className="connection-card" key={item.provider}><div className={`provider-logo large ${item.provider}-logo`}>{item.logo}</div><h2>{item.name}</h2><p>{item.description}</p>{account ? <><span className={`status-chip ${account.status === 'connected' ? 'ok' : 'warning'}`}>{account.status.replace('_', ' ')}</span><div className="account-email">{account.email_address}</div><div className="connection-meta">Last sync: {account.last_sync_at ? new Date(account.last_sync_at).toLocaleString() : 'Not synchronized yet'}</div><div className="button-row"><button className="secondary-btn" onClick={() => onSyncEmail(item.provider)} disabled={!!syncing}>{syncing === item.provider ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>} Sync inbox</button><button className="danger-text" onClick={() => onDisconnectEmail(item.provider)}>Disconnect</button></div></> : <><span className="status-chip">Not connected</span><button className="primary-btn full" onClick={() => onConnectEmail(item.provider)} disabled={!!busyProvider}>{busyProvider === item.provider ? 'Opening provider…' : `Connect ${item.name}`} <ExternalLink size={15}/></button></>}</div>;
      })}
    </div>
    <div className="notice-card"><ShieldCheck size={19}/><div><strong>Permission and privacy</strong><p>CampusOS requests read-only email access. OAuth tokens and synchronized message content are encrypted at rest. Disconnecting deletes the locally synchronized messages and stored token. Provider-side permissions may need to be revoked separately in Google or Microsoft account settings.</p></div></div>
  </>;
}
