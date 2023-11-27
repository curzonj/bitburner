import * as lib from 'bb/lib.js'

/** @param {NS} ns */
export async function main(ns) {
  lib.resizeTail(ns);

  const flagArgs = ns.flags([
    ['debug', false],
    ['trace', false],
    ['tail', false],
    ['systemUnhealthy', 2],
    ['maxThreads', 999999999999],
    ['maxUtil', 0.90],
    ['minUtil', 0.85],
    ['reserved', 10],
    ['target', []],
  ]);

  if (flagArgs.trace) {
    flagArgs.debug = true;
    ns.disableLog("exec");
    lib.disableNoisyLogs(ns);
  } else {
    ns.disableLog("ALL");
  }

  const targets = flagArgs.target.length > 0 ? flagArgs.target : lib.validTargets(ns);
  const maxCycleTime = targets.reduce((acc, n) => Math.max(acc, ns.getWeakenTime(n)), 0);
  const unhealthyCounters = {};
  let skipHack = false;
  const maxThreads = flagArgs.maxThreads;
  let unhealthyThreshold = Math.min(flagArgs.systemUnhealthy, targets.length - 1);

  activeTargets().forEach(unhealthyCheck);
  if (systemUnhealthy()) {
    ns.tprint("system is unhealthy, preparing the servers first");
    skipHack = true;
    unhealthyThreshold = 0;
  }

  let firstCycleComplete = false;
  async function reportFirstCycle() {
    await ns.asleep(maxCycleTime);
    firstCycleComplete = true;
  }

  const spawnOpts = { ns, reservedMemory: flagArgs.reserved, shard: !flagArgs.trace, debug: flagArgs.debug };
  async function spawnThreads(rpc, threads, arg) {
    if (flagArgs.debug) {
      ns.print(`Spawned ${rpc} on ${arg}`);
    }
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

  function unhealthyCheck(name) {
    unhealthyCounters[name] = !isOptimal(name);

    return isUnhealthy(name);
  }

  function isUnhealthy(name) {
    return unhealthyCounters[name];
  }

  function isOptimal(name) {
    return lib.isServerOptimal(ns, name);
  }

  function unhealthyCount() {
    return activeTargets().filter(isUnhealthy).length;
  }

  function systemUnhealthy() {
    const inUse = lib.getTotalMemoryInUse(ns);
    const installed = lib.getTotalMemoryInstalled(ns);

    if (inUse > installed * 0.98) return true;

    return unhealthyCount() > unhealthyThreshold;
  }

  function updateTuningParameters() {
    const inUse = lib.getTotalMemoryInUse(ns);
    const installed = lib.getTotalMemoryInstalled(ns);

    if (skipHack) {
      if (!systemUnhealthy()) {
        skipHack = false;
        unhealthyThreshold = Math.min(flagArgs.systemUnhealthy, targets.length - 1);
      }
    } else if (systemUnhealthy()) {
      if (hackPercentage > 0.011) hackPercentage -= 0.01;
    } else if (inUse > installed * flagArgs.maxUtil) {
      if (hackPercentage > 0.001) hackPercentage -= 0.001;
    } else if (firstCycleComplete && inUse < installed * flagArgs.minUtil) {
      // +0.005 at 50% memory usage, converge faster when memory usage is low
      hackPercentage += ((installed - inUse) / (installed * 100));
    }

    hackPercentage = Math.max(hackPercentage, 0.001);
  }

  const metrics = { moneyEarned: 0 };
  async function monitoringLoop() {
    while (true) {
      updateTuningParameters();

      const money = metrics.moneyEarned;
      metrics.moneyEarned = 0;

      const inUse = lib.getTotalMemoryInUse(ns);
      const installed = lib.getTotalMemoryInstalled(ns);
      const freeMem = installed - inUse;

      const data = {
        maxThreads,
        unhealthy: unhealthyCount(),
        steal: hackPercentage,
        free: ns.formatRam(freeMem),
        usedPct: ns.formatPercent(inUse / installed),
        earned: ns.formatNumber(money),
      };

      try {
        if (skipHack) {
          ns.print(ns.sprintf(" %(maxThreads)' 2d / %(unhealthy)' 2d  Mem: %(usedPct)' 6s / %(free)' 8s  $ %(earned)' 8s",data));
        } else {
          ns.print(ns.sprintf(" %(steal)' 5.3f / %(unhealthy)' 2d  Mem: %(usedPct)' 6s / %(free)' 8s  $ %(earned)' 8s",data));
        }
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

    let safety = 1;
    let dueAt = [];
    let margin = 30;
    let nextBlackoutEnds = null;

    while (true) {
      const batchPrefix = 14;
      margin = Math.min(margin, (ns.getHackTime(name) / (5*(batchPrefix+4)) ));

      await ns.asleep(batchPrefix * margin);

      if (unhealthyCheck(name)) safety++;
      const threads = calculateThreads(name, safety);
      if (threads == null) return;

      let success = true;
      const weakenTime = ns.getWeakenTime(name);
      if (!skipHack) {
        success &&= await spawnThreads(lib.rpcWeaken, threads.hackWeaken, name);
        dueAt.push(Date.now()+Math.ceil(weakenTime));
      }

      await ns.asleep(margin * 2);
      if (success) {
        success &&= await spawnThreads(lib.rpcWeaken, threads.growWeaken, name);
      }

      const growTime = ns.getGrowTime(name);
      const growLead = weakenTime - growTime - margin;
      await ns.asleep(growLead);
      const currentGrowTime = ns.getGrowTime(name);
      if (currentGrowTime < growTime) {
        await ns.asleep(growTime - currentGrowTime);
      }
      if (success) {
        success &&= await spawnThreads(lib.rpcGrow, threads.grow, name);
      }

      const hackTime = ns.getHackTime(name);
      if (skipHack || dueAt.length < 3) {
        await ns.asleep(hackTime - growLead - ((batchPrefix - 2) * margin));
        continue;
      }

      // BEFORE BLACKOUT
      const nextBatchAt = dueAt.shift();
      const hackStartsAt = Math.floor(nextBatchAt - hackTime - margin);
      if (nextBlackoutEnds && hackStartsAt < nextBlackoutEnds) {
        if (flagArgs.trace) {
          const theory = Math.ceil((hackTime - growLead - ((batchPrefix - 2) * margin)));
          ns.print({
            margin, growLead,
            dueAt, hackTime, weakenTime, growTime,
            now: Date.now(), nextBatchAt, nextBlackoutEnds, hackStartsAt,
            theory,
          });
        }
        ns.print(`WARNING: ${name} hack late by ${nextBlackoutEnds - hackStartsAt}ms`);

        await ns.asleep(nextBlackoutEnds - Date.now());
      } else {
        await ns.asleep(hackStartsAt - Date.now());
        // AFTER BLACKOUT

        if (success && lib.isServerOptimal(ns, name)) {
          await spawnThreads(lib.rpcHack, threads.hack, name);
          nextBlackoutEnds = Date.now() + Math.ceil(ns.getHackTime(name) + (4*margin));
        }
      }

      if (!success && hackPercentage > 0.001) hackPercentage -= 0.001;
    }
  }

  function calculateThreads(name, safety=0) {
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
      name,
      hack: Math.min(Math.ceil(maxThreads), Math.ceil(hackPercentage / ns.hackAnalyze(name))),
      grow: Math.min(Math.ceil(maxThreads), Math.ceil(ns.growthAnalyze(name, growthFactor)) + safety),
    }

    const extraDifficulty = hackDifficulty - minDifficulty;
    const growthAnalyze = ns.growthAnalyzeSecurity(threads.grow);
    const weakenAnalyze = ns.weakenAnalyze(1);
    const hackAnalyze = ns.hackAnalyzeSecurity(threads.hack, name);

    threads.growWeaken = Math.ceil((growthAnalyze+extraDifficulty) / weakenAnalyze) + safety;
    threads.hackWeaken = Math.ceil(hackAnalyze / weakenAnalyze) + safety;

    return threads;
  }

  let hackPercentage = 0;
  async function bootstrapParameters() {
    const available = lib.getTotalMemoryFree(ns) - flagArgs.reserved;
    const rpcMemReqs = {};
    const rpcFuncs = [lib.rpcHack, lib.rpcGrow, lib.rpcWeaken];
    rpcFuncs.forEach(function (n) {
      rpcMemReqs[n] = ns.getScriptRam(n);
    });

    let budget = 0;

    do {
      hackPercentage += 0.001;
      if (hackPercentage >= 0.6) return;

      budget = activeTargets()
        .map(calculateThreads)
        .reduce((acc, threads) => {
          if (flagArgs.trace) ns.print(threads);

          return acc +
            rpcMemReqs[lib.rpcWeaken] * threads.growWeaken +
            rpcMemReqs[lib.rpcWeaken] * threads.hackWeaken +
            rpcMemReqs[lib.rpcGrow] * threads.grow +
            rpcMemReqs[lib.rpcHack] * threads.hack;
        }, 0);

      //if (flagArgs.trace) ns.print({ available, budget, hackPercentage });
    } while(budget*3 < available);

    // The last round went over, so back it off
    hackPercentage -= 0.001;
  }

  await bootstrapParameters();

  accounting();
  lib.rsyslog(ns, flagArgs);

  if (!flagArgs.trace) monitoringLoop();

  // Let the monitoring loops get started
  await ns.asleep(10);

  await Promise.all([
    targets.map(loop),
    reportFirstCycle(),
  ].flat());
}
