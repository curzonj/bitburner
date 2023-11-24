/** @param {NS} ns */
export async function main(ns) {
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

  const maxRam = ns.getPurchasedServerMaxRam();
  const money = ns.getServerMoneyAvailable("home");

  let ram = maxRam /* ns.getServerMaxRam("home");

  while (ram < maxRam) {
    if (ns.getPurchasedServerCost(ram * 2) > money) {
      break;
    }

    ram = ram * 2;
  }

  if (ram > maxRam) {
    ram = maxRam;
  }*/


  const myLevel = ns.getHackingLevel();

  ns.purchaseServer("pserv-"+list.length+"-"+myLevel, ram);
  ns.tprint("Purchased server with " + ns.formatRam(ram) + " for ", ns.formatNumber(ns.getPurchasedServerCost(ram)));
}
