/** @param {NS} ns */
export async function main(ns) {
  // Defines the "target server", which is the server
  // that we're going to hack. In this case, it's "n00dles"
  const target = ns.args[0] || "iron-gym";

  // Defines how much money a server should have before we hack it
  // In this case, it is set to the maximum amount of money.
  const moneyThresh = ns.getServerMaxMoney(target) * (0.7 + (Math.random() * 0.2));

  // Defines the maximum security level the target server can
  // have. If the target's security level is higher than this,
  // we'll weaken it before doing anything else
  const securityThresh = ns.getServerMinSecurityLevel(target) * (1 + (Math.random() * 0.2));

  await ns.sleep(Math.floor(Math.random() * 60000));

  // Infinite loop that continously hacks/grows/weakens the target server
  while (true) {
    let money = ns.getServerMoneyAvailable(target);
    let myLevel = ns.getHackingLevel();

    if (ns.getServerSecurityLevel(target) > securityThresh || Math.random() < 0.3) {
      // If the server's security level is above our threshold, weaken it
      await ns.weaken(target);
    } else if (money < moneyThresh || moneyThresh < (myLevel * 500000)) {
      // If the server's money is less than our threshold, grow it
      // If my level is too high for the target, just grow the money
      // anyways for hacking experience
      await ns.grow(target);
    } else {
      // Otherwise, hack it
      await ns.hack(target);
    }

    await ns.sleep(Math.floor(Math.random() * 10000));
  }
}
