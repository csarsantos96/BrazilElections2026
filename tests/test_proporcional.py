import unittest
from proporcional import project


def fixture():
    def candidate(n, votes):
        return dict(n=str(n), vap=str(votes), dt='01/01/1980', dvt='Válido')
    return dict(tpabr='uf', tf='n', v=dict(vv='1000')), dict(nv='5', agr=[
        dict(tp='f', nm='Federação A', tvtn='580', tvtl='20', par=[
            dict(sg='A', cand=[candidate(10, 400)]),
            dict(sg='B', cand=[candidate(20, 120), candidate(21, 60)])]),
        dict(tp='i', nm='C', par=[dict(sg='C', tvtn='400', tvtl='0', cand=[candidate(30, 300), candidate(31, 100)])])])


class Projection(unittest.TestCase):
    def test_federation_and_legend_votes(self):
        data, cargo = fixture()
        r = project(data, cargo)
        self.assertTrue(r['available'])
        self.assertEqual(r['qe'], 200)
        self.assertEqual([g['seats'] for g in r['groups']], [3, 2])
        self.assertEqual(sum(c['inside'] for c in r['candidates'].values()), 5)

    def test_remaining_seat_without_individual_minimum(self):
        data, cargo = fixture()
        cargo['agr'][0]['par'][1]['cand'][1]['vap'] = '10'
        cargo['agr'][0]['tvtn'] = '530'
        cargo['agr'][0]['tvtl'] = '70'
        r = project(data, cargo)
        self.assertTrue(r['candidates']['21']['inside'])
        self.assertIn('remanescentes', r['candidates']['21']['label'])

    def test_missing_birth_or_votes_does_not_guess(self):
        for field in ('dt', 'vap'):
            data, cargo = fixture()
            del cargo['agr'][0]['par'][0]['cand'][0][field]
            r = project(data, cargo)
            self.assertFalse(r['available'])
            self.assertEqual(r['candidates'], {})

    def test_municipal_and_judicial_blocks(self):
        data, cargo = fixture()
        data['tpabr'] = 'mu'
        self.assertFalse(project(data, cargo)['available'])
        data['tpabr'] = 'uf'
        data['esae'] = 's'
        self.assertFalse(project(data, cargo)['available'])

    def test_official_status_overrides_projection(self):
        data, cargo = fixture()
        data['tf'] = 's'
        c = cargo['agr'][0]['par'][0]['cand'][0]
        c.update(e='n', st='Suplente')
        r = project(data, cargo)
        self.assertTrue(r['official'])
        self.assertEqual(r['candidates']['10'], dict(label='Suplente', inside=False))

    def test_half_quotient_rounds_down(self):
        data, cargo = fixture()
        data['v']['vv'] = '1002'
        cargo['nv'] = '4'
        cargo['agr'][0]['tvtl'] = '22'
        self.assertEqual(project(data, cargo)['qe'], 250)

    def test_age_breaks_candidate_tie(self):
        data, cargo = fixture()
        candidates = cargo['agr'][0]['par'][1]['cand']
        candidates[0].update(vap='120', dt='01/01/1990')
        candidates[1].update(vap='120', dt='01/01/1970')
        cargo['agr'][0]['tvtn'] = '640'
        cargo['agr'][0]['tvtl'] = '0'
        cargo['agr'][1]['par'][0]['tvtn'] = '360'
        cargo['agr'][1]['par'][0]['cand'][1]['vap'] = '60'
        cargo['nv'] = '2'
        r = project(data, cargo)
        self.assertTrue(r['candidates']['21']['inside'])
        self.assertFalse(r['candidates']['20']['inside'])

    def test_annulled_candidate_excluded(self):
        data, cargo = fixture()
        cargo['agr'][0]['par'][0]['cand'][0]['dvt'] = 'Válido (legenda)'
        r = project(data, cargo)
        self.assertFalse(r['candidates']['10']['inside'])


class MunicipalClassification(unittest.IsolatedAsyncioTestCase):
    async def test_local_votes_use_statewide_projection(self):
        from eleicoes import app, results
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch

        async def fetch(uf, role, municipality=''):
            return dict(candidates=[dict(number='10', votes=5 if municipality else 500)],
                        proportional=dict(available=True, message=municipality or 'state', candidates={}),
                        updated=municipality or 'state timestamp')
        source = SimpleNamespace(result=AsyncMock(side_effect=fetch),
                                 municipalities=AsyncMock(return_value=([dict(code='01120')], None)))
        with patch.object(app.state, 'tse', source, create=True):
            response = await results('ac', '01120')
        for role in ('6', '7'):
            r = response['regional'][role]
            self.assertEqual(r['candidates'][0]['votes'], 5)
            self.assertEqual(r['proportional']['message'], 'state')
            self.assertEqual(r['proportional']['updated'], 'state timestamp')
