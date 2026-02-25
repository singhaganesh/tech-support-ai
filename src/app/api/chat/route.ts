import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter } from 'ai';

// Force IPv4 DNS
dns.setDefaultResultOrder('ipv4first');

// ─── Configuration ───────────────────────────────────────────
const RAG_THRESHOLD = 0.65;
const LOG_THRESHOLD = 0.70;   // log for admin review if below this
const TOP_K = 3;
const SUPABASE_TIMEOUT_MS = 5000;

export const maxDuration = 45;

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();
        const latestMessage = messages[messages.length - 1].content;

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`💬 User asks: "${latestMessage}"`);

        // ─── 1. Initialize Sarvam LLM ─────────────────────────────
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: {
                baseURL: 'https://api.sarvam.ai/v1',
            },
            temperature: 0.1,
        });

        // ─── 2. Translate Bengali → English ────────────────────────
        console.log('🗣️  Translating to English via Sarvam...');
        const translationPrompt = PromptTemplate.fromTemplate(`
You are a highly accurate English translator.
Translate the following Bengali question strictly into English.
Do not answer the question. ONLY output the English translation.

Bengali text: {input}
English translation:`);

        const englishQuestion = await translationPrompt
            .pipe(sarvamLlm)
            .pipe(new StringOutputParser())
            .invoke({ input: latestMessage });

        console.log(`🗣️  Translated: "${englishQuestion}"`);

        // ─── 3. Try RAG search (with timeout + graceful fallback) ──
        let answerMode = 'general';
        let topSimilarity = 0;
        let contextStr = '';

        try {
            const embeddings = new OllamaEmbeddings({
                model: 'nomic-embed-text',
                baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            });

            console.log('🔍 Generating query vector...');
            const queryVector = await embeddings.embedQuery(englishQuestion);

            console.log('🗄️  Searching knowledge base...');
            const vectorStr = `[${queryVector.join(',')}]`;


            // Race: Supabase search vs timeout
            const supabase = getSupabase();
            const searchPromise = supabase.rpc('search_hms_knowledge', {
                query_embedding: vectorStr,
                similarity_threshold: 0.0,
                match_count: TOP_K,
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Supabase search timed out')), SUPABASE_TIMEOUT_MS)
            );

            const { data: matches, error: searchError } = await Promise.race([
                searchPromise,
                timeoutPromise,
            ]) as any;

            if (searchError) {
                console.warn('⚠️  Search error (falling back to LLM):', searchError.message);
            } else if (matches && matches.length > 0) {
                topSimilarity = matches[0].similarity;

                if (topSimilarity >= RAG_THRESHOLD) {
                    answerMode = 'rag';
                    contextStr = matches.map((m: any) => m.content).join('\n\n');
                }
            }
        } catch (searchErr: any) {
            console.warn(`⚠️  KB search failed (${searchErr.message}). Using LLM-only mode.`);
        }

        console.log(`📊 Top similarity: ${topSimilarity.toFixed(4)}`);
        console.log(`🎯 Mode: ${answerMode.toUpperCase()}`);

        // ─── 4. Log unknown question if similarity is weak ──
        if (topSimilarity < LOG_THRESHOLD) {
            console.log('📝 Logging as unknown question (similarity below LOG_THRESHOLD)...');
            try {
                const supabase = getSupabase();
                supabase.rpc('upsert_unknown_question', {
                    p_user_question: latestMessage,
                    p_english_text: englishQuestion,
                    p_top_similarity: topSimilarity,
                }).then(({ error }) => {
                    if (error) console.warn('⚠️  Unknown question log skipped:', error.message);
                    else console.log('✅ Unknown question logged for admin review');
                });
            } catch { /* ignore */ }
        }

        // ─── 5. Build Prompt Based on Mode ─────────────────────────
        let prompt: PromptTemplate;
        let promptInputs: Record<string, string>;

        if (answerMode === 'rag') {
            prompt = PromptTemplate.fromTemplate(`You are a top-tier technical support assistant for the SEPLe HMS/Dexter Panel. Your job is strictly to answer troubleshooting and setup questions based ONLY on the provided context below.

CONTEXT FACTS:
{context}

STRICT RULES:
- Answer the specific question asked based on the context.
- Only use the context provided. Do not use outside knowledge.
- If the context does NOT contain the answer, say: "I don't have that information in my knowledge base."
- Do NOT hallucinate. Be helpful, concise, and professional.
- CRITICAL: You MUST write your final answer entirely in fluent Bengali. Do not output English.

Question: {question}
Support Answer in Bengali:`);

            promptInputs = { context: contextStr, question: englishQuestion };
        } else {
            prompt = PromptTemplate.fromTemplate(`You are a knowledgeable industrial automation and control systems expert. The user has asked a question about HMS panels, industrial control, or related topics.

RULES:
- Answer using your general expertise in industrial automation, PLC, SCADA, HMS panels, communication protocols, and troubleshooting.
- Be helpful, accurate, and professional.
- If the question is completely unrelated to industrial control, politely say you specialize in industrial automation and HMS panel support.
- CRITICAL: You MUST write your final answer entirely in fluent Bengali. Do not output English.

Question: {question}
Expert Answer in Bengali:`);

            promptInputs = { question: englishQuestion };
        }

        // ─── 6. Stream Response ────────────────────────────────────
        const chain = prompt.pipe(sarvamLlm).pipe(new StringOutputParser());
        const stream = await chain.stream(promptInputs);

        // Log to analytics (non-blocking, skip if Supabase offline)
        try {
            const supabase = getSupabase();
            supabase.from('chat_sessions').insert({
                user_question: latestMessage,
                english_translation: englishQuestion,
                answer_mode: answerMode,
                top_similarity: topSimilarity,
            }).then(({ error }) => {
                if (error) console.warn('⚠️  Analytics skipped:', error.message);
            });
        } catch { /* ignore */ }

        console.log(`${'═'.repeat(60)}\n`);
        return LangChainAdapter.toDataStreamResponse(stream);
    } catch (error: any) {
        console.error('❌ Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.', answerMode: 'error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
