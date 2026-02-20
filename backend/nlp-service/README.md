# NLP Service

Lightweight FastAPI service for sentence embeddings, NSFW content detection, and text toxicity analysis, used by the main API for position similarity search and content moderation.

## Structure

```
nlp-service/
├── app/
│   ├── main.py           # FastAPI app, health endpoint, route setup
│   ├── embeddings.py     # Sentence embedding generation (sentence-transformers)
│   ├── nsfw_detector.py  # NSFW content classification
│   └── toxicity.py       # Text toxicity detection (detoxify, Jigsaw/Perspective model)
├── tests/
│   ├── conftest.py       # Shared fixtures (mock models, test images, TestClient)
│   ├── test_embeddings.py     # EmbeddingModel unit tests (init, embed, similarity)
│   ├── test_nsfw_detector.py  # NSFW detection + image processing unit tests
│   ├── test_toxicity.py       # Toxicity detection unit tests
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
| `/toxicity-check` | POST | Check text for toxicity (returns is_toxic + score) |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEVICE` | `cpu` | Inference device (cpu/cuda) |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence-transformers model name |
| `MAX_BATCH_SIZE` | `32` | Maximum batch size for embedding requests |
| `TOXICITY_MODEL` | `unbiased` | Detoxify model variant (unbiased reduces false positives on identity terms) |
| `TOXICITY_THRESHOLD` | `0.7` | Default toxicity threshold (0.0-1.0) |

## Testing

```bash
cd backend/nlp-service && pip install pytest httpx && python3 -m pytest tests/ -v
```

Tests mock all ML models (SentenceTransformer, NudeNet, Detoxify) via `sys.modules` stubs — no model downloads or GPU needed. FastAPI endpoints are tested via `TestClient`.

## Integration

The main API server calls this service via `controllers/helpers/nlp.py` for:
- Generating position embeddings for similarity search (stored in PostgreSQL via pgvector)
- Checking new positions for NSFW content before publishing
- Checking chat messages and comments for toxicity before sending (pre-send friction via ReconsiderModal)
