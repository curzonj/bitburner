/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const result = await ns.weaken(target);
  while (!ns.tryWritePort(
    1,
    ns.sprintf("rpc-weaken: %j", { target, result, difficulty: ns.getServerSecurityLevel(target), money: ns.getServerMoneyAvailable(target) }),
  )) {
    await ns.sleep(10);
  }
}
