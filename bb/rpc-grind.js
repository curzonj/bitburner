/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];

  while (true) {
    await ns.weaken(target);

    const moneyMax = ns.getServerMaxMoney(target);
    const moneyAvailable = ns.getServerMoneyAvailable(target);

    if (moneyMax > moneyAvailable) {
      await ns.grow(target);
    }
  }
}
