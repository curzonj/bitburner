export async function main(ns) {
  ns.tprint(find(ns, "home", "home", ns.args[0]);
}

function find(ns, name, origin, goal) {
  if (name == goal) {
    return [ name ];
  }

  return $.ns
    .scan(name)
    .filter(n => n != origin);
    .map(n => find(ns, n, name, goal))
    .filter(n => !!n);
}
