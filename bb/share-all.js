import { allServers } from 'bb/lib.js'

export async function main(ns) {
  const reqMem = ns.getScriptRam("/bb/rpc-share.js");

  allServers(ns).filter(ns.hasRootAccess).forEach(target => {
    let freeMem = ns.getServerMaxRam(target) - ns.getServerUsedRam(target);
    if (reqMem > freeMem) {
      return;
    }

    ns.scp('/bb/rpc-share.js', target);
    ns.exec('/bb/rpc-share.js', target, Math.floor(freeMem / reqMem));
  });

  ns.tprint("INFO: done");
}
