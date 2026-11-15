import React from 'react';
import { GraduationCap, LogOut, X } from 'lucide-react';

export default function Sidebar({ nav, page, onNavigate, mobileNav, onClose, user, onLogout }) {
  return <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
    <div className="brand"><div className="brand-icon"><GraduationCap size={22}/></div><div><strong>CampusOS</strong><span>Student workspace</span></div><button className="close-nav" onClick={onClose}><X size={18}/></button></div>
    
    <nav>{nav.map(item => <button key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.count ? <small>{item.count}</small> : null}</button>)}</nav>
    <div className="sidebar-bottom"><div className="avatar">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div><div className="user-mini"><strong>{user.full_name}</strong><span>{user.email}</span></div><button title="Sign out" onClick={onLogout}><LogOut size={17}/></button></div>
  </aside>;
}
