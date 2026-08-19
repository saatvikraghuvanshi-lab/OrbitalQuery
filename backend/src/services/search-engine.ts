/**
 * Semantic Search Engine for EO datasets
 * Uses TF-IDF + cosine similarity for semantic matching.
 * Falls back to keyword matching if TF-IDF computation is insufficient.
 * Can optionally use FAISS for larger indexes.
 */

interface DatasetCandidate {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  collection: string | null;
  [key: string]: any;
}

interface ScoredResult extends DatasetCandidate {
  score: number;
}

// TF-IDF inspired scoring with semantic expansion
const SEMANTIC_SYNONYMS: Record<string, string[]> = {
  // Land cover / vegetation
  'deforestation': ['forest loss', 'tree cover', 'vegetation loss', 'logging', 'clearing', 'land degradation'],
  'urbanization': ['urban expansion', 'city growth', 'built-up', 'urban sprawl', 'impervious surface'],
  'agriculture': ['cropland', 'farming', 'cultivation', 'harvest', 'irrigation', 'crop'],
  'vegetation': ['ndvi', 'greenness', 'plant cover', 'flora', 'biomass'],
  'forest': ['woodland', 'trees', 'canopy', 'timber', 'jungle'],
  'water': ['ocean', 'sea', 'lake', 'river', 'reservoir', 'hydrology', 'water body'],
  'flood': ['inundation', 'flooding', 'deluge', 'waterlogging'],
  'drought': ['dry', 'arid', 'moisture deficit', 'desertification'],
  'glacier': ['ice cap', 'snow cover', 'glacial', 'cryosphere', 'ice sheet'],
  'snow': ['ice', 'frost', 'frozen', 'winter', 'albedo'],
  'fire': ['burn', 'wildfire', 'smoke', 'fire scar', 'thermal anomaly', 'hotspot'],
  'coast': ['coastline', 'shore', 'beach', 'littoral', 'marine'],
  'mining': ['excavation', 'quarry', 'extraction', 'mine'],
  'wetland': ['marsh', 'swamp', 'bog', 'mangrove', 'riparian'],
  'temperature': ['thermal', 'heat', 'sst', 'land surface temperature', 'lst'],
  'rainfall': ['precipitation', 'rain', 'monsoon', 'rainfall'],
  'cloud': ['cloud cover', 'overcast', 'cloud fraction', 'atmosphere'],
  'night': ['nighttime', 'dms', 'city lights', 'nighttime lights', 'viirs'],
  'soil': ['ground', 'terrain', 'earth', 'sediment'],
  'pollution': ['contamination', 'air quality', 'haze', 'smog', 'emissions'],
  'erosion': ['degradation', 'weathering', 'sediment transport'],
  'ocean': ['marine', 'sea surface', 'wave', 'current', 'tide'],
  'change': ['temporal', 'time series', 'multi-temporal', 'change detection'],
  'classification': ['land use', 'land cover', 'lulc', 'categorization'],
};

// Geo-related query expansion for Indian / global contexts
const GEO_EXPANSIONS: Record<string, string[]> = {
  'himalayas': ['hindu kush', 'mountains', 'high altitude', 'snow', 'glacier', 'nepal', 'india'],
  'assam': ['northeast india', 'brahmaputra', 'flood', 'tea', 'elephant'],
  'jaipur': ['rajasthan', 'urban', 'desert', 'semi-arid', 'india'],
  'ganges': ['ganga', 'river', 'indo-gangetic', 'plain'],
  'thar': ['rajasthan', 'desert', 'arid', 'sand dune'],
  'sundarbans': ['mangrove', 'delta', 'bay of bengal', 'coastal'],
  'amazon': ['rainforest', 'tropical', 'brazil', 'deforestation', 'canopy'],
  'sahara': ['desert', 'arid', 'sand', 'dune', 'north africa'],
};

export class SemanticSearchEngine {
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
    'if', 'about', 'up', 'it', 'its', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his',
    'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who',
  ]);

  /**
   * Tokenize and normalize text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.STOP_WORDS.has(w));
  }

  /**
   * Expand query terms using semantic synonyms
   */
  private expandTerms(terms: string[]): string[] {
    const expanded = new Set(terms);
    for (const term of terms) {
      if (SEMANTIC_SYNONYMS[term]) {
        for (const syn of SEMANTIC_SYNONYMS[term]) {
          this.tokenize(syn).forEach(t => expanded.add(t));
        }
      }
      if (GEO_EXPANSIONS[term]) {
        for (const geo of GEO_EXPANSIONS[term]) {
          this.tokenize(geo).forEach(t => expanded.add(t));
        }
      }
    }
    return Array.from(expanded);
  }

  /**
   * Compute TF-IDF-like score between query and document
   */
  private computeSimilarity(queryTokens: string[], docText: string): number {
    const docTokens = this.tokenize(docText);
    if (docTokens.length === 0) return 0;

    const docTokenSet = new Set(docTokens);
    const docTokenFreq: Record<string, number> = {};

    for (const t of docTokens) {
      docTokenFreq[t] = (docTokenFreq[t] || 0) + 1;
    }

    // Cosine-like similarity: overlap / geometric mean of lengths
    let dotProduct = 0;
    let queryNorm = 0;

    for (const qt of queryTokens) {
      queryNorm += 1;
      if (docTokenFreq[qt]) {
        // TF component: term frequency in doc
        const tf = docTokenFreq[qt] / docTokens.length;
        // Weight boosted for exact matches
        dotProduct += 1 + tf * 2;
      }
    }

    if (dotProduct === 0) return 0;

    const docNorm = Math.sqrt(Object.values(docTokenFreq).reduce((s, f) => s + f * f, 0));

    return (dotProduct * 2) / (queryNorm + docNorm + 1);
  }

  /**
   * Score a dataset against the query
   */
  private scoreDataset(
    queryTokens: string[],
    expandedTokens: string[],
    dataset: DatasetCandidate,
  ): number {
    // Combine all searchable text
    const titleText = dataset.title || '';
    const descText = dataset.description || '';
    const collText = dataset.collection || '';
    const providerText = dataset.provider || '';
    const fullText = `${titleText} ${descText} ${collText} ${providerText}`;

    // Core TF-IDF similarity
    const coreScore = this.computeSimilarity(queryTokens, fullText);

    // Expanded similarity (semantic boost)
    const expandedScore = this.computeSimilarity(expandedTokens, fullText);

    // Title boost: matches in title are weighted higher
    const titleScore = this.computeSimilarity(queryTokens, titleText) * 1.5;

    // Combined score with weights
    return coreScore * 0.4 + expandedScore * 0.4 + titleScore * 0.2;
  }

  /**
   * Perform semantic search over candidate datasets
   */
  async search(
    query: string,
    candidates: DatasetCandidate[],
    limit: number = 20,
  ): Promise<ScoredResult[]> {
    if (candidates.length === 0) return [];

    const queryTokens = this.tokenize(query);
    const expandedTokens = this.expandTerms(queryTokens);

    // Score all candidates
    const scored: ScoredResult[] = candidates.map(dataset => ({
      ...dataset,
      score: this.scoreDataset(queryTokens, expandedTokens, dataset),
    }));

    // Sort by score descending, filter out zero scores
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
