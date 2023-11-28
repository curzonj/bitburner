import * as lib from 'bb/lib.js'

/** @param {NS} ns */
export async function main(ns) {
  lib.resizeTail(ns);

  const flagArgs = ns.flags([
    ['debug', false],
    ['trace', false],
    ['tail', false],
    ['initialMemoryFactor', 0.5],
    ['maxThreads', 999999999999],
    ['minUtil', 0.80],
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
  const maxThreads = flagArgs.maxThreads;

  let skipHack = false;
  if (!activeTargets().every(isOptimal)) {
    ns.tprint("preparing the servers first");
    skipHack = false;
  }

  async function parameterTuningLoop() {
    while (true) {
      await ns.asleep(maxCycleTime);
      updateTuningParameters();
    }
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

  function isOptimal(name) {
    return lib.isServerOptimal(ns, name);
  }

  function updateTuningParameters() {
    const inUse = lib.getTotalMemoryInUse(ns);
    const installed = lib.getTotalMemoryInstalled(ns);
    const free = installed - inUse;

    if (skipHack && activeTargets().every(isOptimal)) skipHack = false;

    if (inUse < installed * flagArgs.minUtil) {
      if (free > 600) {
        // +0.05 at 50% memory usage, converge faster when memory usage is low
        hackPercentage += ((installed - inUse) / (installed * 10));
      } else if (free > 200) {
        // early game there's not enough resources to scale much
        hackPercentage += 0.001
      }
    }

    hackPercentage = Math.max(hackPercentage, 0.001);
  }

  const metrics = { moneyEarned: 0 };
  async function monitoringLoop() {
    while (true) {
      const money = metrics.moneyEarned;
      metrics.moneyEarned = 0;

      const inUse = lib.getTotalMemoryInUse(ns);
      const installed = lib.getTotalMemoryInstalled(ns);
      const freeMem = installed - inUse;

      const data = {
        unhealthy: activeTargets().filter(n => !isOptimal(n)).length,
        steal: hackPercentage,
        free: ns.formatRam(freeMem),
        usedPct: ns.formatPercent(inUse / installed),
        earned: ns.formatNumber(money),
      };

      ns.print(ns.sprintf(" %(steal)' 5.3f / %(unhealthy)' 2d  Mem: %(usedPct)' 6s / %(free)' 8s  $ %(earned)' 8s",data));
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
    let queue = [];
    let margin = 30;
    let nextBlackoutEnds = null;

    while (true) {
      const batchPrefix = 14;
      margin = Math.min(margin, (ns.getHackTime(name) / (5*(batchPrefix+4)) ));

      await ns.asleep(batchPrefix * margin);

      if (!isOptimal(name)) safety++;
      const threads = calculateThreads(name, safety);
      if (threads == null) return;

      let success = true;
      const weakenTime = ns.getWeakenTime(name);
      if (!skipHack) {
        success &&= await spawnThreads(lib.rpcWeaken, threads.hackWeaken, name);
      }
      const dueAt = Date.now()+Math.ceil(weakenTime);

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

      queue.push({
        dueAt,
        hackThreads: (skipHack || !success ? 0 : threads.hack),
      });

      const hackTime = ns.getHackTime(name);
      if (queue.length < 3) {
        await ns.asleep(hackTime - growLead - ((batchPrefix - 2) * margin));
        continue;
      }

      // BEFORE BLACKOUT
      const { dueAt: nextBatchAt, hackThreads } = queue.shift();
      const hackStartsAt = Math.floor(nextBatchAt - hackTime - margin);
      if (nextBlackoutEnds && hackStartsAt < nextBlackoutEnds) {
        if (flagArgs.trace) {
          const theory = Math.ceil((hackTime - growLead - ((batchPrefix - 2) * margin)));
          ns.print(`WARNING: ${name} hack late by ${nextBlackoutEnds - hackStartsAt}ms`);
          ns.print({
            margin, growLead,
            queue, hackTime, weakenTime, growTime,
            now: Date.now(), nextBatchAt, nextBlackoutEnds, hackStartsAt,
            theory,
          });
        }

        await ns.asleep(nextBlackoutEnds - Date.now());
      } else {
        await ns.asleep(hackStartsAt - Date.now());
        // AFTER BLACKOUT

        if (hackThreads > 0 && success && lib.isServerOptimal(ns, name)) {
          await spawnThreads(lib.rpcHack, Math.min(threads.hack, hackThreads), name);
        }
      }

      nextBlackoutEnds = nextBatchAt + (3 * margin);
      if (!skipHack && !success && hackPercentage > 0.001) hackPercentage -= 0.001;
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
    // 200 GB is a minimum buffer for batches itself early game
    const available = lib.getTotalMemoryFree(ns) - flagArgs.reserved - 200;
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
    } while(4 * budget * flagArgs.initialMemoryFactor < available);

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
    parameterTuningLoop(),
  ].flat());
}
