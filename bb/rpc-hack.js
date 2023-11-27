/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const hackTime = ns.getHackTime(target);
  const start = Date.now();

  const result = await ns.hack(target);
  const end = Date.now();

  async function log(port, data) {
    while (!ns.tryWritePort(port, data)) {
      await ns.sleep(10);
    }
  }

  await log(1, ns.sprintf("rpc-hack: %j", { target, result, difficulty: ns.getServerSecurityLevel(target), money: ns.getServerMoneyAvailable(target), start, end, hackTime }));
  await log(4, result);
}
