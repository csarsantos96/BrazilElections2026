"""Painel local de resultados oficiais do TSE, leiautes EA11/EA12/EA20."""
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from proporcional import project
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE = "https://resultados.tse.jus.br"
ROOT = Path(__file__).resolve().parent
STATES = dict(ac="Acre", al="Alagoas", ap="Amapa", am="Amazonas", ba="Bahia", ce="Ceara", df="Distrito Federal", es="Espirito Santo", go="Goias", ma="Maranhao", mt="Mato Grosso", ms="Mato Grosso do Sul", mg="Minas Gerais", pa="Para", pb="Paraiba", pr="Parana", pe="Pernambuco", pi="Piaui", rj="Rio de Janeiro", rn="Rio Grande do Norte", rs="Rio Grande do Sul", ro="Rondonia", rr="Roraima", sc="Santa Catarina", sp="Sao Paulo", se="Sergipe", to="Tocantins")


class SourceError(Exception):
    pass


class TSE:
    def __init__(self, client):
        self.client = client
        self.cache = {}
        self.locks = {}
        self.blocked_until = 0

    async def get(self, url, ttl=30):
        async with self.locks.setdefault(url, asyncio.Lock()):
            entry = self.cache.get(url, {})
            now = time.monotonic()
            if now < entry.get("until", 0):
                if entry.get("data") is not None:
                    return entry["data"], entry.get("error")
                raise SourceError(entry.get("error", "Fonte indisponivel"))
            headers = {}
            for key, header in (("etag", "If-None-Match"), ("modified", "If-Modified-Since")):
                if entry.get(key):
                    headers[header] = entry[key]
            try:
                if now < self.blocked_until:
                    raise SourceError("TSE limitou o acesso. Nova tentativa apos o intervalo de espera.")
                response = await self.client.get(url, headers=headers)
                if response.status_code in (403, 429):
                    self.blocked_until = now + 660
                    raise SourceError("Acesso ao TSE temporariamente limitado.")
                if response.status_code == 404:
                    raise SourceError("Arquivo ainda nao disponibilizado pelo TSE.")
                if response.status_code == 304 and "data" in entry:
                    entry.update(until=now + ttl, error=None)
                    return entry["data"], None
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("JSON inesperado")
                self.cache[url] = dict(data=data, until=now + ttl, etag=response.headers.get("etag"), modified=response.headers.get("last-modified"), error=None)
                return data, None
            except (httpx.HTTPError, ValueError, SourceError) as exc:
                message = str(exc) if isinstance(exc, SourceError) else "Nao foi possivel atualizar os dados do TSE."
                entry.update(until=now + 300, error=message)
                self.cache[url] = entry
                if entry.get("data") is not None:
                    return entry["data"], message
                raise SourceError(message) from exc

    async def election(self, role):
        config, warning = await self.get(f"{BASE}/oficial/comum/config/ele-c.json", 3600)
        if config.get("f") != "o":
            raise SourceError("A configuracao recebida nao pertence ao ambiente oficial.")
        code = "6257" if role == 1 else "6259"
        for pleito in config.get("pl", []):
            for election in pleito.get("e", []):
                if str(election.get("cd")) == code and str(election.get("t")) == "1":
                    return pleito["c"], code, warning
        raise SourceError("Eleicao geral de 2026 ainda nao consta na configuracao oficial.")

    async def municipalities(self, uf):
        cycle, election, warning = await self.election(3)
        url = f"{BASE}/oficial/{cycle}/{election}/config/mun-e{int(election):06d}-cm.json"
        data, error = await self.get(url, 3600)
        for area in data.get("abr", []):
            if area.get("cd", "").lower() == uf:
                return sorted([dict(code=str(m["cd"]).zfill(5), name=m["nm"]) for m in area.get("mu", [])], key=lambda m: m["name"]), error or warning
        return [], error or warning

    async def result(self, uf, role, municipality=""):
        url = None
        try:
            cycle, election, warning = await self.election(role)
            area = uf + municipality
            url = f"{BASE}/oficial/{cycle}/{election}/dados/{uf}/{area}-c{role:04d}-e{int(election):06d}-u.json"
            data, error = await self.get(url)
            result = normalize(data, role, election, uf, cycle)
            result.update(source=url, warning=error or warning)
            return result
        except (SourceError, ValueError) as exc:
            return dict(available=False, warning=str(exc), source=url, candidates=[])


