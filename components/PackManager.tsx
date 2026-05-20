'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Download, Upload, ChevronLeft } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { RoleplayPackSchema } from '@/src/types/roleplay-pack';
import type { SupportedLang } from '@/src/lib/ui-i18n';

interface PackListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  domain: string;
  targetLang: string;
  authorLang: string;
  source: 'user' | 'shared';
  scenarios: { id: string; title: string }[];
  personas: { id: string; role: string }[];
}

type EditorMode = 'list' | 'create' | 'edit';

function buildTemplate(authorLang: string): string {
  return `{
  "schemaVersion": "1.0",
  "id": "my-pack",
  "name": "My Pack",
  "description": "Describe what this pack covers.",
  "version": "1.0.0",
  "domain": "Custom",
  "targetLang": "English",
  "authorLang": ${JSON.stringify(authorLang)},
  "vocabulary": [
    {
      "term": "example",
      "pos": "noun",
      "priority": "must_appear",
      "gloss": "A representative case."
    }
  ],
  "scenarios": [
    {
      "id": "intro",
      "title": "Introduction",
      "description": "A short opening exchange.",
      "roleplay_seed": "Hi, can you walk me through this?"
    }
  ],
  "personas": [
    {
      "id": "default-host",
      "role": "Friendly Host",
      "formality": "neutral",
      "typical_phrases": ["Glad you're here."]
    }
  ]
}
`;
}

export function PackManager({ uiLang = 'English' }: { uiLang?: SupportedLang }) {
  const { getHeaders } = useSettings();
  const [packs, setPacks] = useState<PackListItem[]>([]);
  const [mode, setMode] = useState<EditorMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState<string>(() => buildTemplate(uiLang));
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/roleplay-packs', { headers: getHeaders() });
      if (!r.ok) return;
      const data = await r.json();
      setPacks(Array.isArray(data.packs) ? data.packs : []);
    } catch (err) {
      console.error('[PackManager] refresh failed', err);
    }
  }, [getHeaders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const validate = useCallback(() => {
    setValidationIssues([]);
    try {
      const parsed = JSON.parse(editorText);
      const result = RoleplayPackSchema.safeParse(parsed);
      if (!result.success) {
        setValidationIssues(
          result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        );
        return false;
      }
      return true;
    } catch (err) {
      setValidationIssues([`Invalid JSON: ${(err as Error).message}`]);
      return false;
    }
  }, [editorText]);

  const openCreate = () => {
    setMode('create');
    setEditingId(null);
    setEditorText(buildTemplate(uiLang));
    setValidationIssues([]);
    setStatusMsg(null);
  };

  const openEdit = async (id: string) => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const r = await fetch(`/api/roleplay-packs/${encodeURIComponent(id)}`, { headers: getHeaders() });
      if (!r.ok) throw new Error(`Read failed (${r.status})`);
      const data = await r.json();
      setEditorText(JSON.stringify(data.pack, null, 2));
      setMode('edit');
      setEditingId(id);
      setValidationIssues([]);
    } catch (err) {
      setStatusMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const parsed = JSON.parse(editorText);
      const url = mode === 'edit' && editingId
        ? `/api/roleplay-packs/${encodeURIComponent(editingId)}`
        : '/api/roleplay-packs';
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify(parsed),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${r.status})`);
      }
      setStatusMsg({ kind: 'ok', text: 'Saved.' });
      await refresh();
      setMode('list');
    } catch (err) {
      setStatusMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete pack "${id}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/roleplay-packs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${r.status})`);
      }
      setStatusMsg({ kind: 'ok', text: `Deleted ${id}.` });
      await refresh();
    } catch (err) {
      setStatusMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (id: string) => {
    try {
      const r = await fetch(`/api/roleplay-packs/${encodeURIComponent(id)}`, { headers: getHeaders() });
      if (!r.ok) throw new Error('Read failed');
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data.pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatusMsg({ kind: 'err', text: (err as Error).message });
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const text = await file.text();
      setEditorText(text);
      setMode('create');
      setEditingId(null);
      setValidationIssues([]);
    } catch (err) {
      setStatusMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'list') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400">
            Roleplay packs are vocabulary + scenario + persona bundles. Bundled packs are read-only; user packs (★) can be edited.
          </p>
          <div className="flex gap-2 shrink-0">
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              <Upload size={14} /> Import
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
              />
            </label>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Plus size={14} /> New pack
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${statusMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {statusMsg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {statusMsg.text}
          </div>
        )}

        <ul className="space-y-2">
          {packs.length === 0 && (
            <li className="text-center text-xs text-gray-400 py-8">No packs installed yet.</li>
          )}
          {packs.map((p) => (
            <li key={p.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                  {p.source === 'user' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">★ USER</span>}
                  {p.source === 'shared' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">BUNDLED</span>}
                  <span className="text-[10px] text-gray-400">v{p.version}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{p.description}</p>
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>{p.domain}</span>
                  <span>·</span>
                  <span>learn {p.targetLang}</span>
                  <span>·</span>
                  <span
                    className={p.authorLang !== uiLang ? 'text-amber-700 font-semibold' : ''}
                    title={p.authorLang !== uiLang ? `Descriptions are in ${p.authorLang}, your UI is in ${uiLang}` : undefined}
                  >
                    📝 {p.authorLang}{p.authorLang !== uiLang ? ' ⚠' : ''}
                  </span>
                  <span>·</span>
                  <span>{p.scenarios.length} scenarios · {p.personas.length} personas</span>
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleExport(p.id)} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Export">
                  <Download size={14} />
                </button>
                {p.source === 'user' && (
                  <>
                    <button onClick={() => openEdit(p.id)} className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Delete" disabled={busy}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                {p.source === 'shared' && (
                  <button onClick={() => { handleExport(p.id); }} className="px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded" title="Download & customize">
                    Fork
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => { setMode('list'); setStatusMsg(null); }} className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
          <ChevronLeft size={14} /> Back
        </button>
        <div className="flex gap-2">
          <button onClick={validate} className="px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Validate
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === 'edit' ? 'Save changes' : 'Create pack'}
          </button>
        </div>
      </div>

      <textarea
        value={editorText}
        onChange={(e) => { setEditorText(e.target.value); setValidationIssues([]); }}
        className="w-full h-[400px] font-mono text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        spellCheck={false}
      />

      {validationIssues.length > 0 && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1">
            <AlertCircle size={14} /> Validation errors
          </div>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            {validationIssues.map((issue, i) => (<li key={i}>{issue}</li>))}
          </ul>
        </div>
      )}

      {statusMsg && (
        <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${statusMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {statusMsg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}
