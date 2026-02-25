'use client';

import { useState, useEffect, useCallback } from 'react';

type UnknownQuestion = {
    id: string;
    user_question: string;
    english_text: string;
    top_similarity: number;
    frequency: number;
    status: string;
    created_at: string;
};

type Analytics = {
    totalChats: number;
    ragCount: number;
    generalCount: number;
    ragPercent: number;
    unknownQuestions: { total: number; pending: number; reviewed: number };
    topUnknown: { english_text: string; user_question: string; frequency: number; top_similarity: number }[];
    knowledgeBase: Record<string, { count: number; name: string }>;
    recentSessions: { user_question: string; answer_mode: string; top_similarity: number; created_at: string }[];
};

export default function AdminDashboard() {
    const [tab, setTab] = useState<'review' | 'analytics'>('review');
    const [questions, setQuestions] = useState<UnknownQuestion[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [answerText, setAnswerText] = useState('');
    const [category, setCategory] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    const fetchQuestions = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/admin/questions?status=pending');
        const data = await res.json();
        setQuestions(data.questions || []);
        setLoading(false);
    }, []);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        const res = await fetch('/api/admin/analytics');
        const data = await res.json();
        setAnalytics(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (tab === 'review') fetchQuestions();
        else fetchAnalytics();
    }, [tab, fetchQuestions, fetchAnalytics]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handleSaveAndTrain = async (q: UnknownQuestion) => {
        if (!answerText.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/seed-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questionId: q.id,
                    answer: answerText,
                    category: category || 'general',
                    englishQuestion: q.english_text,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('✅ Bot trained successfully!');
                setExpandedId(null);
                setAnswerText('');
                setCategory('');
                fetchQuestions();
            } else {
                showToast(`❌ Error: ${data.error}`);
            }
        } catch {
            showToast('❌ Network error');
        }
        setSaving(false);
    };

    const handleDismiss = async (id: string) => {
        await fetch('/api/admin/questions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: 'dismissed' }),
        });
        fetchQuestions();
        showToast('Question dismissed');
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-sm px-4 py-3 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2">
                    {toast}
                </div>
            )}

            {/* Header */}
            <header className="bg-neutral-900/80 backdrop-blur-md border-b border-neutral-800 p-4 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-xl shadow-lg">
                            ⚙️
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white">
                                Admin <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-300">Dashboard</span>
                            </h1>
                            <p className="text-xs text-neutral-400">Dexter HMS Bot — Train & Monitor</p>
                        </div>
                    </div>
                    <a href="/" className="text-xs text-neutral-400 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-full border border-neutral-700 hover:border-orange-500/50">
                        ← Back to Chat
                    </a>
                </div>
            </header>

            {/* Tabs */}
            <div className="max-w-5xl mx-auto px-4 pt-6">
                <div className="flex gap-1 bg-neutral-900/50 rounded-xl p-1 w-fit">
                    <button
                        onClick={() => setTab('review')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'review'
                            ? 'bg-violet-600 text-white shadow-lg'
                            : 'text-neutral-400 hover:text-white'
                            }`}
                    >
                        📝 Needs Review {questions.length > 0 && tab !== 'review' && (
                            <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{questions.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setTab('analytics')}
                        className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'analytics'
                            ? 'bg-violet-600 text-white shadow-lg'
                            : 'text-neutral-400 hover:text-white'
                            }`}
                    >
                        📊 Analytics
                    </button>
                </div>
            </div>

            {/* Content */}
            <main className="max-w-5xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                ) : tab === 'review' ? (
                    /* ─── NEEDS REVIEW TAB ───────────────────── */
                    <div className="space-y-4">
                        {questions.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="text-5xl mb-4">🎉</div>
                                <h2 className="text-xl font-semibold text-white mb-2">All caught up!</h2>
                                <p className="text-neutral-400">No pending questions to review.</p>
                            </div>
                        ) : (
                            questions.map((q) => (
                                <div
                                    key={q.id}
                                    className={`bg-neutral-900 border rounded-2xl overflow-hidden transition-all ${expandedId === q.id
                                        ? 'border-violet-500/50 shadow-lg shadow-violet-500/5'
                                        : 'border-neutral-800 hover:border-neutral-700'
                                        }`}
                                >
                                    {/* Question Header */}
                                    <button
                                        onClick={() => {
                                            setExpandedId(expandedId === q.id ? null : q.id);
                                            setAnswerText('');
                                            setCategory('');
                                        }}
                                        className="w-full text-left p-5 flex items-start justify-between gap-4"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium truncate">{q.english_text}</p>
                                            <p className="text-neutral-500 text-sm mt-1 truncate">{q.user_question}</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                                {q.frequency}× asked
                                            </span>
                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                                                {(q.top_similarity * 100).toFixed(0)}% match
                                            </span>
                                        </div>
                                    </button>

                                    {/* Expanded: Write Answer */}
                                    {expandedId === q.id && (
                                        <div className="px-5 pb-5 pt-0 border-t border-neutral-800 space-y-4">
                                            <div className="pt-4">
                                                <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">Category</label>
                                                <input
                                                    type="text"
                                                    value={category}
                                                    onChange={(e) => setCategory(e.target.value)}
                                                    placeholder="e.g. troubleshooting, installation, networking"
                                                    className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">Answer (English)</label>
                                                <textarea
                                                    value={answerText}
                                                    onChange={(e) => setAnswerText(e.target.value)}
                                                    rows={4}
                                                    placeholder="Write the correct English answer here. The bot will use this for future similar questions."
                                                    className="mt-1 w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                                                />
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => handleSaveAndTrain(q)}
                                                    disabled={saving || !answerText.trim()}
                                                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
                                                >
                                                    {saving ? '⏳ Training...' : '🚀 Save & Train Bot'}
                                                </button>
                                                <button
                                                    onClick={() => handleDismiss(q.id)}
                                                    className="py-2.5 px-4 text-neutral-400 text-sm border border-neutral-700 rounded-xl hover:border-red-500/50 hover:text-red-400 transition-all"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    /* ─── ANALYTICS TAB ──────────────────────── */
                    analytics && (
                        <div className="space-y-6">
                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <StatCard label="Total Chats" value={analytics.totalChats} icon="💬" />
                                <StatCard label="RAG Answers" value={`${analytics.ragCount} (${analytics.ragPercent}%)`} icon="📚" accent="text-emerald-400" />
                                <StatCard label="LLM Fallback" value={analytics.generalCount} icon="🤖" accent="text-amber-400" />
                                <StatCard label="Pending Review" value={analytics.unknownQuestions.pending} icon="❓" accent="text-red-400" />
                            </div>

                            {/* Knowledge Base Composition */}
                            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">📦 Knowledge Base</h3>
                                <div className="space-y-2">
                                    {Object.entries(analytics.knowledgeBase).map(([source, info]) => (
                                        <div key={source} className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${source === 'json' ? 'bg-blue-400' : source === 'pdf' ? 'bg-green-400' : 'bg-violet-400'}`} />
                                                <span className="text-sm text-neutral-300">{info.name}</span>
                                            </div>
                                            <span className="text-sm text-neutral-400 font-mono">{info.count} chunks</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Unknown Questions */}
                            {analytics.topUnknown.length > 0 && (
                                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                                    <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">🔥 Top Unknown Questions</h3>
                                    <div className="space-y-2">
                                        {analytics.topUnknown.map((q, i) => (
                                            <div key={i} className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-xl">
                                                <p className="text-sm text-neutral-300 truncate flex-1 mr-4">{q.english_text}</p>
                                                <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full flex-shrink-0">{q.frequency}×</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Sessions */}
                            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-4">📋 Recent Sessions</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-neutral-500 text-xs uppercase">
                                                <th className="text-left pb-3">Question</th>
                                                <th className="text-center pb-3">Mode</th>
                                                <th className="text-center pb-3">Score</th>
                                                <th className="text-right pb-3">Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-neutral-300">
                                            {analytics.recentSessions.map((s, i) => (
                                                <tr key={i} className="border-t border-neutral-800/50">
                                                    <td className="py-2.5 pr-4 truncate max-w-[200px]">{s.user_question}</td>
                                                    <td className="py-2.5 text-center">
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.answer_mode === 'rag'
                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                            }`}>
                                                            {s.answer_mode?.toUpperCase() || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-xs">
                                                        {s.top_similarity ? `${(s.top_similarity * 100).toFixed(0)}%` : '—'}
                                                    </td>
                                                    <td className="py-2.5 text-right text-xs text-neutral-500">
                                                        {new Date(s.created_at).toLocaleTimeString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )
                )}
            </main>
        </div>
    );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: string; accent?: string }) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-colors">
            <div className="text-2xl mb-2">{icon}</div>
            <p className={`text-2xl font-bold ${accent || 'text-white'}`}>{value}</p>
            <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">{label}</p>
        </div>
    );
}