def number(value):
    return float(str(value or "0").replace(",", "."))


def normalize(data, role, election, uf="br", cycle="ele2026"):
    if data.get("f") != "o" or str(data.get("ele")) != str(election):
        raise ValueError("Arquivo fora da eleicao oficial selecionada.")
    if data.get("dv") != "s":
        raise ValueError("Divulgacao ainda nao autorizada no arquivo do TSE.")
    cargo = next((c for c in data.get("carg", []) if int(c["cd"]) == role), None)
    if cargo is None:
        raise ValueError("Cargo ausente no arquivo do TSE.")
    candidates = []
    for group in cargo.get("agr", []):
        for party in group.get("par", []):
            for c in party.get("cand", []):
                candidates.append(dict(name=c.get("nmu") or c.get("nm"), number=c["n"], party=party["sg"], votes=int(c.get("vap") or 0), percent=number(c.get("pvapn", c.get("pvap"))), status=c.get("st", ""), elected=c.get("e") == "s", destination=c.get("dvt", ""), photo=f"{BASE}/oficial/{cycle}/{election}/fotos/{'br' if role == 1 else uf}/{c.get('sqcand')}.jpeg"))
    candidates.sort(key=lambda c: (-c["votes"], c["name"]))
    s, v = data.get("s", {}), data.get("v", {})
    return dict(proportional=project(data, cargo) if role in (6, 7, 8) else None, available=True, candidates=candidates, progress=number(s.get("pstn", s.get("pst"))), sections=int(s.get("st") or 0), total_sections=int(s.get("ts") or 0), status={"n": "Aguardando apuracao", "p": "Resultado parcial", "f": "Totalizacao finalizada"}.get(data.get("and"), "Resultado parcial"), updated=f"{data.get('dg', '')} {data.get('hg', '')}".strip(), totalized=f"{data.get('dt', '')} {data.get('ht', '')}".strip(), valid=int(v.get("vv") or 0), blank=int(v.get("vb") or 0), null=int(v.get("tvn") or 0))


@asynccontextmanager
async def lifespan(app):
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"User-Agent": "PainelEleicoes2026/1.0"}) as client:
        app.state.tse = TSE(client)
        app.state.geography = TSE(client)
        app.state.municipal_names = {}
        yield


