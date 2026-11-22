# Piano Learning App

Bun + React piano learning application with SQLite persistence, MIDI playback, and skill calibration.

## Running with Arcane (Git Sync) or Docker Compose

This repository includes a `Dockerfile` and `compose.yaml` ready to pull directly from GitHub in [Arcane](https://getarcane.app) (Git Sync -> **Build & Deploy**) or run locally with `docker compose up -d --build`.

### Configuration (Environment Variables)

All options are optional and can be set in Arcane's **Environment Variables** UI (or a local `.env` file):

| Variable | Default | Description |
| --- | --- | --- |
| `HOST_PORT` | `3000` | Host port mapped to the container |
| `PORT` | `3000` | Internal HTTP port inside the container |
| `DATA_VOLUME` | `piano_data` | Host bind-mount path (e.g. `/srv/piano/data`) or leave unset for a managed Docker volume mounted at `/app/data` |
| `DB_PATH` | `/app/data/piano.db` | SQLite database file path inside the container |
| `EXTERNAL_NETWORK` | `piano_default` | Name of an existing external Docker network to attach to (e.g. `proxy`) |
| `USE_EXTERNAL_NETWORK` | `false` | Set to `true` alongside `EXTERNAL_NETWORK` to join an existing external network |
| `AI_ENDPOINT` | *(app default)* | Optional Anthropic-compatible Messages API URL (set to `off` to disable) |
| `AI_MODEL` | *(app default)* | Optional AI coaching model name |
| `AI_API_KEY` | *(empty)* | Optional API key for `AI_ENDPOINT` |
| `AI_TIMEOUT_MS` | `8000` | AI coaching request timeout in milliseconds |

#### Example: Arcane Environment Variables with External Network & Host Volume

```env
HOST_PORT=3000
DATA_VOLUME=/srv/piano/data
EXTERNAL_NETWORK=proxy
USE_EXTERNAL_NETWORK=true
```
