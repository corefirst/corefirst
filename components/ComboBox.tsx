"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface ComboBoxOption {
  value: string;
  label: string;
}

interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
}

export const ComboBox = ({
  options,
  value,
  onChange,
  onCommit,
  placeholder,
  id,
  className = '',
  inputClassName = '',
}: ComboBoxProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [filterText, setFilterText] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arrowClickedRef = useRef(false);

  const filtered = filterText
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(filterText.toLowerCase()) ||
          o.value.toLowerCase().includes(filterText.toLowerCase())
      )
    : options;

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setHighlightIndex(-1);
    setFilterText('');
  }, []);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLLIElement | undefined;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightIndex]);

  const selectOption = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      onCommit?.(optionValue);
      closeDropdown();
    },
    [onChange, onCommit, closeDropdown]
  );

  const commitCustomValue = useCallback(() => {
    const trimmed = value.trim();
    let committed = trimmed;
    if (trimmed) {
      const matched = options.find(
        (o) => o.label.toLowerCase() === trimmed.toLowerCase()
      );
      if (matched) {
        committed = matched.value;
        onChange(matched.value);
      }
    }
    if (committed) onCommit?.(committed);
    closeDropdown();
  }, [value, options, onChange, onCommit, closeDropdown]);

  // Keep a ref to the latest commitCustomValue so the click-outside handler
  // can always call the current version without re-registering the listener.
  const commitRef = useRef(commitCustomValue);
  commitRef.current = commitCustomValue;

  // Commit and close when clicking outside — same effect as pressing Enter.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = null;
        }
        commitRef.current();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFilterText('');
    setIsOpen(true);
    setHighlightIndex(-1);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        openDropdown();
        setHighlightIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectOption(filtered[highlightIndex].value);
        } else {
          commitCustomValue();
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    onChange(nextValue);
    setFilterText(nextValue);
    if (!isOpen) {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      setIsOpen(true);
    }
    setHighlightIndex(-1);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={openDropdown}
          onBlur={() => {
            if (arrowClickedRef.current) {
              arrowClickedRef.current = false;
              return;
            }
            blurTimeoutRef.current = setTimeout(() => commitCustomValue(), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${inputClassName} pr-8`}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            arrowClickedRef.current = true;
          }}
          onClick={() => {
            if (isOpen) {
              closeDropdown();
            } else {
              openDropdown();
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {isOpen && filtered.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-lg py-1"
        >
          {filtered.map((option, idx) => (
            <li
              key={option.value}
              role="option"
              aria-selected={idx === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(option.value);
              }}
              onMouseEnter={() => setHighlightIndex(idx)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                idx === highlightIndex
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
