import { validTargets, isServerOptimal} from 'bb/lib.js'

export async function main(ns) {
  const flagArgs = ns.flags([
    ['all', false],
  ]);

  const list = validTargets(ns);
  const myLevel = ns.getHackingLevel();

  ns.tprint(ns.sprintf(
    "%(name)' -20s %(levelReq)' 4s %(money)' 6s %(max)' 10s %(difficulty)' 10s
    {
      name: "Name",
      levelReq: "Level",
      money: "Avail",
      max: "Max",
      difficulty:"Difficulty",
    }
  ))

  for (var i in list) {
    const name = list[i];

    const levelReq = ns.getServerRequiredHackingLevel(name);
    if (!flagArgs.all && levelReq > myLevel / 2) continue;

    const maxMoney = ns.getServerMaxMoney(name);
    const money = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    // TODO, just report the % money, and difficulty, not stability

    ns.tprint(ns.sprintf(
      "%(name)' -20s %(levelReq)' 4d %(money)' 6s %(max)' 10s +%(difficulty)' 10.3f %(pointer)' 2s",
      {
        name, levelReq, money: ns.formatPercent(money/maxMoney),
        max: ns.formatNumber(maxMoney), difficulty: hackDifficulty - minDifficulty,
        pointer: isServerOptimal(ns, name) ? '', '<-',
      },
    ));
  }
}
