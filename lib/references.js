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

    // One call per edge, matched on the parent key at write time, so a child
    // moved to another parent stays. Session's delete() is its hard delete.
    const remove = typeof store.destroy === 'function' ? store.destroy : store.delete
    await remove.call(store, { [edge.via]: id })
  }
}

export default cascades
