import unittest
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
from eleicoes import legislature_summary, legislature_map, app


def candidate(number, party, votes, **extra):
    return dict(number=number, party=party, name=number, votes=votes, destination='Válido', **extra)


class Legislature(unittest.TestCase):
    def test_senate_excludes_tie_at_cutoff_and_invalid_votes(self):
        data = dict(available=True, status='Resultado parcial', candidates=[
            candidate('1', 'PL', 100), candidate('2', 'PT', 80), candidate('3', 'MDB', 80),
            candidate('4', 'PP', 200, elected=False)])
        data['candidates'][-1]['destination'] = 'Anulado sub judice'
        self.assertEqual(legislature_summary(data, 5)['parties'], {'PL': 1})

    def test_federal_counts_projected_seats_not_top_votes(self):
        data = dict(available=True, candidates=[candidate('1', 'PL', 100), candidate('2', 'PT', 50)],
                    proportional=dict(available=True, candidates={'2': dict(inside=True)}))
        result = legislature_summary(data, 6)
        self.assertEqual(result['parties'], {'PT': 1})
        self.assertEqual(result['mode'], 'Projeção provisória de vagas')

    def test_official_status_takes_priority_over_projection(self):
        data = dict(available=True, candidates=[candidate('1', 'MDB', 100, status='Eleito por QP'),
                                              candidate('2', 'PL', 50, elected=True)])
        self.assertEqual(legislature_summary(data, 6)['parties'], {'MDB': 1, 'PL': 1})
        self.assertEqual(legislature_summary(data, 6)['mode'], 'Eleitos pelo TSE')

    def test_unavailable_does_not_show_seats(self):
        data = dict(available=False, candidates=[candidate('1', 'PL', 100, elected=True)])
        self.assertEqual(legislature_summary(data, 5)['parties'], {})


class LegislatureEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_requests_both_roles_for_all_states(self):
        mock = AsyncMock(return_value=dict(available=False, candidates=[]))
        with patch.object(app.state, 'tse', SimpleNamespace(result=mock), create=True):
            result = await legislature_map()
        self.assertEqual(len(result), 27)
        self.assertEqual(mock.await_count, 54)
        self.assertEqual(set(result['df']), {'senate', 'federal'})
