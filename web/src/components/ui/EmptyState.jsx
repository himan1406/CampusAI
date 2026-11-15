import React from 'react';

export default function EmptyState({ icon: Icon, size = 27, className = 'empty-state', title, text, children }) {
  return <div className={className}>
    <Icon size={size}/>
    <strong>{title}</strong>
    <p>{text}</p>
    {children}
  </div>;
}
