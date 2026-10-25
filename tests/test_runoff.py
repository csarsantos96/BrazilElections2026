import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from eleicoes import TSE, SourceError, app, overseas, runoff, runoff_local, normalize
from test_tse import sample


def config():
    return dict(f='o', pl=[dict(c='ele2026', e=[
        dict(cd='6257', t='1'), dict(cd='6259', t='1'),
        dict(cd='6258', t='2'), dict(cd='6260', t='2', abr=[dict(cd='ac', cp=[dict(cd='3')])])])])


class Runoff(unittest.IsolatedAsyncioTestCase):
    async def test_second_round_urls_and_non_contested_state(self):
        calls = []
        def handler(request):
            calls.append(str(request.url))
            if 'ele-c.json' in str(request.url):
                return httpx.Response(200, json=config())
            data = sample()
            data['ele'] = '6258' if 'c0001' in str(request.url) else '6260'
            data['carg'][0]['cd'] = '1' if 'c0001' in str(request.url) else '3'
            return httpx.Response(200, json=data)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            source = TSE(client, turn=2)
            self.assertTrue((await source.result('zz', 1, '12345'))['available'])
            self.assertTrue(calls[-1].endswith('/6258/dados/zz/zz12345-c0001-e006258-u.json'))
            self.assertTrue((await source.result('ac', 3))['available'])
            count = len(calls)
            self.assertTrue((await source.result('sp', 3))['not_contested'])
            self.assertEqual(count, len(calls))

    async def test_never_falls_back_to_first_round(self):
        data = config()
        data['pl'][0]['e'] = data['pl'][0]['e'][:2]
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=data))) as client:
            result = await TSE(client, turn=2).result('br', 1)
            self.assertFalse(result['available'])
            self.assertIsNone(result['source'])

    async def test_overseas_uses_tse_locations_and_finalization(self):
        result = dict(available=True, finalized=True, candidates=[])
        source = SimpleNamespace(municipalities=AsyncMock(return_value=([dict(code='12345', name='Local exterior')], None)), result=AsyncMock(return_value=result))
        with patch.object(app.state, 'tse', source, create=True):
            data = await overseas()
        source.municipalities.assert_awaited_once_with('zz')
        source.result.assert_awaited_once_with('zz', 1, '12345')
        self.assertTrue(data['items'][0]['result']['finalized'])

    async def test_national_overview_does_not_query_absent_governor_races(self):
        source = SimpleNamespace(get=AsyncMock(return_value=(config(), None)), result=AsyncMock(return_value=dict(available=False, candidates=[])))
        with patch.object(app.state, 'tse', source, create=True):
            data = await runoff()
        self.assertEqual(len(data['items']), 27)
        self.assertEqual(sum(i['governor'].get('not_contested', False) for i in data['items']), 26)
        source.result.assert_any_await('zz', 1)
        source.result.assert_any_await('ac', 3)
        self.assertFalse(any(call.args == ('sp', 3) for call in source.result.await_args_list))

    def test_finalization_is_not_inferred_from_percent(self):
        data = sample()
        data['s']['pst'] = '100'
        self.assertFalse(normalize(data, 3, '6259')['finalized'])
        data['tf'] = 's'
        self.assertTrue(normalize(data, 3, '6259')['finalized'])

    async def test_local_validation_rejects_wrong_municipality(self):
        from fastapi import HTTPException
        source = SimpleNamespace(municipalities=AsyncMock(return_value=([], None)), result=AsyncMock())
        with patch.object(app.state, 'tse', source, create=True):
            with self.assertRaises(HTTPException) as raised:
                await runoff_local('ac', '99999')
        self.assertEqual(raised.exception.status_code, 422)
        source.result.assert_not_awaited()
