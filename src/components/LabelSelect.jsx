import { Check, Globe2, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Pill from './Pill.jsx';

const COLORS = [
  '#6d5dfc',
  '#28b8ff',
  '#31d0aa',
  '#ff5e84',
  '#ff8f4f',
  '#ffcf5c',
  '#b793ff',
  '#9ee66b',
  '#f45fd2',
  '#4aa3ff',
  '#ffb257',
  '#85dfb7',
];

export default function LabelSelect({
  labels,
  value,
  multiple = false,
  multipleModeToggle = false,
  placeholder = 'Select',
  onChange,
  onAddLabel,
  open: controlledOpen,
  onOpenChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [multiEnabled, setMultiEnabled] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [notice, setNotice] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const [highlightedId, setHighlightedId] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const typeaheadRef = useRef({ value: '', timer: null });
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  }, [controlledOpen, onOpenChange, open]);

  const selected = useMemo(() => {
    const values = multiple ? value : [value];
    return labels.filter((label) => values?.includes(label.id));
  }, [labels, multiple, value]);

  const toggle = (labelId) => {
    if (multiple) {
      if (multipleModeToggle && !multiEnabled) {
        onChange([labelId]);
        setOpen(false);
        return;
      }
      const current = value ?? [];
      onChange(current.includes(labelId) ? current.filter((item) => item !== labelId) : [...current, labelId]);
      return;
    }
    onChange(labelId);
    setOpen(false);
  };

  const selectableLabels = useMemo(() => labels.filter((label) => !label.is_divider), [labels]);

  const highlightLabel = (labelId) => {
    setHighlightedId(labelId);
    window.setTimeout(() => {
      menuRef.current?.querySelector(`[data-label-id="${labelId}"]`)?.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  const handleTypeahead = (key) => {
    const nextValue = `${typeaheadRef.current.value}${key}`.toLowerCase();
    window.clearTimeout(typeaheadRef.current.timer);
    typeaheadRef.current = {
      value: nextValue,
      timer: window.setTimeout(() => {
        typeaheadRef.current.value = '';
      }, 800),
    };
    const match = selectableLabels.find((label) => label.value.toLowerCase().startsWith(nextValue))
      ?? selectableLabels.find((label) => label.value.toLowerCase().startsWith(key.toLowerCase()));
    if (match) highlightLabel(match.id);
  };

  const handleMenuKeyDown = (event) => {
    if (event.key === 'Enter' && highlightedId) {
      event.preventDefault();
      toggle(highlightedId);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      handleTypeahead(event.key);
    }
  };

  const create = async () => {
    if (!newValue.trim()) return;
    if (labels.some((label) => !label.is_divider && label.value.trim().toLowerCase() === newValue.trim().toLowerCase())) {
      setNotice('already exist');
      window.setTimeout(() => setNotice(''), 2200);
      return;
    }
    const label = await Promise.resolve(onAddLabel(newValue.trim(), color));
    setNewValue('');
    setAdding(false);
    toggle(label.id);
  };

  const placeMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 256;
    const menuHeight = Math.min(menuRef.current?.offsetHeight ?? 340, window.innerHeight - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const fitsBelow = rect.bottom + 8 + menuHeight <= window.innerHeight - 12;
    const topCandidate = fitsBelow ? rect.bottom + 8 : rect.top - menuHeight - 8;
    const top = Math.min(Math.max(12, topCandidate), window.innerHeight - menuHeight - 12);
    setMenuStyle({ left, top, width, maxHeight: window.innerHeight - 24 });
  }, []);

  useLayoutEffect(() => {
    if (open) {
      if (!highlightedId) setHighlightedId(selected[0]?.id ?? selectableLabels[0]?.id ?? null);
      placeMenu();
    }
  }, [open, placeMenu, labels.length, adding, highlightedId, selected, selectableLabels]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, placeMenu, setOpen]);

  useEffect(() => {
    if (!multipleModeToggle || !multiple) return;
    if ((value?.length ?? 0) > 1) setMultiEnabled(true);
  }, [multiple, multipleModeToggle, value]);

  const menu = open ? (
    <div ref={menuRef} className="fixed z-[9999] overflow-hidden rounded-lg border border-white/10 bg-ink-850 shadow-glow" style={menuStyle} tabIndex={-1} onKeyDown={handleMenuKeyDown}>
      <div className="max-h-64 overflow-auto p-1">
        {labels.map((label) => {
          if (label.is_divider) {
            return (
              <div key={label.id} className="my-1 flex items-center gap-2 px-2 py-1 text-[0.65rem] font-semibold uppercase text-ink-500">
                <span className="h-px flex-1 bg-white/10" />
                {label.value}
                <span className="h-px flex-1 bg-white/10" />
              </div>
            );
          }
          const active = selected.some((item) => item.id === label.id);
          return (
            <button
              key={label.id}
              data-label-id={label.id}
              type="button"
              onMouseEnter={() => setHighlightedId(label.id)}
              onClick={() => toggle(label.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-ink-100 hover:bg-white/5 ${highlightedId === label.id ? 'bg-white/10' : ''}`}
            >
              <span className="flex items-center gap-2">
                <Pill label={label} />
                {(label.scope === 'global' || !label.project_id) && <Globe2 size={13} className="text-ink-500" />}
              </span>
              {active && <Check size={16} className="text-accent-300" />}
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-2">
        {notice && <div className="mb-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200">{notice}</div>}
        {multiple && multipleModeToggle && !adding && (
          <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-100 hover:bg-white/5">
            <input
              type="checkbox"
              checked={multiEnabled}
              onChange={(event) => setMultiEnabled(event.target.checked)}
            />
            Select multiple Who
          </label>
        )}
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && create()}
              className="w-full rounded-md border border-white/10 bg-ink-950 px-2 py-2 text-sm outline-none focus:border-accent-400"
              placeholder="Label name"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    className="h-5 w-5 rounded-full border"
                    style={{ backgroundColor: swatch, borderColor: color === swatch ? '#fff' : 'transparent' }}
                    aria-label={`Pick ${swatch}`}
                  />
                ))}
              </div>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-7 w-8 rounded border border-white/10 bg-transparent"
                aria-label="Custom label color"
              />
              <button type="button" onClick={create} className="rounded-md bg-accent-500 px-2 py-1 text-xs font-semibold text-white">
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-accent-300 hover:bg-white/5"
          >
            <Plus size={15} /> Add label
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${open ? 'z-[200]' : 'z-0'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setOpen(true);
            window.setTimeout(() => menuRef.current?.focus(), 0);
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            setOpen(true);
            window.setTimeout(() => {
              menuRef.current?.focus();
              handleTypeahead(event.key);
            }, 0);
          }
        }}
        className="flex min-h-9 w-full min-w-0 items-center gap-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-left text-sm text-ink-100 hover:border-white/20"
      >
        {selected.length ? (
          <span className="flex min-w-0 max-w-full flex-nowrap gap-1 overflow-hidden">
            {selected.map((label) => <Pill key={label.id} label={label} />)}
          </span>
        ) : (
          <span className="text-ink-500">{placeholder}</span>
        )}
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
