export function splitQualifiedUsername(value, defaultGroup) {
  const separator = value.indexOf('@')
  if (separator === -1) return { username: value, groupName: defaultGroup }
  return {
    username: value.slice(0, separator),
    groupName: value.slice(separator + 1),
  }
}
