"""Projeção estadual: Res.-TSE 23.677, arts. 7 a 12-A (texto vigente)."""
from datetime import datetime
from fractions import Fraction


def project(data, cargo):
    result = dict(available=False, seats=int(cargo.get("nv") or 0), qe=None,
                  message="Aguardando dados estaduais completos para calcular as vagas.", candidates={}, groups=[])
    if data.get("tpabr") not in (None, "uf") or data.get("esae") == "s":
        return result
    if data.get("tf") == "s":
        result.update(available=True, official=True, message="Classificação oficial do TSE.")
        for group in cargo.get("agr", []):
            for party in group.get("par", []):
                for c in party.get("cand", []):
                    status = c.get("st") or ("Eleito" if c.get("e") == "s" else "Aguardando classificação do TSE")
                    result["candidates"][str(c["n"])] = dict(label=status, inside=c.get("e") == "s" or status.startswith("Eleito"))
        result["qe"] = int(cargo.get("qe") or 0) or None
        return result
    seats = result["seats"]
    valid = int(data.get("v", {}).get("vv") or 0)
    if not seats or not valid:
        return result
    # Código Eleitoral: fração igual a meio é desprezada; acima de meio sobe.
    quotient, remainder = divmod(valid, seats)
    qe = quotient + (2 * remainder > seats)
    if not qe:
        return result
    groups = []
    try:
        for group in cargo.get("agr", []):
            parties = group.get("par", [])
            if group.get("tp") == "f":
                votes = int(group["tvtn"]) + int(group["tvtl"])
            else:
                votes = sum(int(p["tvtn"]) + int(p["tvtl"]) for p in parties)
            candidates = []
            for p in parties:
                for c in p.get("cand", []):
                    result["candidates"][str(c["n"])] = dict(label="Fora das vagas na projeção", inside=False)
                    if c.get("dvt") == "Anulado sub judice":
                        result["candidates"][str(c["n"])]["label"] = "Pendente de decisão judicial"
                    if c.get("dvt") != "Válido":
                        continue
                    birth = datetime.strptime(c["dt"], "%d/%m/%Y").date()
                    candidates.append(dict(number=str(c["n"]), votes=int(c["vap"]), birth=birth))
            candidates.sort(key=lambda c: (-c["votes"], c["birth"]))
            if any(a["votes"] == b["votes"] and a["birth"] == b["birth"] for a, b in zip(candidates, candidates[1:])):
                raise ValueError("Empate sem desempate disponível")
            qp = votes // qe
            groups.append(dict(name=group.get("nm") or "/".join(p["sg"] for p in parties), votes=votes,
                               divisor=qp, filled=0, candidates=candidates))
        if sum(g["votes"] for g in groups) != valid:
            raise ValueError("Votos válidos incompletos")
    except (KeyError, ValueError, TypeError):
        result["candidates"] = {}
        return result

    def elect(g, c, label):
        g["candidates"].remove(c)
        g["filled"] += 1
        result["candidates"][c["number"]] = dict(label=label, inside=True)

    for g in groups:
        eligible = [c for c in g["candidates"] if c["votes"] * 10 >= qe]
        for c in eligible[:g["divisor"]]:
            elect(g, c, "Dentro das vagas · quociente partidário")
    remaining = seats - sum(g["filled"] for g in groups)
    for restricted in (True, False):
        while remaining > 0:
            options = []
            for g in groups:
                eligible = [c for c in g["candidates"] if not restricted or c["votes"] * 5 >= qe]
                if eligible and (not restricted or g["votes"] * 5 >= qe * 4):
                    c = eligible[0]
                    key = (Fraction(g["votes"], g["divisor"] + 1), g["votes"], c["votes"])
                    options.append((key, g, c))
            if not options:
                break
            options.sort(key=lambda o: o[0], reverse=True)
            if len(options) > 1 and options[0][0] == options[1][0]:
                result["candidates"] = {}
                result["message"] = "Empate na distribuição de vagas: aguardando desempate oficial."
                return result
            _, g, c = options[0]
            elect(g, c, "Dentro das vagas · " + ("sobras" if restricted else "sobras remanescentes"))
            g["divisor"] += 1
            remaining -= 1
    result.update(available=True, official=False, qe=qe,
                  message="Projeção com os votos apurados em todo o estado. Pode mudar até a totalização final.",
                  groups=[dict(name=g["name"], votes=g["votes"], seats=g["filled"]) for g in groups])
    return result
