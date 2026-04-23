# RAG (Retrieval-Augmented Generation) — Complete Learning Guide

> For AI Engineers who want to understand RAG deeply, not just copy-paste code.

---

## 1. WHY RAG EXISTS

### The Problem
LLMs have a **context window limit** (GPT-4o: 128K tokens, GLM-4.5: ~128K). Even with large windows:
- You can't fit an entire textbook (500+ pages = millions of tokens)
- Stuffing everything in is **expensive** (you pay per token)
- LLMs get worse with more context — "lost in the middle" problem
- LLMs **hallucinate** when they don't have the answer in context

### The Solution: Retrieve First, Then Generate
Instead of giving the LLM everything, give it only the **relevant pieces**:

```
User: "What is attention mechanism?"
                    ↓
        Search your documents for chunks
        about "attention mechanism"
                    ↓
        Found 5 relevant paragraphs
        from pages 42, 67, 89
                    ↓
        Give ONLY these 5 paragraphs
        to the LLM as context
                    ↓
        LLM generates answer grounded
        in those specific paragraphs
                    ↓
        "According to [Page 42], attention
         mechanism allows the model to..."
```

This is RAG: **Retrieval** (find relevant info) + **Augmented** (add it to prompt) + **Generation** (LLM creates answer).

---

## 2. THE RAG PIPELINE — Step by Step

### Stage A: Ingestion (happens once per document)

```
PDF/Document
    ↓
[1] LOAD — Extract raw text from PDF/TXT/MD
    ↓
[2] CHUNK — Split text into small pieces (300-1000 tokens each)
    ↓
[3] EMBED — Convert each chunk into a vector (array of numbers)
    ↓
[4] STORE — Save vectors + text in a vector database
```

### Stage B: Retrieval + Generation (happens per query)

```
User Query: "Explain backpropagation"
    ↓
[5] EMBED QUERY — Convert query to a vector
    ↓
[6] SEARCH — Find chunks whose vectors are closest to query vector
    ↓
[7] RERANK (optional) — Use a smarter model to re-sort results
    ↓
[8] AUGMENT — Inject top chunks into LLM prompt as context
    ↓
[9] GENERATE — LLM produces answer using only the context
    ↓
[10] CITE — Include source references in the answer
```

Let's go deep into each step.

---

## 3. CHUNKING — Why and How

### Why not just use the full document?
- Full document may exceed context window
- LLMs perform worse with irrelevant context mixed in
- Retrieval can't work on a single giant blob — it needs pieces to select from

### How chunking works

**Input text:**
```
Machine learning is a subset of AI. It focuses on building
systems that learn from data. There are three main types:

Supervised learning uses labeled data. The algorithm learns
to map inputs to known outputs. Examples include classification
and regression tasks.

Unsupervised learning finds hidden patterns in unlabeled data.
Common techniques include clustering and dimensionality reduction.
```

**After chunking (chunk_size=150, overlap=30):**
```
Chunk 0: "Machine learning is a subset of AI. It focuses on building
          systems that learn from data. There are three main types:"

Chunk 1: "There are three main types: Supervised learning uses labeled
          data. The algorithm learns to map inputs to known outputs.
          Examples include classification and regression tasks."

Chunk 2: "Examples include classification and regression tasks.
          Unsupervised learning finds hidden patterns in unlabeled data.
          Common techniques include clustering and dimensionality reduction."
```

Notice the **overlap** — "There are three main types:" appears in both Chunk 0 and 1. This prevents losing context at chunk boundaries.

### Chunking strategies

| Strategy | How | When to use |
|----------|-----|-------------|
| **Fixed size** | Every N characters | Simple, predictable |
| **Recursive** | Split by paragraphs → sentences → words | Best general-purpose (what LangChain uses) |
| **Semantic** | Split when topic changes (using embeddings) | Advanced, more accurate |
| **Document-aware** | Split by headers/sections in structured docs | PDFs with clear structure |

### Key parameters
- **chunk_size**: 500-1000 tokens is the sweet spot. Too small = loses context. Too large = includes irrelevant text.
- **chunk_overlap**: 10-20% of chunk_size. Prevents losing information at boundaries.

### Code (LangChain):
```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,      # characters per chunk
    chunk_overlap=100,   # overlap between consecutive chunks
    separators=["\n\n", "\n", ". ", " ", ""],  # try these in order
)

chunks = splitter.split_text(document_text)
# Returns: ["chunk 0 text...", "chunk 1 text...", ...]
```

