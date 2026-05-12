"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, Award, Clock, BookOpen, Loader2, AlertCircle,
  Flame, CalendarDays, CalendarCheck, Sparkles, MessageSquare,
  Brain, Layers, Target, Globe2, Languages, ArrowRight,
} from 'lucide-react';
import { t as tr, type SupportedLang } from '../src/lib/ui-i18n';

interface DailyActivity {
  date: string;
  attempts: number;
  transforms: number;
  roleplayMsgs: number;
  total: number;
}

interface LearningCurvePoint {
  date: string;
  logic: number;
  pronunciation: number;
  overall: number;
  attempts: number;
}

interface TopPackage {
  slug: string;
  topic: string;
  attempts: number;
  avgScore: number;
  lastStudiedAt: string;
}

interface LangPair {
  pair: string;
  source: string;
  target: string;
  count: number;
}

interface VocabularyDistribution {
  total: number;
  due: number;
  newWords: number;
  learning: number;
  mature: number;
}

interface ProgressResponse {
  summary: {
    totalCourses: number;
    totalSessions: number;
    totalAttempts: number;
    avgScore: number;
    totalTransforms: number;
    totalRoleplaySessions: number;
    totalRoleplayMessages: number;
    totalVocabulary: number;
    studyDays: number;
    currentStreak: number;
    longestStreak: number;
    studyDaysThisMonth: number;
  };
  dailyActivity: DailyActivity[];
  learningCurve: LearningCurvePoint[];
  topPackages: TopPackage[];
  languagePairs: LangPair[];
  vocabulary: VocabularyDistribution;
}

interface ProgressDashboardProps {
  uiLang: SupportedLang;
  onNavigate?: (tab: 'transform' | 'course' | 'roleplay') => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ uiLang, onNavigate }) => {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await fetch('/api/progress');
        if (!response.ok) throw new Error('Failed to load progress');
        const stats: ProgressResponse = await response.json();
        setData(stats);
      } catch (err) {
        console.error(err);
        setFetchError(tr(uiLang, 'statsErrorLoad'));
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, [uiLang]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{tr(uiLang, 'statsLoading')}</p>
    </div>
  );

  if (fetchError) return (
    <div className="bg-white p-12 rounded-[2.5rem] shadow-xl text-center space-y-4">
      <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <p className="text-slate-500">{fetchError}</p>
    </div>
  );

  const isEmpty =
    !data ||
    (data.summary.totalAttempts === 0 &&
      data.summary.totalTransforms === 0 &&
      data.summary.totalRoleplayMessages === 0 &&
      data.summary.totalVocabulary === 0);

  if (isEmpty) return (
    <div className="bg-white p-12 rounded-[2.5rem] shadow-xl text-center space-y-6">
      <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
        <TrendingUp className="w-10 h-10 text-slate-300" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-black text-slate-800">{tr(uiLang, 'statsEmptyTitle')}</h3>
        <p className="text-slate-500 max-w-sm mx-auto">{tr(uiLang, 'statsEmptyBody')}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => onNavigate?.('transform')}
          className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <Languages className="w-4 h-4" />
          {tr(uiLang, 'statsGoTransform')}
        </button>
        <button
          onClick={() => onNavigate?.('course')}
          className="px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          {tr(uiLang, 'statsGoCourse')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <StreakSection data={data!} uiLang={uiLang} />
      <AbilitySection data={data!} uiLang={uiLang} />
      <MemorySection data={data!} uiLang={uiLang} />
    </div>
  );
};

// ---------------- Section: Daily Habit / Streak ----------------

const StreakSection: React.FC<{ data: ProgressResponse; uiLang: SupportedLang }> = ({ data, uiLang }) => {
  const { summary, dailyActivity } = data;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntry = dailyActivity.find((d) => d.date === todayKey);
  const activeToday = (todayEntry?.total ?? 0) > 0;

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<Flame className="w-4 h-4" />}
        title={tr(uiLang, 'statsSectionStreak')}
        accent="text-orange-600"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Flame className="w-5 h-5" />}
          tone="orange"
          label={tr(uiLang, 'statsCurrentStreak')}
          value={tr(uiLang, 'statsDays', String(summary.currentStreak))}
        />
        <StatCard
          icon={<Award className="w-5 h-5" />}
          tone="amber"
          label={tr(uiLang, 'statsLongestStreak')}
          value={tr(uiLang, 'statsDays', String(summary.longestStreak))}
        />
        <StatCard
          icon={<CalendarCheck className="w-5 h-5" />}
          tone="emerald"
          label={tr(uiLang, 'statsStudyDaysMonth')}
          value={tr(uiLang, 'statsDays', String(summary.studyDaysThisMonth))}
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5" />}
          tone="blue"
          label={tr(uiLang, 'statsStudyDaysTotal')}
          value={tr(uiLang, 'statsDays', String(summary.studyDays))}
        />
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">
            {tr(uiLang, 'statsActivityHeatmap')}
          </h4>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${activeToday ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {activeToday ? tr(uiLang, 'statsActivityToday') : tr(uiLang, 'statsActivityNoneToday')}
          </span>
        </div>
        <ActivityHeatmap days={dailyActivity} />
      </div>
    </section>
  );
};

