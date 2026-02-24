'use client';

import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.push('/login/check-email');
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-neutral-950 text-neutral-100 font-sans">
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {/* Logo / Brand */}
                    <div className="text-center mb-10">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-3xl shadow-[0_0_40px_rgba(234,88,12,0.3)] mx-auto mb-5">
                            📡
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">
                            Dexter Tech Support <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">AI</span>
                        </h1>
                        <p className="text-neutral-400 mt-2 text-sm">Service Engineer Chatbot</p>
                    </div>

                    {/* Login Card */}
                    <div className="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-3xl p-8 shadow-2xl">
                        <h2 className="text-xl font-semibold text-white mb-2">Sign in</h2>
                        <p className="text-neutral-400 text-sm mb-6">
                            Enter your email and we'll send you a magic link to sign in instantly — no password needed.
                        </p>

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1.5">
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@seple.com"
                                    required
                                    className="w-full bg-neutral-800/60 border border-neutral-700/80 p-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-white placeholder-neutral-500 text-[15px]"
                                />
                            </div>

                            {error && (
                                <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !email.trim()}
                                className="w-full p-3.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-500 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-orange-900/30 text-[15px]"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Sending magic link...
                                    </span>
                                ) : (
                                    'Send Magic Link'
                                )}
                            </button>
                        </form>
                    </div>

                    <p className="text-center text-neutral-600 text-xs mt-6">
                        Powered by SEPLE • Secure Authentication
                    </p>
                </div>
            </div>
        </div>
    );
}
