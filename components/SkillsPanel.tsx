'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  X, Zap, CheckCircle, AlertCircle, Loader2,
  RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';

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

// ── Skill Editor ──────────────────────────────────────────────────────────

function SkillEditor({
  slot,
  activeSkill,
  onSaved,
  onReset,
}: {
  slot: SlotInfo;
  activeSkill: Skill | null;
  onSaved: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(activeSkill?.name ?? `My ${slot.label}`);
  const [content, setContent] = useState(activeSkill?.content ?? '');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedVars, setDetectedVars] = useState<string[]>([]);

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
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Skill name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">Template</label>
          {validation && (
            <span className={`flex items-center gap-1 text-xs ${validation.valid ? 'text-green-600' : 'text-red-500'}`}>
              {validation.valid
                ? <><CheckCircle size={12} /> Valid</>
                : <><AlertCircle size={12} /> Syntax error</>}
            </span>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder={`Write your skill template here.\nUse {{VARIABLE}} for dynamic values.`}
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
          Syntax error on: <code className="font-mono">{validation.malformed[0]}</code>
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
          Validate
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Save & Activate
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          <RotateCcw size={12} /> Reset to default
        </button>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function SkillsPanel({ onClose }: Props) {
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [activeSkillMap, setActiveSkillMap] = useState<Record<string, Skill | null>>({});
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-blue-600" />
            <span className="font-semibold text-gray-900">Skills</span>
            <span className="text-xs text-gray-400 ml-1">Customize AI prompts per feature</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : (
            slots.map((slot) => {
              const active = activeSkillMap[slot.slot];
              const isExpanded = expandedSlot === slot.slot;
              return (
                <div key={slot.slot} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpandedSlot(isExpanded ? null : slot.slot)}
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{slot.label}</div>
                      <div className="text-xs text-gray-400 font-mono">{slot.slot}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle size={10} /> {active.name}
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          System default
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronUp size={14} className="text-gray-400" />
                        : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <SkillEditor
                        slot={slot}
                        activeSkill={active}
                        onSaved={() => { loadData(); setExpandedSlot(null); }}
                        onReset={() => handleReset(slot.slot)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
