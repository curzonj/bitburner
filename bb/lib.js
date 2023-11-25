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

export function bestGrindTarget(ns) {
  let lvl = ns.getHackingLevel();
  let list = allServers(ns)
    .filter(a => ns.getServerRequiredHackingLevel(a) < lvl)
    .sort(function (a, b) {
      const reqA = ns.getServerRequiredHackingLevel(a);
      const reqB = ns.getServerRequiredHackingLevel(b);

      return ((lvl - reqB) / lvl) - ((lvl - reqA) / lvl);
    });
  return list[0];
}
