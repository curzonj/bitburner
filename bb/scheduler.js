import { allServers, validTargets, bestGrindTarget } from 'bb/lib.js'

/** @param {NS} ns */
export async function main(ns) {
  const flagArgs = ns.flags([
    ['debug', false],
    ['trace', false],
    ['tail', false],
    ['grind', false],
    ['instability', 4],
    ['initialCommit', 1.4],
    ['minCommit', 0.6],
    ['maxUtil', 0.90],
    ['minUtil', 0.85],
    ['concurrency', 20],
    ['margin',200],
    ['reserved', 10],
    ['steal', 0.02],
    ['memoryOversubscription', 0.2],
    ['target', []],
  ]);

  if (flagArgs.trace) {
    flagArgs.debug = true;
    ns.disableLog("disableLog");
    ns.disableLog("scan");
    ns.disableLog("scp");
    ns.disableLog("getServerRequiredHackingLevel");
  } else {
    ns.disableLog("ALL");
  }

  function getWorkers() {
    return allServers(ns)
      .filter(s => ns.hasRootAccess(s))
      .filter(s => ns.getServerMaxRam(s) > 0);
  }

  function getTotalMemoryInUse() {
    return getWorkers().reduce(function (acc, name) {
      return acc + ns.getServerUsedRam(name);
    }, 0);
  }

  function getTotalMemoryInstalled() {
    return getWorkers().reduce(function (acc, name) {
      return acc + ns.getServerMaxRam(name);
    }, 0);
  }

  const reservedMemory = flagArgs.reserved;
  const margin = flagArgs.margin;
  const cpuCores = 1;
  const memoryBudget = {};
  let memoryBudgetLevel = {};
  const memoryUsedElsewhere = getTotalMemoryInUse();
  const selfMemReq = ns.getScriptRam("/bb/scheduler.js");

  if (memoryUsedElsewhere > (reservedMemory+selfMemReq)) {
    ns.tprint("Too much memory used elsewhere ", ns.formatRam(memoryUsedElsewhere));
    ns.exit();
  }

  const rpcHack = "/bb/rpc-hack.js";
  const rpcGrow = "/bb/rpc-grow.js";
  const rpcWeaken = "/bb/rpc-weaken.js";
  const rpcMemReqs = {};
  const rpcFuncs = [rpcHack, rpcGrow, rpcWeaken];
  rpcFuncs.forEach(function (n) {
    rpcMemReqs[n] = ns.getScriptRam(n);
  });
  const maxRpcMemReq = Math.max.apply(null, Object.values(rpcMemReqs));
  const targets = flagArgs.target.length > 0 ? flagArgs.target : validTargets(ns);

  if (flagArgs.tail) {
    ns.tail();
    ns.moveTail(0, 0);
  }

  function updateMemoryBudget(name, threads) {
    const myLevel = ns.getHackingLevel();

    // Only recalculate the optimal budget after big changes in level
    if (memoryBudgetLevel[name] && memoryBudgetLevel[name] > myLevel - 20) return true;

    const budget = (
      rpcMemReqs[rpcWeaken] * threads.growWeaken +
      rpcMemReqs[rpcWeaken] * threads.hackWeaken +
      rpcMemReqs[rpcGrow] * threads.grow +
      rpcMemReqs[rpcHack] * threads.hack
    );

    if (budget < 1 || budget == null || !isFinite(budget) || isNaN(budget)) {
      return false;
    }

    if (isOptimal(name)) memoryBudgetLevel[name] = myLevel;
    memoryBudget[name] = Math.ceil(budget);

    return true;
  }

  async function spawnThreads(rpc, threads, arg) {
    let remaining = Math.ceil(threads);
    const { freeMem } = procStats();
    const memRequired = rpcMemReqs[rpc] * threads;

    let pool = getWorkers().map(function (name) {
      return ns.getServer(name);
    }).sort(function (a, b) {
      return (a.maxRam - a.ramUsed) - (b.maxRam - b.ramUsed);
    });


    for (var i in pool) {
      var s = pool[i];
      var name = s.hostname;
      let maxRam = s.maxRam;
      if (name == "home") {
        maxRam -= reservedMemory;
      }

      let maxLocalThreads = Math.floor((maxRam - s.ramUsed) / rpcMemReqs[rpc])
      let localThreads = remaining;

      if (rpc == rpcWeaken || rpc == rpcGrow) {
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
      if (arg == "home") {
        // trigger a stacktrace
        localThreads = -1;
      }

      ns.scp(rpc, name);
      ns.exec(rpc, name, localThreads, arg);
    }

    if (remaining < 1) {
      return true;
    } else {
      if (flagArgs.debug) {
        ns.print("ERROR: spawn failed ", { rpc, threads, remaining, arg, required: ns.formatRam(memRequired), free: ns.formatRam(freeMem) });
      }

      return false;
    }
  }

  function procStats() {
    let freeMem = 0;
    let procs = 0;

    const list = getWorkers();

    for (var i in list) {
      let name = list[i];
      freeMem += (ns.getServerMaxRam(name) - ns.getServerUsedRam(name));
      procs += ns.ps(name).length;
    }

    return { freeMem, procs };
  }

  function getTotalBudget() {
    return Object.values(memoryBudget).reduce((acc, num) => acc + num, 0);
  }

  function isOptimal(name) {
    const moneyMax = ns.getServerMaxMoney(name);
    const moneyAvailable = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    return (moneyAvailable == moneyMax && hackDifficulty == minDifficulty);
  }


  function isStable(name) {
    const moneyMax = ns.getServerMaxMoney(name);
    const moneyAvailable = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    return (moneyAvailable > (moneyMax * 0.9) && hackDifficulty < (minDifficulty * 1.1));
  }

  function activeTargets() {
    const myLevel = ns.getHackingLevel();
    return targets.filter(n => ns.getServerRequiredHackingLevel(n) > myLevel/2);
  }

  const unstableCounters = {};
  function instabilityCheck(name) {
    unstableCounters[name] ||= 0;

    if (isStable(name)) {
      unstableCounters[name] = 0;
    } else {
      unstableCounters[name]++;
    }

    return isUnstable(name);
  }

  function isUnstable(name) {
    return unstableCounters[name] && unstableCounters[name] > flagArgs.instability;
  }

  function instabilityCount() {
    return Object.values(unstableCounters).filter(n => n > flagArgs.instability).length;
  }

  function allTargetsStable() {
    const list = activeTargets();

    return list.every(isStable) && !list.some(isUnstable);
  }

  function generalInstability() {
    const list = activeTargets();
    const unstable = list.every(n => isUnstable(n) && !isStable(n));
    const stable = allTargetsStable();

    if (unstable && stable) {
      const data = list.reduce((acc, n) => {
        acc[n] = { u: isUnstable(n), s: isStable(n) };
        return acc;
      }, {});

      ns.print("WARNING: ", data, { stable,  unstable });
    }

    return unstable;
  }

  let hackPercentage = flagArgs.steal;
  let memoryFactor = flagArgs.initialCommit;
  function getConcurrency() {
    const installed = getTotalMemoryInstalled();
    let budget = getTotalBudget();

    if (budget < 1 || budget == null || !isFinite(budget) || isNaN(budget)) {
      return 1;
    }

    if (generalInstability()) {
      return 1;
    }

    return Math.max(installed / (budget * memoryFactor), 1);
  }

  function updateTuningParameters() {
    const inUse = getTotalMemoryInUse();
    const installed = getTotalMemoryInstalled();

    if (memoryFactor <= 2) {
      if (inUse > installed * flagArgs.maxUtil) memoryFactor += 0.01;
      if (inUse > installed * 0.98) memoryFactor += 0.20;
      if (generalInstability())     memoryFactor += 0.20;
    }

    if (allTargetsStable() && inUse < installed * flagArgs.minUtil) {
      if (getConcurrency() < flagArgs.concurrency || memoryFactor > 1) {
        memoryFactor -= 0.01;
      } else {
        memoryFactor += 0.1

        // +0.005 at 50% memory usage, converge faster when memory usage is low
        hackPercentage += ((installed - inUse) / (installed * 100));

        // Update the budgets because it'll change when stealing more
        memoryBudgetLevel = {};
        Object.keys(memoryBudget).forEach(calculateThreads);
      }
    }
  }

  const metrics = { moneyEarned: 0 };
  async function monitoringLoop() {
    while (true) {
      updateTuningParameters();

      const concurrency = getConcurrency();
      const { freeMem, procs } = procStats();
      const money = metrics.moneyEarned;
      metrics.moneyEarned = 0;

      const inUse = getTotalMemoryInUse();
      const installed = getTotalMemoryInstalled();

      const data = {
        procs,
        unstable: instabilityCount(),
        factor: memoryFactor,
        steal: hackPercentage,
        concurrency,
        free: ns.formatRam(freeMem),
        usedPct: ns.formatPercent(inUse / installed),
        earned: ns.formatNumber(money),
      };

      try {
        ns.print(ns.sprintf("%(procs)' 5d  mFCSu: %(factor)' 4.2f / %(concurrency)' 6.2f / %(steal)' 5.3f / %(unstable)' 1d  Mem: %(usedPct)' 6s / %(free)' 8s  $ %(earned)' 8s",data));
      } catch(e) {
        ns.print("ERROR: ", data);
      }
      await ns.asleep(5000);
    }
  }

  async function listen(portNumber, fn) {
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

  async function accounting() {
    await listen(4, function (data) {
      metrics.moneyEarned += parseInt(data);
    });
  }

  async function remotePrintLogging() {
    await listen(3, function (data) {
      ns.print(data);
    });
  }

  async function remoteDebugLogging() {
    await listen(2, function (data) {
      if (flagArgs.debug) {
        ns.print(data);
      }
    });
  }

  async function remoteTraceLogging() {
    await listen(1, function (data) {
      if (flagArgs.trace) {
        ns.print(data);
      }
    });
  }

  async function loop(name) {
    const myLevel = ns.getHackingLevel();
    while (ns.getServerRequiredHackingLevel(name) > myLevel/2) {
      await ns.asleep(60000);
    }

    let batchID = 0;
    while (true) {
      const batchLength = ns.getWeakenTime(name) + (margin * 4);
      const nextSleep = Math.max(margin * 4, batchLength / getConcurrency());

      let prom = batch(batchID++, name);
      if (flagArgs.once) {
        return prom;
      }

      await Promise.race([
        prom,
        ns.asleep(nextSleep),
      ]);
    }
  }

  function calculateThreads(name) {
    const myLevel = ns.getHackingLevel();
    if (ns.getServerRequiredHackingLevel(name) > myLevel) {
      return null;
    }

    const moneyMax = ns.getServerMaxMoney(name);
    const moneyAvailable = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    let growthFactor = Math.max(
      (1 / (1 - (hackPercentage * 1.25))),
      moneyMax / Math.max(moneyAvailable, 1)
    );

    const threads = {
      hack: Math.ceil(hackPercentage / ns.hackAnalyze(name)),
      grow: Math.ceil(ns.growthAnalyze(name, growthFactor, cpuCores)),
    }

    const extraDifficulty = hackDifficulty - minDifficulty;
    const growthAnalyze = ns.growthAnalyzeSecurity(threads.grow, undefined, cpuCores);
    const weakenAnalyze = ns.weakenAnalyze(1, cpuCores);
    const hackAnalyze = ns.hackAnalyzeSecurity(threads.hack, name);

    threads.growWeaken = Math.ceil((growthAnalyze+extraDifficulty) / weakenAnalyze);
    threads.hackWeaken = Math.ceil(hackAnalyze / weakenAnalyze)

    if (!updateMemoryBudget(name, threads)) {
      ns.tprint({ threads, growthAnalyze, weakenAnalyze, hackAnalyze, growthFactor });
      ns.tprint(ns.sprintf("ERROR: Failed to build budget for %s", name));
    }

    // TODO limit the number of threads if the server is unstable

    return threads;
  }

  function calculateTimes(name) {
    const times = {};

    times.weakenTime = ns.getWeakenTime(name);
    times.hackTime = ns.getHackTime(name);
    times.growTime = ns.getGrowTime(name);

    times.growLead = times.weakenTime - times.growTime - margin;
    times.hackLead = times.weakenTime - times.hackTime - margin * 3;
    times.weakenLead = margin * 2;

    return times;
  }

  async function batch(batchID, name) {
    function log(src, argv) {
      argv['batchID'] = batchID;
      argv['name'] = name;
      ns.print("loop." + src + " ", argv);
    }

    let moneyMax = ns.getServerMaxMoney(name);
    let moneyAvailable = ns.getServerMoneyAvailable(name);
    let hackDifficulty = ns.getServerSecurityLevel(name);
    let minDifficulty = ns.getServerMinSecurityLevel(name);

    instabilityCheck(name);

    const times = calculateTimes(name);
    const threads = calculateThreads(name);

    if (threads == null) {
      return;
    }

    const stats = { minDifficulty, hackDifficulty, money: moneyAvailable, max: moneyMax };
    if (flagArgs.debug) {
      log('threads', threads);
      log("start", stats);
    }

    await spawnThreads(rpcWeaken, threads.hackWeaken, name);
    await ns.asleep(margin * 2);
    await spawnThreads(rpcWeaken, threads.growWeaken, name);
    await ns.asleep(times.growLead);
    await spawnThreads(rpcGrow, threads.grow, name);

    if (isUnstable(name)) {
      await ns.asleep(times.growTime + (margin*2));
    } else {
      await ns.asleep(times.hackLead - times.growLead);
      await spawnThreads(rpcHack, threads.hack, name);
      await ns.asleep(times.hackTime + (margin*4));
    }

    if (flagArgs.debug) {
      log("end", { minDifficulty , hackDifficulty, money: moneyAvailable, max: moneyMax });
    }
  }

  function calcGrindingThreads() {
    const memCommitted = Object.keys(memoryBudget).reduce(function (acc, name) {
      const num = memoryBudget[name];
      return acc + num;
    }, 0);
    const totalMem = getTotalMemoryInstalled();
    const memRequired = rpcMemReqs[rpcWeaken];
    return (totalMem - (memCommitted * (1 - flagArgs.memoryOversubscription))) / memRequired;
  }

  async function grindHackingExperience() {
    while (true) {
      let target = bestGrindTarget(ns);
      let threads = calcGrindingThreads();
      let time = ns.getWeakenTime(target);

      if (!target) {
        await ns.asleep(60000);
        continue;
      }

      await spawnThreads(rpcWeaken, threads, target);
      await ns.asleep(time + margin);
    }
  }

  accounting();
  remoteDebugLogging();
  remoteTraceLogging();
  remotePrintLogging();
  monitoringLoop();

  // Let the monitoring loops get started
  await ns.asleep(10);

  // main body
  targets.forEach(calculateThreads);

  await Promise.all([
    targets.map(loop),
    flagArgs.grind ? grindHackingExperience() : [],
  ].flat());
}