**Why `RecursiveCharacterTextSplitter`?**
It tries to split at natural boundaries first (paragraph breaks, then sentences, then words). Only falls back to character-level when necessary.

---

## 4. EMBEDDINGS — The Core Concept

### What is an embedding?
A way to convert text into a **fixed-size array of numbers** (a vector) that captures its **meaning**.

```
"The cat sat on the mat"  → [0.12, -0.34, 0.56, 0.78, ...]  (384 numbers)
"A feline rested on a rug" → [0.11, -0.33, 0.55, 0.79, ...]  (similar numbers!)
"Stock market crashed today" → [-0.45, 0.67, -0.23, 0.11, ...] (very different numbers)
```

Texts with similar meanings produce similar vectors. This is how search works — find vectors close to the query vector.

### How similarity is measured

**Cosine Similarity**: Measures the angle between two vectors.
- 1.0 = identical meaning
- 0.0 = unrelated
- -1.0 = opposite meaning

```
similarity("cat on mat", "feline on rug") = 0.92  (very similar)
similarity("cat on mat", "stock market")  = 0.12  (unrelated)
```

### Embedding models

| Model | Dimensions | Speed | Quality | Cost |
|-------|-----------|-------|---------|------|
| `all-MiniLM-L6-v2` | 384 | Very fast | Good | Free (local) |
| `all-mpnet-base-v2` | 768 | Fast | Better | Free (local) |
| `text-embedding-3-small` | 1536 | API call | Great | $0.02/1M tokens |
| `text-embedding-3-large` | 3072 | API call | Best | $0.13/1M tokens |

**For this project:** Use `all-MiniLM-L6-v2` — runs locally, no API cost, good enough for study materials.

### Code:
```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

# Embed a single text
vector = model.encode("What is machine learning?")
# Returns: numpy array of shape (384,)

# Embed multiple texts at once (batched, faster)
vectors = model.encode(["chunk 1 text", "chunk 2 text", "chunk 3 text"])
# Returns: numpy array of shape (3, 384)
```

### Important concepts

**Embedding happens TWICE:**
1. At **ingestion time** — embed all document chunks and store vectors
2. At **query time** — embed the user's question to search against stored vectors

**Both must use the SAME model.** If you embed documents with MiniLM and query with OpenAI embeddings, the vectors live in different spaces and similarity search won't work.

---

## 5. VECTOR DATABASES — Where Vectors Live

### What is a vector database?
A database optimized for storing and searching vectors. Regular databases (Postgres) search by exact match. Vector databases search by **similarity** — "find the 5 vectors closest to this one."

### How search works internally

**Brute force (naive):** Compare query vector against every stored vector. O(n). Too slow for millions of chunks.

**ANN (Approximate Nearest Neighbor):** Build an index that trades small accuracy loss for massive speed gain. Algorithms:
- **HNSW** (Hierarchical Navigable Small World) — graph-based, most popular
- **IVF** (Inverted File Index) — partition-based
- **PQ** (Product Quantization) — compression-based

ChromaDB uses HNSW by default.

### Popular vector databases

| Database | Deployment | Best for |
|----------|-----------|----------|
| **ChromaDB** | Embedded or Docker | Prototypes, small-medium scale |
| **Qdrant** | Docker/Cloud | Production, filtering |
| **Pinecone** | Cloud only | Fully managed, zero ops |
| **Weaviate** | Docker/Cloud | Multimodal (text + images) |
| **pgvector** | Postgres extension | Already using Postgres |
| **FAISS** | In-memory (library) | Research, batch processing |

**For this project:** ChromaDB — lightweight Docker container, Python-native, easy to use.

### ChromaDB operations:
```python
import chromadb

client = chromadb.HttpClient(host="localhost", port=8000)

# Create a collection (like a table)
collection = client.get_or_create_collection(
    name="study_docs",
    metadata={"hnsw:space": "cosine"},  # use cosine similarity
)

# Add documents with embeddings
collection.add(
    ids=["chunk_0", "chunk_1", "chunk_2"],
    documents=["text of chunk 0", "text of chunk 1", "text of chunk 2"],
    embeddings=[[0.1, 0.2, ...], [0.3, 0.4, ...], [0.5, 0.6, ...]],
    metadatas=[
        {"file_id": "abc", "page": 1},
        {"file_id": "abc", "page": 2},
        {"file_id": "def", "page": 1},
    ],
)

# Query: find 5 most similar chunks
results = collection.query(
    query_embeddings=[[0.15, 0.25, ...]],  # embedded query
    n_results=5,
    where={"file_id": "abc"},  # optional: filter by metadata
)
# Returns: documents, metadatas, distances
```

