# Brazil Elections 2026 Dashboard

A local dashboard for tracking Brazil's 2026 election results from the official Superior Electoral Court (TSE) data feed. Built with Python, FastAPI, and a vanilla JavaScript frontend, with Docker Compose for a reproducible setup.

Painel do **2º turno de 25/10/2026** para presidente, governador e votos brasileiros no exterior.

A página inicial mostra o total presidencial nacional (incluindo exterior), o total do exterior e cartões para os 26 estados e o Distrito Federal. O mapa alterna entre presidente e governador; os filtros permitem buscar estado e ver apurações finalizadas. A consulta por município usa os códigos oficiais do TSE.

A seção do exterior carrega sob demanda os locais de votação publicados no cadastro do TSE e permite buscar locais e filtrar resultados publicados ou apurações finalizadas. Depois de carregada, atualiza automaticamente. Votação encerrada não significa apuração publicada: o painel respeita a autorização de divulgação do TSE e não antecipa votos por fuso horário.

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

## Fonte e comportamento

- Fonte oficial: [documentação técnica do TSE](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados).
- Códigos do segundo turno: `6258` (presidente) e `6260` (governador), validados na configuração oficial EA11 do ciclo `ele2026` e turno `2`. A ausência da configuração exibe pendência, sem usar votos do primeiro turno.
- Estados sem disputa são identificados pela abrangência explícita de governador no EA11. Uma falha na fonte não prova ausência de disputa.
- Exterior usa a abrangência `zz` e seus locais cadastrados pelo TSE; nomes e códigos são preservados.
- Apuração finalizada usa `tf=s` ou andamento final `and=f`; seções totalizadas e situação dos candidatos vêm do TSE.
- Atualização automática a cada 30 segundos, cache compartilhado, ETag e Last-Modified. Consultas por abrangência limitadas a quatro tarefas simultâneas.
- Dados anteriores continuam visíveis com aviso quando a fonte falha. Falhas aguardam cinco minutos; HTTP 403/429 suspende consultas por onze minutos.
- Horários aparecem como publicados pelo TSE. Empate, ausência de votos e resultados indisponíveis deixam o mapa cinza.
- Os módulos e endpoints anteriores de primeiro turno e proporcionais foram preservados no código; a interface do segundo turno consulta apenas presidente e governador.

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
