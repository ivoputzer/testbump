export default async function * customReporter (source) {
  const files = new Set()
  for await (const event of source) {
    if (event.data?.file) {
      files.add(event.data.file)
    }
  }
  yield JSON.stringify([...files])
}
