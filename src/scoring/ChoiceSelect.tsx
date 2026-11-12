import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, BookOpenCheck } from 'lucide-react';
import './choices.css';
export type Choice = { value: string; label: string; description?: string };
export default function ChoiceSelect({ label, value, options, onChange }: { label: string; value: string; options: Choice[]; onChange: (value: string) => void }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 300 });
  const selected = options.find(option => option.value === value) || options[0];
  function close(restore = true) { setOpen(false); if (restore) trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const place = () => { const rect = trigger.current!.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 280), innerWidth - 24), below = innerHeight - rect.bottom - 20; const height = Math.min(320, Math.max(below, rect.top - 20)); setPosition({ top: below >= Math.min(240, rect.top) ? rect.bottom + 8 : Math.max(12, rect.top - height - 8), left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)), width, maxHeight: height }); };
    place();
    const frame = requestAnimationFrame(() => popup.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  return <div className="choice-field"><span id={`${id}-label`}>{label}</span><button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-haspopup="listbox" className="choice-trigger" onClick={() => setOpen(!open)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}><BookOpenCheck size={18} aria-hidden="true" /><span id={`${id}-value`}>{selected.label}</span><ChevronDown size={17} aria-hidden="true" /></button>{open && createPortal(<div id={`${id}-list`} ref={popup} role="listbox" aria-labelledby={`${id}-label`} className="choice-popup" style={position} onKeyDown={event => {
    const buttons = [...popup.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') { event.preventDefault(); close(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    else if (event.key.length === 1 && /\p{L}/u.test(event.key)) { buttons.find(button => button.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))?.focus(); }
  }}>{options.map(option => <button key={option.value} type="button" role="option" tabIndex={-1} aria-selected={option.value === value} onClick={() => { onChange(option.value); close(); }}><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.value === value && <Check size={18} aria-hidden="true" />}</button>)}</div>, document.body)}</div>;
}
