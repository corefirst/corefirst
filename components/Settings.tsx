'use client';
import { useState, useCallback, useEffect } from 'react';
import {
  X, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Settings as SettingsIcon, User, Cpu,
} from 'lucide-react';
import { useSettings, type UserSettings } from '@/hooks/useSettings';
import { useProfile } from '@/hooks/useProfile';

interface Props { onClose: () => void }

type Tab = 'providers' | 'profile';
type VerifyState = 'idle' | 'loading' | 'ok' | 'error';

// ─── Provider definitions ─────────────────────────────────────────────────

interface ProviderDef {
  id: string;
  label: string;
  tagline: string;
  authType: 'key' | 'url' | 'none';
  keyPlaceholder?: string;
  urlDefault?: string;
  signupUrl?: string;
  group: 'cloud' | 'local';
}

const PROVIDERS: ProviderDef[] = [
  { id: 'openrouter', label: 'OpenRouter',  tagline: '200+ models, free credits',    authType: 'key',  keyPlaceholder: 'sk-or-…',  signupUrl: 'https://openrouter.ai/keys',              group: 'cloud' },
  { id: 'groq',       label: 'Groq',        tagline: 'Ultra-fast, free tier',        authType: 'key',  keyPlaceholder: 'gsk_…',    signupUrl: 'https://console.groq.com/keys',           group: 'cloud' },
  { id: 'google',     label: 'Google AI',   tagline: 'Gemini models',               authType: 'key',  keyPlaceholder: 'AIza…',    signupUrl: 'https://aistudio.google.com/apikey',      group: 'cloud' },
  { id: 'openai',     label: 'OpenAI',      tagline: 'GPT-4o and family',           authType: 'key',  keyPlaceholder: 'sk-…',     signupUrl: 'https://platform.openai.com/api-keys',    group: 'cloud' },
  { id: 'anthropic',  label: 'Anthropic',   tagline: 'Claude models',               authType: 'key',  keyPlaceholder: 'sk-ant-…', signupUrl: 'https://console.anthropic.com/keys',      group: 'cloud' },
  { id: 'ollama',     label: 'Ollama',      tagline: 'Local models, no API key',    authType: 'url',  urlDefault: 'http://localhost:11434',                                            group: 'local' },
  { id: 'cli/claude', label: 'Claude CLI',  tagline: 'Local claude command, no key',authType: 'none',                                                                                group: 'local' },
  { id: 'cli/gemini', label: 'Gemini CLI',  tagline: 'Local gemini command, no key',authType: 'none',                                                                                group: 'local' },
];

const OLLAMA_QUICK_MODELS = ['llama3.2', 'qwen2.5', 'mistral', 'deepseek-r1', 'gemma3'];
const IMAGE_PROVIDERS = [
  { id: 'google', label: 'Google Imagen', placeholder: 'AIza…' },
  { id: 'openai', label: 'OpenAI (DALL-E 3)', placeholder: 'sk-…' },
];

// ─── Component ────────────────────────────────────────────────────────────

