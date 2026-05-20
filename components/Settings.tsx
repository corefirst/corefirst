'use client';
import { useState, useCallback, useEffect } from 'react';
import {
  X, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Settings as SettingsIcon, User, Cpu, Zap, Cloud, CloudOff,
} from 'lucide-react';
import { SkillsContent } from '@/components/SkillsPanel';
import { MembershipPanel } from '@/components/MembershipPanel';
import { PackManager } from '@/components/PackManager';
import { Package } from 'lucide-react';
import { useSettings, type UserSettings, type SettingsMode } from '@/hooks/useSettings';
import { useProfile } from '@/hooks/useProfile';
import { useCloudAuth } from '@/hooks/useCloudAuth';
import { isFullStackProvider, PROVIDER_DEFAULTS } from '@/src/lib/ai/capabilities';
import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface Props { onClose: () => void; uiLang: SupportedLang; }

type Tab = 'providers' | 'skills' | 'packs' | 'profile';
type VerifyState = 'idle' | 'loading' | 'ok' | 'error';

// === Provider definitions =================================================

interface ProviderDef {
  id: string;
  label: string;
  tagline: string;
  fullStackTagline?: string;
  authType: 'key' | 'url' | 'none';
  keyPlaceholder?: string;
  urlDefault?: string;
  signupUrl?: string;
  group: 'cloud' | 'local';
}

const PROVIDERS: ProviderDef[] = [
  { id: 'corefirst', label: 'CoreFirst（推荐）', tagline: 'CoreFirst 云 · 无需自备 API key', fullStackTagline: 'CoreFirst · text, image, voice', authType: 'none', group: 'cloud' },
  { id: 'openrouter', label: 'OpenRouter', tagline: '200+ models, free credits', fullStackTagline: 'OpenRouter · text, image, voice', authType: 'key', keyPlaceholder: 'sk-or-…', signupUrl: 'https://openrouter.ai/keys', group: 'cloud' },
  { id: 'groq', label: 'Groq', tagline: 'Ultra-fast, free tier', authType: 'key', keyPlaceholder: 'gsk_…', signupUrl: 'https://console.groq.com/keys', group: 'cloud' },
  { id: 'google', label: 'Google AI', tagline: 'Gemini models', fullStackTagline: 'Gemini · text, image, voice', authType: 'key', keyPlaceholder: 'AIza…', signupUrl: 'https://aistudio.google.com/apikey', group: 'cloud' },
  { id: 'openai', label: 'OpenAI', tagline: 'GPT-4o and family', fullStackTagline: 'GPT-4o · text, image, voice', authType: 'key', keyPlaceholder: 'sk-…', signupUrl: 'https://platform.openai.com/api-keys', group: 'cloud' },
  { id: 'anthropic', label: 'Anthropic', tagline: 'Claude models', authType: 'key', keyPlaceholder: 'sk-ant-…', signupUrl: 'https://console.anthropic.com/keys', group: 'cloud' },
  { id: 'qwen', label: 'Qwen', tagline: 'Qwen and family', fullStackTagline: 'Qwen · text, image, voice', authType: 'key', keyPlaceholder: 'sk-…', signupUrl: 'https://dashscope.console.aliyun.com/', group: 'cloud' },
  { id: 'deepseek', label: 'DeepSeek', tagline: 'DeepSeek-V4', authType: 'key', keyPlaceholder: 'sk-…', signupUrl: 'https://platform.deepseek.com/', group: 'cloud' },
  { id: 'ollama', label: 'Ollama', tagline: 'Local models, no API key', authType: 'url', urlDefault: 'http://localhost:11434', group: 'local' },
  { id: 'cli/claude', label: 'Claude CLI', tagline: 'Local claude command, no key', authType: 'none', group: 'local' },
  { id: 'cli/gemini', label: 'Gemini CLI', tagline: 'Local gemini command, no key', authType: 'none', group: 'local' }
];

const STANDARD_PROVIDERS = PROVIDERS.filter((p) => isFullStackProvider(p.id));

const OLLAMA_QUICK_MODELS = ['llama3.2', 'qwen2.5', 'mistral', 'deepseek-r1', 'gemma3'];

const SUGGESTED_MODELS: Record<string, string[]> = {
  google: ['gemini-2.0-flash', 'gemini-2.0-pro-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['google/gemini-2.0-flash-001', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat']
};

const IMAGE_PROVIDERS = [
  { id: 'google', label: 'Google Imagen', placeholder: 'AIza…' },
  { id: 'openai', label: 'OpenAI / Compatible', placeholder: 'sk-… or "ollama"' }
];