### Metadata filtering
This is powerful — you can filter results before similarity search:
```python
# Only search within a specific file
where={"file_id": "abc123"}

# Only search files uploaded after a date
where={"upload_date": {"$gte": "2026-04-01"}}

# Combine filters
where={"$and": [{"file_id": "abc"}, {"page": {"$lte": 50}}]}
```

---

## 6. RETRIEVAL — Finding the Right Chunks

### Basic retrieval
```
Query: "What is backpropagation?"
    ↓
Embed query → [0.23, -0.45, 0.67, ...]
    ↓
Search ChromaDB: find 5 closest vectors
    ↓
Returns: 5 chunks with similarity scores
```

### The problem with basic retrieval
Cosine similarity is **lexical** at heart — it works well for similar words but struggles with:
- Paraphrasing: "How do neural networks learn?" vs a chunk about "gradient descent training procedure"
- Acronyms: "NLP" vs "Natural Language Processing"
- Abstract queries: "Explain the key innovation" (what innovation?)

### Two-stage retrieval (the production pattern)

```
Stage 1: RETRIEVE (fast, approximate)
    ChromaDB returns top-20 chunks by cosine similarity
    Speed: ~5ms for millions of vectors
    ↓
Stage 2: RERANK (slow, precise)  
    Cross-encoder scores each (query, chunk) pair
    Reorders the 20 chunks by relevance
    Keep top-5
    Speed: ~200ms for 20 pairs
```

### Cross-encoder reranking

**Why is it better?**

Bi-encoder (embeddings): Encodes query and document separately, then compares vectors.
Cross-encoder: Encodes query AND document together, producing a single relevance score.

```
Bi-encoder:
  encode("What is attention?") → vec_q
  encode("The attention mechanism allows...") → vec_d
  score = cosine(vec_q, vec_d)  # approximate

Cross-encoder:
  score = model("What is attention?", "The attention mechanism allows...")
  # Sees both together, much more accurate
```

Cross-encoders are too slow for initial search (would need to score every chunk) but perfect for re-ranking a small candidate set.

### Code:
```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# Score (query, chunk) pairs
pairs = [
    ("What is attention?", chunk_1_text),
    ("What is attention?", chunk_2_text),
    ("What is attention?", chunk_3_text),
]
scores = reranker.predict(pairs)
# Returns: [0.92, 0.15, 0.78]
# chunk_1 and chunk_3 are most relevant
```

---

## 7. AUGMENTATION — Building the Prompt

### The prompt structure

```
SYSTEM: You are a study assistant. Answer using ONLY the provided context.
        If the context doesn't contain the answer, say so.
        Cite sources using [Source N] format.

CONTEXT:
[Source 1: lecture_notes.pdf, Page 12]
Attention mechanism allows the model to focus on different parts
of the input sequence when producing each output token...

[Source 2: textbook.pdf, Page 89]  
The transformer architecture replaces recurrence with self-attention,
computing attention scores between all pairs of positions...

[Source 3: lecture_notes.pdf, Page 14]
Multi-head attention runs multiple attention functions in parallel,
allowing the model to attend to information from different
representation subspaces...

USER: Explain how attention mechanism works in transformers.
```

### Why "Answer using ONLY the provided context" matters
This prevents hallucination. Without this instruction, the LLM might:
- Make up facts not in the documents
- Mix its training data with your documents
- Give confident but wrong answers

With the grounding instruction, the LLM is constrained to what's actually in the retrieved chunks.

### Citation format
Including `[Source N: filename, Page X]` in the context lets the LLM reference specific sources. The frontend can then parse these citations and make them clickable.

---

## 8. EVALUATION — How to Know Your RAG Works

### Key metrics

| Metric | What it measures | How to test |
|--------|-----------------|-------------|
| **Retrieval precision** | Are retrieved chunks relevant? | Label chunks as relevant/irrelevant for test queries |
| **Retrieval recall** | Did we find ALL relevant chunks? | Check if known-relevant chunks appear in results |
| **Answer faithfulness** | Is the answer grounded in context? | Check if every claim has a source in context |
| **Answer relevance** | Does the answer address the question? | Human eval or LLM-as-judge |

