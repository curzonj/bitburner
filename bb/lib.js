export function allServers(ns) {
  const table = { "home": true };
  const queue = ["home"];

  while (queue.length > 0) {
    let source = queue.pop();
    let list = ns.scan(source);

    for (var i in list) {
      let target = list[i];

      if (table[target]) {
        continue;
      }

      table[target] = true
      queue.push(target);
    }
  }

  return Object.keys(table);
}

export function validTargets(ns) {
  let lvl = ns.getHackingLevel();
  return allServers(ns)
    .filter(s => ns.hasRootAccess(s))
    .filter(s => ns.getServerMaxMoney(s) > 0)
    .filter(s => s != "home" && !s.startsWith("pserv"))
    .filter(s => ns.getServerRequiredHackingLevel(s) < lvl);
}

export function bestGrindTarget(ns) {
  let lvl = ns.getHackingLevel();
  let list = validTargets(ns)
    .sort(function (a, b) {
      const reqA = ns.getServerRequiredHackingLevel(a);
      const reqB = ns.getServerRequiredHackingLevel(b);

      return ((lvl - reqB) / lvl) - ((lvl - reqA) / lvl);
    });
  return list[0];
}

export function isServerStable(ns, name) {
  const moneyMax = ns.getServerMaxMoney(name);
  const moneyAvailable = ns.getServerMoneyAvailable(name);
  const hackDifficulty = ns.getServerSecurityLevel(name);
  const minDifficulty = ns.getServerMinSecurityLevel(name);

  return (moneyAvailable > (moneyMax * 0.9) && hackDifficulty < (minDifficulty * 1.1));
}
