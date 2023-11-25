/** @param {NS} ns */
export async function main(ns) {
  const flagArgs = ns.flags([
    ['threads', 50],
    ['help', false],
  ]);


  let targets = {};
  let script = "/bb/hack-target.js";

  const reqMem = ns.getScriptRam(script);
  const myLevel = ns.getHackingLevel();

  ns.tprint("Spawning workers, please wait...");

  await everyServer(ns, async function (target) {
    if (!ns.hasRootAccess(target)) {
      return;
    }

    if (target.startsWith("pserv")) {
      return;
    }

    let money = ns.getServerMaxMoney(target);
    let reqLevel = ns.getServerRequiredHackingLevel(target);

    if (reqLevel > myLevel / 2 || money < 10000000) {
      return;
    }

    targets[target] = {
      level: reqLevel,
      threads: 0,
    }
  })

  if (myLevel < 100) {
    script = "/bb/rpc-grind.js";
    targets = {
      "n00dles": {
        level: ns.getServerRequiredHackingLevel("n00dles"),
        threads: 0,
      }
    }
  }

  if (Object.keys(targets).length == 0) {
    ns.tprint("failed to select targets");
    ns.exit();
  }

  function selectTarget(threads) {
    let bestRatio = 10000000000;
    let bestTarget = null;

    for (var name in targets) {
      let data = targets[name];
      let ratio = data.threads / data.level;
      if (ratio < bestRatio) {
        bestTarget = name;
        bestRatio = ratio;
      }
    }

    targets[bestTarget].threads += threads;

    return bestTarget;
  }

  await everyServer(ns, function (target) {
    if (!ns.hasRootAccess(target)) {
      return;
    }

    ns.killall(target, true);

    let freeMem = ns.getServerMaxRam(target) - ns.getServerUsedRam(target);
    if (target != "home" && freeMem > reqMem) {
      ns.scp(script, target);
    }

    while (freeMem > reqMem) {
      let threads = Math.min(flagArgs.threads, Math.floor(freeMem / reqMem));
      freeMem -= (threads * reqMem);

      if (threads > 0) {
        let hackTarget = selectTarget(threads);
        if (hackTarget == null) {
          return;
        }

        ns.exec(script, target, threads, hackTarget);
      }
    }
  })

  for (var name in targets) {
    let ratio = Number(targets[name].threads / targets[name].level).toFixed(2);
    ns.tprint(name, " t=", targets[name].threads, " r=", ratio);
  }
}

async function everyServer(ns, fn) {
  const table = { "home": true };
  const queue = ["home"];

  while (queue.length > 0) {
    await ns.sleep(10);

    let source = queue.pop();
    let list = ns.scan(source);

    for (var i in list) {
      let target = list[i];

      if (table[target]) {
        continue;
      }

      table[target] = true;
      queue.push(target);

      await fn(target);
    }
  }

  await fn("home");
}
