import React from 'react';
import { CircleHelp, Menu } from 'lucide-react';

export default function Topbar({ title, onOpenNav, user }) {
  return <header className="topbar"><button className="menu-toggle" onClick={onOpenNav}><Menu size={20}/></button><div className="top-title">{title}</div><div className="top-right"><span className="connected-pill"><i/> CampusOS account active</span><button className="icon-btn" title="Help"><CircleHelp size={18}/></button><div className="avatar small">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div></div></header>;
}
