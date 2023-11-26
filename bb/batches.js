import * as lib from 'bb/lib.js'

/** @param {NS} ns */
export async function main(ns) {
  const flagArgs = ns.flags([
    ['debug', false],
    ['trace', false],
    ['tail', false],
    ['systemUnhealthy', 2],
    ['maxUtil', 0.90],
    ['minUtil', 0.85],
    ['reserved', 10],
    ['target', []],
  ]);

  if (flagArgs.trace) {
    flagArgs.debug = true;
    lib.disableNoisyLogs(ns);
  } else {
    ns.disableLog("ALL");
  }

  const margin = 30;
  const targets = flagArgs.target.length > 0 ? flagArgs.target : lib.validTargets(ns);
  const maxCycleTime = targets.reduce((acc, n) => Math.max(acc, ns.getWeakenTime(n)), 0);

  if (flagArgs.tail) lib.showTail(ns);

  let firstCycleComplete = false;
  async function reportFirstCycle() {
    await ns.asleep(maxCycleTime);
    firstCycleComplete = true;
  }

  const spawnOpts = { ns, reservedMemory: flagArgs.reserved };
  async function spawnThreads(rpc, threads, arg) {
    return lib.spawnThreads(spawnOpts, ...arguments);
  }

  function isOptimal(name) {
    const moneyMax = ns.getServerMaxMoney(name);
    const moneyAvailable = ns.getServerMoneyAvailable(name);
    const hackDifficulty = ns.getServerSecurityLevel(name);
    const minDifficulty = ns.getServerMinSecurityLevel(name);

    return (moneyAvailable == moneyMax && hackDifficulty == minDifficulty);
  }

  function activeTargets() {
    const myLevel = ns.getHackingLevel();
    return targets.filter(n => ns.getServerRequiredHackingLevel(n) < myLevel/2);
  }

  const unhealthyCounters = {};
  function unhealthyCheck(name) {
    unhealthyCounters[name] ||= 0;

    if (isOptimal(name)) {
      unhealthyCounters[name] = 0;
    } else {
      unhealthyCounters[name]++;
    }

    return isUnhealthy(name);
  }

  function isUnhealthy(name) {
    return unhealthyCounters[name] && unhealthyCounters[name] > flagArgs.targetUnhealthy && !isOptimal(name);
  }

  function isOptimal(name) {
    return lib.isServerOptimal(ns, name);
  }

  function systemUnhealthy() {
    const list = activeTargets();
    const inUse = getTotalMemoryInUse();
    const installed = getTotalMemoryInstalled();

    if (inUse > installed * 0.98) return true;

    return list.length > 0 && list.every(isUnhealthy) && list.some(isUnhealthy);
  }

  function enoughTargetsStable() {
    const list = activeTargets();
    return list.filter(isUnhealthy).length <= Math.floor(flagArgs.systemUnhealthy * list.length);
  }

  function isSteadyState() {
    return firstCycleComplete && enoughTargetsStable();
  }

  function updateTuningParameters() {
    const inUse = getTotalMemoryInUse();
    const installed = getTotalMemoryInstalled();

    if (systemUnhealthy()) {
      hackPercentage -= 0.01;
    } else if (inUse > installed * flagArgs.maxUtil) {
      hackPercentage -= 0.001;
    } else if (isSteadyState() && inUse < installed * flagArgs.minUtil) {
      // +0.005 at 50% memory usage, converge faster when memory usage is low
      hackPercentage += ((installed - inUse) / (installed * 100));
    }
  }

  const metrics = { moneyEarned: 0 };
  async function monitoringLoop() {
    while (true) {
      updateTuningParameters();

      const money = metrics.moneyEarned;
      metrics.moneyEarned = 0;

      const unhealthyCount = activeTargets().filter(isUnhealthy).length;
      const inUse = lib.getTotalMemoryInUse(ns);
      const installed = lib.getTotalMemoryInstalled(ns);
      const freeMem = installed - inUse;

      const data = {
        unhealthy: unhealthyCount,
        steal: hackPercentage,
        free: ns.formatRam(freeMem),
        usedPct: ns.formatPercent(inUse / installed),
        earned: ns.formatNumber(money),
      };

      try {
        ns.print(ns.sprintf(" %(steal)' 5.3f / %(unhealthy)' 2d  Mem: %(usedPct)' 6s / %(free)' 8s  $ %(earned)' 8s",data));
      } catch(e) {
        ns.print("ERROR: ", data);
      }
      await ns.asleep(5000);
    }
  }

  async function accounting() {
    await lib.listen(ns, 4, function (data) {
      metrics.moneyEarned += parseInt(data);
    });
  }

  async function loop(name) {
    const myLevel = ns.getHackingLevel();
    while (ns.getServerRequiredHackingLevel(name) > myLevel/2) {
      await ns.asleep(60000);
    }

    while (true) {
      await batch();
    }
  }

  async function batch(batchID, name) {
    const weakenTime = ns.getWeakenTime(name);
    const growTime = ns.getGrowTime(name);
    const hackTime = ns.getHackTime(name);

    unhealthyCheck(name);

    const threads = calculateThreads(name);

    if (threads == null) {
      return;
    }

    let memoryAvailable = true;

    if (lib.isServerOptimal(ns, name)) {
      memoryAvailable &&= await spawnThreads(rpcWeaken, threads.hackWeaken, name);
    }

    await ns.asleep(margin * 2);
    if (memoryAvailable) {
      memoryAvailable &&= await spawnThreads(rpcWeaken, threads.growWeaken, name);
    }

    const growLead = weakenTime - growTime - margin;
    await ns.asleep(growLead);
    if (memoryAvailable) {
      memoryAvailable &&= await spawnThreads(rpcGrow, threads.grow, name);
    }

    if (lib.isServerOptimal(ns, name) && memoryAvailable) {
      await spawnThreads(rpcHack, threads.hack, name);
    }

    await ns.asleep(hackTime - growLead - margin);
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
      (1 / (1 - hackPercentage)),
      moneyMax / Math.max(moneyAvailable, 1)
    );

    const threads = {
      hack: Math.ceil(hackPercentage / ns.hackAnalyze(name)),
      grow: Math.ceil(ns.growthAnalyze(name, growthFactor)),
    }

    const extraDifficulty = hackDifficulty - minDifficulty;
    const growthAnalyze = ns.growthAnalyzeSecurity(threads.grow);
    const weakenAnalyze = ns.weakenAnalyze(1);
    const hackAnalyze = ns.hackAnalyzeSecurity(threads.hack, name);

    threads.growWeaken = Math.ceil((growthAnalyze+extraDifficulty) / weakenAnalyze);
    threads.hackWeaken = Math.ceil(hackAnalyze / weakenAnalyze);

    return threads;
  }

  let hackPercentage = 0;
  async function bootstrapParameters() {
    const available = ns.getTotalMemoryFree(ns) - flagArgs.reserved;
    const rpcMemReqs = {};
    const rpcFuncs = [rpcHack, rpcGrow, rpcWeaken];
    rpcFuncs.forEach(function (n) {
      rpcMemReqs[n] = ns.getScriptRam(n);
    });

    let budget = 0;

    do {
      hackPercentage += 0.005;
      if (hackPercentage > 0.9) {
        ns.print("ERROR: failed to converge parameters");
        ns.exit();
      }

      budget = activeTargets()
        .map(calculateThreads)
        .reduce((acc, threads) => {
          return acc +
            rpcMemReqs[rpcWeaken] * threads.growWeaken +
            rpcMemReqs[rpcWeaken] * threads.hackWeaken +
            rpcMemReqs[rpcGrow] * threads.grow +
            rpcMemReqs[rpcHack] * threads.hack;
        }, 0);


      await ns.sleep(10);
    } while(budget < available);

    // The last round went over, so back it off
    hackPercentage -= 0.005;
  }

  await bootstrapParameters();

  accounting();
  lib.rsyslog(ns, flagArgs);

  monitoringLoop();

  // Let the monitoring loops get started
  await ns.asleep(10);

  await Promise.all([
    targets.map(loop),
    reportFirstCycle(),
  ].flat());
}
