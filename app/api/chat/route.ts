import { Pinecone } from '@pinecone-database/pinecone';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOpenAI } from '@langchain/openai'; // Using OpenAI adapter for Sarvam
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter } from 'ai';

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
});

// Using App Router Edge Runtime or Node runtime. 
// We'll use Node runtime since Langchain's ChatOllama relies on it seamlessly.
export const maxDuration = 45;

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();
        const latestMessage = messages[messages.length - 1].content;

        console.log(`💬 User asks (Bengali expected): "${latestMessage}"`);

        // 1. Initialize Sarvam LLM
        // Sarvam provides an OpenAI-compatible API endpoint
        const sarvamLlm = new ChatOpenAI({
            modelName: "sarvam-m", // FIX MODEL
            apiKey: process.env.SARVAM_API_KEY || "sk_syhbm7vu_UJvofGSgpCKbCpXGSqtfrAX9",
            configuration: {
                baseURL: "https://api.sarvam.ai/v1", // FIX URL (OpenAI adapter auto-appends /chat/completions)
            },
            temperature: 0.1,
        });

        // 2. TRANSLATION INTERCEPTOR (Bengali -> English)
        console.log('🗣️ Translating question to English via Sarvam...');
        const translationPrompt = PromptTemplate.fromTemplate(`
You are a highly accurate English translator.
Translate the following Bengali question strictly into English. 
Do not answer the question. ONLY output the English translation.

Bengali text: {input}
English translation:`);

        const englishQuestion = await translationPrompt.pipe(sarvamLlm).pipe(new StringOutputParser()).invoke({
            input: latestMessage
        });
        console.log(`🗣️ Translated to: "${englishQuestion}"`);

        // 3. Generate embedding for the ENGLISH translation locally
        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        });

        console.log('🔍 Generating query vector for English text...');
        const queryVector = await embeddings.embedQuery(englishQuestion);

        // 4. Search Pinecone for context
        console.log('🌲 Searching Pinecone database...');
        const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
        const queryResponse = await index.query({
            vector: queryVector,
            topK: 3,
            includeMetadata: true,
        });

        // 5. Extract relevant context
        const contextStr = queryResponse.matches
            .map((match) => match.metadata?.text)
            .join('\n\n');

        console.log(`📚 Found Context: \n${contextStr}\n`);

        // 6. Build strictly scoped prompt for BENGALI output
        const prompt = PromptTemplate.fromTemplate(`You are a top-tier technical support assistant for the SEPLe HMS/Dexter Panel. Your job is strictly to answer troubleshooting and setup questions based ONLY on the provided context below.

CONTEXT FACTS:
{context}

STRICT RULES:
- Answer the specific question asked based on the context.
- Only use the context provided. Do not use outside knowledge.
- If the context does NOT contain the answer to the user's question, you MUST say exactly: "I don't have that information in my knowledge base."
- Do NOT hallucinate. Be helpful, concise, and professional.
- CRITICAL INSTRUCTION: You MUST translate your final answer and write it entirely in fluent, grammatically correct Bengali. Do not output English.

Question: {question}
Support Answer in Bengali:
`);

        // 7. Chain and stream the result back to the frontend
        const stream = await prompt.pipe(sarvamLlm).pipe(new StringOutputParser()).stream({
            context: contextStr,
            question: englishQuestion, // Use translated English question to match the English context
        });

        return LangChainAdapter.toDataStreamResponse(stream);
    } catch (error) {
        console.error('❌ Chat API Error:', error);
        return new Response(JSON.stringify({ error: 'Failed to process chat request. Check server console.' }), { status: 500 });
    }
}
