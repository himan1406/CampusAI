import React from 'react';
import { FileText, LoaderCircle, X } from 'lucide-react';

export default function AttachmentList({ attachments, onRemove }) {
  if (attachments.length === 0) return null;
  return <div className="attachment-list">
    {attachments.map(item => <div className={`attachment-chip ${item.status}`} key={item.id} title={item.name}><FileText size={14}/><span>{item.name}</span>{item.status === 'uploading' ? <LoaderCircle className="spin" size={13}/> : <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}><X size={13}/></button>}</div>)}
  </div>;
}
