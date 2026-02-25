import { getSupabase } from '@/lib/supabase';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { NextRequest, NextResponse } from 'next/server';

// POST — Save answer, embed, and add to knowledge base
export async function POST(req: NextRequest) {
    const supabase = getSupabase();
    try {
        const { questionId, answer, category, englishQuestion } = await req.json();

        if (!questionId || !answer || !englishQuestion) {
            return NextResponse.json(
                { error: 'questionId, answer, and englishQuestion are required' },
                { status: 400 }
            );
        }

        // 1. Generate embedding for the Q&A pair
        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        });

        const embeddingText = `Question: ${englishQuestion}\nAnswer: ${answer}`;
        const vector = await embeddings.embedQuery(embeddingText);

        // 2. Create a unique ID for this knowledge entry
        const knowledgeId = `admin_${Date.now()}`;

        // 3. Insert into hms_knowledge
        const { error: insertError } = await supabase.from('hms_knowledge').insert({
            id: knowledgeId,
            question: englishQuestion,
            answer: answer,
            category: category || 'admin-added',
            content: embeddingText,
            embedding: `[${vector.join(',')}]`,
            source: 'admin',
            source_name: 'Admin Dashboard',
        });

        if (insertError) throw insertError;

        // 4. Mark the unknown question as reviewed
        const { error: updateError } = await supabase
            .from('unknown_questions')
            .update({
                status: 'reviewed',
                admin_answer: answer,
                category: category || 'admin-added',
                updated_at: new Date().toISOString(),
            })
            .eq('id', questionId);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            knowledgeId,
            message: 'Answer saved and bot trained successfully!',
        });
    } catch (err: any) {
        console.error('❌ Seed answer error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
