/** @param {NS} ns */
export async function main(ns) {
  await everyServer(ns, function(target) {
    if(ns.hasRootAccess(target)) {
      return;
    }

    let ports = 0;

    if (ns.fileExists("BruteSSH.exe", "home")) {
      ns.brutessh(target);
      ports++;
    }

    if (ns.fileExists("FTPCrack.exe", "home")) {
      ns.ftpcrack(target);
      ports++;
    }

    if (ns.fileExists("SQLInject.exe", "home")) {
      ns.sqlinject(target);
      ports++;
    }

    if (ns.fileExists("HTTPWorm.exe", "home")) {
      ns.httpworm(target);
      ports++;
    }

    if (ns.fileExists("relaySMTP.exe", "home")) {
      ns.relaysmtp(target);
      ports++;
    }

    if (ns.getServerNumPortsRequired(target) <= ports) {
      ns.nuke(target);;
    }
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
}
