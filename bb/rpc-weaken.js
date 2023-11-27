/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const weakenTime = ns.getHackTime(target);
  const start = Date.now();
  const result = await ns.weaken(target);
  const end = Date.now();
  while (!ns.tryWritePort(
    1,
    ns.sprintf("rpc-weaken: %j", { target, result, difficulty: ns.getServerSecurityLevel(target), money: ns.getServerMoneyAvailable(target), start, end, weakenTime }),
  )) {
    await ns.sleep(10);
  }
}
