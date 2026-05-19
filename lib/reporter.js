export default async function * customReporter (source) {
  const files = new Set()
  for await (const event of source) {
    if (event.data?.file) {
      files.add(event.data.file)
    }
  }
  // Yield the stringified array so --test-reporter-destination can write it to a file
  yield JSON.stringify([...files])
}
