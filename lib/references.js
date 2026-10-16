// What a hard delete takes with it. mysql enforces each of these with a
// FOREIGN KEY; the file stores have none, so their destroy() calls cascade().
const cascades = [
  { parent: 'group', child: 'nameserver', via: 'gid' },
  { parent: 'user', child: 'session', via: 'uid' },
  { parent: 'zone', child: 'zone_record', via: 'zid' },
]

// Imported when a cascade runs, so a child store loading its own parent does
// not close a circle at module load.
const childStores = {
  nameserver: () => import('./nameserver/index.js'),
  session: () => import('./session/index.js'),
  zone_record: () => import('./zone_record/index.js'),
}

export async function cascade(parent, id) {
  for (const edge of cascades.filter((e) => e.parent === parent)) {
    const store = (await childStores[edge.child]()).default

    // Session alone has no destroy(); its delete() is the hard one and clears
    // every session for the parent in a single call.
    if (typeof store.destroy !== 'function') {
      await store.delete({ [edge.via]: id })
      continue
    }

    for (const deleted of [false, true]) {
      const found = await store.get({ [edge.via]: id, deleted })
      for (const child of [found].flat().filter(Boolean)) await store.destroy({ id: child.id })
    }
  }
}

export default cascades