export function Settings({ onClose }: Props) {
  const { settings, save, verifyKey } = useSettings();
  const { currentProfile, renameProfile, currentId } = useProfile();

  const [tab, setTab] = useState<Tab>('providers');
  const [draft, setDraft] = useState<UserSettings>(() => structuredClone(settings));
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyError, setVerifyError] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [displayName, setDisplayName] = useState(currentProfile?.name ?? '');
  const [saveError, setSaveError] = useState('');

  // Sync draft when settings load from localStorage (avoids init-race on first open)
  useEffect(() => {
    setDraft(structuredClone(settings));
  }, [settings]);

  // Sync displayName when profile loads
  useEffect(() => {
    setDisplayName(currentProfile?.name ?? '');
  }, [currentProfile]);

  const selectedProvider = PROVIDERS.find(p => p.id === draft.global.provider);

  const patchGlobal = (patch: Partial<UserSettings['global']>) =>
    setDraft(d => ({ ...d, global: { ...d.global, ...patch } }));

  const patchAdv = <K extends keyof UserSettings['advanced']>(
    key: K, patch: NonNullable<UserSettings['advanced'][K]>,
  ) => setDraft(d => ({
    ...d,
    advanced: { ...d.advanced, [key]: { ...(d.advanced[key] ?? {}), ...patch } },
  }));

  const toggleSection = (id: string) =>
    setOpenSections(s => ({ ...s, [id]: !s[id] }));

  const handleProviderSelect = (id: string) => {
    const def = PROVIDERS.find(p => p.id === id)!;
    setVerifyState('idle');
    setVerifyError('');
    // Reset auth fields; preserve URL for Ollama if re-selecting
    const isSame = id === draft.global.provider;
    patchGlobal({
      provider: id,
      apiKey: isSame ? draft.global.apiKey : '',
      model: isSame ? draft.global.model : '',
    });
    // Seed Ollama URL default if first time
    if (def.authType === 'url' && !draft.advanced.ollama?.baseUrl) {
      patchAdv('ollama', { baseUrl: def.urlDefault ?? '' });
    }
  };

  const handleVerify = useCallback(async () => {
    if (!selectedProvider) return;
    setVerifyState('loading');
    setVerifyError('');

    const provider = draft.global.provider;
    const apiKey   = draft.global.apiKey;

    if (selectedProvider.authType === 'none') {
      // CLI: send a verify request — server will try to spawn the CLI
      const result = await verifyKey(provider, '');
      setVerifyState(result.ok ? 'ok' : 'error');
      if (!result.ok) setVerifyError(result.error ?? 'CLI not found or failed.');
      return;
    }

    if (selectedProvider.authType === 'url') {
      // Ollama: verify with baseUrl + selected model
      const baseUrl = draft.advanced.ollama?.baseUrl || selectedProvider.urlDefault || '';
      const model   = draft.global.model || 'llama3.2';
      try {
        const res = await fetch('/api/verify-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'ollama', apiKey: '', baseUrl, model }),
        });
        const result = await res.json();
        setVerifyState(result.ok ? 'ok' : 'error');
        if (!result.ok) setVerifyError(result.error ?? 'Cannot connect to Ollama.');
      } catch {
        setVerifyState('error');
        setVerifyError("Couldn't reach the server. Check your network connection.");
      }
      return;
    }

    const result = await verifyKey(provider, apiKey);
    setVerifyState(result.ok ? 'ok' : 'error');
    if (!result.ok) setVerifyError(result.error ?? 'Connection failed.');
  }, [draft, selectedProvider, verifyKey]);

  const handleSave = () => {
    const result = save(draft);
    if (!result.ok) { setSaveError(result.error ?? 'Save failed.'); return; }
    if (displayName !== (currentProfile?.name ?? '') && currentId) {
      renameProfile(currentId, displayName);
    }
    onClose();
  };

  const cloudProviders = PROVIDERS.filter(p => p.group === 'cloud');
  const localProviders = PROVIDERS.filter(p => p.group === 'local');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-gray-500" />
            <h2 id="settings-title" className="font-semibold text-gray-900">Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex border-b border-gray-100 px-6 shrink-0">
          {([['providers', Cpu, 'AI Providers'], ['profile', User, 'Profile']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Providers Tab ── */}
          {tab === 'providers' && (
            <>
              {/* ── Section: Text AI ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Text AI <span className="font-normal normal-case text-gray-400">— Transform · Roleplay · Course</span>
                </p>

                {/* Cloud providers */}
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">Cloud</p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {cloudProviders.map(p => (
                    <ProviderCard key={p.id} p={p} selected={draft.global.provider === p.id} onSelect={handleProviderSelect} />
                  ))}
                </div>

                {/* Local providers */}
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">Local</p>
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                  {localProviders.map(p => (
                    <ProviderCard key={p.id} p={p} selected={draft.global.provider === p.id} onSelect={handleProviderSelect} />
                  ))}
                </div>

                {/* Auth area */}
                {selectedProvider && (
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">

                    {/* Cloud: API key */}
                    {selectedProvider.authType === 'key' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={draft.global.apiKey}
                            onChange={e => { patchGlobal({ apiKey: e.target.value }); setVerifyState('idle'); }}
                            placeholder={selectedProvider.keyPlaceholder}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <VerifyButton state={verifyState} disabled={!draft.global.apiKey} onClick={handleVerify} />
                        </div>
                        {selectedProvider.signupUrl && (
                          <p className="text-xs text-gray-400 mt-1">
                            No key?{' '}
                            <a href={selectedProvider.signupUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              Get one free →
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Ollama: URL + model */}
                    {selectedProvider.authType === 'url' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Base URL</label>
                          <input
                            type="text"
                            value={draft.advanced.ollama?.baseUrl ?? selectedProvider.urlDefault ?? ''}
                            onChange={e => { patchAdv('ollama', { baseUrl: e.target.value }); setVerifyState('idle'); }}
                            placeholder="http://localhost:11434"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Model <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            value={draft.global.model}
                            onChange={e => { patchGlobal({ model: e.target.value }); setVerifyState('idle'); }}
                            placeholder="llama3.2"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {OLLAMA_QUICK_MODELS.map(m => (
                              <button
                                key={m}
                                onClick={() => { patchGlobal({ model: m }); setVerifyState('idle'); }}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                  draft.global.model === m
                                    ? 'bg-blue-100 border-blue-400 text-blue-700'
                                    : 'border-gray-300 text-gray-500 hover:border-gray-400'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>
                        <VerifyButton state={verifyState} disabled={!draft.global.model} onClick={handleVerify} label="Test Connection" />
                      </>
                    )}

                    {/* CLI: no config */}
                    {selectedProvider.authType === 'none' && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          No API key needed — uses your local <code className="bg-gray-200 px-1 rounded text-xs">{selectedProvider.id.split('/')[1]}</code> CLI.
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Command path <span className="font-normal text-gray-400">(optional, default: uses PATH)</span>
                          </label>
                          <input
                            type="text"
                            value={draft.global.model}
                            onChange={e => patchGlobal({ model: e.target.value })}
                            placeholder={selectedProvider.id === 'cli/claude' ? '/usr/local/bin/claude' : '/usr/local/bin/gemini'}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <VerifyButton state={verifyState} disabled={false} onClick={handleVerify} label="Check CLI" />
                      </div>
                    )}

                    {/* Cloud: optional model override */}
                    {selectedProvider.authType === 'key' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Model override <span className="font-normal text-gray-400">(optional — leave blank for default)</span>
                        </label>
                        <input
                          type="text"
                          value={draft.global.model}
                          onChange={e => patchGlobal({ model: e.target.value })}
                          placeholder="e.g. gemini-2.0-flash, gpt-4o-mini"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    <VerifyFeedback state={verifyState} error={verifyError} />
                  </div>
                )}
              </div>

              {/* ── Section: TTS ── */}
              <CollapsibleSection
                id="tts"
                title="Text-to-Speech"
                subtitle="Kokoro · Piper · Orpheus · openai.com"
                open={!!openSections.tts}
                onToggle={() => toggleSection('tts')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                    <select
                      value={draft.advanced.tts?.provider ?? ''}
                      onChange={e => patchAdv('tts', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— disabled / use server default —</option>
                      <option value="openai">OpenAI-compatible (local or openai.com)</option>
                    </select>
                  </div>
                  {draft.advanced.tts?.provider === 'openai' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Base URL <span className="font-normal text-gray-400">(blank = openai.com)</span>
                        </label>
                        <input
                          type="text"
                          value={draft.advanced.tts?.baseUrl ?? ''}
                          onChange={e => patchAdv('tts', { baseUrl: e.target.value })}
                          placeholder="http://localhost:8880/v1"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <p className="text-xs text-gray-400 mt-1">Local servers: Kokoro-FastAPI · Piper · Orpheus-FastAPI</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Model <span className="font-normal text-gray-400">(blank = server default)</span>
                        </label>
                        <input
                          type="text"
                          value={draft.advanced.tts?.model ?? ''}
                          onChange={e => patchAdv('tts', { model: e.target.value })}
                          placeholder="tts-1"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                    </>
                  )}
                </div>
              </CollapsibleSection>

              {/* ── Section: STT ── */}
              <CollapsibleSection
                id="stt"
                title="Speech-to-Text"
                subtitle="faster-whisper · whisper.cpp · openai.com"
                open={!!openSections.stt}
                onToggle={() => toggleSection('stt')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                    <select
                      value={draft.advanced.stt?.provider ?? ''}
                      onChange={e => patchAdv('stt', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— disabled / use server default —</option>
                      <option value="openai">OpenAI-compatible (local or openai.com)</option>
                    </select>
                  </div>
                  {draft.advanced.stt?.provider === 'openai' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Base URL <span className="font-normal text-gray-400">(blank = openai.com)</span>
                      </label>
                      <input
                        type="text"
                        value={draft.advanced.stt?.baseUrl ?? ''}
                        onChange={e => patchAdv('stt', { baseUrl: e.target.value })}
                        placeholder="http://localhost:8000/v1"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <p className="text-xs text-gray-400 mt-1">Local servers: faster-whisper-server · whisper.cpp</p>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* ── Section: Image Gen ── */}
              <CollapsibleSection
                id="image"
                title="Image Generation"
                subtitle="Google Imagen · OpenAI DALL-E 3"
                open={!!openSections.image}
                onToggle={() => toggleSection('image')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[{ id: '', label: 'None' }, ...IMAGE_PROVIDERS].map(p => (
                        <button
                          key={p.id}
                          onClick={() => patchAdv('imageGen', { provider: p.id })}
                          className={`py-2 text-sm rounded-lg border transition-all ${
                            (draft.advanced.imageGen?.provider ?? '') === p.id
                              ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {draft.advanced.imageGen?.provider && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                      <input
                        type="password"
                        value={draft.advanced.imageGen?.apiKey ?? ''}
                        onChange={e => patchAdv('imageGen', { apiKey: e.target.value })}
                        placeholder={IMAGE_PROVIDERS.find(p => p.id === draft.advanced.imageGen?.provider)?.placeholder}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </>
          )}

          {/* ── Profile Tab ── */}
          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">User ID</label>
                <p className="text-sm font-mono text-gray-400 bg-gray-50 rounded-xl px-3 py-2 break-all">{currentId || '—'}</p>
                <p className="text-xs text-gray-400 mt-1">Future: link to hub.corefirst.world for sync and premium features.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          {saveError
            ? <p className="text-xs text-red-600 flex-1">{saveError}</p>
            : <span />
          }
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ProviderCard({ p, selected, onSelect }: { p: ProviderDef; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(p.id)}
      className={`text-left px-3 py-2 rounded-xl border transition-all ${
        selected
          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="font-medium text-sm text-gray-900 leading-tight">{p.label}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{p.tagline}</div>
    </button>
  );
}

function VerifyButton({ state, disabled, onClick, label = 'Verify' }: {
  state: VerifyState; disabled: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={state === 'loading' || disabled}
      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
    >
      {state === 'loading' && <Loader2 size={13} className="animate-spin" />}
      {label}
    </button>
  );
}

function VerifyFeedback({ state, error }: { state: VerifyState; error: string }) {
  if (state === 'ok')    return <p className="flex items-center gap-1.5 text-sm text-green-700"><CheckCircle size={14} /> Connected successfully</p>;
  if (state === 'error') return <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle size={14} /> {error}</p>;
  return null;
}

function CollapsibleSection({ id, title, subtitle, open, onToggle, children }: {
  id: string; title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div>
          <span className="text-sm font-medium text-gray-800">{title}</span>
          <span className="ml-2 text-xs text-gray-400">{subtitle}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
