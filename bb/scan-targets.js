import { validTargets, isServerStable } from 'bb/lib.js'

export async function main(ns) {
  const list = validTargets(ns);
  const myLevel = ns.getHackingLevel();

  ns.tprint(ns.sprintf(
    "%(name)' -20s %(levelReq)' 4s %(money)' 10s %(max)' 10s%(hackDifficulty)' 10s%(minDifficulty)' 10s %(stable)' 6s",
    {
      name: "Name",
      levelReq: "Level",
      money: "Avail",
      max: "Max",
      hackDifficulty:"Current",
      minDifficulty:"Min",
      stable: "Stable",
    }
  ))

  for (var i in list) {
    const name = list[i];

    const levelReq = ns.getServerRequiredHackingLevel(name);
    if (levelReq > myLevel / 2) continue;

    const maxMoney = ns.getServerMaxMoney(name);
    const money = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    ns.tprint(ns.sprintf(
      "%(name)' -20s %(levelReq)' 4d %(money)' 10s %(max)' 10s%(hackDifficulty)' 10.3f%(minDifficulty)' 10.3f %(stable)' 6s",
      { name, levelReq, money: ns.formatNumber(money), max: ns.formatNumber(maxMoney), hackDifficulty, minDifficulty, stable: (isServerStable(ns, name) ? '' : 'x') }
    ));
  }
}
