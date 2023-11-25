import { allServers, validTargets, bestGrindTarget } from 'bb/lib.js'

/** @param {NS} ns */
export async function main(ns) {
  const flagArgs = ns.flags([
    ['debug', false],
    ['trace', false],
    ['tail', false],
    ['grind', false],
    ['initialCommit', 1.4],
    ['minCommit', 0.6],
    ['prepThresh', 1.20],
    ['maxUtil', 0.90],
    ['minUtil', 0.85],
    ['margin',200],
    ['reserved', 0],
    ['steal', 0.4],
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

  if (flagArgs.tail) {
    ns.tail();
    ns.moveTail(0, 0);
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
      ns.print("ERROR: spawn failed ", { rpc, threads, remaining, arg, required: ns.formatRam(memRequired), free: ns.formatRam(freeMem) });
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

  let memoryFactor = flagArgs.memoryFactor;
  function getConcurrency() {
    const ramBudget = getTotalBudget();
    const installed = getTotalMemoryInstalled();

    return (installed / (ramBudget * memoryFactor)) || 1;
  }

  function updateMemoryFactor() {
    const inUse = getTotalMemoryInUse();
    const installed = getTotalMemoryInstalled();

    if (inUse > installed * flagArgs.maxUtil) memoryFactor += 0.01;
    if (inUse < installed * flagArgs.minUtil && memoryFactor > flagArgs.minCommit) memoryFactor -= 0.01;
  }

  const metrics = { moneyEarned: 0 };
  async function monitoringLoop() {
    while (true) {
      const concurrency = getConcurrency();
      updateMemoryFactor();

      const { freeMem, procs } = procStats();
      const money = metrics.moneyEarned;
      metrics.moneyEarned = 0;

      const ramBudget = getTotalBudget();
      const inUse = getTotalMemoryInUse();
      const installed = getTotalMemoryInstalled();

      ns.print(ns.sprintf(
        "%(procs)' 5d   Calc: %(factor)' 5.2f   Obs: %(ratio)' 5.2f  Budget: %(budget)' 8s  Used: %(used)' 8s  %(usedPct)' 8s  Free: %(free)' 8s  Max: %(total)' 8s  $ %(earned)' 8s",
        {
          procs,
          factor: memoryFactor,
          ratio: ((inUse / ramBudget) / concurrency),
          free: ns.formatRam(freeMem),
          used: ns.formatRam(inUse),
          total: ns.formatRam(installed),
          usedPct: ns.formatPercent(inUse / installed),
          budget: ns.formatRam(ramBudget),
          earned: ns.formatNumber(money),
        }
      ));
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
      let s = ns.getServer(name);
      let nextSleep = margin * 4;

      if (s.hackDifficulty > (s.minDifficulty * flagArgs.prepThresh)) {
        nextSleep += ns.getWeakenTime(name);
      }

      const batchLength = ns.getWeakenTime(name) + (margin * 4);
      nextSleep = Math.max(nextSleep, batchLength / getConcurrency());

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

    const hackPercentage = flagArgs.steal;
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

    threads.growWeaken = Math.ceil(growthAnalyze / weakenAnalyze);
    threads.hackWeaken = Math.ceil((hackAnalyze+extraDifficulty) / weakenAnalyze)
    threads.prepWeaken = Math.ceil(extraDifficulty / weakenAnalyze);

    const budget = (
      rpcMemReqs[rpcWeaken] * threads.growWeaken +
      rpcMemReqs[rpcWeaken] * threads.hackWeaken +
      rpcMemReqs[rpcGrow] * threads.grow +
      rpcMemReqs[rpcHack] * threads.hack
    );

    if (budget < 1 || budget == null || !isFinite(budget) || isNaN(budget)) {
      ns.tprint({ threads, growthAnalyze, weakenAnalyze, hackAnalyze, growthFactor });
      ns.tprint(ns.sprintf("ERROR: Failed to build budget for %s", name));
      return null;
    }

    memoryBudget[name] = Math.ceil(budget);

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
    times.trailingMargin = margin * 4;

    return times;
  }

  async function batch(batchID, name) {
    let s = ns.getServer(name);

    function log(src, argv) {
      argv['batchID'] = batchID;
      argv['name'] = name;
      ns.print("loop." + src + " ", argv);
    }

    const times = calculateTimes(name);
    const threads = calculateThreads(name);

    if (threads == null) {
      return;
    }

    const stats = { minDifficulty: s.minDifficulty, difficulty: s.hackDifficulty, money: s.moneyAvailable, max: s.moneyMax };
    if (flagArgs.debug) {
      log('threads', threads);
      log("start", stats);
    }
    if (s.hackDifficulty > (s.minDifficulty * flagArgs.prepThresh)) {
      await spawnThreads(rpcWeaken, threads.prepWeaken, name);
      ns.print(ns.sprintf("weakening %s for %s", name, ns.tFormat(times.weakenTime)));
      await ns.asleep(times.weakenTime + margin);
    } else {
      await spawnThreads(rpcWeaken, threads.hackWeaken, name);
      await ns.asleep(margin * 2);
      await spawnThreads(rpcWeaken, threads.growWeaken, name);
      await ns.asleep(times.growLead);
      await spawnThreads(rpcGrow, threads.grow, name);
      await ns.asleep(times.hackLead - times.growLead);
      await spawnThreads(rpcHack, threads.hack, name);
      await ns.asleep(times.hackTime + times.trailingMargin);
    }

    if (flagArgs.debug) {
      s = ns.getServer(name);
      log("end", { minDifficulty: s.minDifficulty, difficulty: s.hackDifficulty, money: s.moneyAvailable, max: s.moneyMax });
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
  const targets = flagArgs.target.length > 0 ? flagArgs.target : validTargets(ns);
  targets.forEach(calculateThreads);

  await Promise.all([
    targets.map(loop),
    flagArgs.grind ? grindHackingExperience() : [],
  ].flat());
}