const ActivityHeatmap: React.FC<{ days: DailyActivity[] }> = ({ days }) => {
  // Color scale: 0 → slate-100, 1 → emerald-200, 2-3 → emerald-400, 4-6 → emerald-500, 7+ → emerald-600
  const intensity = (n: number) => {
    if (n === 0) return 'bg-slate-100';
    if (n === 1) return 'bg-emerald-200';
    if (n <= 3) return 'bg-emerald-400';
    if (n <= 6) return 'bg-emerald-500';
    return 'bg-emerald-600';
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-15 gap-1.5" style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}>
        {days.map((d) => {
          const dt = new Date(d.date + 'T00:00:00.000Z');
          const label = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()} · ${d.total} (${d.attempts} voice · ${d.transforms} transform · ${d.roleplayMsgs} chat)`;
          return (
            <div
              key={d.date}
              title={label}
              className={`aspect-square rounded-md ${intensity(d.total)} transition-transform hover:scale-110`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <span>0</span>
        <div className="w-3 h-3 rounded-sm bg-slate-100" />
        <div className="w-3 h-3 rounded-sm bg-emerald-200" />
        <div className="w-3 h-3 rounded-sm bg-emerald-400" />
        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
        <div className="w-3 h-3 rounded-sm bg-emerald-600" />
        <span>7+</span>
      </div>
    </div>
  );
};

// ---------------- Section: Practice & Skill ----------------

const AbilitySection: React.FC<{ data: ProgressResponse; uiLang: SupportedLang }> = ({ data, uiLang }) => {
  const { summary, learningCurve, topPackages, languagePairs } = data;

  const formattedCurve = useMemo(
    () =>
      learningCurve.map((p) => {
        const dt = new Date(p.date + 'T00:00:00.000Z');
        return { ...p, label: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}` };
      }),
    [learningCurve],
  );

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<Target className="w-4 h-4" />}
        title={tr(uiLang, 'statsSectionAbility')}
        accent="text-blue-600"
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={<BookOpen className="w-5 h-5" />} tone="blue" label={tr(uiLang, 'statsTotalSessions')} value={summary.totalSessions} />
        <StatCard icon={<Award className="w-5 h-5" />} tone="emerald" label={tr(uiLang, 'statsAvgScore')} value={`${summary.avgScore}%`} />
        <StatCard icon={<Clock className="w-5 h-5" />} tone="amber" label={tr(uiLang, 'statsTotalAttempts')} value={summary.totalAttempts} />
        <StatCard icon={<Sparkles className="w-5 h-5" />} tone="violet" label={tr(uiLang, 'statsTotalTransforms')} value={summary.totalTransforms} />
        <StatCard icon={<MessageSquare className="w-5 h-5" />} tone="rose" label={tr(uiLang, 'statsTotalRoleplay')} value={summary.totalRoleplayMessages} />
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-800">{tr(uiLang, 'statsLearningCurve')}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              {tr(uiLang, 'statsLearningCurveSubtitle')}
            </p>
          </div>
        </div>

        {formattedCurve.length < 3 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            {formattedCurve.length === 0
              ? tr(uiLang, 'statsLearningCurveEmpty')
              : `Complete ${3 - formattedCurve.length} more voice challenge${3 - formattedCurve.length === 1 ? '' : 's'} to see your progress curve.`}
          </p>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedCurve}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Line
                  name={tr(uiLang, 'statsLogicStress')}
                  type="monotone"
                  dataKey="logic"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  name={tr(uiLang, 'statsPronunciation')}
                  type="monotone"
                  dataKey="pronunciation"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  name={tr(uiLang, 'statsOverallScore')}
                  type="monotone"
                  dataKey="overall"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Layers className="w-4 h-4" />
            <h4 className="text-sm font-black uppercase tracking-widest">{tr(uiLang, 'statsTopPackages')}</h4>
          </div>
          {topPackages.length === 0 ? (
            <p className="text-sm text-slate-400">{tr(uiLang, 'statsTopPackagesEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {topPackages.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{p.topic}</p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                      {tr(uiLang, 'statsAttemptsLabel', String(p.attempts))}
                    </p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black tabular-nums">
                    {p.avgScore}%
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Globe2 className="w-4 h-4" />
            <h4 className="text-sm font-black uppercase tracking-widest">{tr(uiLang, 'statsLanguagePairs')}</h4>
          </div>
          {languagePairs.length === 0 ? (
            <p className="text-sm text-slate-400">{tr(uiLang, 'statsLanguagePairsEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {languagePairs.map((lp) => {
                const max = languagePairs[0].count;
                const pct = Math.max(8, Math.round((lp.count / max) * 100));
                return (
                  <li key={lp.pair} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-slate-700 flex items-center gap-2">
                        <Languages className="w-3.5 h-3.5 text-slate-400" />
                        {lp.source} → {lp.target}
                      </span>
                      <span className="font-black tabular-nums text-slate-500">{lp.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

// ---------------- Section: Memory / Vocabulary SRS ----------------

const MemorySection: React.FC<{ data: ProgressResponse; uiLang: SupportedLang }> = ({ data, uiLang }) => {
  const { vocabulary } = data;
  const totalKnown = vocabulary.newWords + vocabulary.learning + vocabulary.mature;
  const pct = (n: number) => (totalKnown === 0 ? 0 : Math.round((n / totalKnown) * 100));

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={<Brain className="w-4 h-4" />}
        title={tr(uiLang, 'statsSectionMemory')}
        accent="text-violet-600"
      />

      {vocabulary.total === 0 ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
          <p className="text-sm text-slate-400">{tr(uiLang, 'statsVocabEmpty')}</p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon={<Layers className="w-5 h-5" />} tone="violet" label={tr(uiLang, 'statsVocabTotal')} value={vocabulary.total} />
            <StatCard icon={<Target className="w-5 h-5" />} tone="rose" label={tr(uiLang, 'statsVocabDue')} value={vocabulary.due} />
            <StatCard icon={<Sparkles className="w-5 h-5" />} tone="blue" label={tr(uiLang, 'statsVocabNew')} value={vocabulary.newWords} />
            <StatCard icon={<TrendingUp className="w-5 h-5" />} tone="amber" label={tr(uiLang, 'statsVocabLearning')} value={vocabulary.learning} />
            <StatCard icon={<Award className="w-5 h-5" />} tone="emerald" label={tr(uiLang, 'statsVocabMature')} value={vocabulary.mature} />
          </div>

          {totalKnown > 0 && (
            <div className="space-y-2">
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                {vocabulary.newWords > 0 && <div className="bg-blue-400" style={{ width: `${pct(vocabulary.newWords)}%` }} />}
                {vocabulary.learning > 0 && <div className="bg-amber-400" style={{ width: `${pct(vocabulary.learning)}%` }} />}
                {vocabulary.mature > 0 && <div className="bg-emerald-500" style={{ width: `${pct(vocabulary.mature)}%` }} />}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" />{tr(uiLang, 'statsVocabNew')} · {pct(vocabulary.newWords)}%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />{tr(uiLang, 'statsVocabLearning')} · {pct(vocabulary.learning)}%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{tr(uiLang, 'statsVocabMature')} · {pct(vocabulary.mature)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

// ---------------- Shared building blocks ----------------

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; accent: string }> = ({ icon, title, accent }) => (
  <div className={`flex items-center gap-2 ${accent}`}>
    {icon}
    <h2 className="text-xs font-black uppercase tracking-[0.25em]">{title}</h2>
  </div>
);

const TONE_CLASSES: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  tone: keyof typeof TONE_CLASSES;
  label: string;
  value: number | string;
}> = ({ icon, tone, label, value }) => {
  const t = TONE_CLASSES[tone] ?? TONE_CLASSES.blue;
  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
      <div className={`${t.bg} ${t.text} p-2.5 rounded-2xl shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest truncate">{label}</p>
        <p className="text-2xl font-black text-slate-800 tabular-nums">{value}</p>
      </div>
    </div>
  );
};