### Quick evaluation approach
1. Create 20-30 test questions with known answers from your documents
2. Run retrieval → check if the right chunks are retrieved
3. Run full RAG → check if answers are correct and cited

### Tools for evaluation
- **RAGAS** — popular Python framework for RAG evaluation
- **LangSmith** — tracing and evaluation from LangChain
- **Your existing `rag-eval-system`** — you already built this!

---

## 9. COMMON PITFALLS

### Chunking too small
Chunks under 200 tokens lose context. "It refers to the method described above" — what method? The chunk doesn't include it.
**Fix:** Use overlap and reasonable chunk sizes (500-1000).

### Chunking too large
Chunks over 1500 tokens dilute relevance. A 2000-token chunk about "ML basics" will match queries about supervised, unsupervised, AND reinforcement learning equally.
**Fix:** Smaller chunks with good overlap.

### Wrong embedding model
Using different models for indexing and querying. Or using a model trained on English for non-English documents.
**Fix:** Same model everywhere. Use multilingual model for non-English.

### Not enough retrieved chunks
Top-3 might miss important context spread across the document.
**Fix:** Retrieve more (top-10-20), then rerank to top-5.

### No metadata filtering
Searching across ALL documents when the user asked about a specific file.
**Fix:** Use metadata filters to scope retrieval.

### Ignoring document structure
PDFs have headers, tables, figures. Naive text extraction loses this.
**Fix:** Use structure-aware parsers (PyMuPDF, Unstructured.io) that preserve headers and tables.

---

## 10. ADVANCED TOPICS (future learning)

### Hybrid Search
Combine vector search (semantic) with BM25 (keyword). Vector search finds "feline" when you search "cat". BM25 finds exact terms like "API key" that embeddings might miss. Best results come from combining both.

### Query Transformation
Before searching, transform the query:
- **HyDE** (Hypothetical Document Embeddings): Generate a hypothetical answer, embed THAT instead of the question. Gets better retrieval.
- **Multi-query**: Generate 3-5 variations of the question, retrieve for each, merge results.

### Agentic RAG
Instead of a fixed pipeline, use an LLM agent that decides:
- "Should I search the documents or do I already have enough context?"
- "The retrieved chunks don't answer this — let me reformulate and search again"
- "I need to search two different collections for this question"

### Knowledge Graphs + RAG (GraphRAG)
Build a knowledge graph from documents, then use graph traversal + vector search together. Microsoft's GraphRAG does this.

### Fine-tuning Embeddings
Train your embedding model on your specific domain for better retrieval. Important when your documents use specialized terminology.

---

## 11. LEARNING PATH

| Order | Topic | Resource |
|-------|-------|----------|
| 1 | RAG overview | This guide |
| 2 | Embeddings deep dive | sentence-transformers docs: sbert.net |
| 3 | LangChain RAG tutorial | python.langchain.com/docs/tutorials/rag |
| 4 | ChromaDB docs | docs.trychroma.com |
| 5 | Chunking strategies | "Evaluating Chunking Strategies for RAG" (blog by Greg Kamradt) |
| 6 | Reranking | sentence-transformers cross-encoder docs |
| 7 | RAG evaluation | RAGAS docs: docs.ragas.io |
| 8 | Advanced RAG patterns | "Building Production RAG" (blog by Anyscale) |
| 9 | Agentic RAG | LangGraph + RAG tutorials |
| 10 | GraphRAG | Microsoft GraphRAG paper + repo |

---

## 12. HOW THIS MAPS TO YOUR PROJECT

```
YOUR PROJECT NOW                    WHAT YOU'LL ADD
────────────────                    ──────────────
Upload PDF                     →   Upload + Chunk + Embed + Store
  (file_extractor.py)               (chunking_service.py + vector_store.py)

Full text → prompt             →   Query → Retrieve → Rerank → Prompt
  (prompt_service.py)               (vector_store.py + reranker.py)

Static generation              →   Conversational chat with memory
  (study_modes.py)                  (chat.py + conversation model)

Single file                    →   Multi-document collections
  (upload.py)                       (collections.py + collection model)

No sources                     →   Citation-grounded answers
  (just raw LLM output)            ([Source: file, Page N] in response)
```

Every piece maps to a real concept. You're not just coding — you're building understanding of the full RAG stack.
