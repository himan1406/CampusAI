import React from 'react';
import { LogOut } from 'lucide-react';

export default function ProfilePage({ user, onLogout }) {
  return <>
    <section className="page-heading"><div><h1>Student profile</h1><p>Manage your CampusOS identity and session.</p></div></section>
    <div className="profile-card"><div className="profile-avatar">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div><h2>{user.full_name}</h2><p>{user.email}</p><div className="profile-details"><div><span>Mobile number</span><strong>{user.phone_number || 'Not added'}</strong></div><div><span>Student ID</span><strong>{user.student_id || 'Not added'}</strong></div><div><span>Department</span><strong>{user.department || 'Not added'}</strong></div><div><span>Academic year</span><strong>{user.academic_year || 'Not added'}</strong></div></div><button className="danger-btn" onClick={onLogout}><LogOut size={16}/> Sign out</button></div>
  </>;
}
