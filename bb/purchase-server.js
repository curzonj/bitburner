/** @param {NS} ns */
export async function main(ns) {
  const flagArgs = ns.flags([
    ['ram', ns.getPurchasedServerMaxRam()],
    ['debug', false],
  ]);

  const maxServers = ns.getPurchasedServerLimit();
  const list = ns.getPurchasedServers();

  if (list.length == maxServers) {
    ns.tprint("Deleting server: " + list[0]);
    ns.killall(list[0]);
    
    if (!ns.deleteServer(list[0])) {
      ns.tprint("Failed to delete server");
      ns.exit();
    }
  }

  ns.tprint(`${ns.formatRam(ram)} costs ${ns.getPurchasedServerCost(ram)}`);

  let i = list.length;
  const myLevel = ns.sprintf("%4d", ns.getHackingLevel());

  while (i < maxServers && ns.getPurchasedServerCost(ram) < ns.getServerMoneyAvailable("home")) {
    ns.purchaseServer(`pserv-${myLevel}-${i++}`, ram);
    ns.tprint("Purchased server with " + ns.formatRam(ram) + " for ", ns.formatNumber(ns.getPurchasedServerCost(ram)));
  }
}
