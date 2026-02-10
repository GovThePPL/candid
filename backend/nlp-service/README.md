# NLP Service

Lightweight FastAPI service for sentence embeddings and NSFW content detection, used by the main API for position similarity search and content moderation.

## Structure

```
nlp-service/
├── app/
│   ├── main.py           # FastAPI app, health endpoint, route setup
│   ├── embeddings.py     # Sentence embedding generation (sentence-transformers)
│   └── nsfw_detector.py  # NSFW content classification
├── tests/
│   ├── conftest.py       # Shared fixtures (mock models, test images, TestClient)
│   ├── test_embeddings.py     # EmbeddingModel unit tests (init, embed, similarity)
│   ├── test_nsfw_detector.py  # NSFW detection + image processing unit tests
│   └── test_endpoints.py      # FastAPI endpoint tests via TestClient
├── pytest.ini            # Test configuration
├── Dockerfile            # Python container, model download at build time
└── requirements.txt      # Dependencies
```

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/embed` | POST | Generate sentence embeddings for position text |
| `/nsfw` | POST | Check text for NSFW content |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `cpu` | Inference device (cpu/cuda) |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence-transformers model name |
| `MAX_BATCH_SIZE` | `32` | Maximum batch size for embedding requests |

## Testing

```bash
cd backend/nlp-service && pip install pytest httpx && python3 -m pytest tests/ -v
```

Tests mock all ML models (SentenceTransformer, NudeNet) via `sys.modules` stubs — no model downloads or GPU needed. FastAPI endpoints are tested via `TestClient`.

## Integration

The main API server calls this service via `controllers/helpers/nlp.py` for:
- Generating position embeddings for similarity search (stored in PostgreSQL via pgvector)
- Checking new positions for NSFW content before publishing
