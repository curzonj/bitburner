import { allServers } from 'bb/lib.js'

export async function main(ns) {
  const list = allServers(ns);
  const myLevel = ns.getHackingLevel();

  ns.tprint(ns.sprintf(
    "%(name)' -20s %(levelReq)' 4s %(money)' 10s %(max)' 10s%(hackDifficulty)' 10s%(minDifficulty)' 6s",
    {
      name: "Name",
      levelReq: "Level",
      money: "Avail",
      max: "Max",
      hackDifficulty:"Current",
      minDifficulty:"Min"
    }
  ))

  for (var i in list) {
    const name = list[i];
    if (name == "home") continue;

    const levelReq = ns.getServerRequiredHackingLevel(name);
    if (levelReq > myLevel / 2) continue;

    const maxMoney = ns.getServerMaxMoney(name);
    const money = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    ns.tprint(ns.sprintf(
      "%(name)' -20s %(levelReq)' 4.0d %(money)' 10s %(max)' 10s%(hackDifficulty)' 10.3d%(minDifficulty)' 10.3d",
      { name, levelReq, money: ns.formatNumber(money), max: ns.formatNumber(maxMoney), hackDifficulty, minDifficulty }
    ));
  }
}
