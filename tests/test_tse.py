import unittest
import httpx
from eleicoes import TSE, SourceError, normalize, app, results, presidential_summary, president_map, president_cities
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace


def sample():
    return dict(f="o", ele="6259", dv="s", dg="04/10/2026", hg="18:00:00", s=dict(ts="100", st="50", pst="50,00"), v=dict(vv="100", vb="2", tvn="3"), carg=[dict(cd="3", agr=[dict(par=[dict(sg="PARTIDO", cand=[dict(n="10", nmu="CANDIDATO", vap="50", pvap="50,00", sqcand="123", st="", dvt="Anulado sub judice")])])])], **{"and": "p"})


class Normalization(unittest.TestCase):
    def test_nested_2026_and_comma_percentages(self):
        result = normalize(sample(), 3, "6259", "ac")
        self.assertEqual(result["progress"], 50)
        self.assertEqual(result["candidates"][0]["votes"], 50)
        self.assertEqual(result["candidates"][0]["percent"], 50)
        self.assertIn("/fotos/ac/", result["candidates"][0]["photo"])
        self.assertEqual(result["candidates"][0]["destination"], "Anulado sub judice")

    def test_reject_wrong_phase_election_and_embargo(self):
        for field, value in [("f", "s"), ("ele", "619"), ("dv", "n")]:
            data = sample()
            data[field] = value
            with self.assertRaises(ValueError):
                normalize(data, 3, "6259")


class Cache(unittest.IsolatedAsyncioTestCase):
    async def test_cache_conditional_request_and_stale_failure(self):
        calls = []
        responses = [httpx.Response(200, json=sample(), headers={"etag": "abc"}), httpx.Response(304), httpx.Response(503)]
        def handler(request):
            calls.append(request)
            return responses.pop(0)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            source = TSE(client)
            url = "https://example.test/result"
            await source.get(url)
            await source.get(url)
            self.assertEqual(len(calls), 1)
            source.cache[url]["until"] = 0
            data, warning = await source.get(url)
            self.assertIsNone(warning)
            self.assertEqual(calls[-1].headers["if-none-match"], "abc")
            source.cache[url]["until"] = 0
            data, warning = await source.get(url)
            self.assertEqual(data["ele"], "6259")
            self.assertIsNotNone(warning)

    async def test_rate_limit_stops_requests_to_other_urls(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(429)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            source = TSE(client)
            for url in ["https://example.test/a", "https://example.test/b"]:
                with self.assertRaises(SourceError):
                    await source.get(url)
            self.assertEqual(len(calls), 1)

    async def test_url_padding_and_config_discovery(self):
        urls = []
        def handler(request):
            urls.append(str(request.url))
            if "ele-c.json" in str(request.url):
                return httpx.Response(200, json=dict(f="o", pl=[dict(c="ele2026", e=[dict(cd="6259", t="1")])]))
            return httpx.Response(200, json=sample())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await TSE(client).result("ac", 3, "01120")
            self.assertTrue(result["available"])
            self.assertTrue(urls[-1].endswith("/ac/ac01120-c0003-e006259-u.json"))


class RegionalPresident(unittest.IsolatedAsyncioTestCase):
    async def test_national_state_and_city_scopes(self):
        async def result(uf, role, municipality=""):
            return dict(uf=uf, role=role, municipality=municipality)
        source = SimpleNamespace(result=AsyncMock(side_effect=result), municipalities=AsyncMock(return_value=([dict(code="01120")], None)))
        with patch.object(app.state, "tse", source, create=True):
            statewide = await results("ac", "")
            self.assertEqual(statewide["president"]["uf"], "br")
            self.assertEqual(statewide["state_president"], dict(uf="ac", role=1, municipality=""))
            self.assertIsNone(statewide["local_president"])
            municipal = await results("ac", "01120")
            self.assertEqual(municipal["state_president"], statewide["state_president"])
            self.assertEqual(municipal["local_president"], dict(uf="ac", role=1, municipality="01120"))
            self.assertTrue(all(r["municipality"] == "01120" for r in municipal["regional"].values()))


class PresidentialMap(unittest.IsolatedAsyncioTestCase):
    def test_leader_tie_zero_and_unavailable(self):
        a = dict(name="A", number="10", votes=20, percent=60)
        b = dict(name="B", number="20", votes=10, percent=40)
        result = dict(available=True, candidates=[b, a], progress=50, warning="Dados anteriores")
        summary = presidential_summary(result)
        self.assertEqual(summary["leader"], a)
        self.assertEqual(summary["warning"], "Dados anteriores")
        b["votes"] = 20
        self.assertTrue(presidential_summary(result)["tied"])
        self.assertIsNone(presidential_summary(result)["leader"])
        a["votes"] = b["votes"] = 0
        self.assertIsNone(presidential_summary(result)["leader"])
        result["available"] = False
        self.assertFalse(presidential_summary(result)["available"])

    async def test_map_and_city_scopes(self):
        source = SimpleNamespace(result=AsyncMock(return_value=dict(available=True, candidates=[], progress=0)), municipalities=AsyncMock(return_value=([dict(code="01120", name="Cidade")], None)))
        with patch.object(app.state, "tse", source, create=True):
            statewide = await president_map()
            self.assertEqual(len(statewide), 27)
            source.result.assert_any_await("ac", 1, "")
            cities = await president_cities("ac")
            self.assertEqual(cities["items"][0]["code"], "01120")
            source.result.assert_any_await("ac", 1, "01120")


class MunicipalGeography(unittest.IsolatedAsyncioTestCase):
    async def test_ibge_names_keep_ibge_codes_separate_from_tse(self):
        from eleicoes import municipality_map
        geo = dict(type="FeatureCollection", features=[dict(properties=dict(codarea="1200013"))])
        response = httpx.Response(200, json=[dict(id=1200013, nome="Acrelândia")], request=httpx.Request("GET", "https://example.test"))
        source = SimpleNamespace(get=AsyncMock(return_value=(geo, None)), client=SimpleNamespace(get=AsyncMock(return_value=response)))
        with patch.object(app.state, "geography", source, create=True), patch.object(app.state, "municipal_names", {}, create=True):
            result = await municipality_map("ac")
            self.assertEqual(result["names"]["1200013"], "Acrelândia")
            self.assertEqual(result["geo"], geo)
            await municipality_map("ac")
            self.assertEqual(source.client.get.await_count, 1)

    async def test_ibge_failure_returns_service_unavailable(self):
        from eleicoes import municipality_map
        from fastapi import HTTPException
        source = SimpleNamespace(get=AsyncMock(side_effect=SourceError("Offline")))
        with patch.object(app.state, "geography", source, create=True):
            with self.assertRaises(HTTPException) as raised:
                await municipality_map("ac")
            self.assertEqual(raised.exception.status_code, 503)
