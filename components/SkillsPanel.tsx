'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  X, Zap, CheckCircle, AlertCircle, Loader2,
  RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';

import { t as tr, type SupportedLang, type DictKey } from '@/src/lib/ui-i18n';
import { SLOT_METADATA, type FeatureSlot, type SkillCategory } from '@/src/lib/skills/feature-slots';
import { CommunitySkillsPanel } from './CommunitySkillsPanel';

// ── Types ─────────────────────────────────────────────────────────────────

interface SkillVar { key: string; label: string }

interface Skill {
  _id: string;
  featureSlot: string;
  name: string;
  description: string;
  content: string;
  vars: SkillVar[];
  tags: string[];
  authorId: string;
  createdAt: string;
}

interface SlotInfo {
  slot: string;
  label: string;
  defaultFile: string;
  defaultContent: string;
  activeSkillId: string | null;
}

interface ValidationResult {
  valid: boolean;
  malformed: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function detectVars(content: string): string[] {
  const matches = [...content.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function validateContent(content: string): ValidationResult {
  const malformed: string[] = [];
  for (const line of content.split('\n')) {
    const stripped = line.replace(/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/g, '');
    if (/\{\{|\}\}/.test(stripped)) malformed.push(line.trim());
  }
  return { valid: malformed.length === 0, malformed };
}

// ── Helpers for metadata mapping ──────────────────────────────────────────

const FRIENDLY_LABELS: Record<string, DictKey> = {
  'roleplay-coach': 'skillLabelRoleplayCoach',
  'speech-eval': 'skillLabelSpeechEval',
  'sentence-refine': 'skillLabelSentenceRefine',
  'cflt-transformer': 'skillLabelCfltTransformer',
  'courseware-gen': 'skillLabelCoursewareGen',
  'courseware-repair': 'skillLabelCoursewareRepair',
  'roleplay-analysis': 'skillLabelRoleplayAnalysis',
  'speech-eval-user': 'skillLabelSpeechEvalUser',
  'sentence-refine-user': 'skillLabelSentenceRefineUser',
};

const DESCRIPTION_KEYS: Record<string, DictKey> = {
  'roleplay-coach': 'skillRoleplayCoachDesc',
  'speech-eval': 'skillSpeechEvalDesc',
  'sentence-refine': 'skillSentenceRefineDesc',
};

const CATEGORY_KEYS: Record<SkillCategory, DictKey> = {
  'core': 'skillCategoryCore',
  'practice': 'skillCategoryPractice',
  'courseware': 'skillCategoryCourseware',
};

// ── Skill Editor ──────────────────────────────────────────────────────────

function SkillEditor({
  slot,
  activeSkill,
  onSaved,
  onReset,
  uiLang,
}: {
  slot: SlotInfo;
  activeSkill: Skill | null;
  onSaved: () => void;
  onReset: () => void;
  uiLang: SupportedLang;
}) {
  const meta = SLOT_METADATA[slot.slot as FeatureSlot];
  const descKey = DESCRIPTION_KEYS[slot.slot];
  
  const friendlyLabel = FRIENDLY_LABELS[slot.slot] ? tr(uiLang, FRIENDLY_LABELS[slot.slot]) : slot.label;
  const [name, setName] = useState(activeSkill?.name ?? friendlyLabel);
  const [content, setContent] = useState(activeSkill?.content ?? slot.defaultContent ?? '');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedVars, setDetectedVars] = useState<string[]>(() => detectVars(activeSkill?.content ?? slot.defaultContent ?? ''));

  useEffect(() => {
    setDetectedVars(detectVars(content));
    setValidation(null);
  }, [content]);

  const handleValidate = () => setValidation(validateContent(content));

  const handleSave = async () => {
    const v = validateContent(content);
    setValidation(v);
    if (!v.valid) return;
    setSaving(true);
    setError(null);
    try {
      let skillId: string;
      if (activeSkill) {
        const res = await fetch(`/api/skills/${activeSkill._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        skillId = activeSkill._id;
      } else {
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureSlot: slot.slot, name, content }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        skillId = (await res.json())._id;
      }
      await fetch('/api/skills/slots', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slot.slot, skillId }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr(uiLang, 'skillSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      {descKey && (
        <p className="text-xs text-gray-500 leading-relaxed italic">
          {tr(uiLang, descKey)}
        </p>
      )}
      
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">{tr(uiLang, 'skillName')}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">{tr(uiLang, 'template')}</label>
          {validation && (
            <span className={`flex items-center gap-1 text-xs ${validation.valid ? 'text-green-600' : 'text-red-500'}`}>
              {validation.valid
                ? <><CheckCircle size={12} /> {tr(uiLang, 'valid')}</>
                : <><AlertCircle size={12} /> {tr(uiLang, 'syntaxError')}</>}
            </span>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder={tr(uiLang, 'skillPlaceholder')}
          spellCheck={false}
        />
      </div>

      {detectedVars.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {detectedVars.map((v) => (
            <span key={v} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono">
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      {validation?.malformed.length ? (
        <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {tr(uiLang, 'skillSyntaxErrorOn', validation.malformed[0])}
        </div>
      ) : null}

      {error && (
        <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleValidate}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {tr(uiLang, 'skillBtnValidate')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {tr(uiLang, 'skillBtnSave')}
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <RotateCcw size={12} /> {tr(uiLang, 'skillBtnReset')}
        </button>
      </div>
    </div>
  );
}

// ── Skills content (no modal wrapper) ────────────────────────────────────────

export function SkillsContent({ uiLang }: { uiLang: SupportedLang }) {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [activeSkillMap, setActiveSkillMap] = useState<Record<string, Skill | null>>({});
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadData = useCallback(async () => {
    const [slotsRes, skillsRes] = await Promise.all([
      fetch('/api/skills/slots'),
      fetch('/api/skills'),
    ]);
    const slotsData: SlotInfo[] = await slotsRes.json();
    const skillsData: Skill[] = await skillsRes.json();
    setSlots(slotsData);
    setMySkills(skillsData);

    const map: Record<string, Skill | null> = {};
    for (const s of slotsData) {
      map[s.slot] = s.activeSkillId
        ? skillsData.find((sk) => sk._id === s.activeSkillId) ?? null
        : null;
    }
    setActiveSkillMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReset = async (slot: string) => {
    await fetch('/api/skills/slots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, skillId: null }),
    });
    loadData();
    setExpandedSlot(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // Filter and group slots
  const visibleSlots = slots.filter(s => {
    const meta = SLOT_METADATA[s.slot as FeatureSlot];
    return showAdvanced || (meta?.level === 'basic');
  });

  const categories: SkillCategory[] = ['practice', 'core', 'courseware'];
  const grouped = categories.map(cat => ({
    cat,
    slots: visibleSlots.filter(s => SLOT_METADATA[s.slot as FeatureSlot]?.category === cat)
  })).filter(g => g.slots.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
          {showAdvanced ? tr(uiLang, 'skillAllCapabilities') : tr(uiLang, 'skillEssentials')}
        </span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-gray-600">{tr(uiLang, 'skillShowAdvanced')}</span>
          <div
            className={`w-8 h-4 rounded-full relative transition-colors ${showAdvanced ? 'bg-blue-600' : 'bg-gray-200'}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showAdvanced ? 'left-4.5' : 'left-0.5'}`} />
          </div>
        </label>
      </div>

      <CommunitySkillsPanel
        mySkills={mySkills as any}
        onForked={async (s) => {
          // Make the forked skill usable locally by creating a personal copy.
          try {
            await fetch('/api/skills', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                featureSlot: s.featureSlot,
                name: s.name,
                description: s.description ?? '',
                content: s.content,
                tags: [],
              }),
            });
            loadData();
          } catch { /* non-fatal */ }
        }}
      />

      {grouped.map(({ cat, slots }) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
            {tr(uiLang, CATEGORY_KEYS[cat])}
          </h3>
          <div className="space-y-2">
            {slots.map((slot) => {
              const active = activeSkillMap[slot.slot];
              const isExpanded = expandedSlot === slot.slot;
              const meta = SLOT_METADATA[slot.slot as FeatureSlot];
              
              return (
                <div key={slot.slot} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-blue-200 ring-2 ring-blue-50' : 'border-gray-200'}`}>
                  <button
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left ${isExpanded ? 'bg-blue-50/30' : ''}`}
                    onClick={() => setExpandedSlot(isExpanded ? null : slot.slot)}
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {FRIENDLY_LABELS[slot.slot] ? tr(uiLang, FRIENDLY_LABELS[slot.slot]) : slot.label}
                      </div>
                      {showAdvanced && (
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">{slot.slot}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle size={10} /> {active.name}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          {tr(uiLang, 'skillSystemDefault')}
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronUp size={14} className="text-gray-400" />
                        : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 bg-white">
                      <SkillEditor
                        slot={slot}
                        activeSkill={active}
                        onSaved={() => { loadData(); setExpandedSlot(null); }}
                        onReset={() => handleReset(slot.slot)}
                        uiLang={uiLang}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Standalone modal wrapper ─────────────────────────────────────────────────

interface Props { onClose: () => void; uiLang: SupportedLang; }

export function SkillsPanel({ onClose, uiLang }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-blue-600" />
            <span className="font-semibold text-gray-900">{tr(uiLang, 'skills')}</span>
            <span className="text-xs text-gray-400 ml-1">{tr(uiLang, 'skillsSubtitle')}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <SkillsContent uiLang={uiLang} />
        </div>
      </div>
    </div>
  );
}
