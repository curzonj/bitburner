export async function main(ns) {
  const goal = ns.args[0];
  if (!goal) {
    ns.tprint("Usage: find.js <hostname>");
    ns.exit)();
  }

  ns.tprint(find(ns, "home", "home", goal);
}

function find(ns, name, origin, goal) {
  if (name == goal) {
    return [ name ];
  }

  return ns
    .scan(name)
    .filter(n => n != origin)
    .map(n => find(ns, n, name, goal))
    .filter(n => n && n.length > 0)
    .map(list => [ name, list ])
    .flat();
}
