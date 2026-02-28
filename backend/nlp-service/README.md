# NLP Service

Lightweight FastAPI service for sentence embeddings, NSFW content detection, and text toxicity analysis, used by the main API for position similarity search and content moderation.

## Structure

```
nlp-service/
├── app/
│   ├── main.py           # FastAPI app, health endpoint, route setup
│   ├── embeddings.py     # Sentence embedding generation (sentence-transformers)
│   ├── nsfw_detector.py  # NSFW content classification
│   ├── toxicity.py       # Text toxicity detection (detoxify, Jigsaw/Perspective model)
│   ├── proposal_prompts.py  # System prompt templates for AI-guided proposal creation (loads from YAML)
│   └── llm_providers/    # LLM provider abstraction for multi-provider support
│       ├── __init__.py          # Package exports (create_provider, get_provider)
│       ├── base.py              # Abstract base class for LLM providers
│       ├── factory.py           # Factory for creating provider instances from LLM_PROVIDER env var
│       ├── anthropic_provider.py  # Anthropic Claude LLM provider
│       └── openai_provider.py     # OpenAI LLM provider
├── prompts/
│   └── proposal_prompts.yaml  # YAML prompt templates for AI proposal wizard (source of truth)
├── tests/
│   ├── conftest.py       # Shared fixtures (mock models, test images, TestClient)
│   ├── test_embeddings.py     # EmbeddingModel unit tests (init, embed, similarity)
│   ├── test_nsfw_detector.py  # NSFW detection + image processing unit tests
│   ├── test_toxicity.py       # Toxicity detection unit tests
│   ├── test_endpoints.py      # FastAPI endpoint tests via TestClient
│   └── test_llm_providers.py  # LLM provider abstraction and proposal-assist endpoint tests
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
| `/resize-avatar` | POST | Resize avatar image |

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
