import React from 'react';
import { Check, ExternalLink, LoaderCircle, X } from 'lucide-react';

export default function ToolActivity({ tools, sources }) {
  return <div className="chat-runtime">
    {tools.length > 0 && <div className="tool-activity"><strong>AI activity</strong>{tools.map((item, index) => <div key={`${item.name}-${index}`}><span className={item.status === 'running' ? 'tool-pulse' : item.status === 'error' ? 'tool-error' : 'tool-check'}>{item.status === 'running' ? <LoaderCircle className="spin" size={13}/> : item.status === 'error' ? <X size={13}/> : <Check size={13}/>}</span>{item.label}{item.status === 'running' ? '…' : item.count != null ? ` · ${item.count} results` : ''}</div>)}</div>}
    {sources.length > 0 && <div className="chat-sources"><strong>Sources used</strong><div>{sources.map((source, index) => source.url ? <a key={`${source.type}-${source.id || index}`} href={source.url} target="_blank" rel="noreferrer">{source.label} <ExternalLink size={11}/></a> : <span key={`${source.type}-${source.id || index}`}>{source.label}</span>)}</div></div>}
  </div>;
}
