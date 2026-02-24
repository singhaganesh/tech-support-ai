export default function CheckEmailPage() {
    return (
        <div className="flex flex-col min-h-screen bg-neutral-950 text-neutral-100 font-sans">
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    {/* Email Icon */}
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(234,88,12,0.3)] mx-auto mb-6">
                        ✉️
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
                    <p className="text-neutral-400 leading-relaxed mb-8">
                        We've sent you a magic link to sign in. Click the link in your email to continue.
                    </p>

                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 text-sm text-neutral-400">
                        <p>💡 <strong className="text-neutral-300">Tip:</strong> Check your spam folder if you don't see the email within a minute.</p>
                    </div>

                    <a
                        href="/login"
                        className="inline-block mt-6 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                    >
                        ← Back to login
                    </a>
                </div>
            </div>
        </div>
    );
}