app = FastAPI(title="Apuracao 2026", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
async def home():
    return FileResponse(ROOT / "static/index.html")


@app.get("/api/states")
async def states():
    return STATES


@app.get("/api/seats")
async def deputy_seats():
    limit = asyncio.Semaphore(4)

    async def state_seats(uf):
        async with limit:
            federal, regional = await asyncio.gather(
                app.state.tse.result(uf, 6),
                app.state.tse.result(uf, 8 if uf == "df" else 7))

        def summary(result):
            seats = (result.get("proportional") or {}).get("seats")
            return dict(seats=seats or None,
                        elected=sum(c.get("elected", False) or str(c.get("status", "")).lower().startswith("eleito")
                                    for c in result.get("candidates", [])) if result.get("available") else None,
                        updated=result.get("updated"), warning=result.get("warning"), source=result.get("source"))

        return dict(uf=uf, name=STATES[uf], federal=summary(federal), regional=summary(regional))

    return dict(items=await asyncio.gather(*(state_seats(uf) for uf in STATES)))


def validate_uf(uf):
    if uf not in STATES:
        raise HTTPException(422, "Estado invalido")


@app.get("/api/municipalities/{uf}")
async def municipalities(uf: str):
    validate_uf(uf)
    try:
        items, warning = await app.state.tse.municipalities(uf)
        return dict(items=items, warning=warning)
    except SourceError as exc:
        return dict(items=[], warning=str(exc))


@app.get("/api/municipality-map/{uf}")
async def municipality_map(uf: str):
    validate_uf(uf)
    base = "https://servicodados.ibge.gov.br/api"
    try:
        geo, warning = await app.state.geography.get(
            f"{base}/v3/malhas/estados/{uf.upper()}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima", 86400)
        if uf not in app.state.municipal_names:
            response = await app.state.geography.client.get(f"{base}/v1/localidades/estados/{uf.upper()}/municipios")
            response.raise_for_status()
            app.state.municipal_names[uf] = {str(m["id"]): m["nome"] for m in response.json()}
        return dict(geo=geo, names=app.state.municipal_names[uf], warning=warning)
    except (SourceError, httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(503, "Nao foi possivel carregar os contornos municipais do IBGE.") from exc


@app.get("/api/results")
async def results(uf: str = "ac", municipality: str = ""):
    validate_uf(uf)
    if municipality:
        try:
            items, _ = await app.state.tse.municipalities(uf)
        except SourceError as exc:
            raise HTTPException(503, str(exc)) from exc
        if municipality not in {m["code"] for m in items}:
            raise HTTPException(422, "Municipio invalido para o estado")
    roles = [3, 5, 6, 8 if uf == "df" else 7]
    queries = [app.state.tse.result("br", 1)] + [app.state.tse.result(uf, r, municipality) for r in roles]
    queries.append(app.state.tse.result(uf, 1))
    if municipality:
        queries.append(app.state.tse.result(uf, 1, municipality))
    if municipality:
        queries.append(app.state.tse.result(uf, 5))
    values = await asyncio.gather(*queries)
    if municipality:
        statewide = await asyncio.gather(*(app.state.tse.result(uf, r) for r in roles if r in (6, 7, 8)))
        for r, state_result in zip((r for r in roles if r in (6, 7, 8)), statewide):
            local_result = values[1 + roles.index(r)]
            local_result["proportional"] = dict(state_result.get("proportional") or dict(available=False, message="Classificação estadual indisponível.", candidates={}))
            local_result["proportional"]["warning"] = state_result.get("warning")
            local_result["proportional"]["updated"] = state_result.get("updated")
    return dict(state_senate=values[7] if municipality else values[2], president=values[0], regional=dict(zip(map(str, roles), values[1:5])), state_president=values[5], local_president=values[6] if municipality else None, interval=30)


def presidential_summary(result):
    candidates = result.get("candidates", [])
    ranked = sorted(candidates, key=lambda c: -c["votes"])
    leader = ranked[0] if result.get("available") and ranked and ranked[0]["votes"] > 0 else None
    tied = bool(leader and len(ranked) > 1 and ranked[1]["votes"] == leader["votes"])
    return dict(available=result.get("available", False), leader=None if tied else leader,
                tied=tied, candidates=ranked, progress=result.get("progress"), updated=result.get("updated"),
                warning=result.get("warning"))


async def area_summaries(areas):
    limit = asyncio.Semaphore(4)
    async def fetch(code, uf, municipality):
        async with limit:
            return code, presidential_summary(await app.state.tse.result(uf, 1, municipality))
    return dict(await asyncio.gather(*(fetch(*area) for area in areas)))


@app.get("/api/president-map")
async def president_map():
    return await area_summaries([(uf, uf, "") for uf in STATES])


@app.get("/api/president-cities/{uf}")
async def president_cities(uf: str):
    validate_uf(uf)
    try:
        items, warning = await app.state.tse.municipalities(uf)
    except SourceError as exc:
        return dict(items=[], warning=str(exc))
    summaries = await area_summaries([(m["code"], uf, m["code"]) for m in items])
    return dict(items=[dict(**m, **summaries[m["code"]]) for m in items], warning=warning)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