function ModelSelect({ value, onChange, provider, capability, placeholder }: {
  value: string;
  onChange: (val: string) => void;
  provider: string;
  capability: string;
  placeholder?: string;
}) {
  const suggestions = SUGGESTED_MODELS[provider] || [];
  return (
    <div className="relative group">
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        {suggestions.length > 0 && (
          <select
            value=""
            onChange={e => { if (e.target.value) onChange(e.target.value); }}
            className="w-8 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">v</option>
            {suggestions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// === Component ============================================================

export function Settings({ onClose, uiLang }: Props) {
  const { settings, save, verifyKey } = useSettings();
  const { currentProfile, renameProfile, currentId } = useProfile();
  const { user, loggedIn } = useCloudAuth();

  const [tab, setTab] = useState<Tab>('providers');
  const [accountExpanded, setAccountExpanded] = useState(false);
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
    const isSame    = id === draft.global.provider;
    const isSaved   = id === settings.global.provider;
    const pick = <T,>(draftVal: T, savedVal: T, empty: T): T =>
      isSame ? draftVal : isSaved ? savedVal : empty;
    patchGlobal({
      provider:   id,
      apiKey:     pick(draft.global.apiKey,     settings.global.apiKey,     ''),
      model:      pick(draft.global.model,      settings.global.model,      ''),
      ttsModel:   pick(draft.global.ttsModel,   settings.global.ttsModel,   ''),
      sttModel:   pick(draft.global.sttModel,   settings.global.sttModel,   ''),
      imageModel: pick(draft.global.imageModel, settings.global.imageModel, ''),
    });
    if (def.authType === 'url' && !draft.advanced.ollama?.baseUrl) {
      patchAdv('ollama', { baseUrl: def.urlDefault ?? '' });
    }
  };

  const handleVerify = useCallback(async () => {
    if (!selectedProvider) return;
    setVerifyState('loading');
    setVerifyError('');

    const provider = draft.global.provider;
    const apiKey = draft.global.apiKey;

    if (selectedProvider.authType === 'none') {
      const result = await verifyKey(provider, '');
      setVerifyState(result.ok ? 'ok' : 'error');
      if (!result.ok) setVerifyError(result.error ?? 'CLI not found or failed.');
      return;
    }

    if (selectedProvider.authType === 'url') {
      const baseUrl = draft.advanced.ollama?.baseUrl || selectedProvider.urlDefault || '';
      const model = draft.global.model || 'llama3.2';
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
  const mode: SettingsMode = draft.mode ?? 'standard';
  const setMode = (next: SettingsMode) => setDraft(d => ({ ...d, mode: next }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '92vh' }}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-gray-500" />
            <h2 id="settings-title" className="font-semibold text-gray-900">{tr(uiLang, 'settings')}</h2>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Account card — always visible, expands to full MembershipPanel */}
        <div className="shrink-0 border-b border-gray-100">
          <button
            onClick={() => setAccountExpanded(v => !v)}
            className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              {loggedIn
                ? <Cloud size={15} className="text-blue-500 shrink-0" />
                : <CloudOff size={15} className="text-gray-400 shrink-0" />}
              {loggedIn
                ? <span className="text-sm text-gray-800">{user?.email}</span>
                : <span className="text-sm text-gray-400">未连接云账号</span>}
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${accountExpanded ? 'rotate-180' : ''}`} />
          </button>
          {accountExpanded && (
            <div className="px-6 pb-4">
              <MembershipPanel />
            </div>
          )}
        </div>

        <div role="tablist" className="flex border-b border-gray-100 px-6 shrink-0">
          {([['providers', Cpu, tr(uiLang, 'providers')], ['skills', Zap, tr(uiLang, 'skills')], ['packs', Package, 'Packs'], ['profile', User, tr(uiLang, 'profile')]] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {tab === 'providers' && (
            <>
              <ModeToggle uiLang={uiLang} mode={mode} onChange={setMode} />

              <div>
                {mode === 'standard' ? (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {tr(uiLang, 'settingsPickProvider')}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {tr(uiLang, 'fullStackSub')}
                    </p>
                    <select
                      value={draft.global.provider}
                      onChange={e => handleProviderSelect(e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    >
                      <option value="">{tr(uiLang, 'settingsSelectProvider')}</option>
                      {STANDARD_PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.label} — {p.fullStackTagline ?? p.tagline}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      {tr(uiLang, 'textAi')} <span className="font-normal normal-case text-gray-400">— {tr(uiLang, 'textAiSubtitle')}</span>
                    </p>

                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">{tr(uiLang, 'cloud')}</p>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {cloudProviders.map(p => (
                        <ProviderCard key={p.id} p={p} selected={draft.global.provider === p.id} onSelect={handleProviderSelect} />
                      ))}
                    </div>

                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-1.5">{tr(uiLang, 'local')}</p>
                    <div className="grid grid-cols-3 gap-1.5 mb-4">
                      {localProviders.map(p => (
                        <ProviderCard key={p.id} p={p} selected={draft.global.provider === p.id} onSelect={handleProviderSelect} />
                      ))}
                    </div>
                  </>
                )}

                {selectedProvider && (
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">

                    {selectedProvider.authType === 'key' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'apiKey')}</label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={draft.global.apiKey}
                            onChange={e => { patchGlobal({ apiKey: e.target.value }); setVerifyState('idle'); }}
                            placeholder={selectedProvider.keyPlaceholder}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <VerifyButton state={verifyState} disabled={!draft.global.apiKey} onClick={handleVerify} label={tr(uiLang, 'btnVerify')} />
                        </div>
                        {selectedProvider.signupUrl && (
                          <p className="text-xs text-gray-400 mt-1">
                            {tr(uiLang, 'settingsNoKey')}{' '}
                            <a href={selectedProvider.signupUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              {tr(uiLang, 'settingsGetOneFree')}
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    {selectedProvider.authType === 'url' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'baseUrl')}</label>
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
                            {tr(uiLang, 'model')} <span className="text-red-400">*</span>
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
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${draft.global.model === m
                                  ? 'bg-blue-100 border-blue-400 text-blue-700'
                                  : 'border-gray-300 text-gray-500 hover:border-gray-400'
                                  }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>
                        <VerifyButton state={verifyState} disabled={!draft.global.model} onClick={handleVerify} label={tr(uiLang, 'btnTestConnection')} />
                      </>
                    )}

                    {selectedProvider.authType === 'none' && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          {tr(uiLang, 'labelNoApiKeyNeeded', selectedProvider.id.split('/')[1])}
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {tr(uiLang, 'commandPath')} <span className="font-normal text-gray-400">(optional, default: uses PATH)</span>
                          </label>
                          <input
                            type="text"
                            value={draft.global.model}
                            onChange={e => patchGlobal({ model: e.target.value })}
                            placeholder={selectedProvider.id === 'cli/claude' ? '/usr/local/bin/claude' : '/usr/local/bin/gemini'}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <VerifyButton state={verifyState} disabled={false} onClick={handleVerify} label={tr(uiLang, 'btnCheckCli')} />
                      </div>
                    )}

                    {selectedProvider.authType === 'key' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                          {tr(uiLang, 'labelModelOverrides')} <span className="font-normal text-gray-400">({tr(uiLang, 'labelProviderDefault')})</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: tr(uiLang, 'labelLlmDefault'), key: 'model' as const, cap: 'text' },
                            { label: tr(uiLang, 'labelTts'), key: 'ttsModel' as const, cap: 'text-to-speech' },
                            { label: tr(uiLang, 'labelStt'), key: 'sttModel' as const, cap: 'speech-to-text' },
                            { label: tr(uiLang, 'labelImage'), key: 'imageModel' as const, cap: 'text-to-image' },
                          ].map(({ label, key, cap }) => {
                            const defaults = PROVIDER_DEFAULTS[draft.global.provider] ?? {};
                            const placeholder = defaults[cap as keyof typeof defaults] ?? tr(uiLang, 'labelProviderDefault');
                            return (
                              <div key={key}>
                                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</label>
                                <ModelSelect
                                  value={draft.global[key] ?? ''}
                                  onChange={val => patchGlobal({ [key]: val })}
                                  provider={draft.global.provider}
                                  capability={cap}
                                  placeholder={placeholder}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <VerifyFeedback state={verifyState} error={verifyError} uiLang={uiLang} />
                  </div>
                )}
              </div>

              {mode === 'advanced' && (<>
              <CollapsibleSection
                id="transform"
                title="CFLT Transform"
                subtitle={tr(uiLang, 'labelTransformEngine')}
                open={!!openSections.transform}
                onToggle={() => toggleSection('transform')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'provider')}</label>
                    <select
                      value={draft.advanced.transform?.provider ?? ''}
                      onChange={e => patchAdv('transform', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— {tr(uiLang, 'globalDefault')} —</option>
                      {PROVIDERS.filter(p => p.authType !== 'url').map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Model <span className="font-normal text-gray-400">({tr(uiLang, 'settingsBlankDefault')})</span>
                    </label>
                    <ModelSelect
                      value={draft.advanced.transform?.model ?? ''}
                      onChange={val => patchAdv('transform', { model: val })}
                      provider={draft.advanced.transform?.provider || draft.global.provider}
                      capability="text"
                      placeholder="e.g. gemini-2.0-pro"
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                id="courseGen"
                title="Course Generation"
                subtitle={tr(uiLang, 'labelCourseOrchestrator')}
                open={!!openSections.courseGen}
                onToggle={() => toggleSection('courseGen')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'provider')}</label>
                    <select
                      value={draft.advanced.courseGen?.provider ?? ''}
                      onChange={e => patchAdv('courseGen', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— {tr(uiLang, 'globalDefault')} —</option>
                      {PROVIDERS.filter(p => p.authType !== 'url').map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Model <span className="font-normal text-gray-400">({tr(uiLang, 'settingsBlankDefault')})</span>
                    </label>
                    <ModelSelect
                      value={draft.advanced.courseGen?.model ?? ''}
                      onChange={val => patchAdv('courseGen', { model: val })}
                      provider={draft.advanced.courseGen?.provider || draft.global.provider}
                      capability="text"
                      placeholder="e.g. gemini-2.0-pro"
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                id="tts"
                title="Text-to-Speech"
                subtitle={tr(uiLang, 'labelTtsSub')}
                open={!!openSections.tts}
                onToggle={() => toggleSection('tts')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'provider')}</label>
                    <select
                      value={draft.advanced.tts?.provider ?? ''}
                      onChange={e => patchAdv('tts', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— {tr(uiLang, 'globalDefault')} —</option>
                      <option value="openai">{tr(uiLang, 'labelOpenAiCompatible')}</option>
                      <option value="qwen">{tr(uiLang, 'labelQwenCosyVoice')}</option>
                      <option value="openrouter">{tr(uiLang, 'labelOpenRouterTts')}</option>
                    </select>
                  </div>
                  {draft.advanced.tts?.provider === 'openai' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Base URL <span className="font-normal text-gray-400">({tr(uiLang, 'settingsInheritOpenAI')})</span>
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
                          Model <span className="font-normal text-gray-400">({tr(uiLang, 'settingsInheritServer')})</span>
                        </label>
                        <ModelSelect
                          value={draft.advanced.tts?.model ?? ''}
                          onChange={val => patchAdv('tts', { model: val })}
                          provider={draft.advanced.tts?.provider || draft.global.provider}
                          capability="text-to-speech"
                          placeholder="tts-1"
                        />
                      </div>
                    </>
                  )}
                  {(draft.advanced.tts?.provider === 'qwen' || draft.advanced.tts?.provider === 'openrouter') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        API Key <span className="font-normal text-gray-400">({tr(uiLang, 'leaveBlank')})</span>
                      </label>
                      <input
                        type="password"
                        value={draft.advanced.tts?.apiKey ?? ''}
                        onChange={e => patchAdv('tts', { apiKey: e.target.value })}
                        placeholder={draft.advanced.tts?.provider === 'qwen' ? 'sk-…' : 'sk-or-…'}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                id="stt"
                title="Speech-to-Text"
                subtitle={tr(uiLang, 'labelSttSub')}
                open={!!openSections.stt}
                onToggle={() => toggleSection('stt')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'provider')}</label>
                    <select
                      value={draft.advanced.stt?.provider ?? ''}
                      onChange={e => patchAdv('stt', { provider: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— {tr(uiLang, 'globalDefault')} —</option>
                      <option value="openai">{tr(uiLang, 'labelOpenAiCompatible')}</option>
                      <option value="qwen">{tr(uiLang, 'labelQwenParaformer')}</option>
                      <option value="openrouter">{tr(uiLang, 'labelOpenRouterStt')}</option>
                    </select>
                  </div>
                  {draft.advanced.stt?.provider === 'openai' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Base URL <span className="font-normal text-gray-400">({tr(uiLang, 'settingsInheritOpenAI')})</span>
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
                  {(draft.advanced.stt?.provider === 'qwen' || draft.advanced.stt?.provider === 'openrouter') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        API Key <span className="font-normal text-gray-400">({tr(uiLang, 'leaveBlank')})</span>
                      </label>
                      <input
                        type="password"
                        value={draft.advanced.stt?.apiKey ?? ''}
                        onChange={e => patchAdv('stt', { apiKey: e.target.value })}
                        placeholder={draft.advanced.stt?.provider === 'qwen' ? 'sk-…' : 'sk-or-…'}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                id="image"
                title="Image Generation"
                subtitle={tr(uiLang, 'labelImageSub')}
                open={!!openSections.image}
                onToggle={() => toggleSection('image')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'provider')}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[{ id: '', label: tr(uiLang, 'labelNoneServerEnv') }, ...IMAGE_PROVIDERS].map(p => (
                        <button
                          key={p.id}
                          onClick={() => patchAdv('imageGen', { provider: p.id })}
                          className={`py-2 text-sm rounded-lg border transition-all ${(draft.advanced.imageGen?.provider ?? '') === p.id
                            ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          {p.id === 'google' || p.id === 'openai' ? p.label : (p.id === '' ? tr(uiLang, 'labelNoneServerEnv') : p.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {draft.advanced.imageGen?.provider === 'openai' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Base URL <span className="font-normal text-gray-400">({tr(uiLang, 'settingsInheritEnv')})</span>
                        </label>
                        <input
                          type="text"
                          value={draft.advanced.imageGen?.baseUrl ?? ''}
                          onChange={e => patchAdv('imageGen', { baseUrl: e.target.value })}
                          placeholder="http://localhost:11434/v1"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <p className="text-xs text-gray-400 mt-1">Ollama · ComfyUI · any OpenAI-compatible image API</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Model <span className="font-normal text-gray-400">({tr(uiLang, 'settingsInheritEnv')})</span>
                        </label>
                        <ModelSelect
                          value={draft.advanced.imageGen?.model ?? ''}
                          onChange={val => patchAdv('imageGen', { model: val })}
                          provider={draft.advanced.imageGen?.provider || draft.global.provider}
                          capability="text-to-image"
                          placeholder="dall-e-3 · x/z-image-turbo · …"
                        />
                      </div>
                    </>
                  )}
                  {draft.advanced.imageGen?.provider && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{tr(uiLang, 'apiKey')}</label>
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
              </>)}
            </>
          )}

          {tab === 'skills' && (
            <div>
              <p className="text-xs text-gray-400 mb-4">
                {tr(uiLang, 'skillsSubtitle')}. Use <code className="bg-gray-100 px-1 rounded text-xs">{`{{VARIABLE}}`}</code> for dynamic values.
              </p>
              <SkillsContent uiLang={uiLang} />
            </div>
          )}

          {tab === 'packs' && (
            <PackManager uiLang={uiLang} />
          )}

          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{tr(uiLang, 'settingsProfileName')}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{tr(uiLang, 'settingsUserId')}</label>
                <p className="text-sm font-mono text-gray-400 bg-gray-50 rounded-xl px-3 py-2 break-all">{currentId || '—'}</p>
                <p className="text-xs text-gray-400 mt-1">{tr(uiLang, 'settingsFuture')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          {saveError
            ? <p className="text-xs text-red-600 flex-1">{saveError}</p>
            : <span />
          }
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              {tr(uiLang, 'cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              {tr(uiLang, 'settingsSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// === Sub-components ========================================================

function ModeToggle({ uiLang, mode, onChange }: { uiLang: string; mode: SettingsMode; onChange: (m: SettingsMode) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-1">
      {(['standard', 'advanced'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex-1 px-3 py-1.5 text-sm rounded-lg transition-all ${
            mode === m
              ? 'bg-white text-gray-900 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {m === 'standard' ? tr(uiLang, 'settingsStandard') : tr(uiLang, 'settingsAdvanced')}
          <span className="ml-2 text-[11px] text-gray-400 font-normal">
            {m === 'standard' ? tr(uiLang, 'settingsOneKeyAll') : tr(uiLang, 'settingsMixProviders')}
          </span>
        </button>
      ))}
    </div>
  );
}

function ProviderCard({ p, selected, onSelect }: { p: ProviderDef; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(p.id)}
      className={`text-left px-3 py-2 rounded-xl border transition-all ${selected
        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
    >
      <div className="font-medium text-sm text-gray-900 leading-tight">{p.label}</div>
      <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{p.tagline}</div>
    </button>
  );
}

function VerifyButton({ state, disabled, onClick, label }: {
  state: VerifyState; disabled: boolean; onClick: () => void; label: string;
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

function VerifyFeedback({ state, error, uiLang }: { state: VerifyState; error: string; uiLang: SupportedLang }) {
  if (state === 'ok') return <p className="flex items-center gap-1.5 text-sm text-green-700"><CheckCircle size={14} /> {tr(uiLang, 'verifyOk')}</p>;
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
