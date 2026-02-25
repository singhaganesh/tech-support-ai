import { createClient } from '@supabase/supabase-js';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as fs from 'fs';
import * as path from 'path';

// ─── Parse CLI Arguments ────────────────────────────────────────
function parseArgs() {
    const args: Record<string, string> = {};
    process.argv.slice(2).forEach((arg) => {
        const match = arg.match(/^--(\w+)=(.+)$/);
        if (match) args[match[1]] = match[2];
    });
    return args;
}

async function ingestPdf() {
    const args = parseArgs();
    const filePath = args.file;
    const sourceName = args.name || path.basename(filePath || '');
    const chunkSize = parseInt(args.chunkSize || '800');
    const chunkOverlap = parseInt(args.chunkOverlap || '150');

    if (!filePath) {
        console.error('❌ Usage: npx tsx scripts/ingest-pdf.ts --file="path/to/file.pdf" --name="Manual Name" [--chunkSize=800] [--chunkOverlap=150]');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📄 PDF Ingestion Tool');
    console.log('═'.repeat(60));
    console.log(`📁 File: ${filePath}`);
    console.log(`📝 Source Name: ${sourceName}`);
    console.log(`✂️  Chunk size: ${chunkSize}, overlap: ${chunkOverlap}`);

    // ─── 1. Read PDF ────────────────────────────────────────────
    console.log('\n📖 Reading PDF...');
    const pdfParse = (await import('pdf-parse')).default;
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    console.log(`   ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

    // ─── 2. Split into chunks ───────────────────────────────────
    console.log('✂️  Splitting into chunks...');
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    const chunks = await splitter.createDocuments([pdfData.text]);
    console.log(`   ${chunks.length} chunks created`);

    // ─── 3. Setup Supabase & Ollama ─────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const embeddings = new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: ollamaBaseUrl });

    // ─── 4. Embed & Upsert ──────────────────────────────────────
    let success = 0;
    const batchSize = 5;
    const totalBatches = Math.ceil(chunks.length / batchSize);

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        console.log(`\n⏳ Batch ${batchNum}/${totalBatches} (chunks ${i + 1}–${i + batch.length})...`);

        for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const chunkIndex = i + j;
            const id = `pdf_${sourceName.replace(/\s+/g, '_').toLowerCase()}_${String(chunkIndex).padStart(4, '0')}`;
            const content = chunk.pageContent;

            try {
                const vector = await embeddings.embedQuery(content);

                const { error } = await supabase.from('hms_knowledge').upsert({
                    id,
                    question: `[PDF Chunk] ${sourceName} - Part ${chunkIndex + 1}`,
                    answer: content,
                    category: 'pdf-manual',
                    content,
                    embedding: vector,
                    source: 'pdf',
                    source_name: sourceName,
                });

                if (error) {
                    console.error(`   ❌ ${id}: ${error.message}`);
                } else {
                    console.log(`   ✅ ${id}: "${content.substring(0, 60)}..."`);
                    success++;
                }
            } catch (err: any) {
                console.error(`   ❌ ${id}: ${err.message}`);
            }
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ PDF ingestion complete!`);
    console.log(`   Success: ${success}/${chunks.length} chunks`);
    console.log(`   Source: ${sourceName}`);
    console.log('═'.repeat(60) + '\n');
}

ingestPdf().catch(console.error);
