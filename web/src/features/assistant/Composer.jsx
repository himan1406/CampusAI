import React from 'react';
import { LoaderCircle, Paperclip, Send } from 'lucide-react';

export default function Composer({ value, onChange, onSubmit, busy, disabled, attachInputRef, onAttachFiles }) {
  return <form className="chat-composer" onSubmit={onSubmit}><button type="button" className="attach-btn" onClick={() => attachInputRef.current?.click()} disabled={busy || disabled} title="Attach PDF, Word, PowerPoint or text files" aria-label="Attach documents"><Paperclip size={17}/></button><input ref={attachInputRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,.csv" onChange={e => { onAttachFiles(e.target.files); e.target.value = ''; }}/><input value={value} onChange={e => onChange(e.target.value)} placeholder="Message Campus AI…"/><button disabled={busy || !value.trim()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}</button></form>;
}
