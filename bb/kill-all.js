/** @param {NS} ns */
export async function main(ns) {
  await everyServer(ns, function(target) {
    ns.killall(target, true);
  });
    
  ns.tprint("done");
}

async function everyServer(ns, fn) {
  const table = { "home": true };
  const queue = ["home"];

  while (queue.length > 0) {
    await ns.sleep(10);

    let source = queue.pop();
    let list = ns.scan(source);

    for (var i in list) {
      let target = list[i];

      if (table[target]) {
        continue;
      }

      table[target] = true;
      queue.push(target);

      await fn(target);
    }
  }

  await fn("home");
}
