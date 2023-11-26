import { allServers } from 'bb/lib.js'

export async function main(ns) {
  const reqMem = ns.getScriptRam("/bb/rpc-share.js");
  const maxThreads = ns.args[0] || 9999999999999;

  allServers(ns).filter(ns.hasRootAccess).forEach(target => {
    const freeMem = ns.getServerMaxRam(target) - ns.getServerUsedRam(target);
    const threads = Math.max(maxThreads, Math.floor(freeMem / reqMem));
    if (threads < 1) return;

    ns.scp('/bb/rpc-share.js', target);
    ns.exec('/bb/rpc-share.js', target, threads);
  });

  ns.tprint("INFO: done");
}
