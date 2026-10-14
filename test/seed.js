export function seed(store, key, rows) {
  return store.mutate(key, (current, data) => {
    current.splice(0, current.length, ...rows)
    delete data.last_id
  })
}
