'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
export function StudioModal({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=ref.current;if(!element)return;if(open&&!element.open)element.showModal();if(!open&&element.open)element.close();},[open]);
  return <dialog ref={ref} className="studio-modal" onCancel={onClose} onClose={onClose} aria-label={title} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}}><div className="modal-heading"><h2>{title}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Tutup"><X/></Button></div>{children}</dialog>;
}
