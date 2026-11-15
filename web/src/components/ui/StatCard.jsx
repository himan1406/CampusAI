import React from 'react';

export default function StatCard({ icon: Icon, iconClassName = 'stat-icon blue', size = 19, label, value, hint }) {
  return <div className="stat-card">
    <div className={iconClassName}><Icon size={size}/></div>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </div>;
}
