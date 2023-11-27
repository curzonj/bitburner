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
    .filter(s => ns.getServerRequiredHackingLevel(s) <= lvl);
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
export function isServerOptimal(ns, name) {
  const moneyMax = ns.getServerMaxMoney(name);
  const moneyAvailable = ns.getServerMoneyAvailable(name);
  const hackDifficulty = ns.getServerSecurityLevel(name);
  const minDifficulty = ns.getServerMinSecurityLevel(name);

  return (moneyAvailable == moneyMax && hackDifficulty == minDifficulty);
}

export function isServerStable(ns, name) {
  const moneyMax = ns.getServerMaxMoney(name);
  const moneyAvailable = ns.getServerMoneyAvailable(name);
  const hackDifficulty = ns.getServerSecurityLevel(name);
  const minDifficulty = ns.getServerMinSecurityLevel(name);

  return (moneyAvailable > (moneyMax * 0.9) && hackDifficulty < (minDifficulty * 1.1));
}

export function getWorkers(ns) {
  return allServers(ns)
    .filter(s => ns.hasRootAccess(s))
    .filter(s => ns.getServerMaxRam(s) > 0);
}

export function getTotalMemoryFree(ns) {
  return getTotalMemoryInstalled(ns) - getTotalMemoryInUse(ns);
}

export function getTotalMemoryInUse(ns) {
  return getWorkers(ns).reduce(function (acc, name) {
    return acc + ns.getServerUsedRam(name);
  }, 0);
}

export function getTotalMemoryInstalled(ns) {
  return getWorkers(ns).reduce(function (acc, name) {
    return acc + ns.getServerMaxRam(name);
  }, 0);
}

export function validNumber(n) {
  return (n != null && isFinite(n) && !isNaN(n) && n != undefined);
}

export function disableNoisyLogs(ns) {
  ns.disableLog("disableLog");
  ns.disableLog("scan");
  ns.disableLog("scp");
  ns.disableLog("getHackingLevel");
  ns.disableLog("getServerRequiredHackingLevel");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getServerUsedRam");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("getServerMaxMoney");
  ns.disableLog("getServerMinSecurityLevel");
  ns.disableLog("getServerSecurityLevel");
}

export const rpcHack = "/bb/rpc-hack.js";
export const rpcGrow = "/bb/rpc-grow.js";
export const rpcWeaken = "/bb/rpc-weaken.js";
export async function spawnThreads($, rpc, threads, arg) {
  const ns = $.ns;
  const shard = ($.shard != false);

  const pool = getWorkers(ns).sort(function (a, b) {
    return (
      ns.getServerMaxRam(a) - ns.getServerUsedRam(a)
    ) - (
      ns.getServerMaxRam(b) - ns.getServerUsedRam(b)
    );
  });

  const scriptMemReq = ns.getScriptRam(rpc);
  let remaining = Math.ceil(threads);

  for (var i in pool) {
    const name = pool[i];
    const ramUsed = ns.getServerUsedRam(name);

    let maxRam = ns.getServerMaxRam(name);
    if (name == "home") {
      maxRam -= $.reservedMemory;
    }

    const maxLocalThreads = Math.floor((maxRam - ramUsed) / scriptMemReq);
    let localThreads = remaining;

    if (shard && (rpc == rpcWeaken || rpc == rpcGrow)) {
      localThreads = Math.min(remaining, maxLocalThreads);
    } else if (localThreads > maxLocalThreads) {
      if (i == pool.length -1) {
        // If this is the biggest we have available, just use what ever we can.
        localThreads = maxLocalThreads;
      } else {
        continue;
      }
    }

    if (localThreads < 1) {
      continue;
    }

    remaining -= localThreads;

    ns.scp(rpc, name);
    ns.exec(rpc, name, localThreads, arg);
  }

  if (remaining < 1) {
    return true;
  } else {
    if (flagArgs.debug) {
      ns.print("ERROR: spawn failed ", { rpc, threads, remaining, arg, required: ns.formatRam(scriptMemReq * threads) });
    }

    return false;
  }
}

export function resizeTail(ns) {
  const [ width, height ] = ns.ui.windowSize();
  ns.moveTail(70, 0);
  ns.resizeTail(width-200, height-10);
}

export async function listen(ns, portNumber, fn) {
  const port = ns.getPortHandle(portNumber);
  port.clear();

  while (true) {
    if (port.empty()) {
      await port.nextWrite();
    }

    let data = port.read();
    if (data != "NULL PORT DATA") {
      await fn(data);
    }
  }
}

export async function rsyslog(ns, opts) {
  const { debug, trace } = opts;

  return Promise.all([
    remoteDebugLogging(ns, debug),
    remoteTraceLogging(ns, trace),
    remotePrintLogging(ns),
  ]);
}

export async function remotePrintLogging(ns) {
  await listen(ns, 3, function (data) {
    ns.print(data);
  });
}

export async function remoteDebugLogging(ns, debug) {
  await listen(ns, 2, function (data) {
    if (debug) ns.print(data);
  });
}

export async function remoteTraceLogging(ns, trace) {
  await listen(ns, 1, function (data) {
    if (trace) ns.print(data);
  });
}
