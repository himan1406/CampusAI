import React from 'react';
import { Check, X } from 'lucide-react';

export default function Banner({ tone = 'error', onDismiss, children }) {
  if (tone === 'toast') {
    return <div className="toast-banner"><Check size={16}/>{children}<button onClick={onDismiss}><X size={14}/></button></div>;
  }
  return <div className="error-banner page-error">{children}<button onClick={onDismiss}><X size={14}/></button></div>;
}
