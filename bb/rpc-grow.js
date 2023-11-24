/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const ret = await ns.grow(target);

  while (!ns.tryWritePort(
    1,
    ns.sprintf("rpc-grow: %j", { target, result: ns.formatPercent(ret - 1), difficulty: ns.getServerSecurityLevel(target), money: ns.getServerMoneyAvailable(target) }),
  )) {
    await ns.sleep(10);
  }
}
