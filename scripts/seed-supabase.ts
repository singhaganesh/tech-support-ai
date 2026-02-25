import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import * as fs from 'fs';
import * as path from 'path';

// Force IPv4 + Google DNS (local DNS refuses *.supabase.co)
dns.setDefaultResultOrder('ipv4first');

const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

function customLookup(hostname: string, _opts: any, cb: Function) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

const agent = new Agent({
    connect: { family: 4, lookup: customLookup as any },
});

const customFetch = (input: any, init?: any) =>
    undiciFetch(input, { ...init, dispatcher: agent }) as unknown as Promise<Response>;

// Load .env variables
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function seed() {
    console.log('🏁 Starting Supabase seeding process...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            '❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env\n' +
            '   Get the service role key from: Supabase Dashboard → Project Settings → API'
        );
    }

    // 1. Initialize Supabase client with Google DNS fetch
    console.log('🗄️  Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as any },
    });

    // 2. Read Knowledge Base JSON
    console.log('📂 Reading dataset from data/hms-dexter-qa.json...');
    const dataPath = path.join(process.cwd(), 'data', 'hms-dexter-qa.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const qaData = JSON.parse(rawData);
    console.log(`   Found ${qaData.length} Q&A entries.\n`);

    // 3. Initialize Ollama Embeddings
    console.log('🦙 Initializing Ollama nomic-embed-text model...');
    const embeddings = new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: ollamaBaseUrl,
    });

    // 4. Process in batches of 10
    const BATCH_SIZE = 10;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < qaData.length; i += BATCH_SIZE) {
        const batch = qaData.slice(i, i + BATCH_SIZE);
        console.log(`\n⏳ Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(qaData.length / BATCH_SIZE)} (items ${i + 1}–${Math.min(i + BATCH_SIZE, qaData.length)})...`);

        for (const item of batch) {
            try {
                // Build rich embedding text
                const embeddingText = [
                    `[ID: ${item.id}]`,
                    `Product: ${item.product}`,
                    `Category: ${item.category} > ${item.subcategory}`,
                    `Tags: ${item.tags.join(', ')}`,
                    `Question: ${item.question}`,
                    `Answer: ${item.answer}`,
                ].join('\n');

                // Generate embedding vector
                const vector = await embeddings.embedQuery(embeddingText);

                // Upsert into Supabase
                const { error } = await supabase
                    .from('hms_knowledge')
                    .upsert({
                        id: item.id,
                        question: item.question,
                        answer: item.answer,
                        category: item.category,
                        subcategory: item.subcategory,
                        product: item.product,
                        tags: item.tags,
                        content: embeddingText,
                        embedding: vector,
                    }, { onConflict: 'id' });

                if (error) {
                    console.error(`   ❌ Error upserting ${item.id}: ${error.message}`);
                    errorCount++;
                } else {
                    console.log(`   ✅ ${item.id}: "${item.question.substring(0, 60)}..."`);
                    successCount++;
                }
            } catch (err: any) {
                console.error(`   ❌ Failed to process ${item.id}: ${err.message}`);
                errorCount++;
            }
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Seeding complete!`);
    console.log(`   Success: ${successCount}/${qaData.length}`);
    if (errorCount > 0) console.log(`   Errors:  ${errorCount}`);
    console.log(`${'='.repeat(50)}`);
}

seed().catch((error) => {
    console.error('\n❌ Fatal error seeding database:', error);
    process.exit(1);
});
