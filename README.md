# Brazil Elections 2026 Dashboard

A local dashboard for tracking Brazil's 2026 election results from the official Superior Electoral Court (TSE) data feed. Built with Python, FastAPI, and a vanilla JavaScript frontend, with Docker Compose for a reproducible setup.

View nationwide presidential results alongside state and municipal results for governor, senator, federal deputy, and state deputy. The Federal District displays district deputies instead of state deputies.

**Current scope: the first round of the 2026 elections only. Second-round support is not implemented.**

## Quick start with Docker

### Requirements

- Docker Engine or Docker Desktop with Docker Compose.
- Internet access to build the image and retrieve official TSE data.

From the project directory, build and start the dashboard:

```sh
docker compose up --build -d
```

Open [http://localhost:8000](http://localhost:8000).

Compose builds a Python 3.12 image, installs the application dependencies, and runs FastAPI through Uvicorn. The service binds to `127.0.0.1` on the host and uses the `unless-stopped` restart policy.

### Use a different port

If port 8000 is already in use:

```sh
PAINEL_PORT=8001 docker compose up --build -d
```

Then open [http://localhost:8001](http://localhost:8001).

To keep this setting across Compose commands, create a `.env` file in the project root:

```dotenv
PAINEL_PORT=8001
```

The container continues to listen on port 8000; `PAINEL_PORT` changes the host port only.

### Manage the service

```sh
# Check container status
docker compose ps

# Follow application logs
docker compose logs -f painel

# Rebuild and apply code changes
docker compose up --build -d

# Stop and remove the container and Compose network
docker compose down
```

If you set the port inline instead of using `.env`, include the same `PAINEL_PORT` value when starting or recreating the service.

## Features

- National presidential results and regional results for all 26 states and the Federal District.
- Municipality filtering using TSE municipality codes, rather than IBGE codes.
- Candidate vote counts, official percentages, and election status as published by TSE.
- Automatic refresh every 30 seconds.
- Shared in-memory caching and conditional requests using ETag and Last-Modified headers.
- Previously fetched data remains visible with a warning when updates fail.

## Data source and behavior

The application consumes official TSE JSON files using the EA11, EA12, and EA20 layouts. For the 2026 first round, it selects election IDs `6257` (federal) and `6259` (state), validating them against the official EA11 configuration.

See the [TSE technical documentation for election results](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados) for details about the source formats.

The dashboard displays official results and candidate status without generating simulated data or independently determining winners. Candidate percentages come from the official counted-vote fields, and vote classification is included when available.

Results depend on source availability and the TSE publication flag (`dv=s`). Files from a different election or a simulated environment are rejected. Generation and tally timestamps are displayed as published, without timezone conversion.

Failed requests wait five minutes before retrying. HTTP 403 or 429 responses pause upstream requests for eleven minutes. The cache is held in memory and resets when the application restarts.

## Technology stack

| Component | Technology |
| --- | --- |
| Backend | Python 3.12, FastAPI, Uvicorn |
| HTTP client | HTTPX with asynchronous requests |
| Frontend | HTML, CSS, vanilla JavaScript |
| Packaging | Docker and Docker Compose |
| Unit tests | Python unittest |

## Local development and tests

For development without Docker:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python eleicoes.py
```

Open [http://localhost:8000](http://localhost:8000).

Run the unit tests from the project root:

```sh
.venv/bin/python -m unittest discover -s tests -v
```
