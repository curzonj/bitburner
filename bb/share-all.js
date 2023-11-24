/** @param {NS} ns */
export async function main(ns) {
  const reqMem = ns.getScriptRam("/rpc-share.js");

  await everyServer(ns, function(target) {
    if(!ns.hasRootAccess(target)) {
      return;
    }

    let freeMem = ns.getServerMaxRam(target) - ns.getServerUsedRam(target);
    if (reqMem > freeMem) {
      return;
    }

    ns.scp('/bb/rpc-share.js', target);
    ns.exec('/bb/rpc-share.js', target, Math.floor(freeMem / reqMem));
  })

  ns.tprint("done");
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
