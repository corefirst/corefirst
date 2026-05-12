'use client';
import { useState, useRef, useEffect } from 'react';
import { User, UserPlus, Check, Pencil, ChevronDown } from 'lucide-react';
import { useProfile, type Profile } from '@/hooks/useProfile';

export function ProfileSwitcher() {
  const { profiles, currentId, currentProfile, addProfile, renameProfile, switchProfile } = useProfile();
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((addingNew || editingId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [addingNew, editingId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingNew(false);
        setEditingId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = (p?: Profile) => p?.name || 'Default';

  const commitAdd = () => {
    const name = inputValue.trim();
    const id = addProfile(name || 'New User');
    switchProfile(id);
  };

  const commitRename = (id: string) => {
    const name = inputValue.trim();
    if (name) renameProfile(id, name);
    setEditingId(null);
    setInputValue('');
  };

  const startEdit = (p: Profile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setInputValue(p.name);
    setAddingNew(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch profile — current: ${displayName(currentProfile)}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <User size={15} />
        <span className="max-w-[100px] truncate">{displayName(currentProfile)}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="listbox" aria-label="Profiles" className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Profiles</p>

          {profiles.map(p => (
            <div
              key={p.id}
              role="option"
              aria-selected={p.id === currentId}
              tabIndex={0}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 group ${p.id === currentId ? 'bg-blue-50' : ''}`}
              onClick={() => p.id !== currentId && switchProfile(p.id)}
              onKeyDown={e => e.key === 'Enter' && p.id !== currentId && switchProfile(p.id)}
            >
              {editingId === p.id ? (
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(p.id);
                    if (e.key === 'Escape') { setEditingId(null); setInputValue(''); }
                  }}
                  onBlur={() => commitRename(p.id)}
                  className="flex-1 text-sm border border-blue-300 rounded px-1.5 py-0.5 outline-none"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{displayName(p)}</span>
                  {p.id === currentId && <Check size={13} className="text-blue-500 shrink-0" />}
                  <button
                    onClick={e => startEdit(p, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 transition-opacity shrink-0"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="border-t border-gray-100 mt-1 pt-1">
            {addingNew ? (
              <div className="px-3 py-2 flex items-center gap-2">
                <UserPlus size={13} className="text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitAdd();
                    if (e.key === 'Escape') { setAddingNew(false); setInputValue(''); }
                  }}
                  onBlur={commitAdd}
                  placeholder="Name (optional)"
                  className="flex-1 text-sm border border-blue-300 rounded px-1.5 py-0.5 outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => { setAddingNew(true); setInputValue(''); setEditingId(null); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <UserPlus size={13} />
                Add person
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
