# DukanSaathi GenAI Backend

This is the production-ready GenAI backend for DukanSaathi. It provides intelligent, structured AI capabilities (such as zero-mistake invoice parsing and context-aware chat) using OpenAI's `gpt-4o-mini` (primary) and `gpt-4o` (fallback) models.

## 1. Architecture
The architecture is designed for **extreme reliability and minimal cost**.
It heavily utilizes Pydantic for validation, YAML for dynamic configuration, FAISS for local semantic retrieval, and Tenacity for robust exponential-backoff retries.

- **FastAPI**: Provides async HTTP endpoints.
- **Pydantic**: Validates both external YAML configuration at boot and LLM Structured Outputs at runtime.
- **Tenacity**: Wraps LLM calls. If `gpt-4o-mini` fails or times out, it retries. If it repeatedly fails, it triggers the fallback `gpt-4o` model.
- **Structlog**: Ensures all requests, failures, token usage, and latency are logged in JSON for observability.

## 2. Component Responsibilities
- `app/api/genai.py`: FastApi routers mapping HTTP endpoints.
- `app/core/config.py`: Loads and validates `config/*.yaml`.
- `app/llm/client.py`: The core LLM engine wrapper managing the OpenAI client and fallback logic.
- `app/retrieval/service.py`: FAISS-based semantic search engine (No LangChain bloat).
- `app/prompts/builder.py`: Combines YAML prompts with dynamic context.

## 3. Installation
1. Ensure Python 3.11+ is installed.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## 4. Environment Variables
Copy `.env.example` to `.env`. Gemini uses **Vertex AI + Application Default Credentials** (no API key).

```
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=asia-south1
GEMINI_MODEL=gemini-3.6-flash
GEMINI_STORE_PROMPTS=false
```

On Windows (Git Bash or WSL):

```bash
bash <(curl -sSL https://storage.googleapis.com/cloud-samples-data/adc/setup_adc.sh)
```

Or with the Google Cloud SDK:

```bash
gcloud auth application-default login
```

Enable the Vertex AI API on that GCP project. On a VM, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON instead of user ADC.

## 5. Configuration (YAML)
All logic is configuration-driven. Modify files in the `config/` directory without changing Python code:
- `application.yaml`: Logging level and app details.
- `models.yaml`: Primary and fallback models, retry counts, and timeout policies.
- `retrieval.yaml`: FAISS chunk size, top_k, and similarity thresholds.
- `prompts/`: Contains `chat.yaml` and `extraction.yaml`.

## 6. Running Locally
```bash
python server.py
# or
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```
Swagger UI available at: `http://localhost:8000/docs`

## 7. API Usage
### `POST /api/genai/extract`
Upload a base64 encoded image to receive a structured JSON response containing the supplier, date, and extracted products.

### `POST /api/genai/chat`
Send chat history. The system will retrieve context via RAG and respond using the `gpt-4o-mini` chat model.

### `POST /api/genai/index-documents`
Push text chunks to the FAISS vector index (runs as a FastAPI background task).

## 8. Fallback Behavior
1. The system calls `gpt-4o-mini`.
2. If it hits a rate limit or API error, it retries (exponential backoff).
3. If it exhausts its retries, or hits a fatal structured validation error, it invokes `gpt-4o`.
4. If `gpt-4o` fails, a structured `FallbackError` is returned to the client (never exposing stack traces).

## 9. Testing & Evaluation
Run the unit tests:
```bash
pytest tests/
```

## 10. Cost Optimization
- **gpt-4o-mini**: The default model costs ~$0.15 / 1M input tokens. This ensures 99% of requests are virtually free.
- **FAISS**: Retrieval is handled locally in-memory, avoiding expensive external vector DB costs.
- **Fallback**: The expensive `gpt-4o` model is strictly gated behind failure thresholds, avoiding accidental high billing.

## 11. Production Deployment
Use the included `docker-compose.yml`:
```bash
docker-compose up -d --build
```
Ensure you have a `.env` file present before building.

## 12. Security
- Secrets are explicitly loaded via `pydantic-settings`.
- Pydantic sanitizes all outputs, preventing prompt injection responses from corrupting downstream database logic.
