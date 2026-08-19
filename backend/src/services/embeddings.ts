import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../index';

const INDEX_PATH = process.env.FAISS_INDEX_PATH || path.join(__dirname, '../../data/faiss_index');

/**
 * Simple TF-IDF vectorizer for embedding generation.
 * Works entirely in Node.js without Python dependencies.
 * For production, swap with HuggingFace sentence-transformers via ONNX Runtime.
 */
class TFIDFVectorizer {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'then', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'about', 'it', 'its',
    'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
  ]);

  tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.STOP_WORDS.has(w));
  }

  fit(texts: string[]): void {
    const docFreq = new Map<string, number>();
    const N = texts.length;
    const allTerms = new Set<string>();

    for (const text of texts) {
      const tokens = new Set(this.tokenize(text));
      for (const t of tokens) {
        allTerms.add(t);
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
      }
    }

    // Build vocabulary
    let idx = 0;
    for (const term of allTerms) {
      this.vocabulary.set(term, idx++);
      // IDF: log(N / df)
      this.idf.set(term, Math.log(N / (docFreq.get(term) || 1)));
    }
  }

  transform(text: string): number[] {
    const tokens = this.tokenize(text);
    const vec = new Array(this.vocabulary.size).fill(0);
    const tf = new Map<string, number>();

    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    for (const [term, freq] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        vec[idx] = (freq / tokens.length) * (this.idf.get(term) || 1);
      }
    }

    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec;
  }

  getVocabSize(): number {
    return this.vocabulary.size;
  }

  save(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
    const data = {
      vocabulary: Object.fromEntries(this.vocabulary),
      idf: Object.fromEntries(this.idf),
    };
    fs.writeFileSync(path.join(dir, 'vectorizer.json'), JSON.stringify(data));
  }

  load(dir: string): void {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'vectorizer.json'), 'utf-8'));
    this.vocabulary = new Map(Object.entries(raw.vocabulary));
    this.idf = new Map(Object.entries(raw.idf).map(([k, v]) => [k, v as number]));
  }
}

/**
 * Build embeddings for all datasets and store in FAISS-compatible format
 */
export async function buildEmbeddings(): Promise<{
  totalDatasets: number;
  vocabSize: number;
  indexSaved: boolean;
}> {
  console.log('🧠 Building embeddings for all datasets...');

  // Fetch all datasets
  const datasets = await prisma.eODataset.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      collection: true,
      provider: true,
      platform: true,
    },
  });

  if (datasets.length === 0) {
    console.log('   No datasets found. Run ingestion first.');
    return { totalDatasets: 0, vocabSize: 0, indexSaved: false };
  }

  // Prepare text corpus
  const texts = datasets.map(d =>
    `${d.title || ''} ${d.description || ''} ${d.collection || ''} ${d.platform || ''}`
  );

  // Fit TF-IDF vectorizer
  const vectorizer = new TFIDFVectorizer();
  vectorizer.fit(texts);

  console.log(`   Dataset count: ${datasets.length}`);
  console.log(`   Vocabulary size: ${vectorizer.getVocabSize()}`);

  // Generate vectors
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(vectorizer.transform(text));
  }

  // Save index (simple JSON format for now — swap for native FAISS in production)
  fs.mkdirSync(INDEX_PATH, { recursive: true });

  const indexData = {
    type: 'tfidf',
    dimension: vectorizer.getVocabSize(),
    count: vectors.length,
    vectors,
    datasetIds: datasets.map(d => d.id),
  };

  fs.writeFileSync(
    path.join(INDEX_PATH, 'index.json'),
    JSON.stringify(indexData),
  );

  vectorizer.save(INDEX_PATH);

  // Update dataset records with embedding IDs
  for (let i = 0; i < datasets.length; i++) {
    await prisma.eODataset.update({
      where: { id: datasets[i].id },
      data: {
        hasEmbedding: true,
        embeddingId: i,
      },
    });
  }

  console.log(`   ✅ Embeddings saved to ${INDEX_PATH}`);

  return {
    totalDatasets: datasets.length,
    vocabSize: vectorizer.getVocabSize(),
    indexSaved: true,
  };
}

/**
 * Load the TF-IDF index for search
 */
export function loadIndex(): {
  vectors: number[][];
  datasetIds: string[];
  vectorizer: TFIDFVectorizer;
} | null {
  const indexPath = path.join(INDEX_PATH, 'index.json');
  if (!fs.existsSync(indexPath)) return null;

  const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const vectorizer = new TFIDFVectorizer();
  vectorizer.load(INDEX_PATH);

  return {
    vectors: data.vectors,
    datasetIds: data.datasetIds,
    vectorizer,
  };
}

/**
 * Query the vector index for nearest neighbors
 */
export function queryIndex(
  query: string,
  topK: number = 20,
): { datasetId: string; score: number }[] {
  const index = loadIndex();
  if (!index) return [];

  const queryVec = index.vectorizer.transform(query);
  const scores: { datasetId: string; score: number }[] = [];

  for (let i = 0; i < index.vectors.length; i++) {
    // Cosine similarity (vectors are L2-normalized)
    let dot = 0;
    for (let j = 0; j < queryVec.length; j++) {
      dot += queryVec[j] * index.vectors[i][j];
    }
    scores.push({ datasetId: index.datasetIds[i], score: dot });
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
