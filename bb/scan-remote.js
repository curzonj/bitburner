/** @param {NS} ns */
export async function main(ns) {
  ns.tprint(ns.scan(ns.args[0]));
}
