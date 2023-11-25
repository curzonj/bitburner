import { allServers } from 'bb/lib.js'

export async function main(ns) {
  const list = allServers(ns);
  const myLevel = ns.getHackingLevel();
  const format = "%(name)' -20s %(levelReq)' 4s %(money)' 10s %(max)' 10s";

  ns.tprint(ns.sprintf(format, {
    name: "Name",
    levelReq: "Level",
    money: "Avail",
    max: "Max",
  }))

  for (var i in list) {
    const name = list[i];
    if (name == "home") continue;

    const levelReq = ns.getServerRequiredHackingLevel(name);
    if (levelReq > myLevel / 2) continue;

    const maxMoney = ns.getServerMaxMoney(name);
    const money = ns.getServerMoneyAvailable(name);

    ns.tprint(ns.sprintf(format,
      { name, levelReq, money: ns.formatNumber(money), max: ns.formatNumber(maxMoney) }
    ));
  }
}
