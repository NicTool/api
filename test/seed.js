// replaces a file store's rows, and forgets its last_id, as a fixture
export function seed(store, key, rows) {
  return store.mutate(key, (current, data) => {
    current.splice(0, current.length, ...rows)
    delete data.last_id
  })
}
