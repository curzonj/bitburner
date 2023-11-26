import { allServers, validTargets, bestGrindTarget, isServerStable } from 'bb/lib.js'

export async function main(ns) {
  const flagArgs = ns.flags([
    ['target', []],
    ['all', false],
    ['best', false],
  ]);

  const script = "/bb/rpc-grind.js";
  const reqMem = ns.getScriptRam(script);
  const myLevel = ns.getHackingLevel();

  let targets = [];
  if (flagArgs.all) {
    targets = validTargets(ns)
  } else if (flagArgs.best) {
    targets = [ bestGrindTarget(ns) ];
  } else if (flagArgs.target.length > 0) {
    targets = flagArgs.target;
  } else {
    targets = validTargets.filter(s => !isServerStable(ns, s));
  }

  const workers = allServers(ns)
    .filter(s => ns.hasRootAccess(s));
  const totalThreads = workers.reduce((acc, name) => {
    if (name != 'home') ns.scp(script, name);

    const freeMem = ns.getServerMaxRam(name) - ns.getServerUsedRam(name);
    return acc + Math.floor(freeMem / reqMem);
  }, 0)
  const perTarget = Math.floor(totalThreads / targets.length);

  for (var i in targets) {
    const target = targets[i];
    let remaining = perTarget;
    let j = 0;

    while(remaining > 0 && j < workers.length) {
      const worker = workers[j++];
      const freeMem = ns.getServerMaxRam(worker) - ns.getServerUsedRam(worker);
      const threads = Math.min(remaining, Math.floor(freeMem / reqMem));
      remaining -= threads;
      if (threads > 0) ns.exec(script, worker, threads, target);
    }
  }
}
