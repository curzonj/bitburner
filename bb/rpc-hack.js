/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const result = await ns.hack(target);

  async function log(port, data) {
    while (!ns.tryWritePort(port, data)) {
      await ns.sleep(10);
    }
  }

  await log(1, ns.sprintf("rpc-hack: %j", { target, result, difficulty: ns.getServerSecurityLevel(target), money: ns.getServerMoneyAvailable(target) }));
  await log(3, ns.sprintf("earned %s from %s", ns.formatNumber(result), target));
}
