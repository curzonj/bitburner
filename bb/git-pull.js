let $ = {};
const argsSchema = [
  ['github', 'curzonj'],
  ['repository', 'bitburner-scripts'],
  ['path', 'scripts'],
  ['branch', 'main'],
  ['extension', ['.js']], // Files to download by extension
];

function buildClient(ns) {
  const apiToken = ns.read("/api_token.txt");
  return function(url, opts={}) {
    opts.headers ||= {};
    opts.headers["Authorization"] = `Bearer ${apiToken}`;
    return fetch(url, opts);
  }
}

export async function main(ns) {
  $.request = buildClient(ns);
  $.options = ns.flags(argsSchema);

  const filesToDownload = await repositoryListing();

  const baseUrl = `raw.githubusercontent.com/${$.options.github}/${$.options.repository}/${$.options.branch}/`;
  for (const path of filesToDownload) {
    const url = `https://${baseUrl}/${path}?ts=${new Date().getTime()}`;
    if (!await ns.wget(url, path)) {
      ns.tprint(`Failed to download ${path}`);
    }
  }
  ns.tprint(`INFO: Pull complete.`);
}

async function repositoryListing(folder = '') {
  const listUrl = `https://api.github.com/repos/${$.options.github}/${$.options.repository}/contents/${folder}?ref=${$.options.branch}`
  const response = await $.request(listUrl);
  const payload = await response.json();
  const folders = payload.filter(f => f.type == "dir").map(f => f.path);
  let files = payload.filter(f => f.type == "file").map(f => f.path)
    .filter(f => $.options.extension.some(ext => f.endsWith(ext)));
  for (const folder of folders)
    files = files.concat((await repositoryListing(folder))
      .map(f => `${f}`)); // Game requires folders to have a leading slash
  return files;
}
